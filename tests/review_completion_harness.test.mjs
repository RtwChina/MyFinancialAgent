import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './helpers/review-completion-harness.mjs';
import { previousDate, reviewDate, workloads } from './helpers/review-completion-fixtures.mjs';
import { dates, legacyNotes, seedMarketReviewFixture } from './helpers/market-review-fixtures.mjs';

const liveUrl = '/api/account-live-action-plans';
const livePlan = { accountId: 1, symbol: 'GSPC', currentPosition: '5%-10%', thinking: '初始思考' };

test('health uses localhost APP_ENV=test and implicit/explicit GET perform no writes', async () => {
  const h = await createHarness();
  try {
    const before = h.snapshot();
    const expected = { status: 200, body: { ok: true, service: 'my-financial-agent-api', env: 'test' } };
    assert.deepEqual(await h.request('/api/health'), expected);
    assert.deepEqual(await h.request('/api/health', undefined, { method: 'GET' }), expected);
    assert.deepEqual(h.snapshot(), before);
    assert.deepEqual(h.stats(), { calls: 0, prepares: 0, roundTrips: 0 });
    assert.equal(h.events.length, 0);
  } finally { h.close(); }
});

test('original request with a body defaults to POST through the real live handler', async () => {
  const h = await createHarness();
  try {
    const created = await h.request(liveUrl, livePlan);
    assert.equal(created.status, 200);
    assert.equal(created.body.item.symbol, 'GSPC');
    assert.equal(created.body.item.thinking, livePlan.thinking);
    const row = h.sqlite.prepare('SELECT * FROM account_live_action_plans WHERE id = ?').get(created.body.item.id);
    assert.equal(row.account_id, livePlan.accountId);
    assert.equal(row.thinking, livePlan.thinking);
    assert.equal((await h.request(`${liveUrl}/${row.id}`)).body.item.id, row.id);
    assert.ok(h.events.some(event => event.stage === 'save' && event.table === 'account_live_action_plans'));
  } finally { h.close(); }
});

test('explicit GET ignores a supplied body instead of sending JSON or executing POST', async () => {
  const h = await createHarness();
  try {
    const created = await h.request(liveUrl, livePlan);
    assert.equal(created.status, 200);
    const before = h.snapshot();
    const writes = h.events.length;
    const result = await h.request(`${liveUrl}/${created.body.item.id}`, { thinking: '不得保存' }, { method: 'GET' });
    assert.equal(result.status, 200);
    assert.equal(result.body.item.thinking, livePlan.thinking);
    assert.deepEqual(h.snapshot(), before);
    assert.equal(h.events.length, writes);
  } finally { h.close(); }
});

test('explicit POST and PUT reach real Worker handlers and persist fields', async () => {
  const h = await createHarness();
  try {
    const created = await h.request(liveUrl, livePlan, { method: 'POST' });
    assert.equal(created.status, 200);
    const updated = await h.request(`${liveUrl}/${created.body.item.id}`, {
      thinking: '真实 PUT 更新', currentPosition: '15%-20%',
    }, { method: 'PUT' });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.item.id, created.body.item.id);
    assert.equal(updated.body.item.thinking, '真实 PUT 更新');
    assert.equal(updated.body.item.currentPosition, '15%-20%');
    const row = h.sqlite.prepare('SELECT * FROM account_live_action_plans WHERE id = ?').get(created.body.item.id);
    assert.equal(row.thinking, '真实 PUT 更新');
    assert.equal(row.current_position, '15%-20%');
    const daily = h.sqlite.prepare('SELECT * FROM daily_review_action_plans WHERE archive_date = ? AND account_id = ? AND symbol = ?').get(reviewDate, 1, 'GSPC');
    assert.equal(daily.thinking, row.thinking);
    assert.equal(daily.current_position, row.current_position);
  } finally { h.close(); }
});

test('explicit DELETE without a body deletes real live and latest daily rows', async () => {
  const h = await createHarness();
  try {
    const created = await h.request(liveUrl, livePlan);
    assert.equal(created.status, 200);
    const result = await h.request(`${liveUrl}/${created.body.item.id}`, undefined, { method: 'DELETE' });
    assert.deepEqual(result, { status: 200, body: { ok: true, deletedId: created.body.item.id } });
    assert.equal(h.sqlite.prepare('SELECT COUNT(*) AS count FROM account_live_action_plans').get().count, 0);
    assert.equal(h.sqlite.prepare('SELECT COUNT(*) AS count FROM daily_review_action_plans WHERE archive_date = ?').get(reviewDate).count, 0);
    assert.equal((await h.request(`${liveUrl}/${created.body.item.id}`, undefined, { method: 'GET' })).status, 404);
    assert.ok(h.events.some(event => event.stage === 'save' && event.key.includes('DELETE FROM account_live_action_plans')));
  } finally { h.close(); }
});

test('custom seed runs once after all formal migrations, replacing the default seed', async () => {
  let seeded = 0;
  const h = await createHarness({ seed(db) {
    seeded++;
    const columns = db.prepare('PRAGMA table_info(daily_review_archive)').all();
    assert.ok(columns.some(column => column.name === 'market_review_json'));
    db.prepare('INSERT INTO daily_review_symbol_levels (archive_date, symbol, support_levels) VALUES (?, ?, ?)').run(dates.empty, 'GSPC', '测试支撑');
  } });
  try {
    assert.equal(seeded, 1);
    assert.equal(h.payload, undefined);
    assert.equal(h.sqlite.prepare('SELECT COUNT(*) AS count FROM daily_review_archive').get().count, 0);
    assert.equal(h.sqlite.prepare('SELECT support_levels FROM daily_review_symbol_levels').get().support_levels, '测试支撑');
    assert.deepEqual(h.stats(), { calls: 0, prepares: 0, roundTrips: 0 });
  } finally { h.close(); }
});

test('shared fixture loader uses the same SQL data on migrated SQLite without default review data', async () => {
  const h = await createHarness({ seed: seedMarketReviewFixture });
  try {
    const history = h.sqlite.prepare('SELECT * FROM daily_review_archive WHERE archive_date = ?').get(dates.history);
    assert.ok(history, '共享历史夹具必须已加载');
    assert.deepEqual(JSON.parse(history.market_sentiment_blocks_json), legacyNotes.market);
    assert.deepEqual(JSON.parse(history.sector_rotation_blocks_json), legacyNotes.rotation);
    assert.equal(h.sqlite.prepare('SELECT COUNT(*) AS count FROM daily_review_archive WHERE archive_date = ?').get(reviewDate).count, 0);
    assert.equal(h.sqlite.prepare('SELECT COUNT(*) AS count FROM news_raw_data').get().count, 0);
    assert.equal(h.sqlite.prepare('SELECT COUNT(*) AS count FROM account_live_action_plans').get().count, 3);
    const before = h.snapshot();
    const response = await h.request(`/api/reviews/${dates.history}`, undefined, { method: 'GET' });
    assert.equal(response.status, 200);
    assert.equal(response.body.archiveDate, dates.history);
    assert.deepEqual(h.snapshot(), before);
    assert.equal(h.events.length, 0);
  } finally { h.close(); }
});

test('default payload is only the new marketReview contract with real GSPC identity and legacy DB evidence', async () => {
  const h = await createHarness();
  try {
    for (const key of ['marketSentimentBlocks', 'sectorRotationBlocks', 'market_sentiment_blocks', 'sector_rotation_blocks']) {
      assert.equal(Object.hasOwn(h.payload, key), false, `${key} 不得双写`);
    }
    assert.deepEqual(Object.keys(h.payload.marketReview).sort(), ['blocks', 'levels']);
    assert.deepEqual(h.payload.marketReview.levels, []);
    assert.equal(h.payload.marketReview.blocks.length, 1);
    const block = h.payload.marketReview.blocks[0];
    const catalog = h.sqlite.prepare('SELECT * FROM tracked_symbols WHERE symbol = ?').get('GSPC');
    assert.ok(block.id);
    assert.equal(block.type, 'symbol');
    assert.equal(block.symbol, 'GSPC');
    assert.deepEqual(block.identity, { catalogId: catalog.id, displayCode: catalog.symbol, displayName: catalog.display_name });
    assert.equal(block.children.length, 1);
    assert.ok(block.children[0].id);
    assert.notEqual(block.id, block.children[0].id);
    assert.deepEqual({ ...block.children[0], id: undefined }, { id: undefined, kind: 'thinking', title: '思考', body: '维持观察' });
    const oldNotes = [{ id: 'market-1', title: '市场', children: [{ id: 'child-1', title: '判断', body: '维持观察' }] }];
    for (const date of [previousDate, reviewDate]) {
      const row = h.sqlite.prepare('SELECT * FROM daily_review_archive WHERE archive_date = ?').get(date);
      assert.deepEqual(JSON.parse(row.market_sentiment_blocks_json), oldNotes);
      assert.deepEqual(JSON.parse(row.sector_rotation_blocks_json), oldNotes);
      assert.equal(row.market_review_json, null);
    }
  } finally { h.close(); }
});

for (const [name, fixture] of Object.entries(workloads)) {
  test(`${name} retains its news/plan workload dimensions`, async () => {
    assert.deepEqual(fixture, name === 'normal' ? { news: 50, plans: 20 } : { news: 200, plans: 40 });
    const h = await createHarness({ fixture });
    try {
      assert.equal(h.payload.actionPlans.length, fixture.plans);
      assert.equal(h.sqlite.prepare('SELECT COUNT(*) AS count FROM news_raw_data').get().count, fixture.news);
      assert.equal(h.sqlite.prepare('SELECT COUNT(*) AS count FROM daily_review_action_plans WHERE archive_date = ?').get(previousDate).count, fixture.plans);
    } finally { h.close(); }
  });
}

test('original complete() and complete(body) remain callable via save then completion', async () => {
  const h = await createHarness({ fixture: { news: 2, plans: 2 } });
  try {
    assert.equal((await h.complete()).status, 200);
    const first = h.sqlite.prepare('SELECT * FROM daily_review_archive WHERE archive_date = ?').get(reviewDate);
    assert.equal(first.review_status, 'reviewed');
    assert.equal(first.reviewer_news_notes, h.payload.reviewerNewsNotes);
    assert.equal(first.trading_summary, h.payload.tradingSummary);
    assert.equal((await h.complete({ accountSnapshot: { accounts: [], notes: '仍可传参' } })).status, 200);
    assert.ok(h.events.some(event => event.stage === 'save'));
    assert.ok(h.events.some(event => event.stage === 'complete'));
  } finally { h.close(); }
});

for (const constraint of ['PRIMARY KEY', 'NOT NULL']) {
  test(`DB.batch rolls back actual ${constraint} violations, counts failed calls and remains usable`, async () => {
    const h = await createHarness({ fixture: { news: 0, plans: 0 } });
    try {
      const before = h.snapshot();
      const insert = h.DB.prepare('INSERT INTO daily_review_symbol_levels (archive_date, symbol, support_levels) VALUES (?, ?, ?)');
      const update = h.DB.prepare('UPDATE daily_review_archive SET trading_summary = ? WHERE archive_date = ?');
      assert.deepEqual(h.stats(), { calls: 0, prepares: 2, roundTrips: 0 });
      const batch = [
        insert.bind(reviewDate, 'GSPC', '500'),
        update.bind('必须回滚', reviewDate),
        insert.bind(reviewDate, constraint === 'PRIMARY KEY' ? 'GSPC' : 'MU', constraint === 'PRIMARY KEY' ? '510' : null),
      ];
      await assert.rejects(h.DB.batch(batch), constraint === 'PRIMARY KEY' ? /UNIQUE constraint failed/ : /NOT NULL constraint failed/);
      assert.deepEqual(h.snapshot(), before);
      assert.deepEqual(h.stats(), { calls: 3, prepares: 2, roundTrips: 1 });
      assert.equal(h.rolledBack().length, 3);
      assert.deepEqual(h.rolledBack(), h.events.map(event => event.key));
      const retry = await h.DB.batch([insert.bind(reviewDate, 'GSPC', '')]);
      assert.deepEqual(retry, [{ success: true, results: [] }]);
      assert.deepEqual(h.stats(), { calls: 4, prepares: 2, roundTrips: 2 });
      const row = h.sqlite.prepare('SELECT * FROM daily_review_symbol_levels WHERE archive_date = ? AND symbol = ?').get(reviewDate, 'GSPC');
      assert.equal(row.support_levels, '');
      assert.equal(row.resistance_levels, '');
    } finally { h.close(); }
  });
}

test('prepare/bind are not round trips; run/all/first and one multi-statement batch are counted exactly', async () => {
  const h = await createHarness({ fixture: { news: 0, plans: 0 } });
  try {
    const insert = h.DB.prepare('INSERT INTO daily_review_symbol_levels (archive_date, symbol, support_levels) VALUES (?, ?, ?)');
    const select = h.DB.prepare('SELECT symbol, support_levels FROM daily_review_symbol_levels WHERE archive_date = ? ORDER BY symbol').bind(reviewDate);
    assert.deepEqual(h.stats(), { calls: 0, prepares: 2, roundTrips: 0 });
    const saved = await insert.bind(reviewDate, 'GSPC', '500').run();
    assert.equal(saved.success, true);
    assert.equal(saved.meta.changes, 1);
    assert.ok(Number.isInteger(saved.meta.last_row_id));
    assert.deepEqual(await select.all(), { results: [{ symbol: 'GSPC', support_levels: '500' }] });
    assert.deepEqual(await select.first(), { symbol: 'GSPC', support_levels: '500' });
    assert.equal(await select.first('support_levels'), '500');
    const results = await h.DB.batch([insert.bind(reviewDate, 'MU', ''), select]);
    assert.deepEqual(results, [
      { success: true, results: [] },
      { success: true, results: [{ symbol: 'GSPC', support_levels: '500' }, { symbol: 'MU', support_levels: '' }] },
    ]);
    assert.deepEqual(h.stats(), { calls: 6, prepares: 2, roundTrips: 5 });
  } finally { h.close(); }
});
