import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import pandas as pd

from db_utils import get_db_connection, init_database, insert_price_data
from repair_prices import _repair_with_fallback, run_price_repair
from runtime.context import build_execution_context


FIXTURE_PATH = Path(__file__).parent / "testdata" / "repair_price_fallback_cases.json"


def load_cases():
    with FIXTURE_PATH.open("r", encoding="utf-8") as fh:
        return json.load(fh)["cases"]


class TestRepairPriceFallback(unittest.TestCase):
    def setUp(self):
        self.context = build_execution_context(app_env="local")
        self.cases = {case["name"]: case for case in load_cases()}

    def test_yahoo_hit_short_circuits_fallback(self):
        case = self.cases["yahoo_hit_short_circuit"]
        yahoo_payload = {
            **case["candidate"],
            "current_price": case["expected_price"],
            "change_percent": -1.82,
            "volume": 12345,
            "captured_at": "2026-04-03 14:00:00",
        }
        with patch("repair_prices.fetch_price_for_k_date_live", return_value=yahoo_payload), \
             patch("repair_prices.fetch_price_for_k_date_akshare") as mock_akshare:
            repaired, source = _repair_with_fallback(case["candidate"], self.context)

        self.assertEqual(source, case["expected_source"])
        self.assertEqual(repaired["current_price"], case["expected_price"])
        mock_akshare.assert_not_called()

    def test_akshare_hit_after_yahoo_miss(self):
        case = self.cases["akshare_hit_after_yahoo_miss"]
        akshare_payload = {
            **case["candidate"],
            "current_price": case["expected_price"],
            "change_percent": -1.82,
            "volume": 22345,
            "captured_at": "2026-04-03 14:00:00",
        }
        with patch("repair_prices.fetch_price_for_k_date_live", return_value=None), \
             patch("repair_prices.fetch_price_for_k_date_akshare", return_value=akshare_payload) as mock_akshare:
            repaired, source = _repair_with_fallback(case["candidate"], self.context)

        self.assertEqual(source, case["expected_source"])
        self.assertEqual(repaired["current_price"], case["expected_price"])
        mock_akshare.assert_called_once()

    def test_international_logs_and_skips_after_yahoo_miss(self):
        case = self.cases["international_logs_after_yahoo_miss"]
        with patch("repair_prices.fetch_price_for_k_date_live", return_value=None):
            repaired, source = _repair_with_fallback(case["candidate"], self.context)

        self.assertIsNone(repaired)
        self.assertIsNone(source)

    def test_akshare_wrong_date_is_rejected(self):
        candidate = self.cases["akshare_hit_after_yahoo_miss"]["candidate"]
        wrong_date_df = pd.DataFrame([
            {"日期": "2026-04-01", "收盘": 1.101, "涨跌幅": 3.19, "成交量": 12345}
        ])
        with patch("data_sources.price_live.ak.fund_etf_hist_em", return_value=wrong_date_df):
            from data_sources.price_live import fetch_price_for_k_date_akshare

            repaired = fetch_price_for_k_date_akshare(candidate, self.context)

        self.assertIsNone(repaired)

    def test_run_price_repair_updates_existing_rows(self):
        mainland = self.cases["akshare_hit_after_yahoo_miss"]["candidate"]
        international = self.cases["international_logs_after_yahoo_miss"]["candidate"]
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = str(Path(tmpdir) / "repair.db")
            init_database(db_path)
            for row in (mainland, international):
                insert_price_data(
                    {
                        **row,
                        "current_price": None,
                        "change_percent": None,
                        "volume": None,
                        "captured_at": "2026-04-03 08:00:00",
                    },
                    db_path,
                )

            def fake_candidates(_context, days=3):
                return [mainland, international]

            def fake_repair(candidate, _context):
                if candidate["yahoo_symbol"].endswith(".SS"):
                    return (
                        {
                            **candidate,
                            "current_price": 9.9,
                            "change_percent": 1.1,
                            "volume": 10,
                            "captured_at": "2026-04-03 14:00:00",
                        },
                        "akshare",
                    )
                return (None, None)

            with patch("repair_prices.load_repair_candidates", side_effect=fake_candidates), \
                 patch("repair_prices._repair_with_fallback", side_effect=fake_repair), \
                 patch("repair_prices.ENABLE_REMOTE_WRITE", False), \
                 patch("repair_prices.apply_repaired_price", side_effect=lambda _context, repaired: __import__("db_utils").repair_price_data(repaired, db_path)):
                stats = run_price_repair(self.context)

            conn = get_db_connection(db_path)
            rows = [dict(row) for row in conn.execute(
                "SELECT yahoo_symbol, current_price FROM stock_raw ORDER BY yahoo_symbol"
            ).fetchall()]
            conn.close()

        self.assertEqual(stats["repaired"], 1)
        self.assertEqual(stats["skipped"], 1)
        self.assertEqual(rows, [
            {"yahoo_symbol": "515880.SS", "current_price": 9.9},
            {"yahoo_symbol": "9988.HK", "current_price": None},
        ])


if __name__ == "__main__":
    unittest.main()
