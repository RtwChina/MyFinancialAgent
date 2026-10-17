import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import * as fixtures from './helpers/market-review-fixtures.mjs';

const root = path.resolve(import.meta.dirname, '..');
function migrated(until = 27) {
  const db = new DatabaseSync(':memory:');
  const directory = path.join(root, 'cloudflare/migrations');
  for (const name of fs.readdirSync(directory).filter((name) => name.endsWith('.sql') && Number(name.slice(0, 3)) <= until).sort()) {
    db.exec(fs.readFileSync(path.join(directory, name), 'utf8'));
  }
  return db;
}
function withFixture(action) {
  const db = migrated();
  try { fixtures.seedMarketReviewFixture(db); return action(db); }
  finally { db.close(); }
}
function snapshot(db) {
  return Object.fromEntries(db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(({ name }) => [
    name, db.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all().map((row) => ({ ...row })),
  ]));
}
const archive = (db, date) => db.prepare('SELECT * FROM daily_review_archive WHERE archive_date=?').get(date);

test('日期 API 稳定，新场景早于 latest，E 日无旧笔记、新文档和价位', () => withFixture((db) => {
  assert.equal(fixtures.dates.empty, '2026-09-01');
  assert.equal(fixtures.dates.history, '2026-10-12');
  assert.equal(fixtures.dates.latest, '2026-10-14');
  for (const [key, date] of Object.entries(fixtures.dates)) if (key !== 'latest') assert.ok(date < fixtures.dates.latest, key);
  assert.equal(db.prepare('SELECT MAX(archive_date) AS day FROM daily_review_archive').get().day, fixtures.dates.latest);
  const empty = archive(db, fixtures.dates.empty);
  for (const key of ['market_sentiment_blocks_json', 'sector_rotation_blocks_json', 'market_review_json']) assert.equal(empty[key], null);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM daily_review_symbol_levels WHERE archive_date=?').get(fixtures.dates.empty).n, 0);
  for (const symbol of ['GSPC', 'SPY', 'SOXX', 'MU']) assert.ok(db.prepare('SELECT * FROM tracked_symbols WHERE symbol=? AND is_active=1').get(symbol));
}));

test('七轮动完整旧主题、未知/歧义/跨 symbol、重复来源 id/预设都保留', () => withFixture((db) => {
  const row = archive(db, fixtures.dates.history);
  const market = JSON.parse(row.market_sentiment_blocks_json);
  const rotation = JSON.parse(row.sector_rotation_blocks_json);
  assert.deepEqual(market, fixtures.legacyNotes.market);
  assert.deepEqual(rotation, fixtures.legacyNotes.rotation);
  for (const symbol of ['GOLD', 'QQQ', 'SPY', 'SOXX', 'XLC', 'XLK', 'IGV']) {
    const block = rotation.find((b) => b.title.includes(symbol));
    assert.ok(block, `缺少 ${symbol} 轮动主题`);
    assert.ok(block.children.length > 0);
    assert.ok(db.prepare('SELECT * FROM tracked_symbols WHERE symbol=?').get(symbol));
  }
  assert.ok(market.some((b) => b.title === '市场广度'));
  assert.ok(rotation.some((b) => b.title === '存储/光通信'));
  assert.ok(rotation.some((b) => b.title.includes('QQQ') && b.title.includes('SPY')));
  assert.ok(rotation.some((b) => b.title === 'Micron'));
  assert.ok(rotation.filter((b) => b.title.includes('SOXX')).length >= 2);
  assert.ok(new Set(rotation.map((b) => b.id)).size < rotation.length);
  const gold = rotation.find((b) => b.title === '黄金 GOLD');
  assert.deepEqual(gold.children.map((c) => c.body), ['3300', '3200 重复预设']);
}));

test('账户价位冲突/NULL/显式空/key_levels/导出原文和引号逐字段准确', () => withFixture((db) => {
  const rows = db.prepare('SELECT * FROM daily_review_action_plans WHERE archive_date=? AND symbol=? ORDER BY account_id').all(fixtures.dates.history, 'SOXX');
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((p) => [p.account_id, p.support_levels, p.resistance_levels]), [[1, '498–508', '560–570'], [2, '495', '']]);
  assert.equal(rows[0].key_levels, '旧关键位 SOXX');
  assert.equal(rows[1].key_levels, null);
  const first = fixtures.legacyNotes.market[0];
  for (const text of ['6550–6600（强）\n6400', '6800–6850', 'CTA 加速卖出触发 6480/6450', '6900 call / 5800 put', '2026 EPS 300', '10Y 4.2% 压制估值', '6500']) {
    assert.ok(first.children.some((c) => c.body === text), text);
  }
  const market = JSON.parse(archive(db, fixtures.dates.history).market_sentiment_blocks_json);
  const quote = market.flatMap((b) => b.children).find((c) => c.title === "O'Brien <b>原文</b>");
  assert.equal(quote?.body, "It's 500–510（强）\n'不要改写' <script>alert(\"test\")</script>");
  const msft = db.prepare('SELECT * FROM daily_review_action_plans WHERE archive_date=? AND symbol=?').get(fixtures.dates.history, 'MSFT');
  assert.equal(msft.support_levels, '400-410');
  assert.equal(msft.resistance_levels, '450-460');
  const invalid = db.prepare('SELECT * FROM daily_review_action_plans WHERE archive_date=? AND symbol=?').get(fixtures.dates.explicitEmptyLevels, 'MSFT');
  assert.equal(invalid?.support_levels, '400-410\n无效行\nEPS 预计 300');
}));

test('目录含无行情候选、停用历史标的、TNX/^TNX 不新增 US10Y', () => withFixture((db) => {
  assert.equal(typeof fixtures.noPriceSymbol, 'string');
  assert.ok(db.prepare('SELECT * FROM tracked_symbols WHERE symbol=? AND is_active=1').get(fixtures.noPriceSymbol));
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM stock_raw WHERE symbol=?').get(fixtures.noPriceSymbol).n, 0);
  assert.equal(db.prepare("SELECT is_active FROM tracked_symbols WHERE symbol='OLDETF'").get().is_active, 0);
  assert.ok(fixtures.legacyNotes.rotation.some((b) => b.title.includes('OLDETF')));
  const tnx = db.prepare("SELECT * FROM tracked_symbols WHERE symbol='TNX'").get();
  assert.equal(tnx.yahoo_symbol, '^TNX');
  assert.equal(tnx.display_name, '十年期国债收益率');
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM tracked_symbols WHERE symbol='US10Y'").get().n, 0);
  assert.equal(db.prepare("SELECT current_price FROM stock_raw WHERE symbol='TNX' AND k_date=?").get(fixtures.dates.latest).current_price, 4.21);
}));

test('已存新基线 + 更晚旧 market + 基线前旧 rotation + NULL 目标交错纯数据', () => withFixture((db) => {
  const d = fixtures.dates;
  assert.ok(d.mixedOlderRotation < d.mixedBaseline && d.mixedBaseline < d.mixedNewerMarket && d.mixedNewerMarket < d.mixedTarget, '缺少交错来源日期');
  const baseline = archive(db, d.mixedBaseline);
  const review = JSON.parse(baseline.market_review_json);
  assert.equal(review.version, 1);
  assert.ok(Array.isArray(review.conflicts));
  assert.deepEqual(review.blocks.map((b) => b.symbol), ['GSPC', 'SOXX', 'MU']);
  for (const block of review.blocks) {
    assert.equal(block.type, 'symbol');
    const catalog = db.prepare('SELECT * FROM tracked_symbols WHERE symbol=?').get(block.symbol);
    assert.deepEqual(block.identity, { catalogId: catalog.id, displayCode: block.symbol, displayName: catalog.display_name });
    for (const child of block.children) if (['support', 'resistance'].includes(child.kind)) assert.ok(!Object.hasOwn(child, 'body'));
  }
  assert.equal(review.blocks[0].legacyOrigin.group, 'market');
  assert.equal(review.blocks[1].legacyOrigin.group, 'rotation');
  assert.equal(review.blocks[1].legacyOrigin.date, d.mixedOlderRotation);
  assert.equal(review.blocks[1].legacyOrigin.id, 'mixed-r');
  assert.equal(review.blocks[1].legacyOrigin.index, 0);
  assert.equal(review.blocks[1].legacyOrigin.title, '半导体 SOXX 旧轮动');
  assert.ok(!Object.hasOwn(review.blocks[2], 'legacyOrigin'));
  assert.ok(JSON.parse(baseline.market_sentiment_blocks_json)[0].title.includes('冻结'));
  assert.ok(JSON.parse(baseline.sector_rotation_blocks_json)[0].title.includes('冻结'));
  const market = archive(db, d.mixedNewerMarket);
  const rotation = archive(db, d.mixedOlderRotation);
  assert.equal(market.market_review_json, null);
  assert.equal(market.sector_rotation_blocks_json, null);
  assert.ok(JSON.parse(market.market_sentiment_blocks_json)[0].title.includes('GSPC'));
  assert.ok(JSON.parse(rotation.sector_rotation_blocks_json)[0].title.includes('SOXX'));
  for (const key of ['market_review_json', 'market_sentiment_blocks_json', 'sector_rotation_blocks_json']) assert.equal(archive(db, d.mixedTarget)[key], null);
}));

test('显式空新文档/权威行与旧非空证据共存，不通过删除表示空', () => withFixture((db) => {
  const d = fixtures.dates;
  assert.deepEqual(JSON.parse(archive(db, d.savedEmpty).market_review_json), { version: 1, blocks: [], conflicts: [] });
  const row = archive(db, d.explicitEmptyLevels);
  assert.ok(JSON.parse(row.market_review_json).blocks.some((b) => b.symbol === 'SOXX'));
  const levels = db.prepare('SELECT * FROM daily_review_symbol_levels WHERE archive_date=? AND symbol=?').get(d.explicitEmptyLevels, 'SOXX');
  assert.equal(levels?.support_levels, '');
  assert.equal(levels?.resistance_levels, '');
  assert.equal(db.prepare('SELECT support_levels FROM daily_review_action_plans WHERE archive_date=? AND symbol=?').get(d.explicitEmptyLevels, 'SOXX').support_levels, '480');
  assert.equal(JSON.parse(row.sector_rotation_blocks_json)[0].children[0].body, '500');
  assert.equal(archive(db, d.emptyMiddle).market_sentiment_blocks_json, '[]');
}));

test('重复 legacyOrigin 来源拒绝场景仅提供纯数据，不提前实现模型', () => {
  assert.ok(fixtures.duplicateSourceReview, '缺少重复来源输入');
  const review = fixtures.duplicateSourceReview;
  assert.equal(review.version, 1);
  assert.equal(review.blocks.length, 2);
  assert.notEqual(review.blocks[0].id, review.blocks[1].id);
  assert.deepEqual(review.blocks[0].legacyOrigin, review.blocks[1].legacyOrigin);
});

test('SQLite wrapper 与 seed SQL 同源、全表含序列重复加载完全幂等', () => {
  const wrapped = migrated();
  const direct = migrated();
  try {
    const sql = fixtures.marketReviewSeedSql();
    assert.equal(sql, fixtures.marketReviewSeedSql());
    fixtures.seedMarketReviewFixture(wrapped);
    direct.exec(sql);
    // 同一正式迁移两次建立时，自动时间相同；测试直接统一迁移目录/账户的时间。
    for (const db of [wrapped, direct]) db.exec("UPDATE tracked_symbols SET created_at='2026-01-01',updated_at='2026-01-01'; UPDATE investment_accounts SET created_at='2026-01-01',updated_at='2026-01-01'");
    assert.deepEqual(snapshot(wrapped), snapshot(direct));
    fixtures.seedMarketReviewFixture(wrapped);
    const before = snapshot(wrapped);
    fixtures.seedMarketReviewFixture(wrapped);
    assert.deepEqual(snapshot(wrapped), before, '再次 seed 改变了行或 AUTOINCREMENT 序列');
  } finally { wrapped.close(); direct.close(); }
});

test('seed 不删除无关用户目录、行情、日计划或 live 计划', () => withFixture((db) => {
  db.exec("INSERT INTO tracked_symbols(symbol,display_name,symbol_type) VALUES('USER_ONLY','用户','stock'); INSERT INTO account_live_action_plans(account_id,symbol,thinking) VALUES(4,'USER_ONLY','用户原文'); INSERT INTO daily_review_action_plans(archive_date,account_id,symbol,thinking) VALUES('2026-08-01',4,'USER_ONLY','保留'); INSERT INTO stock_raw(k_date,symbol,current_price) VALUES('2026-10-12','USER_ONLY',42)");
  const before = {
    catalog: db.prepare("SELECT * FROM tracked_symbols WHERE symbol='USER_ONLY'").get(),
    live: db.prepare("SELECT * FROM account_live_action_plans WHERE symbol='USER_ONLY'").get(),
    daily: db.prepare("SELECT * FROM daily_review_action_plans WHERE symbol='USER_ONLY'").get(),
    price: db.prepare("SELECT * FROM stock_raw WHERE symbol='USER_ONLY'").get(),
  };
  fixtures.seedMarketReviewFixture(db);
  for (const [key, table] of [['catalog', 'tracked_symbols'], ['live', 'account_live_action_plans'], ['daily', 'daily_review_action_plans'], ['price', 'stock_raw']]) assert.deepEqual(db.prepare(`SELECT * FROM ${table} WHERE symbol='USER_ONLY'`).get(), before[key]);
}));

test('既有 fixture 自然键保留原 catalog/plan id，identity 取实际目录 id', () => {
  const db = migrated();
  try {
    db.exec("INSERT INTO tracked_symbols(id,symbol,display_name,symbol_type) VALUES(500,'SPY','已有SPY','sector'); INSERT INTO daily_review_action_plans(id,archive_date,account_id,symbol) VALUES(600,'2026-10-12',1,'SOXX'); INSERT INTO account_live_action_plans(id,account_id,symbol) VALUES(700,1,'SOXX')");
    fixtures.seedMarketReviewFixture(db);
    assert.equal(db.prepare("SELECT id FROM tracked_symbols WHERE symbol='SPY'").get().id, 500);
    assert.equal(db.prepare("SELECT id FROM daily_review_action_plans WHERE archive_date='2026-10-12' AND account_id=1 AND symbol='SOXX'").get().id, 600);
    assert.equal(db.prepare("SELECT id FROM account_live_action_plans WHERE account_id=1 AND symbol='SOXX'").get().id, 700);
    const review = JSON.parse(archive(db, fixtures.dates.mixedBaseline).market_review_json);
    for (const block of review.blocks) assert.equal(block.identity.catalogId, db.prepare('SELECT id FROM tracked_symbols WHERE symbol=?').get(block.symbol).id);
    const before = snapshot(db);
    fixtures.seedMarketReviewFixture(db);
    assert.deepEqual(snapshot(db), before);
  } finally { db.close(); }
});

test('真实 fixture id 唯一约束失败回滚全部 seed，不碰冲突用户行', () => {
  const db = migrated();
  try {
    db.exec("INSERT INTO daily_review_action_plans(id,archive_date,account_id,symbol,thinking) VALUES(30001,'2026-08-01',4,'USER_ONLY','不能覆盖')");
    const before = snapshot(db);
    assert.throws(() => fixtures.seedMarketReviewFixture(db), /UNIQUE constraint failed/);
    assert.deepEqual(snapshot(db), before);
  } finally { db.close(); }
});

test('001–026 自有 fixtures 升级到正式 027 后直接加载，无全局 schema 开关', () => {
  assert.equal(fixtures.setFixtureSchema, undefined);
  const db = migrated(26);
  try {
    db.exec("INSERT INTO daily_review_archive(archive_date,review_status) VALUES('2026-08-01','reviewed')");
    db.exec(fs.readFileSync(path.join(root, 'cloudflare/migrations/027_market_review_symbol_levels.sql'), 'utf8'));
    fixtures.seedMarketReviewFixture(db);
    assert.equal(archive(db, '2026-08-01').review_status, 'reviewed');
    assert.ok(db.prepare('SELECT COUNT(*) AS n FROM daily_review_symbol_levels').get().n > 0);
  } finally { db.close(); }
});
