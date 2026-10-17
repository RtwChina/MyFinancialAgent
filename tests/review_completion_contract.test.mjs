import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './helpers/review-completion-harness.mjs';
import { assertEquivalent, assertConverged } from './helpers/review-completion-compare.mjs';
import { reviewDate, previousDate } from './helpers/review-completion-fixtures.mjs';

function assertCompleted(h, before, { newsCount, blocks = h.payload.marketReview.blocks } = {}) {
  const snapshot = h.snapshot();
  const record = snapshot.daily_review_archive.find(row => row.archive_date === reviewDate);
  assert.equal(record.review_status, 'reviewed');
  assert.match(record.reviewed_at, /^\d{4}-\d{2}-\d{2} /);
  assert.equal(record.reviewer_news_notes, h.payload.reviewerNewsNotes);
  assert.equal(record.trading_summary, h.payload.tradingSummary);
  assert.deepEqual(JSON.parse(record.market_review_json).blocks, blocks);
  const original = before.daily_review_archive.find(row => row.archive_date === reviewDate);
  for (const column of ['market_sentiment_blocks_json', 'sector_rotation_blocks_json']) assert.equal(record[column], original[column]);
  const daily = snapshot.daily_review_action_plans.filter(row => row.archive_date === reviewDate);
  assert.equal(daily.length, h.payload.actionPlans.length);
  assert.deepEqual(daily.map(row => [row.account_id, row.symbol, row.action_type, row.current_position, row.entry_plan, row.thinking]),
    h.payload.actionPlans.map(plan => [plan.accountId, plan.symbol, plan.actionType, plan.currentPosition, plan.entryPlan, plan.thinking]));
  assert.ok(daily.every(row => row.support_levels === null && row.resistance_levels === null));
  assert.deepEqual(snapshot.daily_review_action_plans.filter(row => row.archive_date === previousDate), before.daily_review_action_plans.filter(row => row.archive_date === previousDate));
  assert.deepEqual(snapshot.daily_review_archive.filter(row => row.archive_date !== reviewDate), before.daily_review_archive.filter(row => row.archive_date !== reviewDate));
  const news = snapshot.daily_review_archive_news.filter(row => row.archive_date === reviewDate);
  assert.equal(news.length, newsCount);
  for (const row of news) {
    const raw = before.news_raw_data.find(item => item.id === row.original_news_id);
    assert.ok(raw);
    for (const column of ['title', 'content', 'pub_date', 'ai_summary', 'news_hash']) assert.equal(row[column], raw[column]);
    for (const column of ['source', 'url']) assert.equal(row[column], raw[column] ?? '');
    assert.equal(row.processing_status, 'reviewed');
  }
  assert.equal(snapshot.review_account_snapshots.filter(row => row.archive_date === reviewDate).length, 1);
  assertEquivalent(snapshot.investment_accounts.map(({ updated_at, ...row }) => row), before.investment_accounts.map(({ updated_at, ...row }) => row));
  const latest = snapshot.daily_review_archive.map(row => row.archive_date).sort().at(-1);
  assert.equal(snapshot.account_live_action_plans.length, latest === reviewDate ? daily.length : before.account_live_action_plans.length);
  assert.ok(h.events.every(event => event.values.length <= 100));
}

for (const fixture of [{}, { news: 200, plans: 40 }, { news: 0, plans: 0 }, { news: 5, plans: 3, sourceIds: true }, { historical: true }]) {
  test(`new review completion preserves all business content ${JSON.stringify(fixture)}`, async () => {
    const a = await createHarness({ fixture }), b = await createHarness({ fixture });
    try {
      const before = a.snapshot();
      const ra = await a.complete(), rb = await b.complete();
      assert.equal(ra.status, 200);
      assert.equal(ra.body.reviewStatus, 'reviewed');
      assertEquivalent(ra, rb);
      assertConverged(a.snapshot(), b.snapshot());
      assertCompleted(a, before, { newsCount: fixture.news ?? 50 });
      for (const suffix of ['', '/bootstrap']) {
        const result = await a.request(`/api/reviews/${reviewDate}${suffix}`);
        assert.equal(result.status, 200);
        assertEquivalent(result, await b.request(`/api/reviews/${reviewDate}${suffix}`));
        const market = suffix ? result.body.structuredNotes.marketReview : result.body.review.marketReview;
        assert.equal(market.source, 'saved');
        assert.equal(market.blocks[0].symbol, 'GSPC');
        assert.equal(market.blocks[0].children[0].body, '维持观察');
      }
    } finally { a.close(); b.close(); }
  });
}

for (const scenario of ['explicit empty market', 'same symbol two accounts', 'no prices', 'duplicate source news ids', 'batch autofill']) {
  test(`new contract compatibility: ${scenario}`, async () => {
    const h = await createHarness({ fixture: { news: 4, plans: 2, historical: true } });
    try {
      if (scenario === 'explicit empty market') h.payload.marketReview.blocks = [];
      if (scenario === 'same symbol two accounts') h.payload.actionPlans[1].symbol = h.payload.actionPlans[0].symbol;
      if (scenario === 'no prices') h.sqlite.exec('DELETE FROM stock_raw');
      if (scenario === 'duplicate source news ids') h.sqlite.exec("UPDATE daily_news_ai_analysis SET source_news_ids='[1,1,2,999]'");
      const before = h.snapshot();
      const body = scenario === 'batch autofill' ? { completionSource: 'batch', requireCompleteContent: true, autoFill: { reviewerNewsNotes: 'AI fallback', marketReview: { blocks: [], levels: [] } } } : {};
      const result = await h.complete(body);
      assert.equal(result.status, 200, result.body.error || JSON.stringify(result.body));
      assert.equal(result.body.reviewStatus, 'reviewed');
      assertCompleted(h, before, { newsCount: scenario === 'duplicate source news ids' ? 2 : 4 });
      const bootstrap = await h.request(`/api/reviews/${reviewDate}/bootstrap`);
      assert.equal(bootstrap.status, 200);
      assert.equal(bootstrap.body.actionPlans.length, 2);
      if (scenario === 'explicit empty market') assert.deepEqual(bootstrap.body.structuredNotes.marketReview.blocks, []);
      if (scenario === 'same symbol two accounts') {
        assert.equal(new Set(bootstrap.body.actionPlans.map(plan => plan.accountId)).size, 2);
        assert.equal(new Set(bootstrap.body.actionPlans.map(plan => plan.symbol)).size, 1);
      }
      if (scenario === 'no prices') {
        assert.deepEqual(bootstrap.body.prices.stock, []);
        assert.ok(bootstrap.body.marketReviewSymbols.some(item => item.symbol === 'GSPC'));
      }
      for (const url of ['/api/reviews?page=1', '/api/reviews/pending?limit=all']) assert.equal((await h.request(url)).status, 200);
      const completedState = h.snapshot();
      const skipped = await h.request(`/api/reviews/${reviewDate}/complete`, { onlyIfPending: true });
      assert.equal(skipped.status, 200);
      assert.equal(skipped.body.skipped, true);
      assert.equal(skipped.body.reason, 'already reviewed');
      assert.deepEqual(h.snapshot(), completedState);
    } finally { h.close(); }
  });
}

for (const field of ['marketSentimentBlocks', 'sectorRotationBlocks', 'market_sentiment_blocks', 'sector_rotation_blocks']) {
  test(`retired note write field ${field} fails without partial persistence`, async () => {
    const h = await createHarness();
    try {
      const before = h.snapshot();
      const result = await h.request(`/api/reviews/${reviewDate}`, { ...h.payload, [field]: [] });
      assert.equal(result.status, 400);
      assert.match(result.body.error, /旧复盘字段已停用.*刷新/);
      assert.deepEqual(h.snapshot(), before);
    } finally { h.close(); }
  });
}

test('plan membership preserves submitted account/symbol behavior independently of market identity validation', async () => {
  const h = await createHarness();
  try {
    h.payload.actionPlans[0].accountId = 999;
    h.payload.actionPlans[0].symbol = 'UNKNOWN';
    const result = await h.request(`/api/reviews/${reviewDate}`, h.payload);
    assert.equal(result.status, 200);
    const saved = h.snapshot().daily_review_action_plans.find(row => row.archive_date === reviewDate && row.symbol === 'UNKNOWN');
    assert.equal(saved.account_id, 999);
    assert.equal(result.body.marketReview.blocks[0].symbol, 'GSPC');
  } finally { h.close(); }
});

test('manual repeated completion and snake account snapshot preserve business results', async () => {
  const h = await createHarness();
  try {
    assert.equal((await h.complete()).status, 200);
    const before = h.snapshot();
    const input = { account_snapshot: { accounts: [], notes: '重复完成' } };
    const once = await h.request(`/api/reviews/${reviewDate}/complete`, input);
    assert.equal(once.status, 200);
    assert.equal(once.body.reviewStatus, 'reviewed');
    const after = h.snapshot();
    for (const table of ['daily_review_archive', 'daily_review_action_plans', 'account_live_action_plans', 'daily_review_symbol_levels', 'news_raw_data']) assertEquivalent(after[table], before[table]);
    assert.equal(after.review_account_snapshots.find(row => row.archive_date === reviewDate).notes, '重复完成');
    const twice = await h.request(`/api/reviews/${reviewDate}/complete`, input);
    assertEquivalent(once, twice);
    assertConverged(after, h.snapshot());
  } finally { h.close(); }
});
