#!/usr/bin/env python3
"""Real SQLite integration tests using all formal migrations."""
from __future__ import annotations

import inspect
import json
import logging
import os
import sqlite3
import sys
import tempfile
import types
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
os.environ["APP_ENV"] = "test"
sys.dont_write_bytecode = True
sys.path.insert(0, str(ROOT / "src"))

# Avoid loading a workstation .env in this SQL-only suite.
dotenv = types.ModuleType("dotenv")
dotenv.load_dotenv = lambda *args, **kwargs: False
previous_dotenv = sys.modules.get("dotenv")
sys.modules["dotenv"] = dotenv
logging.getLogger("db_utils").addHandler(logging.NullHandler())
try:
    import db_utils
finally:
    if previous_dotenv is None:
        del sys.modules["dotenv"]
    else:
        sys.modules["dotenv"] = previous_dotenv

D = "2026-10-14"
H = "2026-10-12"
FIELDS = ("support_levels", "resistance_levels")


class ReviewPlansTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="market-review-db-", dir=ROOT / "tests")
        self.addCleanup(self.temp.cleanup)
        self.path = str(Path(self.temp.name) / "review.sqlite")
        with sqlite3.connect(self.path) as conn:
            for migration in sorted((ROOT / "cloudflare" / "migrations").glob("[0-9][0-9][0-9]_*.sql")):
                conn.executescript(migration.read_text(encoding="utf-8"))
            conn.execute("INSERT INTO daily_review_archive (archive_date) VALUES (?)", (D,))
            conn.execute("INSERT INTO daily_review_archive (archive_date) VALUES (?)", (H,))
            # Account order, not request order or plan sort, chooses old candidates.
            conn.execute("UPDATE investment_accounts SET sort_order = 20 WHERE id = 1")
            conn.execute("UPDATE investment_accounts SET sort_order = 10 WHERE id = 2")
            self.seed_plan(conn, D, 1, "SOXX", " account1 support\n", "account1 resistance", 10, "15%-20%", 101)
            self.seed_plan(conn, D, 2, "SOXX", "account2 support", "account2 resistance", 90, "5%-10%", 202)
            self.seed_plan(conn, H, 1, "SOXX", "history support", "history resistance", 0, "0-5%", 303)
            conn.execute("INSERT INTO account_live_action_plans (account_id, symbol, support_levels, resistance_levels, thinking) VALUES (1, 'SOXX', 'live support', 'live resistance', 'live thinking')")

    def seed_plan(self, conn, date, account, symbol, support, resistance, order, position, amount):
        conn.execute(
            """INSERT INTO daily_review_action_plans
                (archive_date, account_id, symbol, support_levels, resistance_levels,
                 key_levels, action_type, entry_plan, take_profit_plan, stop_loss_plan,
                 current_position, position_amount, thinking, market_type, sort_order)
                VALUES (?, ?, ?, ?, ?, ?, '持仓观察', ?, ?, ?, ?, ?, ?, '美股', ?)""",
            (date, account, symbol, support, resistance, f" key original {account}\n",
             f"entry {account}", f"profit {account}", f"stop {account}", position, amount,
             f"thinking {account}", order),
        )

    def rows(self, date=D):
        return db_utils.list_review_action_plans(date, self.path)

    def plans(self, date=D):
        return [dict(row) for row in self.raw("SELECT * FROM daily_review_action_plans WHERE archive_date = ? ORDER BY account_id", (date,))]

    def raw(self, sql, params=()):
        with sqlite3.connect(self.path) as conn:
            conn.row_factory = sqlite3.Row
            return conn.execute(sql, params).fetchall()

    def execute(self, sql, params=()):
        with sqlite3.connect(self.path) as conn:
            conn.execute(sql, params)

    def levels(self, symbol="SOXX", date=D):
        rows = self.raw("SELECT * FROM daily_review_symbol_levels WHERE archive_date = ? AND symbol = ?", (date, symbol))
        return dict(rows[0]) if rows else None

    def seed_level(self, support="saved support", resistance="saved resistance", symbol="SOXX", date=D):
        self.execute("INSERT INTO daily_review_symbol_levels (archive_date, symbol, support_levels, resistance_levels) VALUES (?, ?, ?, ?)", (date, symbol, support, resistance))

    def legacy(self, market=None, rotation=None, date=D):
        self.execute("UPDATE daily_review_archive SET market_sentiment_blocks_json = ?, sector_rotation_blocks_json = ? WHERE archive_date = ?",
                     (json.dumps(market, ensure_ascii=False) if market is not None else None,
                      json.dumps(rotation, ensure_ascii=False) if rotation is not None else None, date))

    def snapshot(self):
        conn = sqlite3.connect(self.path)
        try:
            tables = [row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")]
            return {table: conn.execute(f'SELECT * FROM "{table}" ORDER BY rowid').fetchall() for table in tables}
        finally:
            conn.close()

    def replace(self, plans, patch, date=D):
        # On the unimplemented baseline fail on the missing contract, not TypeError/import.
        self.assertIn("symbol_levels", inspect.signature(db_utils.replace_review_action_plans).parameters,
                      "replace_review_action_plans lacks the explicit level patch contract")
        return db_utils.replace_review_action_plans(date, plans, self.path, symbol_levels=patch)

    def assert_prices(self, rows, support, resistance):
        self.assertTrue(rows)
        self.assertTrue(all(type(row) is dict for row in rows))
        self.assertEqual([(row["support_levels"], row["resistance_levels"]) for row in rows],
                         [(support, resistance)] * len(rows))

    def track_connections(self):
        original = sqlite3.connect
        connections, statements = [], []

        class TrackedConnection(sqlite3.Connection):
            closed = False

            def close(self):
                self.closed = True
                super().close()

        def constructor(*args, **kwargs):
            conn = original(*args, factory=TrackedConnection, **kwargs)
            conn.set_trace_callback(statements.append)
            connections.append(conn)
            return conn

        # Constructor instrumentation only: execute/commit/rollback use real SQLite.
        sqlite3.connect = constructor
        self.addCleanup(setattr, sqlite3, "connect", original)
        return connections, statements

    def test_saved_levels_override_two_accounts_and_read_is_zero_write(self):
        self.seed_level()
        before = self.snapshot()
        self.assert_prices(self.rows(), "saved support", "saved resistance")
        self.assertEqual(before, self.snapshot())

    def test_saved_blanks_are_authoritative(self):
        self.seed_level("", "")
        self.assert_prices(self.rows(), "", "")

    def test_old_accounts_select_each_field_independently(self):
        self.execute("UPDATE daily_review_action_plans SET support_levels = ' \n' WHERE archive_date = ? AND account_id = 2", (D,))
        before = self.snapshot()
        self.assert_prices(self.rows(), " account1 support\n", "account2 resistance")
        self.assertEqual(before, self.snapshot())

    def test_old_market_first_nonempty_per_field_before_accounts(self):
        self.legacy(
            [{"title": "半导体 SOXX", "children": [{"title": "支撑位 (Support)", "body": " market support\n486–532（强） "}]}],
            [{"title": "半导体板块", "children": [{"title": "压力位", "body": ""}]},
             {"title": "SOXX", "children": [{"title": "压力位", "body": " market resistance\n"}]}],
        )
        before = self.snapshot()
        self.assert_prices(self.rows(), " market support\n486–532（强） ", " market resistance\n")
        self.assertEqual(before, self.snapshot())

    def test_unique_catalog_matching_never_guesses_unknown_or_cross_symbol(self):
        self.legacy([{"title": "UNKNOWN SOXX / MU", "children": [{"title": "支撑位", "body": "not shared"}]},
                     {"title": "存储/光通信", "children": [{"title": "压力位", "body": "not shared"}]},
                     {"title": "Micron", "children": [{"title": "压力位", "body": "ambiguous alias"}]},
                     {"title": "UNKNOWN", "children": [{"title": "压力位", "body": "unknown token"}]}])
        self.assert_prices(self.rows(), "account2 support", "account2 resistance")

    def test_unique_alias_matches_but_unknown_dimensions_do_not(self):
        self.legacy([{"title": "芯片板块", "children": [{"title": "关键指标", "body": "999"},
                    {"title": "支持", "body": "alias support"}]}])
        self.assert_prices(self.rows(), "alias support", "account2 resistance")

    def test_legacy_matching_follows_worker_rules_not_substrings(self):
        for title, child in (("半导体板块走势", "支撑位"), ("soxx 观察", "支撑位"), ("SOXX", "support")):
            with self.subTest(title=title, child=child):
                self.legacy([{"title": title, "children": [{"title": child, "body": "must not share"}]}])
                self.assert_prices(self.rows(), "account2 support", "account2 resistance")
        self.legacy([{"title": "SOXX", "subsections": [{"title": "支撑位", "content": "not a stored shape"}]}])
        self.assert_prices(self.rows(), "account2 support", "account2 resistance")

    def test_legacy_fullwidth_parens_and_first_preset_only(self):
        self.legacy([{"title": "SOXX", "children": [{"title": "阻力位（Resistance）", "body": "market resistance"},
                                                    {"title": "压力位", "body": "duplicate preset is custom"}]}])
        self.assert_prices(self.rows(), "account2 support", "market resistance")

    def test_sp500_title_maps_to_gspc_only_in_market_group(self):
        with sqlite3.connect(self.path) as conn:
            self.seed_plan(conn, D, 1, "GSPC", "plan gspc support", "plan gspc resistance", 0, "0-5%", 0)
        gspc = lambda: [row for row in self.rows() if row["symbol"] == "GSPC"]
        self.legacy([{"title": "标普500点位", "children": [{"title": "压力位", "body": "market gspc"}]}])
        self.assert_prices(gspc(), "plan gspc support", "market gspc")
        for market, rotation in (([{"title": "标普500 ETF", "children": [{"title": "压力位", "body": "etf"}]}], None),
                                 (None, [{"title": "标普500点位", "children": [{"title": "压力位", "body": "rotation"}]}])):
            with self.subTest(market=market, rotation=rotation):
                self.legacy(market, rotation)
                self.assert_prices(gspc(), "plan gspc support", "plan gspc resistance")

    DOC = {"version": 1, "blocks": [{"id": "b1", "type": "symbol", "symbol": "SOXX", "children": []}],
           "conflicts": [], "sourceDates": []}

    def archive(self, date=D):
        rows = self.raw("SELECT * FROM daily_review_archive WHERE archive_date = ?", (date,))
        return dict(rows[0]) if rows else None

    def seed_filled(self, status):
        self.legacy([{"title": "SOXX", "children": []}], [{"title": "MU", "children": []}])
        self.execute("""UPDATE daily_review_archive SET review_status = ?, reviewer_news_notes = 'notes',
                        trading_summary = 'summary', reviewed_at = ?, market_review_json = ? WHERE archive_date = ?""",
                     (status, "2026-10-14T20:00:00" if status == "reviewed" else None, json.dumps(self.DOC), D))
        self.seed_level()

    def test_initialize_new_date_writes_null_notes_and_no_levels(self):
        date = "2026-10-15"
        self.assertTrue(db_utils.initialize_archive_record(date, self.path))
        row = self.archive(date)
        self.assertEqual(row["review_status"], "initialized")
        self.assertEqual((row["reviewer_news_notes"], row["trading_summary"]), ("", ""))
        for column in ("market_review_json", "market_sentiment_blocks_json", "sector_rotation_blocks_json", "reviewed_at"):
            self.assertIsNone(row[column], column)
        self.assertEqual(self.raw("SELECT * FROM daily_review_symbol_levels WHERE archive_date = ?", (date,)), [])

    def test_initialize_resets_unreviewed_notes_but_keeps_levels_and_plans(self):
        self.seed_filled("draft")
        levels, plans = self.levels(), self.plans()
        self.assertTrue(db_utils.initialize_archive_record(D, self.path))
        row = self.archive()
        self.assertEqual(row["review_status"], "initialized")
        self.assertEqual((row["reviewer_news_notes"], row["trading_summary"]), ("", ""))
        for column in ("market_review_json", "market_sentiment_blocks_json", "sector_rotation_blocks_json", "reviewed_at"):
            self.assertIsNone(row[column], column)
        self.assertEqual((levels, plans), (self.levels(), self.plans()))

    def test_initialize_reviewed_date_changes_nothing(self):
        self.seed_filled("reviewed")
        before = self.snapshot()
        self.assertTrue(db_utils.initialize_archive_record(D, self.path))
        self.assertEqual(before, self.snapshot())

    def test_get_archive_is_zero_write_and_exposes_new_and_frozen_columns(self):
        self.seed_filled("draft")
        before = self.snapshot()
        row = db_utils.get_archive_by_date(D, self.path)
        self.assertEqual(before, self.snapshot())
        self.assertEqual(json.loads(row["market_review_json"]), self.DOC)
        self.assertEqual(json.loads(row["sector_rotation_blocks_json"])[0]["title"], "MU")

    def test_save_archive_writes_new_document_and_keeps_it_when_omitted(self):
        self.legacy([{"title": "SOXX", "children": []}])
        frozen = self.archive()["market_sentiment_blocks_json"]
        self.assertTrue(db_utils.save_archive({"archive_date": D, "review_status": "draft", "reviewer_news_notes": "n",
                                               "trading_summary": "s", "market_review": self.DOC}, self.path))
        row = self.archive()
        self.assertEqual(json.loads(row["market_review_json"]), self.DOC)
        self.assertEqual(row["market_sentiment_blocks_json"], frozen)
        self.assertTrue(db_utils.save_archive({"archive_date": D, "review_status": "draft", "trading_summary": "s2"}, self.path))
        row = self.archive()
        self.assertEqual(json.loads(row["market_review_json"]), self.DOC)
        self.assertEqual(row["trading_summary"], "s2")
        self.assertIsNone(self.levels())
        self.assertTrue(db_utils.save_archive({"archive_date": D, "market_review": {"version": 1, "blocks": []}}, self.path))
        self.assertEqual(json.loads(self.archive()["market_review_json"])["blocks"], [])

    def test_saved_document_does_not_revive_frozen_old_market_or_price_body(self):
        self.legacy([{"title": "SOXX", "children": [{"title": "支撑位", "body": "frozen"}]}])
        for blocks in ([], [{"type": "symbol", "symbol": "SOXX", "children": [{"kind": "support", "body": "not a write source"}]}]):
            with self.subTest(blocks=blocks):
                self.execute("UPDATE daily_review_archive SET market_review_json = ? WHERE archive_date = ?", (json.dumps({"version": 1, "blocks": blocks}), D))
                self.assert_prices(self.rows(), "account2 support", "account2 resistance")

    def test_patch_omitted_field_retains_authority_and_blank_clears(self):
        self.seed_level()
        plans = self.plans()
        plans[0]["support_levels"] = "stale mirror"
        result = self.replace(plans, [{"symbol": "soxx", "support_levels": ""}])
        self.assert_prices(result, "", "saved resistance")
        self.assert_prices(self.rows(), "", "saved resistance")
        self.replace(self.plans(), [{"symbol": "SOXX", "resistanceLevels": " raw\n 550–580（强） "}])
        self.assert_prices(self.rows(), "", " raw\n 550–580（强） ")

    def test_first_patch_seeds_missing_field_from_write_before_market(self):
        self.legacy([{"title": "SOXX", "children": [{"title": "压力位", "body": " market resistance\n"}]}])
        plans = self.plans()
        plans[1]["support_levels"] = "new account mirror"
        result = self.replace(plans, [{"symbol": "SOXX", "support_levels": " explicit support\n"}])
        self.assert_prices(result, " explicit support\n", " market resistance\n")
        self.assertEqual(self.levels()["resistance_levels"], " market resistance\n")

    def test_first_patch_seeds_account_field_before_deleting_its_source_plan(self):
        plans = self.plans()[:1]
        self.replace(plans, [{"symbol": "SOXX", "resistance_levels": "patched resistance"}])
        self.assert_prices(self.rows(), "account2 support", "patched resistance")

    def test_no_patch_preserves_all_evidence_and_unrelated_levels(self):
        self.seed_level()
        self.seed_level("orphan", "orphan resistance", "GOLD")
        before_levels = [dict(row) for row in self.raw("SELECT * FROM daily_review_symbol_levels ORDER BY symbol")]
        before = self.plans()
        plans = self.plans()
        for plan in plans:
            plan.update(support_levels="stale", resistance_levels="stale", key_levels="overwrite attempt")
        result = db_utils.replace_review_action_plans(D, plans, self.path)
        after = self.plans()
        for old, new in zip(before, after):
            for field in ("support_levels", "resistance_levels", "key_levels", "current_position", "position_amount", "thinking", "entry_plan", "take_profit_plan", "stop_loss_plan", "market_type", "action_type", "created_at"):
                self.assertEqual(old[field], new[field], field)
        self.assertEqual(before_levels, [dict(row) for row in self.raw("SELECT * FROM daily_review_symbol_levels ORDER BY symbol")])
        self.assert_prices(result, "saved support", "saved resistance")
        self.assertEqual([row["key_levels"] for row in result], [row["key_levels"] for row in before])

    def test_new_plan_raw_prices_null_and_key_not_derived(self):
        plans = self.plans()
        plans.extend([{"account_id": 1, "symbol": "MU", "support_levels": "ignored", "key_levels": " supplied key\n"},
                      {"account_id": 2, "symbol": "MU", "resistanceLevels": "ignored"}])
        db_utils.replace_review_action_plans(D, plans, self.path)
        rows = self.raw("SELECT * FROM daily_review_action_plans WHERE archive_date = ? AND symbol = 'MU' ORDER BY account_id", (D,))
        self.assertEqual([(row["support_levels"], row["resistance_levels"]) for row in rows], [(None, None)] * 2)
        self.assertEqual([row["key_levels"] for row in rows], [" supplied key\n", ""])
        self.assertIsNone(self.levels("MU"))

    def test_explicit_patch_preserves_other_account_fields_and_date_live(self):
        self.seed_level("history saved", "history saved resistance", date=H)
        before = self.plans()
        isolated = {"history": self.plans(H), "live": [dict(row) for row in self.raw("SELECT * FROM account_live_action_plans")],
                    "archive": [dict(row) for row in self.raw("SELECT * FROM daily_review_archive")], "history_levels": self.levels(date=H)}
        self.replace(self.plans(), [{"symbol": "SOXX", "support_levels": "new support", "resistance_levels": "new resistance"}])
        for old, new in zip(before, self.plans()):
            for field in ("account_id", "symbol", "action_type", "current_position", "position_amount", "thinking", "entry_plan", "take_profit_plan", "stop_loss_plan", "market_type", "key_levels", *FIELDS):
                self.assertEqual(old[field], new[field], field)
        self.assertEqual(isolated, {"history": self.plans(H), "live": [dict(row) for row in self.raw("SELECT * FROM account_live_action_plans")],
                                   "archive": [dict(row) for row in self.raw("SELECT * FROM daily_review_archive")], "history_levels": self.levels(date=H)})

    def test_delete_plans_keeps_level_and_patch_can_target_no_plan(self):
        self.seed_level()
        db_utils.replace_review_action_plans(D, [], self.path)
        self.assertEqual(self.rows(), [])
        self.assertEqual(self.levels()["support_levels"], "saved support")
        self.assertEqual(self.replace([], [{"symbol": "GOLD", "resistance_levels": "new gold"}]), [])
        self.assertEqual(self.levels("GOLD")["support_levels"], "")
        self.assertEqual(self.levels("GOLD")["resistance_levels"], "new gold")

    def test_invalid_patches_rejected_before_any_sql_write(self):
        invalid = [None, "bad", {}, [None], [{"symbol": "SOXX"}], [{"symbol": "SOXX", "support_levels": None}],
                   [{"symbol": "SOXX", "support_levels": 500}], [{"symbol": "SOXX", "resistanceLevels": False}],
                   [{"symbol": "SOXX", "support_levels": "a"}, {"symbol": "soxx", "resistance_levels": "b"}],
                   [{"symbol": "SOXX", "support_levels": "a", "supportLevels": "b"}],
                   [{"symbol": "", "support_levels": "a"}], [{"symbol": 12, "support_levels": "a"}]]
        self.assertIn("symbol_levels", inspect.signature(db_utils.replace_review_action_plans).parameters)
        connections, statements = self.track_connections()
        before = self.snapshot()
        for patch in invalid:
            with self.subTest(patch=patch):
                start = len(statements)
                with self.assertRaises(ValueError):
                    db_utils.replace_review_action_plans(D, [], self.path, symbol_levels=patch)
                self.assertFalse(any(sql.lstrip().upper().startswith(("INSERT", "UPDATE", "DELETE", "REPLACE")) for sql in statements[start:]))
                self.assertEqual(before, self.snapshot())
        self.assertTrue(all(conn.closed for conn in connections))

    def install_constraint_trigger(self, event, table):
        self.execute(f"""CREATE TRIGGER reject_write AFTER {event} ON {table}
            BEGIN INSERT INTO tracked_symbols (symbol, display_name, symbol_type)
            VALUES ('INVALID_CONSTRAINT', 'failure probe', 'not-an-allowed-type'); END""")

    def test_constraint_after_level_write_rolls_back_and_closes(self):
        self.assertIn("symbol_levels", inspect.signature(db_utils.replace_review_action_plans).parameters)
        self.install_constraint_trigger("INSERT", "daily_review_symbol_levels")
        plans = self.plans()
        before = self.snapshot()
        connections, statements = self.track_connections()
        with self.assertRaisesRegex(sqlite3.IntegrityError, "CHECK constraint failed"):
            self.replace(plans, [{"symbol": "SOXX", "support_levels": "attempt"}])
        self.assertTrue(connections)
        self.assertTrue(all(conn.closed for conn in connections))
        self.assertTrue(any(sql.upper().startswith("ROLLBACK") for sql in statements))
        self.assertEqual(before, self.snapshot())

    def test_constraint_after_plan_update_and_delete_rolls_back_levels_and_plans(self):
        self.assertIn("symbol_levels", inspect.signature(db_utils.replace_review_action_plans).parameters)
        self.seed_level()
        self.install_constraint_trigger("DELETE", "daily_review_action_plans")
        plans = self.plans()[:1]
        plans[0]["thinking"] = "attempt changed account thinking"
        before = self.snapshot()
        connections, statements = self.track_connections()
        with self.assertRaisesRegex(sqlite3.IntegrityError, "CHECK constraint failed"):
            self.replace(plans, [{"symbol": "SOXX", "support_levels": "attempt changed level"}])
        self.assertTrue(all(conn.closed for conn in connections))
        self.assertTrue(any(sql.upper().startswith("ROLLBACK") for sql in statements))
        self.assertEqual(before, self.snapshot())

    def test_success_closes_connection(self):
        plans = self.plans()
        connections, _ = self.track_connections()
        result = db_utils.replace_review_action_plans(D, plans, self.path)
        self.assertTrue(result)
        self.assertTrue(connections)
        self.assertTrue(all(conn.closed for conn in connections))

    def test_account_symbol_key_changes_do_not_move_or_delete_levels(self):
        self.seed_level()
        self.seed_level("MU shared support", "MU shared resistance", "MU")
        before_levels = [dict(row) for row in self.raw("SELECT * FROM daily_review_symbol_levels ORDER BY symbol")]
        plans = self.plans()
        old_other = plans[1].copy()
        plans[0].update(account_id=3, symbol="MU")
        result = db_utils.replace_review_action_plans(D, plans, self.path, symbol_levels=[])
        moved = next(row for row in result if row["symbol"] == "MU")
        self.assert_prices([moved], "MU shared support", "MU shared resistance")
        after = self.plans()
        self.assertEqual({(row["account_id"], row["symbol"]) for row in after}, {(2, "SOXX"), (3, "MU")})
        new_raw = next(row for row in after if row["symbol"] == "MU")
        self.assertIsNone(new_raw["support_levels"])
        self.assertIsNone(new_raw["resistance_levels"])
        remaining = next(row for row in after if row["symbol"] == "SOXX")
        for field in ("key_levels", "position_amount", "thinking", "current_position", *FIELDS):
            self.assertEqual(remaining[field], old_other[field], field)
        self.assertEqual(before_levels, [dict(row) for row in self.raw("SELECT * FROM daily_review_symbol_levels ORDER BY symbol")])

    def test_history_patch_and_empty_patch_are_date_isolated(self):
        self.seed_level()
        current = self.plans()
        current_levels = self.levels()
        live = [dict(row) for row in self.raw("SELECT * FROM account_live_action_plans")]
        self.replace(self.plans(H), [{"symbol": "SOXX", "resistance_levels": "history patched"}], H)
        self.assert_prices(self.rows(H), "history support", "history patched")
        self.assertEqual(current, self.plans())
        self.assertEqual(current_levels, self.levels())
        self.assertEqual(live, [dict(row) for row in self.raw("SELECT * FROM account_live_action_plans")])
        old_history_level = self.levels(date=H)
        self.replace(self.plans(H), [], H)
        self.assertEqual(old_history_level, self.levels(date=H))

    def test_new_plan_no_key_does_not_derive_key_from_explicit_shared_level(self):
        result = self.replace([{"account_id": 1, "symbol": "MU", "supportLevels": "ignored mirror"}],
                              [{"symbol": "MU", "support_levels": "shared new level"}])
        self.assert_prices(result, "shared new level", "")
        self.assertEqual(result[0]["key_levels"], "")
        raw = self.plans()[0]
        self.assertEqual(raw["key_levels"], "")
        self.assertIsNone(raw["support_levels"])
        self.assertIsNone(raw["resistance_levels"])

    def assert_identity_rejected(self, plans, patches):
        before = self.snapshot()
        connections, statements = self.track_connections()
        with self.assertRaises(ValueError):
            self.replace(plans, patches)
        self.assertTrue(connections)
        self.assertTrue(all(conn.closed for conn in connections))
        self.assertTrue(any(sql.upper().startswith("BEGIN IMMEDIATE") for sql in statements))
        self.assertTrue(any(sql.upper().startswith("ROLLBACK") for sql in statements))
        self.assertFalse(any(sql.lstrip().upper().startswith(("INSERT", "UPDATE", "DELETE", "REPLACE"))
                             for sql in statements))
        self.assertEqual(before, self.snapshot())

    def test_display_code_us10y_is_not_a_system_key(self):
        self.assertEqual(len(self.raw("SELECT * FROM tracked_symbols WHERE symbol = 'TNX' AND is_active = 1")), 1)
        self.assertEqual(self.raw("SELECT * FROM tracked_symbols WHERE symbol = 'US10Y'"), [])
        self.assert_identity_rejected([], [{"symbol": "US10Y", "support_levels": "not TNX"}])
        self.assertIsNone(self.levels("US10Y"))
        self.assertIsNone(self.levels("TNX"))

    def test_unknown_patch_is_rejected(self):
        self.assert_identity_rejected([], [{"symbol": "UNKNOWN", "resistanceLevels": "unknown"}])
        self.assertIsNone(self.levels("UNKNOWN"))

    def test_new_inactive_symbol_is_rejected(self):
        self.execute("UPDATE tracked_symbols SET is_active = 0 WHERE symbol = 'MU'")
        self.assert_identity_rejected([], [{"symbol": "MU", "support_levels": "disabled"}])
        self.assertIsNone(self.levels("MU"))

    def test_request_new_unknown_plan_cannot_authorize_patch(self):
        plans = self.plans() + [{"account_id": 1, "symbol": " unknown ", "thinking": "new request"}]
        self.assert_identity_rejected(plans, [{"symbol": "unknown", "support_levels": "untrusted"}])
        self.assertIsNone(self.levels("UNKNOWN"))

    def test_tail_invalid_patch_rejects_batch_before_any_write(self):
        self.seed_level()
        plans = self.plans()[:1]
        plans[0]["thinking"] = "must not update or delete the other account"
        self.assert_identity_rejected(plans, [
            {"symbol": "SOXX", "support_levels": "must not update"},
            {"symbol": "TNX", "resistanceLevels": "must not insert"},
            {"symbol": "UNKNOWN", "support_levels": "invalid tail"},
        ])
        self.assertIsNone(self.levels("TNX"))
        self.assertIsNone(self.levels("UNKNOWN"))

    def test_saved_level_identity_survives_catalog_disable_or_delete(self):
        self.seed_level("historical support", "historical resistance", "MU")
        for change in ("UPDATE tracked_symbols SET is_active = 0", "DELETE FROM tracked_symbols"):
            with self.subTest(change=change):
                self.execute(f"{change} WHERE symbol = 'MU'")
                self.replace([], [{"symbol": "MU", "support_levels": ""}])
                self.assertEqual(self.levels("MU")["support_levels"], "")
                self.assertEqual(self.levels("MU")["resistance_levels"], "historical resistance")
                self.replace([], [{"symbol": "MU", "supportLevels": "modified history"}])
                self.assertEqual(self.levels("MU")["support_levels"], "modified history")
                self.assertEqual(self.levels("MU")["resistance_levels"], "historical resistance")

    def test_saved_plan_identity_survives_catalog_disable_or_delete(self):
        for change in ("UPDATE tracked_symbols SET is_active = 0", "DELETE FROM tracked_symbols"):
            for support in ("", "modified history"):
                with self.subTest(change=change, support=support):
                    self.execute(f"{change} WHERE symbol = 'MU'")
                    self.execute("DELETE FROM daily_review_symbol_levels WHERE archive_date = ? AND symbol = 'MU'", (D,))
                    with sqlite3.connect(self.path) as conn:
                        self.seed_plan(conn, D, 1, "MU", "old support", "old resistance", 0, "0-5%", 0)
                    self.replace([], [{"symbol": "MU", "support_levels": support}])
                    self.assertEqual(self.levels("MU")["support_levels"], support)
                    self.assertEqual(self.levels("MU")["resistance_levels"], "old resistance")
                    self.assertEqual(self.plans(), [])

    def test_saved_document_identity_survives_catalog_disable_or_delete(self):
        catalog_id = self.raw("SELECT id FROM tracked_symbols WHERE symbol = 'MU'")[0]["id"]
        document = {"version": 1, "blocks": [{"id": "saved-mu", "type": "symbol", "symbol": "MU",
                    "identity": {"catalogId": catalog_id, "displayCode": "MU", "displayName": "美光科技"},
                    "children": [{"kind": "resistance", "body": "not a price write source"}]}]}
        self.execute("UPDATE daily_review_archive SET market_review_json = ? WHERE archive_date = ?",
                     (json.dumps(document), D))
        for change in ("UPDATE tracked_symbols SET is_active = 0", "DELETE FROM tracked_symbols"):
            for support in ("", "modified history"):
                with self.subTest(change=change, support=support):
                    self.execute(f"{change} WHERE symbol = 'MU'")
                    self.execute("DELETE FROM daily_review_symbol_levels WHERE archive_date = ? AND symbol = 'MU'", (D,))
                    self.replace([], [{"symbol": "MU", "supportLevels": support}])
                    self.assertEqual(self.levels("MU")["support_levels"], support)
                    self.assertEqual(self.levels("MU")["resistance_levels"], "")
                    self.assertEqual(json.loads(self.raw("SELECT market_review_json FROM daily_review_archive WHERE archive_date = ?", (D,))[0][0]), document)

    def test_history_identity_must_belong_to_target_date(self):
        self.execute("UPDATE tracked_symbols SET is_active = 0 WHERE symbol = 'MU'")
        self.seed_level(symbol="MU", date=H)
        with sqlite3.connect(self.path) as conn:
            self.seed_plan(conn, H, 1, "MU", "history", "history", 0, "0-5%", 0)
            conn.execute("INSERT INTO account_live_action_plans (account_id, symbol) VALUES (1, 'MU')")
        self.execute("UPDATE daily_review_archive SET market_review_json = ? WHERE archive_date = ?",
                     (json.dumps({"version": 1, "blocks": [{"type": "symbol", "symbol": "MU"}]}), H))
        self.assert_identity_rejected([], [{"symbol": "MU", "support_levels": "wrong date"}])
        self.assertIsNone(self.levels("MU"))

    def test_non_symbol_document_or_legacy_title_cannot_authorize_patch(self):
        self.execute("UPDATE tracked_symbols SET is_active = 0 WHERE symbol = 'MU'")
        self.legacy([{"title": "MU", "children": [{"title": "支撑位", "body": "old text"}]}])
        self.execute("UPDATE daily_review_archive SET market_review_json = ? WHERE archive_date = ?",
                     (json.dumps({"version": 1, "blocks": [{"type": "legacy", "symbol": "MU", "title": "MU"},
                                                           {"type": "custom", "symbol": "MU"}]}), D))
        self.assert_identity_rejected([], [{"symbol": "MU", "support_levels": "not an identity"}])
        self.assertIsNone(self.levels("MU"))

    def test_saved_document_display_code_does_not_authorize_another_symbol(self):
        self.execute("UPDATE daily_review_archive SET market_review_json = ? WHERE archive_date = ?",
                     (json.dumps({"version": 1, "blocks": [{"type": "symbol", "symbol": "TNX",
                         "identity": {"displayCode": "US10Y", "displayName": "十年期国债收益率"}}]}), D))
        self.assert_identity_rejected([], [{"symbol": "US10Y", "support_levels": "display only"}])
        self.assertIsNone(self.levels("US10Y"))
        self.assertIsNone(self.levels("TNX"))

    def test_active_system_keys_keep_native_normalization(self):
        self.replace([], [{"symbol": " tnx ", "supportLevels": " native TNX\n "},
                          {"symbol": " 通信ETF ", "resistance_levels": "中文系统键"}])
        self.assertEqual(self.levels("TNX")["support_levels"], " native TNX\n ")
        self.assertEqual(self.levels("通信ETF")["resistance_levels"], "中文系统键")
        self.assertIsNone(self.levels("US10Y"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
