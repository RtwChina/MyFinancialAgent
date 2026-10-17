import assert from 'node:assert/strict';
import test from 'node:test';
import * as worker from '../cloudflare/worker/src/index.js';
import { createHarness } from './helpers/review-completion-harness.mjs';
import { reviewDate, previousDate } from './helpers/review-completion-fixtures.mjs';
import { dates, legacyNotes, seedMarketReviewFixture } from './helpers/market-review-fixtures.mjs';
import { createMarketReview, linkLegacyMarketBlock, serializeMarketReview } from '../cloudflare/web/market-review-model.js';

function plans(count = 150) {
  return Array.from({ length: count }, (_, index) => ({
    accountId: index % 2 + 1, symbol: `SQL${index}`,
    actionType: '持仓观察', entryPlan: `记录 '${index}'\n第二行`,
    takeProfitPlan: '止盈 600', stopLossPlan: '止损 480',
    keyLevels: `旧关键位 ${index}`, supportLevels: '500', resistanceLevels: '560',
    currentPosition: '10%-15%', positionAmount: index === 0 ? 0 : 1000 + index,
    thinking: `观察 ${index} <b>原文</b>`, marketType: '美股', sortOrder: index,
  }));
}

for (const [name, table, build] of [
  ['日计划', 'daily_review_action_plans', (h, input) => worker.buildReviewActionPlanStatements({ DB: h.DB }, reviewDate, input)],
  ['live 计划', 'account_live_action_plans', (h, input) => worker.buildAccountLiveActionPlanStatements({ DB: h.DB }, input)],
]) {
  test(`集合：${name}大规模 UPSERT/成员删除只用两条语句、一个 batch`, async () => {
    const h = await createHarness({ fixture: { news: 0, plans: 0 } });
    try {
      const input = plans();
      const built = build(h, input);
      assert.equal(built.statements.length, 2);
      assert.ok(built.statements.every(statement => statement.values.length <= 100));
      const before = h.stats().roundTrips;
      await h.DB.batch(built.statements);
      assert.equal(h.stats().roundTrips - before, 1);
      const rows = h.sqlite.prepare(`SELECT * FROM ${table} ${table.startsWith('daily_') ? 'WHERE archive_date = ?' : ''} ORDER BY sort_order`).all(...(table.startsWith('daily_') ? [reviewDate] : []));
      assert.equal(rows.length, input.length);
      for (const [index, row] of rows.entries()) {
        const item = input[index];
        assert.equal(row.account_id, item.accountId);
        assert.equal(row.symbol, item.symbol);
        assert.equal(row.entry_plan, item.entryPlan);
        assert.equal(row.take_profit_plan, item.takeProfitPlan);
        assert.equal(row.stop_loss_plan, item.stopLossPlan);
        assert.equal(row.current_position, item.currentPosition);
        assert.equal(row.position_amount, item.positionAmount);
        assert.equal(row.thinking, item.thinking);
        assert.equal(row.market_type, item.marketType);
        assert.equal(row.sort_order, index);
      }
      const initial = rows[0];
      await h.DB.batch(build(h, [{ ...input[0], entryPlan: '修改仓位记录', positionAmount: null }]).statements);
      const final = h.sqlite.prepare(`SELECT * FROM ${table} ${table.startsWith('daily_') ? 'WHERE archive_date = ?' : ''}`).all(...(table.startsWith('daily_') ? [reviewDate] : []));
      assert.equal(final.length, 1);
      assert.equal(final[0].id, initial.id);
      assert.equal(final[0].created_at, initial.created_at);
      assert.equal(final[0].entry_plan, '修改仓位记录');
      assert.equal(final[0].position_amount, null);
      await h.DB.batch(build(h, []).statements);
      assert.equal(h.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table} ${table.startsWith('daily_') ? 'WHERE archive_date = ?' : ''}`).get(...(table.startsWith('daily_') ? [reviewDate] : [])).n, 0);
    } finally { h.close(); }
  });
}

test('集合：日计划集合删除只影响目标日期，同标的不同账户可同时保留', async () => {
  const h = await createHarness({ fixture: { news: 0, plans: 2 } });
  try {
    const before = h.sqlite.prepare('SELECT * FROM daily_review_action_plans WHERE archive_date = ? ORDER BY id').all(previousDate);
    const same = [1, 2].map(accountId => ({ ...plans(1)[0], symbol: 'SOXX', accountId }));
    await h.DB.batch(worker.buildReviewActionPlanStatements({ DB: h.DB }, reviewDate, same).statements);
    assert.equal(h.sqlite.prepare('SELECT COUNT(*) n FROM daily_review_action_plans WHERE archive_date = ?').get(reviewDate).n, 2);
    await h.DB.batch(worker.buildReviewActionPlanStatements({ DB: h.DB }, reviewDate, same.slice(1)).statements);
    assert.deepEqual(h.sqlite.prepare('SELECT account_id FROM daily_review_action_plans WHERE archive_date = ?').all(reviewDate).map(row => row.account_id), [2]);
    assert.deepEqual(h.sqlite.prepare('SELECT * FROM daily_review_action_plans WHERE archive_date = ? ORDER BY id').all(previousDate), before);
  } finally { h.close(); }
});

test('集合：用户引号与 HTML 只作绑定数据，不进入 SQL 文本', async () => {
  const h = await createHarness({ fixture: { news: 0, plans: 0 } });
  try {
    const body = "x'); DROP TABLE tracked_symbols; -- <img src=x>";
    const input = [{ ...plans(1)[0], symbol: "QU'OTE", thinking: body }];
    const built = worker.buildReviewActionPlanStatements({ DB: h.DB }, reviewDate, input);
    assert.ok(built.statements.every(statement => !statement.sql.includes(body) && !statement.sql.includes("QU'OTE")));
    await h.DB.batch(built.statements);
    assert.equal(h.sqlite.prepare('SELECT thinking FROM daily_review_action_plans WHERE archive_date = ? AND symbol = ?').get(reviewDate, "QU'OTE").thinking, body);
    assert.ok(h.sqlite.prepare('SELECT COUNT(*) n FROM tracked_symbols').get().n > 0);
  } finally { h.close(); }
});

test('集合：日期价位 UPSERT 大量行只用一条语句，明确空保留、其他日不变', async () => {
  const h = await createHarness({ fixture: { news: 0, plans: 0 } });
  try {
    assert.equal(typeof worker.buildReviewSymbolLevelStatements, 'function');
    const input = plans().map(plan => ({ symbol: plan.symbol, supportLevels: '500\n480', resistanceLevels: '560' }));
    const built = worker.buildReviewSymbolLevelStatements({ DB: h.DB }, reviewDate, input);
    assert.equal(built.length, 1);
    assert.ok(built.every(statement => statement.values.length <= 100));
    await h.DB.batch(built);
    const first = h.sqlite.prepare('SELECT * FROM daily_review_symbol_levels WHERE archive_date = ? AND symbol = ?').get(reviewDate, 'SQL0');
    assert.equal(h.sqlite.prepare('SELECT COUNT(*) n FROM daily_review_symbol_levels').get().n, input.length);
    await h.DB.batch(worker.buildReviewSymbolLevelStatements({ DB: h.DB }, previousDate, [{ symbol: 'SQL0', supportLevels: '历史500', resistanceLevels: '历史560' }]));
    await h.DB.batch(worker.buildReviewSymbolLevelStatements({ DB: h.DB }, reviewDate, [{ symbol: 'SQL0', supportLevels: '', resistanceLevels: '' }]));
    const final = h.sqlite.prepare('SELECT * FROM daily_review_symbol_levels WHERE archive_date = ? AND symbol = ?').get(reviewDate, 'SQL0');
    assert.equal(final.support_levels, '');
    assert.equal(final.resistance_levels, '');
    assert.equal(final.created_at, first.created_at);
    assert.equal(h.sqlite.prepare('SELECT support_levels FROM daily_review_symbol_levels WHERE archive_date = ? AND symbol = ?').get(previousDate, 'SQL0').support_levels, '历史500');
    assert.equal(h.sqlite.prepare('SELECT support_levels FROM daily_review_symbol_levels WHERE archive_date = ? AND symbol = ?').get(reviewDate, 'SQL1').support_levels, '500\n480');
  } finally { h.close(); }
});

test('集合：真实 SQLite 约束失败时整个 D1 batch 回滚', async () => {
  const h = await createHarness({ fixture: { news: 0, plans: 0 } });
  try {
    assert.equal(typeof worker.buildReviewSymbolLevelStatements, 'function');
    const before = h.snapshot();
    const levels = worker.buildReviewSymbolLevelStatements({ DB: h.DB }, reviewDate, [
      { symbol: 'SOXX', supportLevels: '500', resistanceLevels: '560' },
    ]);
    const daily = worker.buildReviewActionPlanStatements({ DB: h.DB }, reviewDate, plans(3));
    const invalid = h.DB.prepare('INSERT INTO daily_review_symbol_levels (archive_date, symbol, support_levels, resistance_levels) VALUES (?, ?, NULL, ?)').bind(reviewDate, 'INVALID', '');
    await assert.rejects(h.DB.batch([...levels, ...daily.statements, invalid]), /NOT NULL/);
    assert.deepEqual(h.snapshot(), before);
  } finally { h.close(); }
});

for (const suffix of ['', '/bootstrap']) {
  test(`读取：${suffix || 'date'} 新空记录、完整目录和所有表零写`, async () => {
    const h = await createHarness({ fixture: { news: 0, plans: 0 } });
    try {
      h.sqlite.prepare('UPDATE daily_review_archive SET market_sentiment_blocks_json = NULL, sector_rotation_blocks_json = NULL WHERE archive_date IN (?, ?)').run(reviewDate, previousDate);
      h.sqlite.prepare('INSERT INTO tracked_symbols (symbol, display_name, symbol_type) VALUES (?, ?, ?)').run('NOPRICE', '无行情候选', 'stock');
      const before = h.snapshot();
      const beforeTrips = h.stats().roundTrips;
      const response = await h.request(`/api/reviews/${reviewDate}${suffix}`);
      assert.equal(response.status, 200);
      const market = suffix ? response.body.structuredNotes.marketReview : response.body.review.marketReview;
      assert.equal(market.version, 1);
      assert.equal(market.source, 'empty');
      assert.deepEqual(market.blocks, []);
      assert.deepEqual(market.conflicts, []);
      assert.deepEqual(suffix ? response.body.symbolLevels : response.body.review.symbolLevels, {});
      if (suffix) {
        assert.ok(response.body.marketReviewSymbols.some(item => item.symbol === 'NOPRICE'));
        assert.ok(response.body.marketReviewSymbols.some(item => item.symbol === 'GOLD'));
      }
      assert.deepEqual(h.snapshot(), before);
      assert.equal(h.events.length, 0);
      assert.ok(h.stats().roundTrips - beforeTrips <= 2);
    } finally { h.close(); }
  });

  test(`读取：${suffix || 'date'} 已保存空结构和空价位是权威`, async () => {
    const h = await createHarness({ fixture: { news: 0, plans: 0 } });
    try {
      h.sqlite.prepare('UPDATE daily_review_archive SET market_review_json = ? WHERE archive_date = ?').run(serializeMarketReview(createMarketReview()), reviewDate);
      h.sqlite.prepare("INSERT INTO daily_review_symbol_levels (archive_date, symbol, support_levels, resistance_levels) VALUES (?, 'SOXX', '', '')").run(reviewDate);
      h.sqlite.prepare("INSERT INTO daily_review_symbol_levels (archive_date, symbol, support_levels, resistance_levels) VALUES (?, 'SOXX', '历史500', '历史560')").run(previousDate);
      const before = h.snapshot();
      const response = await h.request(`/api/reviews/${reviewDate}${suffix}`);
      assert.equal(response.status, 200);
      const market = suffix ? response.body.structuredNotes.marketReview : response.body.review.marketReview;
      assert.equal(market.source, 'saved');
      assert.deepEqual(market.blocks, []);
      assert.deepEqual(suffix ? response.body.symbolLevels : response.body.review.symbolLevels, { SOXX: { supportLevels: '', resistanceLevels: '' } });
      assert.deepEqual(h.snapshot(), before);
    } finally { h.close(); }
  });
}

test('读取：日期不存在仍返回 review=null，不写入新日期', async () => {
  const h = await createHarness({ fixture: { news: 0, plans: 0 } });
  try {
    const before = h.snapshot();
    assert.deepEqual((await h.request('/api/reviews/2026-10-01')).body, { archiveDate: '2026-10-01', review: null });
    assert.deepEqual(h.snapshot(), before);
  } finally { h.close(); }
});

test('读取：新结构两接口一致，价位来自目标日映射，身份和思考原文保持', async () => {
  const h = await createHarness({ fixture: { news: 0, plans: 0 } });
  try {
    const document = createMarketReview({ blocks: [{
      id: 'soxx-1', type: 'symbol', symbol: 'SOXX',
      identity: { catalogId: 19, displayCode: 'SOXX', displayName: '半导体板块' },
      children: [
        { id: 's-1', kind: 'support', title: '支撑位', body: '不能作为写源' },
        { id: 'r-1', kind: 'resistance', title: '压力位' },
        { id: 't-1', kind: 'thinking', title: '思考', body: '<script>仅原文</script>\n"500/480"' },
      ],
    }] });
    h.sqlite.prepare('UPDATE daily_review_archive SET market_review_json = ? WHERE archive_date = ?').run(serializeMarketReview(document), reviewDate);
    h.sqlite.prepare("INSERT INTO daily_review_symbol_levels (archive_date, symbol, support_levels, resistance_levels) VALUES (?, 'SOXX', '500–510', '')").run(reviewDate);
    const before = h.snapshot();
    const detail = await h.request(`/api/reviews/${reviewDate}`);
    const bootstrap = await h.request(`/api/reviews/${reviewDate}/bootstrap`);
    assert.equal(detail.status, 200);
    assert.equal(bootstrap.status, 200);
    assert.deepEqual(detail.body.review.marketReview, bootstrap.body.structuredNotes.marketReview);
    const block = detail.body.review.marketReview.blocks[0];
    assert.equal(block.id, 'soxx-1');
    assert.deepEqual(block.identity, document.blocks[0].identity);
    assert.deepEqual(block.children.map(child => child.id), ['s-1', 'r-1', 't-1']);
    assert.equal(block.children[0].body, '500–510');
    assert.equal(block.children[1].body, '');
    assert.equal(block.children[2].body, document.blocks[0].children[2].body);
    assert.deepEqual(h.snapshot(), before);
    assert.equal(h.events.length, 0);
  } finally { h.close(); }
});

function newBlocks(symbol = 'SOXX') {
  return [{ id: `block-${symbol}`, type: 'symbol', symbol, children: [
    { id: `${symbol}-support`, kind: 'support', title: '支撑位' },
    { id: `${symbol}-resistance`, kind: 'resistance', title: '压力位' },
    { id: `${symbol}-thinking`, kind: 'thinking', title: '思考', body: '观察\n"500/480" <b>只作原文</b>' },
  ] }];
}

async function assertRejectedWithoutWrites(h, body, status) {
  const before = h.snapshot();
  const response = await h.request(`/api/reviews/${reviewDate}`, body);
  assert.equal(response.status, status, response.body.error || JSON.stringify(response.body));
  assert.deepEqual(h.snapshot(), before);
  assert.equal(h.events.filter(event => event.write).length, 0);
  return response;
}

test('US1 保存：完整结构与权威目录身份返回，重开稳定且旧证据列零修改', async () => {
  const h = await createHarness({ fixture: { news: 0, plans: 0 } });
  try {
    const archiveBefore = h.sqlite.prepare('SELECT * FROM daily_review_archive WHERE archive_date = ?').get(reviewDate);
    const blocks = newBlocks();
    blocks[0].identity = { catalogId: 999, displayCode: '伪造', displayName: '伪造名称' };
    const response = await h.request(`/api/reviews/${reviewDate}`, { marketReview: { blocks, levels: [] }, reviewerNewsNotes: '新闻', tradingSummary: '总结' });
    assert.equal(response.status, 200);
    assert.equal(response.body.marketReview.version, 1);
    assert.equal(response.body.marketReview.source, 'saved');
    assert.equal(response.body.marketReview.blocks[0].id, 'block-SOXX');
    const catalog = h.sqlite.prepare("SELECT * FROM tracked_symbols WHERE symbol='SOXX'").get();
    assert.deepEqual(response.body.marketReview.blocks[0].identity, { catalogId: catalog.id, displayCode: 'SOXX', displayName: catalog.display_name });
    assert.equal(response.body.marketReview.blocks[0].children[2].body, blocks[0].children[2].body);
    assert.deepEqual(response.body.symbolLevels, { SOXX: { supportLevels: '', resistanceLevels: '' } });
    const reopened = await h.request(`/api/reviews/${reviewDate}/bootstrap`);
    assert.deepEqual(reopened.body.structuredNotes.marketReview, response.body.marketReview);
    const stored = h.sqlite.prepare('SELECT * FROM daily_review_archive WHERE archive_date = ?').get(reviewDate);
    assert.equal(stored.market_sentiment_blocks_json, archiveBefore.market_sentiment_blocks_json);
    assert.equal(stored.sector_rotation_blocks_json, archiveBefore.sector_rotation_blocks_json);
    assert.equal(JSON.parse(stored.market_review_json).blocks[0].children[2].body, blocks[0].children[2].body);
  } finally { h.close(); }
});

test('US1 保存：仅省略整个 marketReview 保持，空 blocks 明确清空', async () => {
  const h = await createHarness({ fixture: { news: 0, plans: 0 } });
  try {
    assert.equal((await h.request(`/api/reviews/${reviewDate}`, { marketReview: { blocks: newBlocks(), levels: [] } })).status, 200);
    const stored = h.sqlite.prepare('SELECT market_review_json FROM daily_review_archive WHERE archive_date = ?').get(reviewDate).market_review_json;
    assert.ok(stored);
    assert.equal((await h.request(`/api/reviews/${reviewDate}`, { reviewerNewsNotes: '只改新闻' })).status, 200);
    assert.equal(h.sqlite.prepare('SELECT market_review_json FROM daily_review_archive WHERE archive_date = ?').get(reviewDate).market_review_json, stored);
    const cleared = await h.request(`/api/reviews/${reviewDate}`, { marketReview: { blocks: [], levels: [] } });
    assert.equal(cleared.status, 200);
    assert.deepEqual(cleared.body.marketReview.blocks, []);
    assert.equal(cleared.body.marketReview.source, 'saved');
  } finally { h.close(); }
});

for (const marketReview of [null, [], 'invalid', {}, { blocks: [] }, { levels: [] }, { blocks: null, levels: [] }, { blocks: [], levels: null }]) {
  test(`US1 拒绝：marketReview 对象和两个数组必填 ${JSON.stringify(marketReview)}`, async () => {
    const h = await createHarness({ fixture: { news: 0, plans: 0 } });
    try { await assertRejectedWithoutWrites(h, { marketReview }, 400); } finally { h.close(); }
  });
}

for (const field of ['marketSentimentBlocks', 'sectorRotationBlocks', 'market_sentiment_blocks', 'sector_rotation_blocks']) {
  test(`US1 拒绝：旧写字段 ${field} 返回刷新错误`, async () => {
    const h = await createHarness({ fixture: { news: 0, plans: 0 } });
    try {
      const response = await assertRejectedWithoutWrites(h, { [field]: [], marketReview: { blocks: [], levels: [] } }, 400);
      assert.match(response.body.error, /旧复盘字段已停用.*刷新/);
    } finally { h.close(); }
  });
}

for (const [name, blocks, status] of [
  ['不存在的标的', newBlocks('DOESNOTEXIST'), 400],
  ['手输展示键', newBlocks('US10Y'), 400],
  ['重复一级id', [newBlocks()[0], { ...newBlocks('MU')[0], id: 'block-SOXX' }], 400],
  ['重复二级id', [{ ...newBlocks()[0], children: [newBlocks()[0].children[0], { ...newBlocks()[0].children[1], id: 'SOXX-support' }] }], 400],
  ['重复新建标的', [newBlocks()[0], { ...newBlocks()[0], id: 'another', children: [] }], 409],
  ['伪造来源', [{ ...newBlocks()[0], legacyOrigin: { date: previousDate, group: 'rotation', index: 0 } }], 400],
  ['新建legacy', [{ id: 'legacy-new', type: 'legacy', symbol: null, title: '不能新建', children: [] }], 400],
]) {
  test(`US1 拒绝：${name} 在 write batch 前终止`, async () => {
    const h = await createHarness({ fixture: { news: 0, plans: 0 } });
    try { await assertRejectedWithoutWrites(h, { marketReview: { blocks, levels: [] } }, status); } finally { h.close(); }
  });
}

test('US1 保存：无行情目录标的可选；停用标的拒绝新建', async () => {
  const h = await createHarness({ fixture: { news: 0, plans: 0 } });
  try {
    h.sqlite.prepare('INSERT INTO tracked_symbols (symbol, display_name, symbol_type, is_active) VALUES (?, ?, ?, ?)').run('NOPRICE', '无行情', 'stock', 1);
    const result = await h.request(`/api/reviews/${reviewDate}`, { marketReview: { blocks: newBlocks('NOPRICE'), levels: [] } });
    assert.equal(result.status, 200);
    assert.equal(result.body.marketReview.blocks[0].symbol, 'NOPRICE');
    h.sqlite.prepare("UPDATE tracked_symbols SET is_active=0 WHERE symbol='MU'").run();
    const before = h.snapshot();
    const response = await h.request(`/api/reviews/${reviewDate}`, { marketReview: { blocks: newBlocks('MU'), levels: [] } });
    assert.equal(response.status, 400);
    assert.deepEqual(h.snapshot(), before);
  } finally { h.close(); }
});

for (const remove of [false, true]) {
  test(`US1 保存：已存 ${remove ? '删除' : '停用'} 目录身份允许原块继续编辑`, async () => {
    const h = await createHarness({ fixture: { news: 0, plans: 0 } });
    try {
      const catalog = h.sqlite.prepare("SELECT * FROM tracked_symbols WHERE symbol='SOXX'").get();
      const blocks = newBlocks();
      blocks[0].identity = { catalogId: catalog.id, displayCode: 'SOXX', displayName: catalog.display_name };
      h.sqlite.prepare('UPDATE daily_review_archive SET market_review_json = ? WHERE archive_date = ?').run(serializeMarketReview(createMarketReview({ blocks })), reviewDate);
      h.sqlite.exec(remove ? "DELETE FROM tracked_symbols WHERE symbol='SOXX'" : "UPDATE tracked_symbols SET is_active=0 WHERE symbol='SOXX'");
      const patch = structuredClone(blocks);
      patch[0].identity.displayName = '伪造名字';
      patch[0].children[2].body = '继续编辑历史合法身份';
      const response = await h.request(`/api/reviews/${reviewDate}`, { marketReview: { blocks: patch, levels: [] } });
      assert.equal(response.status, 200);
      assert.deepEqual(response.body.marketReview.blocks[0].identity, blocks[0].identity);
      assert.equal(response.body.marketReview.blocks[0].children[2].body, '继续编辑历史合法身份');
    } finally { h.close(); }
  });
}

test('US1 拒绝：已有价位二级即使为空也不能更换标的', async () => {
  const h = await createHarness({ fixture: { news: 0, plans: 0 } });
  try {
    h.sqlite.prepare('UPDATE daily_review_archive SET market_review_json = ? WHERE archive_date = ?').run(serializeMarketReview(createMarketReview({ blocks: newBlocks() })), reviewDate);
    const blocks = newBlocks();
    blocks[0].symbol = 'MU';
    await assertRejectedWithoutWrites(h, { marketReview: { blocks, levels: [] } }, 409);
  } finally { h.close(); }
});

test('US1 保存：仅含思考更换保留 block/child id 与原文', async () => {
  const h = await createHarness({ fixture: { news: 0, plans: 0 } });
  try {
    const blocks = newBlocks();
    blocks[0].children = [blocks[0].children[2]];
    h.sqlite.prepare('UPDATE daily_review_archive SET market_review_json = ? WHERE archive_date = ?').run(serializeMarketReview(createMarketReview({ blocks })), reviewDate);
    blocks[0].symbol = 'MU';
    const response = await h.request(`/api/reviews/${reviewDate}`, { marketReview: { blocks, levels: [] } });
    assert.equal(response.status, 200);
    assert.equal(response.body.marketReview.blocks[0].id, 'block-SOXX');
    assert.equal(response.body.marketReview.blocks[0].children[0].id, 'SOXX-thinking');
    assert.equal(response.body.marketReview.blocks[0].children[0].body, blocks[0].children[0].body);
    assert.equal(response.body.marketReview.blocks[0].symbol, 'MU');
  } finally { h.close(); }
});

test('保存：计划价位只允许省略或与应用本次补丁后的共用值一致', async () => {
  const h = await createHarness({ fixture: { news: 0, plans: 0 } });
  try {
    h.sqlite.prepare('UPDATE daily_review_archive SET market_review_json=? WHERE archive_date=?').run(serializeMarketReview(createMarketReview({ blocks: newBlocks() })), reviewDate);
    h.sqlite.prepare("INSERT INTO daily_review_symbol_levels (archive_date,symbol,support_levels,resistance_levels) VALUES (?,'SOXX','500','560')").run(reviewDate);
    const body = { marketReview: { blocks: newBlocks(), levels: [{ symbol: 'SOXX', supportLevels: '510' }] },
      actionPlans: [{ accountId: 1, symbol: 'SOXX', supportLevels: '500' }] };
    await assertRejectedWithoutWrites(h, body, 409);
    body.actionPlans[0].supportLevels = '510';
    const response = await h.request(`/api/reviews/${reviewDate}`, body);
    assert.equal(response.status, 200);
    assert.equal(response.body.symbolLevels.SOXX.supportLevels, '510');
    assert.equal(h.sqlite.prepare("SELECT support_levels FROM daily_review_action_plans WHERE archive_date=? AND symbol='SOXX'").get(reviewDate).support_levels, null);
  } finally { h.close(); }
});

test('保存：已有 key_levels 和日计划价位证据不被新计划镜像改写', async () => {
  const h = await createHarness({ fixture: { news: 0, plans: 0 } });
  try {
    const body = { marketReview: { blocks: newBlocks(), levels: [{ symbol: 'SOXX', supportLevels: '500', resistanceLevels: '560' }] },
      actionPlans: [{ accountId: 1, symbol: 'SOXX', thinking: '仅改思考' }] };
    h.sqlite.prepare("INSERT INTO daily_review_action_plans (archive_date,account_id,symbol,key_levels,support_levels,resistance_levels) VALUES (?,1,'SOXX','旧关键位','480原证据','540原证据')").run(reviewDate);
    h.sqlite.exec("INSERT INTO account_live_action_plans (account_id,symbol,key_levels,support_levels,resistance_levels) VALUES (1,'SOXX','live旧关键位','480','540')");
    const response = await h.request(`/api/reviews/${reviewDate}`, body);
    assert.equal(response.status, 200);
    const daily = h.sqlite.prepare("SELECT * FROM daily_review_action_plans WHERE archive_date=? AND symbol='SOXX'").get(reviewDate);
    assert.equal(daily.key_levels, '旧关键位');
    assert.equal(daily.support_levels, '480原证据');
    assert.equal(daily.resistance_levels, '540原证据');
    const live = h.sqlite.prepare("SELECT * FROM account_live_action_plans WHERE symbol='SOXX'").get();
    assert.equal(live.key_levels, 'live旧关键位');
    assert.equal(live.support_levels, '500');
    assert.equal(live.resistance_levels, '560');
  } finally { h.close(); }
});

for (const levels of [
  [{ symbol: 'SOXX', supportLevels: null }],
  [{ symbol: 'SOXX', resistanceLevels: 560 }],
  [{ symbol: 'SOXX' }],
  [{ symbol: 'SOXX', supportLevels: '500' }, { symbol: 'SOXX', resistanceLevels: '560' }],
  [{ symbol: 'UNKNOWN', supportLevels: '500' }],
]) {
  test(`保存补丁边界：无效价位 ${JSON.stringify(levels)} 写前拒绝`, async () => {
    const h = await createHarness({ fixture: { news: 0, plans: 0 } });
    try { await assertRejectedWithoutWrites(h, { marketReview: { blocks: newBlocks(), levels } }, 400); } finally { h.close(); }
  });
}

test('保存补丁：非空/显式空/省略逐字段生效，blocks 是最终结构不补回已删主题', async () => {
  const h = await createHarness({ fixture: { news: 0, plans: 0 } });
  try {
    const first = await h.request(`/api/reviews/${reviewDate}`, { marketReview: { blocks: newBlocks(), levels: [{ symbol: 'SOXX', supportLevels: '500\n480', resistanceLevels: '560' }] } });
    assert.equal(first.status, 200);
    assert.equal(first.body.marketReview.blocks[0].children[0].body, '500\n480');
    assert.equal(first.body.symbolLevels.SOXX.resistanceLevels, '560');
    const next = await h.request(`/api/reviews/${reviewDate}`, { marketReview: { blocks: [], levels: [{ symbol: 'SOXX', supportLevels: '' }] } });
    assert.equal(next.status, 200);
    assert.deepEqual(next.body.marketReview.blocks, []);
    assert.deepEqual(next.body.symbolLevels.SOXX, { supportLevels: '', resistanceLevels: '560' });
    const independent = await h.request(`/api/reviews/${reviewDate}`, { marketReview: { blocks: [], levels: [{ symbol: 'MU', supportLevels: '100' }] } });
    assert.equal(independent.status, 200);
    assert.deepEqual(independent.body.marketReview.blocks, []);
    assert.equal(independent.body.symbolLevels.MU.supportLevels, '100');
    const stored = h.sqlite.prepare('SELECT market_review_json FROM daily_review_archive WHERE archive_date = ?').get(reviewDate).market_review_json;
    assert.equal(stored.includes('500\\n480'), false);
  } finally { h.close(); }
});

test('保存：省略 marketReview 只改新闻，不覆盖读取后并发保存的新文档', async () => {
  const h = await createHarness({ fixture: { news: 0, plans: 0 } });
  try {
    const oldDocument = serializeMarketReview(createMarketReview({ blocks: newBlocks() }));
    const newDocument = serializeMarketReview(createMarketReview({ blocks: newBlocks('MU') }));
    h.sqlite.prepare('UPDATE daily_review_archive SET market_review_json=? WHERE archive_date=?').run(oldDocument, reviewDate);
    const batch = h.DB.batch.bind(h.DB);
    let interleaved = false;
    h.DB.batch = async statements => {
      const result = await batch(statements);
      if (!interleaved && statements[0].sql.startsWith('SELECT * FROM daily_review_archive')) {
        interleaved = true;
        h.sqlite.prepare('UPDATE daily_review_archive SET market_review_json=? WHERE archive_date=?').run(newDocument, reviewDate);
      }
      return result;
    };
    const response = await h.request(`/api/reviews/${reviewDate}`, { reviewerNewsNotes: '只改新闻' });
    assert.equal(response.status, 200);
    assert.equal(h.sqlite.prepare('SELECT market_review_json FROM daily_review_archive WHERE archive_date=?').get(reviewDate).market_review_json, newDocument);
    assert.equal(response.body.marketReview.blocks[0].symbol, 'MU');
  } finally { h.close(); }
});

test('保存：只改计划账户字段，live 镜像保留权威价位原文首尾空白', async () => {
  const h = await createHarness({ fixture: { news: 0, plans: 0 } });
  try {
    const support = '  500–510\n  480  \n';
    h.sqlite.prepare('UPDATE daily_review_archive SET market_review_json=? WHERE archive_date=?').run(serializeMarketReview(createMarketReview({ blocks: newBlocks() })), reviewDate);
    h.sqlite.prepare("INSERT INTO daily_review_symbol_levels (archive_date,symbol,support_levels,resistance_levels) VALUES (?,'SOXX',?,'')").run(reviewDate, support);
    const response = await h.request(`/api/reviews/${reviewDate}`, { actionPlans: [{ accountId: 1, symbol: 'SOXX', thinking: '只改思考' }] });
    assert.equal(response.status, 200);
    assert.equal(response.body.symbolLevels.SOXX.supportLevels, support);
    assert.equal(h.sqlite.prepare("SELECT support_levels FROM account_live_action_plans WHERE symbol='SOXX'").get().support_levels, support);
  } finally { h.close(); }
});

test('保存：150 条真实计划不跨 write batch，每条 SQL 绑定在上限内', async () => {
  const h = await createHarness({ fixture: { news: 0, plans: 150 } });
  try {
    const before = h.stats().roundTrips;
    const response = await h.request(`/api/reviews/${reviewDate}`, h.payload);
    assert.equal(response.status, 200);
    assert.equal(h.stats().roundTrips - before, 2);
    assert.equal(h.sqlite.prepare('SELECT COUNT(*) n FROM daily_review_action_plans WHERE archive_date=?').get(reviewDate).n, 150);
    assert.equal(h.sqlite.prepare('SELECT COUNT(*) n FROM account_live_action_plans').get().n, 150);
    assert.ok(h.events.every(event => event.values.length <= 100));
    assert.equal(h.events.filter(event => event.table === 'daily_review_action_plans' && event.key.includes('INSERT INTO')).length, 1);
    assert.equal(h.events.filter(event => event.table === 'account_live_action_plans' && event.key.includes('INSERT INTO')).length, 1);
  } finally { h.close(); }
});

for (const actionPlans of [null, {}, [null], [false], ['invalid']]) {
  test(`保存：计划输入类型错误写前拒绝 ${JSON.stringify(actionPlans)}`, async () => {
    const h = await createHarness({ fixture: { news: 0, plans: 0 } });
    try { await assertRejectedWithoutWrites(h, { actionPlans, marketReview: { blocks: newBlocks(), levels: [] } }, 400); } finally { h.close(); }
  });
}

test('保存：目录中的原型同名系统键作为普通数据，不能污染映射', async () => {
  const h = await createHarness({ fixture: { news: 0, plans: 0 } });
  try {
    h.sqlite.prepare('INSERT INTO tracked_symbols (symbol, display_name, symbol_type) VALUES (?, ?, ?)').run('__proto__', '边界系统键', 'stock');
    const response = await h.request(`/api/reviews/${reviewDate}`, { marketReview: {
      blocks: newBlocks('__proto__'), levels: [{ symbol: '__proto__', supportLevels: '500', resistanceLevels: '' }],
    } });
    assert.equal(response.status, 200);
    assert.equal(Object.hasOwn(response.body.symbolLevels, '__proto__'), true);
    assert.equal(response.body.symbolLevels.__proto__.supportLevels, '500');
    assert.equal(response.body.marketReview.blocks[0].children[0].body, '500');
    assert.equal(h.sqlite.prepare('SELECT support_levels FROM daily_review_symbol_levels WHERE archive_date=? AND symbol=?').get(reviewDate, '__proto__').support_levels, '500');
    assert.equal({}.supportLevels, undefined);
  } finally { h.close(); }
});

test('保存：真实约束失败回滚新文档、价位、日计划和 live 整个 batch', async () => {
  const h = await createHarness({ fixture: { news: 0, plans: 0 } });
  try {
    h.sqlite.exec("CREATE TRIGGER fail_live_fixture BEFORE INSERT ON account_live_action_plans WHEN NEW.symbol='SOXX' BEGIN SELECT RAISE(ABORT, '真实约束失败'); END;");
    const before = h.snapshot();
    const response = await h.request(`/api/reviews/${reviewDate}`, {
      marketReview: { blocks: newBlocks(), levels: [{ symbol: 'SOXX', supportLevels: '500' }] },
      actionPlans: [{ accountId: 1, symbol: 'SOXX', currentPosition: '5%-10%', thinking: '计划不能部分写入' }],
    });
    assert.equal(response.status, 500);
    assert.match(response.body.error, /真实约束失败/);
    assert.deepEqual(h.snapshot(), before);
  } finally { h.close(); }
});

const us2Presets = { support: '支撑位', resistance: '压力位', thinking: '思考', cta: 'CTA 流动性', collar: 'JPM collar', eps: 'EPS 预计' };

for (const [label, child] of [
  ['未知 kind', { kind: 'analysis', title: '分析', body: '' }],
  ['伪造预设标题', { kind: 'cta', title: 'CTA 自定义计算', body: '' }],
  ['空自定义标题', { kind: 'custom', title: ' \n\t', body: '' }],
  ['非字符串正文', { kind: 'eps', title: 'EPS 预计', body: 275 }],
]) {
  test(`US2 API：${label} 写 batch 前拒绝`, async () => {
    const h = await createHarness({ fixture: { news: 0, plans: 0 } });
    try {
      const blocks = newBlocks('GSPC');
      blocks[0].children = [{ id: 'invalid-child', ...child }];
      await assertRejectedWithoutWrites(h, { marketReview: { blocks, levels: [] } }, 400);
    } finally { h.close(); }
  });
}

for (const [kind, title] of Object.entries(us2Presets)) {
  test(`US2 API：${kind} 预设唯一，不借历史重复规则放行`, async () => {
    const h = await createHarness({ fixture: { news: 0, plans: 0 } });
    try {
      const blocks = newBlocks('GSPC');
      blocks[0].children = ['one', 'two'].map(id => ({ id, kind, title, body: '' }));
      await assertRejectedWithoutWrites(h, { marketReview: { blocks, levels: [] } }, 400);
    } finally { h.close(); }
  });
}

test('US2 API：六预设和多个自定义可保存空正文、数字原文与排序，重开不改身份', async () => {
  const h = await createHarness({ fixture: { news: 0, plans: 0 } });
  try {
    const blocks = newBlocks('GSPC');
    blocks[0].children = Object.entries(us2Presets).map(([kind, title]) => ({
      id: `gspc-${kind}`, kind, title, body: ['support', 'resistance', 'thinking'].includes(kind) ? '' : `  ${title}：275.00 / 6600–6800\n$12,345.67 <b>原文</b>  `,
    }));
    blocks[0].children.push({ id: 'custom-a', kind: 'custom', title: ' 风险 275.00 ', body: '' }, { id: 'custom-b', kind: 'custom', title: ' 风险 275.00 ', body: '风险：500/480\n原样' });
    blocks[0].children.reverse();
    const response = await h.request(`/api/reviews/${reviewDate}`, { marketReview: { blocks, levels: [] } });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.marketReview.blocks[0].children, blocks[0].children);
    const reopened = await h.request(`/api/reviews/${reviewDate}`);
    assert.deepEqual(reopened.body.review.marketReview.blocks[0].children, blocks[0].children);
    assert.equal(reopened.body.review.marketReview.blocks[0].symbol, 'GSPC');
    assert.equal(reopened.body.review.marketReview.blocks[0].identity.displayCode, 'GSPC');
    const stored = JSON.parse(h.sqlite.prepare('SELECT market_review_json FROM daily_review_archive WHERE archive_date=?').get(reviewDate).market_review_json);
    assert.deepEqual(stored.blocks[0].children.filter(child => !['support', 'resistance'].includes(child.kind)), blocks[0].children.filter(child => !['support', 'resistance'].includes(child.kind)));
  } finally { h.close(); }
});

test('US2 完整度：只要求一个新市场项，新闻和计划规则不变', () => {
  const complete = { reviewer_news_notes: '新闻总结', market_review_json: serializeMarketReview(createMarketReview({ blocks: newBlocks('GSPC') })), action_plan_count: 1 };
  assert.deepEqual(worker.getBatchReviewReadiness(complete), { ready: true, missingFields: [] });
  assert.deepEqual(worker.getBatchReviewReadiness({ ...complete, market_review_json: serializeMarketReview(createMarketReview()) }), { ready: false, missingFields: ['market'] });
  assert.deepEqual(worker.getBatchReviewReadiness({ ...complete, reviewer_news_notes: ' ', action_plan_count: 0 }), { ready: false, missingFields: ['news', 'plan'] });
  assert.deepEqual(worker.getBatchReviewReadiness({}), { ready: false, missingFields: ['news', 'market', 'plan'] });
});

test('US2 完成：保存新市场结构后可完成，不要求两个旧组', async () => {
  const h = await createHarness({ fixture: { news: 0, plans: 1 } });
  try {
    const save = await h.request(`/api/reviews/${reviewDate}`, h.payload);
    assert.equal(save.status, 200);
    h.sqlite.prepare('UPDATE daily_review_archive SET market_sentiment_blocks_json=NULL, sector_rotation_blocks_json=NULL WHERE archive_date=?').run(reviewDate);
    const complete = await h.request(`/api/reviews/${reviewDate}/complete`, { requireCompleteContent: true });
    assert.equal(complete.status, 200);
    assert.equal(complete.body.skipped, undefined);
    assert.equal(complete.body.reviewStatus, 'reviewed');
    assert.equal(h.sqlite.prepare('SELECT review_status FROM daily_review_archive WHERE archive_date=?').get(reviewDate).review_status, 'reviewed');
  } finally { h.close(); }
});

test('US2 完成：显式空新市场不借旧列通过，返回单项缺失且零写', async () => {
  const h = await createHarness({ fixture: { news: 0, plans: 1 } });
  try {
    assert.equal((await h.request(`/api/reviews/${reviewDate}`, { ...h.payload, marketReview: { blocks: [], levels: [] } })).status, 200);
    const before = h.snapshot();
    const response = await h.request(`/api/reviews/${reviewDate}/complete`, { requireCompleteContent: true });
    assert.equal(response.status, 200);
    assert.equal(response.body.skipped, true);
    assert.deepEqual(response.body.missingFields, ['market']);
    assert.deepEqual(h.snapshot(), before);
  } finally { h.close(); }
});

async function sharedPriceHarness() {
  const h = await createHarness({ fixture: { news: 0, plans: 0 } });
  h.sqlite.prepare('UPDATE daily_review_archive SET market_review_json=? WHERE archive_date=?').run(serializeMarketReview(createMarketReview({ blocks: newBlocks() })), reviewDate);
  h.sqlite.prepare("INSERT INTO daily_review_symbol_levels (archive_date,symbol,support_levels,resistance_levels) VALUES (?,'SOXX',' 500–510（强）\n','560–580')").run(reviewDate);
  for (const account of [1, 2]) {
    h.sqlite.prepare("INSERT INTO daily_review_action_plans (archive_date,account_id,symbol,support_levels,resistance_levels,key_levels,current_position,position_amount,thinking) VALUES (?,?,'SOXX',?,?,?,'5%-10%',?,'账户原思考')").run(reviewDate, account, `旧日支撑${account}`, `旧日压力${account}`, `原key${account}`, account * 1000);
    h.sqlite.prepare("INSERT INTO account_live_action_plans (account_id,symbol,support_levels,resistance_levels,key_levels,current_position,position_amount,thinking) VALUES (?,'SOXX',?,?,?,'5%-10%',?,'账户原思考')").run(account, `旧live支撑${account}`, `旧live压力${account}`, `原key${account}`, account * 1000);
  }
  return h;
}

for (const kind of ['bootstrap', 'live', 'live-item']) {
  test(`US3 读取：${kind} 同标的跨账户用日期权威价位，GET 零写`, async () => {
    const h = await sharedPriceHarness();
    try {
      const before = h.snapshot();
      const id = h.sqlite.prepare('SELECT id FROM account_live_action_plans ORDER BY id LIMIT 1').get().id;
      const response = await h.request(kind === 'bootstrap' ? `/api/reviews/${reviewDate}/bootstrap` : kind === 'live' ? '/api/account-live-action-plans' : `/api/account-live-action-plans/${id}`);
      assert.equal(response.status, 200);
      const items = kind === 'bootstrap' ? response.body.actionPlans : kind === 'live' ? response.body.items : [response.body.item];
      assert.equal(items.length, kind === 'live-item' ? 1 : 2);
      assert.deepEqual(items.map(p => [p.supportLevels, p.resistanceLevels]), items.map(() => [' 500–510（强）\n', '560–580']));
      assert.deepEqual(items.map(p => p.keyLevels), items.map(p => `原key${p.accountId}`));
      assert.deepEqual(h.snapshot(), before);
    } finally { h.close(); }
  });
}

test('US3 live：显式价位双向同步两账户和最新日，清空不回退，非价位字段不变', async () => {
  const h = await sharedPriceHarness();
  try {
    const rawBefore = h.snapshot().daily_review_action_plans;
    const id = h.sqlite.prepare('SELECT id FROM account_live_action_plans WHERE account_id=1').get().id;
    const response = await h.request(`/api/account-live-action-plans/${id}`, { resistanceLevels: ' 600–620\n原文 ' }, { method: 'PUT' });
    assert.equal(response.status, 200);
    assert.equal(response.body.item.supportLevels, ' 500–510（强）\n');
    assert.equal(response.body.item.resistanceLevels, ' 600–620\n原文 ');
    const bootstrap = await h.request(`/api/reviews/${reviewDate}/bootstrap`);
    assert.ok(bootstrap.body.actionPlans.every(p => p.supportLevels === ' 500–510（强）\n' && p.resistanceLevels === ' 600–620\n原文 '));
    assert.equal(bootstrap.body.structuredNotes.marketReview.blocks[0].children.find(c => c.kind === 'resistance').body, ' 600–620\n原文 ');
    assert.equal((await h.request(`/api/account-live-action-plans/${id}`, { supportLevels: '' }, { method: 'PUT' })).status, 200);
    assert.equal((await h.request(`/api/account-live-action-plans/${id}`, { currentPosition: '15%-20%' }, { method: 'PUT' })).status, 200);
    const live = await h.request('/api/account-live-action-plans');
    assert.ok(live.body.items.every(p => p.supportLevels === '' && p.resistanceLevels === ' 600–620\n原文 '));
    for (const p of live.body.items) {
      assert.equal(p.keyLevels, `原key${p.accountId}`);
      assert.equal(p.positionAmount, p.accountId * 1000);
      assert.equal(p.thinking, '账户原思考');
      assert.equal(p.currentPosition, p.accountId === 1 ? '15%-20%' : '5%-10%');
    }
    const rawAfter = h.snapshot().daily_review_action_plans;
    for (const row of rawBefore) {
      const after = rawAfter.find(p => p.id === row.id);
      assert.ok(after);
      for (const field of ['support_levels', 'resistance_levels', 'key_levels']) assert.equal(after[field], row[field]);
    }
  } finally { h.close(); }
});

for (const body of [{ supportLevels: null }, { resistanceLevels: 600 }, { support_levels: null }]) {
  test(`US3 live：非法价位 ${JSON.stringify(body)} 写前拒绝`, async () => {
    const h = await sharedPriceHarness();
    try {
      const id = h.sqlite.prepare('SELECT id FROM account_live_action_plans ORDER BY id LIMIT 1').get().id;
      const before = h.snapshot();
      const response = await h.request(`/api/account-live-action-plans/${id}`, body, { method: 'PUT' });
      assert.equal(response.status, 400);
      assert.deepEqual(h.snapshot(), before);
    } finally { h.close(); }
  });
}

test('US3 live：删主题/二级与清空不复活，实际新的非空价位才补缺维度', async () => {
  const h = await sharedPriceHarness();
  try {
    assert.equal((await h.request(`/api/reviews/${reviewDate}`, { marketReview: { blocks: [], levels: [] } })).status, 200);
    const id = h.sqlite.prepare('SELECT id FROM account_live_action_plans ORDER BY id LIMIT 1').get().id;
    for (const body of [{ currentPosition: '15%-20%' }, { supportLevels: ' 500–510（强）\n' }, { resistanceLevels: '' }]) {
      assert.equal((await h.request(`/api/account-live-action-plans/${id}`, body, { method: 'PUT' })).status, 200);
      assert.deepEqual((await h.request(`/api/reviews/${reviewDate}`)).body.review.marketReview.blocks, []);
    }
    assert.equal((await h.request(`/api/account-live-action-plans/${id}`, { supportLevels: '新的 510–520' }, { method: 'PUT' })).status, 200);
    const rebuilt = (await h.request(`/api/reviews/${reviewDate}`)).body.review.marketReview.blocks;
    assert.equal(rebuilt.length, 1);
    assert.equal(rebuilt[0].symbol, 'SOXX');
    assert.equal(rebuilt[0].children.find(c => c.kind === 'support').body, '新的 510–520');
    const onlyThinking = [{ ...rebuilt[0], children: rebuilt[0].children.filter(c => c.kind === 'thinking') }];
    assert.equal((await h.request(`/api/reviews/${reviewDate}`, { marketReview: { blocks: onlyThinking, levels: [] } })).status, 200);
    assert.equal((await h.request(`/api/account-live-action-plans/${id}`, { resistanceLevels: '压力 620' }, { method: 'PUT' })).status, 200);
    const children = (await h.request(`/api/reviews/${reviewDate}`)).body.review.marketReview.blocks[0].children;
    assert.deepEqual(children.map(c => c.kind), ['thinking', 'resistance']);
    assert.equal(children[1].body, '压力 620');
  } finally { h.close(); }
});

test('US3 live：新建未提交价位带出已有值，删除计划保留共用价位与市场', async () => {
  const h = await sharedPriceHarness();
  try {
    const created = await h.request('/api/account-live-action-plans', { accountId: 3, symbol: 'SOXX', positionAmount: 3000 });
    assert.equal(created.status, 200);
    assert.equal(created.body.item.supportLevels, ' 500–510（强）\n');
    const before = h.sqlite.prepare('SELECT market_review_json FROM daily_review_archive WHERE archive_date=?').get(reviewDate).market_review_json;
    assert.equal((await h.request(`/api/account-live-action-plans/${created.body.item.id}`, undefined, { method: 'DELETE' })).status, 200);
    assert.equal(h.sqlite.prepare('SELECT market_review_json FROM daily_review_archive WHERE archive_date=?').get(reviewDate).market_review_json, before);
    assert.equal(h.sqlite.prepare('SELECT support_levels FROM daily_review_symbol_levels WHERE archive_date=?').get(reviewDate).support_levels, ' 500–510（强）\n');
    assert.equal((await h.request('/api/account-live-action-plans')).body.items.length, 2);
  } finally { h.close(); }
});

for (const method of ['POST', 'PUT', 'DELETE']) {
  test(`US3 live：${method} 最新日计划约束失败时 live/日计划/价位/文档整体回滚且单 write batch`, async () => {
    const h = await sharedPriceHarness();
    try {
      h.sqlite.exec("CREATE TRIGGER reject_daily_us3 BEFORE UPDATE ON daily_review_action_plans BEGIN SELECT RAISE(ABORT,'US3 constraint'); END;");
      const id = h.sqlite.prepare('SELECT id FROM account_live_action_plans ORDER BY id LIMIT 1').get().id;
      const before = h.snapshot();
      const original = h.DB.batch;
      let writes = 0;
      h.DB.batch = async statements => { if (statements.some(s => /^\s*(INSERT|UPDATE|DELETE)/i.test(s.sql))) writes++; return original(statements); };
      const response = await h.request(method === 'POST' ? '/api/account-live-action-plans' : `/api/account-live-action-plans/${id}`, method === 'POST' ? { accountId: 3, symbol: 'SOXX', supportLevels: 'new' } : method === 'PUT' ? { supportLevels: 'new' } : undefined, { method });
      assert.equal(response.status, 500);
      assert.match(response.body.error, /US3 constraint/);
      assert.deepEqual(h.snapshot(), before);
      assert.equal(writes, 1);
    } finally { h.close(); }
  });
}

test('US3 live：无归档日按账户顺序逐字段取首个非空，统一投影和差异提示且零写', async () => {
  const h = await sharedPriceHarness();
  try {
    h.sqlite.exec("DELETE FROM daily_review_action_plans; DELETE FROM daily_review_symbol_levels; DELETE FROM daily_review_archive; UPDATE investment_accounts SET sort_order=10 WHERE id=1; UPDATE investment_accounts SET sort_order=20 WHERE id=2; UPDATE account_live_action_plans SET support_levels='' WHERE account_id=1;");
    const before = h.snapshot();
    const response = await h.request('/api/account-live-action-plans');
    assert.equal(response.status, 200);
    assert.ok(response.body.items.every(p => p.supportLevels === '旧live支撑2' && p.resistanceLevels === '旧live压力1'));
    assert.ok(response.body.conflicts.length > 0);
    assert.deepEqual(h.snapshot(), before);
  } finally { h.close(); }
});

for (const body of [{ accountId: 1.5, symbol: 'MU' }, { accountId: 1, symbol: 'UNKNOWN' }, { accountId: 1, symbol: 'US10Y' }, { accountId: 1, symbol: 'MU', supportLevels: null }, { accountId: 1, symbol: 'MU', resistance_levels: 120 }]) {
  test(`US3 live 新建边界：${JSON.stringify(body)} 写前拒绝`, async () => {
    const h = await sharedPriceHarness();
    try {
      const before = h.snapshot();
      const response = await h.request('/api/account-live-action-plans', body);
      assert.equal(response.status, 400, response.body.error || JSON.stringify(response.body));
      assert.deepEqual(h.snapshot(), before);
    } finally { h.close(); }
  });
}

test('US3 日期隔离：历史复盘改价位不改最新/live，随后 live 修改不改历史', async () => {
  const h = await sharedPriceHarness();
  try {
    const liveBefore = h.snapshot().account_live_action_plans;
    const saved = await h.request(`/api/reviews/${previousDate}`, { marketReview: { blocks: newBlocks(), levels: [{ symbol: 'SOXX', supportLevels: '历史 480–490' }] } });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.syncedToLive, false);
    assert.deepEqual(h.snapshot().account_live_action_plans, liveBefore);
    const beforeHistory = h.sqlite.prepare('SELECT * FROM daily_review_symbol_levels WHERE archive_date=?').all(previousDate).map(row => ({ ...row }));
    const id = liveBefore[0].id;
    assert.equal((await h.request(`/api/account-live-action-plans/${id}`, { support_levels: '最新 510–520' }, { method: 'PUT' })).status, 200);
    assert.deepEqual(h.sqlite.prepare('SELECT * FROM daily_review_symbol_levels WHERE archive_date=?').all(previousDate).map(row => ({ ...row })), beforeHistory);
    assert.equal((await h.request(`/api/reviews/${previousDate}`)).body.review.marketReview.blocks[0].children[0].body, '历史 480–490');
    assert.equal((await h.request('/api/account-live-action-plans')).body.items[0].supportLevels, '最新 510–520');
  } finally { h.close(); }
});

test('US3 live：省略金额保持，显式 null 清空且不改变共用价位', async () => {
  const h = await sharedPriceHarness();
  try {
    const id = h.sqlite.prepare('SELECT id FROM account_live_action_plans WHERE account_id=1').get().id;
    const beforeLevels = h.snapshot().daily_review_symbol_levels;
    const edited = await h.request(`/api/account-live-action-plans/${id}`, { thinking: '只改思考' }, { method: 'PUT' });
    assert.equal(edited.status, 200);
    assert.equal(edited.body.item.positionAmount, 1000);
    const cleared = await h.request(`/api/account-live-action-plans/${id}`, { positionAmount: null }, { method: 'PUT' });
    assert.equal(cleared.status, 200);
    assert.equal(cleared.body.item.positionAmount, null);
    assert.equal(h.sqlite.prepare('SELECT position_amount FROM daily_review_action_plans WHERE archive_date=? AND account_id=1').get(reviewDate).position_amount, null);
    assert.deepEqual(h.snapshot().daily_review_symbol_levels, beforeLevels);
  } finally { h.close(); }
});

test('US3 live：更换账户/标的使用新标的价位，不移动旧价位、不重算空 key_levels', async () => {
  const h = await sharedPriceHarness();
  try {
    h.sqlite.prepare("INSERT INTO daily_review_symbol_levels (archive_date,symbol,support_levels,resistance_levels) VALUES (?,'MU','MU 100','MU 120')").run(reviewDate);
    h.sqlite.exec("UPDATE account_live_action_plans SET key_levels='' WHERE account_id=1");
    const id = h.sqlite.prepare('SELECT id FROM account_live_action_plans WHERE account_id=1').get().id;
    const before = h.snapshot().daily_review_symbol_levels;
    const response = await h.request(`/api/account-live-action-plans/${id}`, { accountId: 3, symbol: 'MU' }, { method: 'PUT' });
    assert.equal(response.status, 200);
    assert.equal(response.body.item.id, id);
    assert.equal(response.body.item.accountId, 3);
    assert.equal(response.body.item.symbol, 'MU');
    assert.equal(response.body.item.keyLevels, '');
    assert.deepEqual([response.body.item.supportLevels, response.body.item.resistanceLevels], ['MU 100', 'MU 120']);
    assert.deepEqual(h.snapshot().daily_review_symbol_levels, before);
    assert.equal((await h.request('/api/account-live-action-plans')).body.items.find(p => p.accountId === 2).supportLevels, ' 500–510（强）\n');
  } finally { h.close(); }
});

test('US3 live：目录停用/硬删后已有同 id 同 symbol可改非价位，不能新造历史身份', async () => {
  const h = await sharedPriceHarness();
  try {
    const id = h.sqlite.prepare('SELECT id FROM account_live_action_plans WHERE account_id=1').get().id;
    h.sqlite.exec("DELETE FROM tracked_symbols WHERE symbol='SOXX'");
    const response = await h.request(`/api/account-live-action-plans/${id}`, { thinking: '继续旧身份' }, { method: 'PUT' });
    assert.equal(response.status, 200);
    assert.equal(response.body.item.symbol, 'SOXX');
    const before = h.snapshot();
    const rejected = await h.request('/api/account-live-action-plans', { accountId: 3, symbol: 'SOXX' });
    assert.equal(rejected.status, 400);
    assert.deepEqual(h.snapshot(), before);
  } finally { h.close(); }
});

test('US3 live：150 条集合下单项修改依旧一个 write batch，每 SQL <=100 绑定', async () => {
  const h = await sharedPriceHarness();
  try {
    const initial = plans().map(p => ({ ...p, supportLevels: '500', resistanceLevels: '560' }));
    for (const p of initial) h.sqlite.prepare("INSERT INTO tracked_symbols(symbol,display_name,symbol_type,is_active) VALUES (?,?,'stock',1)").run(p.symbol, p.symbol);
    assert.equal((await h.request(`/api/reviews/${reviewDate}`, { marketReview: { blocks: newBlocks(), levels: initial.map(p => ({ symbol: p.symbol, supportLevels: p.supportLevels, resistanceLevels: p.resistanceLevels })) }, actionPlans: initial })).status, 200);
    const id = h.sqlite.prepare("SELECT id FROM account_live_action_plans WHERE symbol='SQL0'").get().id;
    const original = h.DB.batch;
    const widths = [];
    h.DB.batch = async statements => { if (statements.some(s => /^\s*(INSERT|UPDATE|DELETE)/i.test(s.sql))) widths.push(statements.map(s => s.values.length)); return original(statements); };
    const beforeTrips = h.stats().roundTrips;
    const response = await h.request(`/api/account-live-action-plans/${id}`, { supportLevels: '新 510' }, { method: 'PUT' });
    assert.equal(response.status, 200);
    assert.equal(widths.length, 1);
    assert.ok(widths[0].every(n => n <= 100));
    assert.ok(h.stats().roundTrips - beforeTrips <= 3);
    assert.equal(h.sqlite.prepare('SELECT COUNT(*) n FROM daily_review_action_plans WHERE archive_date=?').get(reviewDate).n, 150);
    assert.equal((await h.request(`/api/reviews/${reviewDate}/bootstrap`)).body.actionPlans.find(p => p.symbol === 'SQL0').supportLevels, '新 510');
  } finally { h.close(); }
});

for (const method of ['POST', 'PUT']) {
  for (const body of [null, [], 'invalid']) {
    test(`US3 live ${method}：非对象请求 ${JSON.stringify(body)} 拒绝且零写`, async () => {
      const h = await sharedPriceHarness();
      try {
        const id = h.sqlite.prepare('SELECT id FROM account_live_action_plans ORDER BY id LIMIT 1').get().id;
        const before = h.snapshot();
        const response = await h.request(method === 'POST' ? '/api/account-live-action-plans' : `/api/account-live-action-plans/${id}`, body, { method });
        assert.equal(response.status, 400);
        assert.deepEqual(h.snapshot(), before);
      } finally { h.close(); }
    });
  }
}

test('US3 live：重复账户标的返回409，更新重键失败不改价位或金额', async () => {
  const h = await sharedPriceHarness();
  try {
    const id = h.sqlite.prepare('SELECT id FROM account_live_action_plans WHERE account_id=1').get().id;
    const before = h.snapshot();
    const create = await h.request('/api/account-live-action-plans', { accountId: 2, symbol: 'SOXX', supportLevels: '不能写入' });
    assert.equal(create.status, 409);
    const update = await h.request(`/api/account-live-action-plans/${id}`, { accountId: 2, supportLevels: '不能写入', positionAmount: 0 }, { method: 'PUT' });
    assert.equal(update.status, 409);
    assert.deepEqual(h.snapshot(), before);
  } finally { h.close(); }
});

test('US3 live：无归档日显式价位共用且不制造日期，零金额原样保存', async () => {
  const h = await sharedPriceHarness();
  try {
    h.sqlite.exec('DELETE FROM daily_review_action_plans; DELETE FROM daily_review_symbol_levels; DELETE FROM daily_review_archive;');
    const id = h.sqlite.prepare('SELECT id FROM account_live_action_plans WHERE account_id=1').get().id;
    const update = await h.request(`/api/account-live-action-plans/${id}`, { supportLevels: '新的无日支撑', positionAmount: 0 }, { method: 'PUT' });
    assert.equal(update.status, 200);
    assert.equal(update.body.item.positionAmount, 0);
    assert.ok(h.sqlite.prepare("SELECT support_levels FROM account_live_action_plans WHERE symbol='SOXX'").all().every(row => row.support_levels === '新的无日支撑'));
    const clear = await h.request(`/api/account-live-action-plans/${id}`, { supportLevels: '' }, { method: 'PUT' });
    assert.equal(clear.status, 200);
    assert.ok((await h.request('/api/account-live-action-plans')).body.items.every(p => p.supportLevels === ''));
    assert.equal(h.sqlite.prepare('SELECT COUNT(*) n FROM daily_review_archive').get().n, 0);
    assert.equal(h.sqlite.prepare('SELECT COUNT(*) n FROM daily_review_symbol_levels').get().n, 0);
  } finally { h.close(); }
});

test('US3 live 并发：只改价位不覆盖读取后另一次已保存的思考，最新日同步采用当前值', async () => {
  const h = await sharedPriceHarness();
  try {
    const id = h.sqlite.prepare('SELECT id FROM account_live_action_plans WHERE account_id=1').get().id;
    const original = h.DB.batch;
    let interleaved = false;
    h.DB.batch = async statements => {
      const rows = await original(statements);
      if (!interleaved && statements.some(s => s.sql.includes('FROM account_live_action_plans p')) && statements.some(s => s.sql.includes('FROM tracked_symbols'))) {
        interleaved = true;
        const concurrent = await h.request(`/api/account-live-action-plans/${id}`, { thinking: '并发已保存的新思考' }, { method: 'PUT' });
        assert.equal(concurrent.status, 200);
      }
      return rows;
    };
    const response = await h.request(`/api/account-live-action-plans/${id}`, { supportLevels: 'A 新支撑 510' }, { method: 'PUT' });
    assert.equal(response.status, 200);
    assert.equal(interleaved, true);
    assert.equal(response.body.item.thinking, '并发已保存的新思考');
    assert.equal(h.sqlite.prepare('SELECT thinking FROM account_live_action_plans WHERE id=?').get(id).thinking, '并发已保存的新思考');
    assert.equal(h.sqlite.prepare('SELECT thinking FROM daily_review_action_plans WHERE archive_date=? AND account_id=1').get(reviewDate).thinking, '并发已保存的新思考');
    assert.equal(response.body.item.supportLevels, 'A 新支撑 510');
  } finally { h.close(); }
});

for (const saved of ['filled', 'empty', 'unset']) {
  test(`US2 batch：新合同 autoFill 在 ${saved} 新结构下保存后校验、不恢复明确空`, async () => {
    const h = await createHarness({ fixture: { news: 0, plans: 1, historical: true } });
    try {
      const blocks = saved === 'empty' ? [] : newBlocks('GSPC');
      assert.equal((await h.request(`/api/reviews/${reviewDate}`, { ...h.payload, marketReview: { blocks, levels: [{ symbol: 'GSPC', supportLevels: '' }] } })).status, 200);
      if (saved === 'unset') h.sqlite.prepare('UPDATE daily_review_archive SET market_review_json=NULL, market_sentiment_blocks_json=NULL, sector_rotation_blocks_json=NULL, reviewer_news_notes=? WHERE archive_date=?').run('', reviewDate);
      const existing = h.sqlite.prepare('SELECT market_review_json FROM daily_review_archive WHERE archive_date=?').get(reviewDate).market_review_json;
      const response = await h.request(`/api/reviews/${reviewDate}/complete`, {
        completionSource: 'batch', requireCompleteContent: true,
        autoFill: { reviewerNewsNotes: '保存后新闻默认', marketReview: { blocks: newBlocks('MU'), levels: [{ symbol: 'GSPC', supportLevels: '不能覆盖明确空' }] } },
      });
      assert.equal(response.status, 200, response.body.error || JSON.stringify(response.body));
      assert.equal(h.sqlite.prepare('SELECT support_levels FROM daily_review_symbol_levels WHERE archive_date=? AND symbol=?').get(reviewDate, 'GSPC').support_levels, '');
      if (saved === 'empty') {
        assert.equal(response.body.skipped, true);
        assert.deepEqual(response.body.missingFields, ['market']);
        assert.equal(h.sqlite.prepare('SELECT review_status FROM daily_review_archive WHERE archive_date=?').get(reviewDate).review_status, 'initialized');
      } else {
        assert.equal(response.body.skipped, undefined);
        assert.equal(response.body.reviewStatus, 'reviewed');
      }
      const after = h.sqlite.prepare('SELECT market_review_json, reviewer_news_notes FROM daily_review_archive WHERE archive_date=?').get(reviewDate);
      if (saved === 'unset') {
        assert.equal(JSON.parse(after.market_review_json).blocks[0].symbol, 'MU');
        assert.equal(after.reviewer_news_notes, '保存后新闻默认');
      } else assert.equal(after.market_review_json, existing);
    } finally { h.close(); }
  });
}

test('US3 最终结构：非空 MU 补丁可独立存价位，不向最终 GSPC blocks 追加 MU', async () => {
  const h = await createHarness({ fixture: { news: 0, plans: 0 } });
  try {
    const response = await h.request(`/api/reviews/${reviewDate}`, { marketReview: { blocks: newBlocks('GSPC'), levels: [{ symbol: 'MU', supportLevels: 'MU 100–110' }] } });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.marketReview.blocks.map(block => block.symbol), ['GSPC']);
    assert.equal(response.body.symbolLevels.MU.supportLevels, 'MU 100–110');
    assert.equal(h.sqlite.prepare("SELECT support_levels FROM daily_review_symbol_levels WHERE archive_date=? AND symbol='MU'").get(reviewDate).support_levels, 'MU 100–110');
    assert.deepEqual((await h.request(`/api/reviews/${reviewDate}`)).body.review.marketReview.blocks.map(block => block.symbol), ['GSPC']);
  } finally { h.close(); }
});

for (const [name, outer, concurrent] of [
  ['非价位修改不改写并发的新价位镜像', { thinking: 'A 的思考' }, { supportLevels: 'B 的新支撑' }],
  ['只改支撑不覆盖并发压力补丁', { supportLevels: 'A 的新支撑' }, { resistanceLevels: 'B 的新压力' }],
]) {
  test(`US3 字段补丁并发：${name}`, async () => {
    const h = await sharedPriceHarness();
    try {
      const id = h.sqlite.prepare('SELECT id FROM account_live_action_plans WHERE account_id=1').get().id;
      const original = h.DB.batch;
      let inserted = false;
      h.DB.batch = async statements => {
        const rows = await original(statements);
        if (!inserted && statements.some(s => s.sql.includes('FROM account_live_action_plans p')) && statements.some(s => s.sql.includes('FROM tracked_symbols'))) {
          inserted = true;
          assert.equal((await h.request(`/api/account-live-action-plans/${id}`, concurrent, { method: 'PUT' })).status, 200);
        }
        return rows;
      };
      const response = await h.request(`/api/account-live-action-plans/${id}`, outer, { method: 'PUT' });
      assert.equal(response.status, 200);
      const support = outer.supportLevels ?? concurrent.supportLevels ?? ' 500–510（强）\n';
      const resistance = outer.resistanceLevels ?? concurrent.resistanceLevels ?? '560–580';
      const saved = h.sqlite.prepare("SELECT support_levels,resistance_levels FROM daily_review_symbol_levels WHERE archive_date=? AND symbol='SOXX'").get(reviewDate);
      assert.deepEqual({ ...saved }, { support_levels: support, resistance_levels: resistance });
      assert.deepEqual([response.body.item.supportLevels, response.body.item.resistanceLevels], [support, resistance]);
      assert.ok(h.sqlite.prepare("SELECT support_levels,resistance_levels FROM account_live_action_plans WHERE symbol='SOXX'").all().every(row => row.support_levels === support && row.resistance_levels === resistance));
    } finally { h.close(); }
  });
}

test('US3 复盘补丁并发：只改支撑保持读后已保存的新压力，响应和所有 live 镜像一致', async () => {
  const h = await sharedPriceHarness();
  try {
    const original = h.DB.batch;
    let inserted = false;
    h.DB.batch = async statements => {
      const rows = await original(statements);
      if (!inserted && statements.some(s => s.sql.includes('FROM tracked_symbols')) && statements.every(s => /^\s*SELECT/i.test(s.sql))) {
        inserted = true;
        const concurrent = await h.request(`/api/reviews/${reviewDate}`, { marketReview: { blocks: newBlocks(), levels: [{ symbol: 'SOXX', resistanceLevels: 'B 复盘新压力' }] } });
        assert.equal(concurrent.status, 200);
      }
      return rows;
    };
    const response = await h.request(`/api/reviews/${reviewDate}`, { marketReview: { blocks: newBlocks(), levels: [{ symbol: 'SOXX', supportLevels: 'A 复盘新支撑' }] } });
    assert.equal(response.status, 200);
    assert.equal(inserted, true);
    assert.deepEqual(response.body.symbolLevels.SOXX, { supportLevels: 'A 复盘新支撑', resistanceLevels: 'B 复盘新压力' });
    const raw = h.sqlite.prepare("SELECT support_levels,resistance_levels FROM daily_review_symbol_levels WHERE archive_date=? AND symbol='SOXX'").get(reviewDate);
    assert.deepEqual({ ...raw }, { support_levels: 'A 复盘新支撑', resistance_levels: 'B 复盘新压力' });
    assert.ok(h.sqlite.prepare("SELECT support_levels,resistance_levels FROM account_live_action_plans WHERE symbol='SOXX'").all().every(row => row.support_levels === raw.support_levels && row.resistance_levels === raw.resistance_levels));
  } finally { h.close(); }
});

async function legacyPriceHarness() {
  const h = await createHarness({ fixture: { news: 0, plans: 0 } });
  const market = [{ id: 'old-soxx', title: '半导体 SOXX', children: [
    { id: 'old-support', title: '支撑位', body: '500' },
    { id: 'old-resistance', title: '压力位', body: '560' },
    { id: 'old-thinking', title: '思考', body: '  原文 <b>判断</b>\n不改写  ' },
  ] }];
  h.sqlite.prepare('UPDATE daily_review_archive SET market_review_json=NULL, market_sentiment_blocks_json=?, sector_rotation_blocks_json=NULL WHERE archive_date=?').run(JSON.stringify(market), reviewDate);
  for (const account of [1, 2]) {
    h.sqlite.prepare("INSERT INTO daily_review_action_plans (archive_date,account_id,symbol,support_levels,resistance_levels,key_levels,current_position,position_amount,thinking) VALUES (?,?,'SOXX',?,?,?,'5%-10%',?,'账户原思考')").run(reviewDate, account, account === 1 ? '480' : '490', account === 1 ? '540' : '550', `历史key${account}`, account * 1000);
    h.sqlite.prepare("INSERT INTO account_live_action_plans (account_id,symbol,support_levels,resistance_levels,key_levels,current_position,position_amount,thinking) VALUES (?,'SOXX',?,?,?,'5%-10%',?,'账户原思考')").run(account, `live支撑${account}`, `live压力${account}`, `历史key${account}`, account * 1000);
  }
  return h;
}

for (const suffix of ['', '/bootstrap']) {
  test(`US4 历史只读：${suffix || 'date'} 逐项保留两组所有来源原文，重复 id 不丢且 GET 全表零写`, async () => {
    const h = await createHarness({ seed: seedMarketReviewFixture });
    try {
      const before = h.snapshot();
      const response = await h.request(`/api/reviews/${dates.history}${suffix}`);
      assert.equal(response.status, 200);
      const market = suffix ? response.body.structuredNotes.marketReview : response.body.review.marketReview;
      assert.equal(market.source, 'legacy');
      assert.equal(market.blocks.length, legacyNotes.market.length + legacyNotes.rotation.length);
      assert.equal(new Set(market.blocks.map(block => block.id)).size, market.blocks.length);
      for (const group of ['market', 'rotation']) {
        for (const [index, original] of legacyNotes[group].entries()) {
          const block = market.blocks.find(item => item.legacyOrigin?.group === group && item.legacyOrigin?.index === index);
          assert.ok(block, `${group} 原第 ${index} 块缺失`);
          assert.equal(block.legacyOrigin.date, dates.history);
          assert.equal(block.legacyOrigin.id, original.id);
          assert.equal(block.legacyOrigin.title, original.title);
          assert.deepEqual(block.legacyOrigin.children.map(child => ({ id: child.id, title: child.title, body: child.body })), original.children);
          if (block.type === 'legacy') {
            assert.equal(block.title, original.title);
            assert.deepEqual(block.children.map(child => ({ title: child.title, body: child.body })), original.children.map(({ title, body }) => ({ title, body })));
          }
        }
      }
      const bond = market.blocks.find(block => block.symbol === 'GSPC');
      assert.ok(bond.children.some(child => child.title === '国债' && child.body === '10Y 4.2% 压制估值'));
      assert.ok(!market.blocks.some(block => block.symbol === 'TNX'));
      assert.deepEqual(h.snapshot(), before);
      assert.equal(h.events.length, 0);
    } finally { h.close(); }
  });
}

for (const endpoint of ['date', 'bootstrap', 'live', 'live-item']) {
  test(`US4 历史初值：${endpoint} 市场 500 优先计划 480，所有账户统一且保留差异证据`, async () => {
    const h = await legacyPriceHarness();
    try {
      const before = h.snapshot();
      const id = h.sqlite.prepare('SELECT id FROM account_live_action_plans WHERE account_id=1').get().id;
      const url = endpoint === 'date' ? `/api/reviews/${reviewDate}` : endpoint === 'bootstrap' ? `/api/reviews/${reviewDate}/bootstrap` : endpoint === 'live' ? '/api/account-live-action-plans' : `/api/account-live-action-plans/${id}`;
      const response = await h.request(url);
      assert.equal(response.status, 200);
      if (endpoint === 'date' || endpoint === 'bootstrap') {
        const market = endpoint === 'date' ? response.body.review.marketReview : response.body.structuredNotes.marketReview;
        const levels = endpoint === 'date' ? response.body.review.symbolLevels : response.body.symbolLevels;
        assert.deepEqual(levels.SOXX, { supportLevels: '500', resistanceLevels: '560' });
        const conflict = market.conflicts.find(item => item.symbol === 'SOXX' && item.field === 'supportLevels');
        assert.equal(conflict.selectedValue, '500');
        assert.ok(conflict.alternatives.some(item => item.value === '480' && item.source.accountId === 1));
        if (endpoint === 'bootstrap') assert.ok(response.body.actionPlans.every(item => item.supportLevels === '500'));
      } else {
        const items = endpoint === 'live' ? response.body.items : [response.body.item];
        assert.ok(items.every(item => item.supportLevels === '500' && item.resistanceLevels === '560'));
        assert.ok(response.body.conflicts.some(item => item.symbol === 'SOXX' && item.selectedValue === '500'));
      }
      assert.deepEqual(h.snapshot(), before);
    } finally { h.close(); }
  });
}

for (const entry of ['review', 'live-price', 'live-position']) {
  test(`US4 首次冻结：${entry} 写前 500/480 证据不被当前补丁反算，旧列与账户其他字段保留`, async () => {
    const h = await legacyPriceHarness();
    try {
      const before = h.snapshot();
      const id = h.sqlite.prepare('SELECT id FROM account_live_action_plans WHERE account_id=1').get().id;
      let response;
      if (entry === 'review') {
        const projected = (await h.request(`/api/reviews/${reviewDate}/bootstrap`)).body.structuredNotes.marketReview;
        response = await h.request(`/api/reviews/${reviewDate}`, { marketReview: { blocks: projected.blocks, levels: [{ symbol: 'SOXX', supportLevels: '510' }] } });
      } else response = await h.request(`/api/account-live-action-plans/${id}`, entry === 'live-price' ? { supportLevels: '510' } : { currentPosition: '15%-20%' }, { method: 'PUT' });
      assert.equal(response.status, 200, response.body.error);
      const row = h.sqlite.prepare('SELECT * FROM daily_review_archive WHERE archive_date=?').get(reviewDate);
      assert.notEqual(row.market_review_json, null);
      const frozen = JSON.parse(row.market_review_json);
      const evidence = frozen.conflicts.find(item => item.symbol === 'SOXX' && item.field === 'supportLevels');
      assert.ok(evidence, '首次冻结缺少 SOXX 支撑位原始冲突证据');
      assert.equal(evidence.selectedValue, '500');
      assert.ok(evidence.alternatives.some(item => item.value === '480' && item.source.accountId === 1));
      const selected = entry === 'live-position' ? '500' : '510';
      assert.deepEqual({ ...h.sqlite.prepare("SELECT support_levels,resistance_levels FROM daily_review_symbol_levels WHERE archive_date=? AND symbol='SOXX'").get(reviewDate) }, { support_levels: selected, resistance_levels: '560' });
      const initialArchive = before.daily_review_archive.find(item => item.archive_date === reviewDate);
      assert.equal(row.market_sentiment_blocks_json, initialArchive.market_sentiment_blocks_json);
      assert.equal(row.sector_rotation_blocks_json, initialArchive.sector_rotation_blocks_json);
      for (const old of before.daily_review_action_plans.filter(item => item.archive_date === reviewDate)) {
        const actual = h.sqlite.prepare('SELECT * FROM daily_review_action_plans WHERE id=?').get(old.id);
        for (const field of ['support_levels', 'resistance_levels', 'key_levels', 'position_amount', 'thinking']) assert.equal(actual[field], old[field]);
      }
      assert.equal((await h.request(`/api/account-live-action-plans/${id}`, { supportLevels: '520' }, { method: 'PUT' })).status, 200);
      const reopened = (await h.request(`/api/reviews/${reviewDate}`)).body.review.marketReview;
      assert.deepEqual(reopened.conflicts, frozen.conflicts);
      assert.equal(reopened.blocks.find(item => item.symbol === 'SOXX').children.find(item => item.kind === 'support').body, '520');
    } finally { h.close(); }
  });
}

test('US4 混合沿用：保留新基线无来源 MU 和轮动，只有基线后的 market 替换，不读冻结旧列', async () => {
  const h = await createHarness({ seed: seedMarketReviewFixture });
  try {
    const before = h.snapshot();
    const response = await h.request(`/api/reviews/${dates.mixedTarget}/bootstrap`);
    assert.equal(response.status, 200);
    const market = response.body.structuredNotes.marketReview;
    assert.equal(market.source, 'inherited');
    assert.deepEqual(new Set(market.blocks.map(item => item.symbol)), new Set(['GSPC', 'SOXX', 'MU']));
    assert.ok(market.blocks.find(item => item.symbol === 'GSPC').children.some(item => item.body === '更晚 market 替换基线 market，保留轮动和 MU'));
    assert.ok(market.blocks.find(item => item.symbol === 'SOXX').children.some(item => item.body === '新基线 SOXX 轮动，不能被基线前内容覆盖'));
    assert.ok(market.blocks.find(item => item.symbol === 'MU').children.some(item => item.body === '无旧来源的新建主题必须保留'));
    assert.deepEqual([...market.sourceDates].sort(), [dates.mixedBaseline, dates.mixedNewerMarket].sort());
    assert.equal(response.body.symbolLevels.SOXX.supportLevels, '520 新基线支撑');
    assert.equal(response.body.symbolLevels.MU.supportLevels, '90-95');
    assert.deepEqual(h.snapshot(), before);
    const detail = await h.request(`/api/reviews/${dates.mixedTarget}`);
    assert.deepEqual(detail.body.review.marketReview.blocks, []);
    assert.equal(detail.body.review.marketReview.source, 'empty');
  } finally { h.close(); }
});

test('US4 新初始化日：只改 live 仓位也冻结有效沿用，不把 NULL 变空文档', async () => {
  const h = await createHarness({ seed: seedMarketReviewFixture });
  try {
    const initial = await h.request(`/api/reviews/${dates.latest}/initialize`, {});
    assert.equal(initial.status, 200);
    const beforeLevels = h.snapshot().daily_review_symbol_levels;
    const id = h.sqlite.prepare("SELECT id FROM account_live_action_plans WHERE account_id=1 AND symbol='SOXX'").get().id;
    const before = await h.request(`/api/reviews/${dates.latest}/bootstrap`);
    assert.ok(before.body.structuredNotes.marketReview.blocks.length > 0);
    assert.equal((await h.request(`/api/account-live-action-plans/${id}`, { currentPosition: '15%-20%' }, { method: 'PUT' })).status, 200);
    const after = await h.request(`/api/reviews/${dates.latest}/bootstrap`);
    assert.deepEqual(after.body.structuredNotes.marketReview.blocks, before.body.structuredNotes.marketReview.blocks);
    assert.deepEqual(after.body.structuredNotes.marketReview.sourceDates, before.body.structuredNotes.marketReview.sourceDates);
    assert.equal(after.body.structuredNotes.marketReview.source, 'saved');
    assert.deepEqual(beforeLevels, h.snapshot().daily_review_symbol_levels.filter(row => row.archive_date !== dates.latest));
  } finally { h.close(); }
});

for (const status of ['initialized', 'reviewed']) {
  test(`US4 初始化：${status} 不写日期价位，reviewed 保护或重置后仍首次选择市场来源`, async () => {
    const h = await legacyPriceHarness();
    try {
      h.sqlite.prepare('UPDATE daily_review_archive SET review_status=? WHERE archive_date=?').run(status, reviewDate);
      const before = h.snapshot();
      const response = await h.request(`/api/reviews/${reviewDate}/initialize`, {});
      assert.equal(response.status, 200);
      assert.deepEqual(h.snapshot().daily_review_symbol_levels, before.daily_review_symbol_levels);
      if (status === 'reviewed') {
        assert.equal(response.body.skipped, true);
        assert.deepEqual(h.snapshot(), before);
      } else {
        const row = h.sqlite.prepare('SELECT market_review_json,market_sentiment_blocks_json,sector_rotation_blocks_json FROM daily_review_archive WHERE archive_date=?').get(reviewDate);
        assert.deepEqual({ ...row }, { market_review_json: null, market_sentiment_blocks_json: null, sector_rotation_blocks_json: null });
        const projected = await h.request(`/api/reviews/${reviewDate}/bootstrap`);
        assert.equal(projected.status, 200);
        assert.equal(projected.body.symbolLevels.SOXX.supportLevels, '480');
      }
    } finally { h.close(); }
  });
}

test('US4 首次非市场保存：不传 marketReview 也冻结已有旧主题和价格证据，不清空原标题', async () => {
  const h = await legacyPriceHarness();
  try {
    const response = await h.request(`/api/reviews/${reviewDate}`, { reviewerNewsNotes: '仅更新新闻' });
    assert.equal(response.status, 200);
    const row = h.sqlite.prepare('SELECT market_review_json FROM daily_review_archive WHERE archive_date=?').get(reviewDate);
    assert.notEqual(row.market_review_json, null);
    const document = JSON.parse(row.market_review_json);
    assert.equal(document.blocks[0].symbol, 'SOXX');
    assert.equal(document.blocks[0].legacyOrigin.title, '半导体 SOXX');
    assert.equal(document.conflicts.find(item => item.field === 'supportLevels').selectedValue, '500');
    assert.equal(response.body.symbolLevels.SOXX.supportLevels, '500');
  } finally { h.close(); }
});

for (const change of ['title', 'body', 'duplicate-origin']) {
  test(`US4 未关联原文：${change} 在写 batch 前拒绝，合法保留与确认删除可保存`, async () => {
    const h = await createHarness({ seed: seedMarketReviewFixture });
    try {
      const initial = (await h.request(`/api/reviews/${dates.history}`)).body.review.marketReview;
      const legacy = initial.blocks.find(block => block.type === 'legacy' && block.title === '市场广度');
      assert.ok(legacy, '旧未知主题必须投影成 legacy');
      const blocks = structuredClone(initial.blocks);
      const target = blocks.find(block => block.id === legacy.id);
      if (change === 'title') target.title += ' 被改写';
      if (change === 'body') target.children[0].body += ' 被改写';
      if (change === 'duplicate-origin') blocks.push({ ...structuredClone(legacy), id: '复制来源', children: legacy.children.map(child => ({ ...child, id: `${child.id}-copy` })) });
      const before = h.snapshot();
      const invalid = await h.request(`/api/reviews/${dates.history}`, { marketReview: { blocks, levels: [] } });
      assert.equal(invalid.status, change === 'duplicate-origin' ? 400 : 409);
      assert.deepEqual(h.snapshot(), before);
      const saved = await h.request(`/api/reviews/${dates.history}`, { marketReview: { blocks: initial.blocks, levels: [] } });
      assert.equal(saved.status, 200);
      const stored = JSON.parse(h.sqlite.prepare('SELECT market_review_json FROM daily_review_archive WHERE archive_date=?').get(dates.history).market_review_json);
      assert.deepEqual(stored.blocks.find(block => block.id === legacy.id), legacy);
      const levels = h.snapshot().daily_review_symbol_levels;
      const deleted = await h.request(`/api/reviews/${dates.history}`, { marketReview: { blocks: saved.body.marketReview.blocks.filter(block => block.id !== legacy.id), levels: [] } });
      assert.equal(deleted.status, 200);
      assert.ok(!deleted.body.marketReview.blocks.some(block => block.id === legacy.id));
      assert.deepEqual(h.snapshot().daily_review_symbol_levels, levels);
    } finally { h.close(); }
  });
}

test('US4 关联原文：前端关联后序列化保存成功且不写价位，关联同时改正文拒绝', async () => {
  const h = await createHarness({ seed: seedMarketReviewFixture });
  try {
    const initial = (await h.request(`/api/reviews/${dates.history}`)).body.review.marketReview;
    const legacy = initial.blocks.find(block => block.type === 'legacy' && block.title === '市场广度');
    const catalog = h.sqlite.prepare('SELECT * FROM tracked_symbols WHERE is_active = 1').all();
    const symbol = ['MU', 'GOLD', 'XLK'].find(code => catalog.some(item => item.symbol === code)
      && !initial.blocks.some(block => block.symbol === code));
    const linked = linkLegacyMarketBlock(legacy, { symbol, catalog, blocks: initial.blocks });
    const blocks = initial.blocks.map(block => block.id === legacy.id ? linked : block);
    const edited = structuredClone(blocks);
    edited.find(block => block.id === legacy.id).children[0].body += ' 改写';
    const before = h.snapshot();
    const rejected = await h.request(`/api/reviews/${dates.history}`, { marketReview: { blocks: JSON.parse(serializeMarketReview(createMarketReview({ blocks: edited }))).blocks, levels: [] } });
    assert.equal(rejected.status, 409);
    assert.deepEqual(h.snapshot(), before);
    const saved = await h.request(`/api/reviews/${dates.history}`, { marketReview: { blocks: JSON.parse(serializeMarketReview(createMarketReview({ blocks }))).blocks, levels: [] } });
    assert.equal(saved.status, 200);
    const stored = JSON.parse(h.sqlite.prepare('SELECT market_review_json FROM daily_review_archive WHERE archive_date=?').get(dates.history).market_review_json)
      .blocks.find(block => block.id === legacy.id);
    assert.equal(stored.type, 'symbol');
    assert.equal(stored.symbol, symbol);
    assert.deepEqual(stored.legacyOrigin, legacy.legacyOrigin);
    assert.deepEqual(stored.children.map(child => [child.kind, child.body]), legacy.children.map(child => ['custom', child.body]));
    const level = h.sqlite.prepare('SELECT * FROM daily_review_symbol_levels WHERE archive_date=? AND symbol=?').get(dates.history, symbol);
    assert.ok(!level || (level.support_levels === '' && level.resistance_levels === ''), '旧原文不得写入共用价位');
  } finally { h.close(); }
});

test('US4 当日计划优先沿用市场，已存双空价位又优先本日及沿用所有非空候选', async () => {
  const h = await legacyPriceHarness();
  try {
    h.sqlite.prepare('UPDATE daily_review_archive SET market_sentiment_blocks_json=NULL,sector_rotation_blocks_json=NULL WHERE archive_date=?').run(reviewDate);
    h.sqlite.prepare("UPDATE daily_review_archive SET market_sentiment_blocks_json=?,sector_rotation_blocks_json=NULL WHERE archive_date=?").run(JSON.stringify([{ id: 'older-soxx', title: 'SOXX', children: [{ id: 'older-support', title: '支撑位', body: '450 沿用候选' }] }]), previousDate);
    const before = h.snapshot();
    const projected = await h.request(`/api/reviews/${reviewDate}/bootstrap`);
    assert.equal(projected.status, 200);
    assert.equal(projected.body.symbolLevels.SOXX.supportLevels, '480');
    assert.equal(projected.body.structuredNotes.marketReview.source, 'inherited');
    assert.deepEqual(h.snapshot(), before);
    h.sqlite.prepare("INSERT INTO daily_review_symbol_levels (archive_date,symbol,support_levels,resistance_levels) VALUES (?,'SOXX','','')").run(reviewDate);
    const empty = await h.request(`/api/reviews/${reviewDate}/bootstrap`);
    assert.deepEqual(empty.body.symbolLevels.SOXX, { supportLevels: '', resistanceLevels: '' });
    assert.equal(empty.body.structuredNotes.marketReview.blocks.find(block => block.symbol === 'SOXX').children.find(child => child.kind === 'support').body, '');
  } finally { h.close(); }
});

test('US4 快照：复制当时新文档与日期价位，之后改价位不变；未物化旧日不回填新列', async () => {
  const h = await createHarness({ seed: seedMarketReviewFixture });
  try {
    const projected = (await h.request(`/api/reviews/${dates.history}`)).body.review.marketReview;
    assert.equal((await h.request(`/api/reviews/${dates.history}`, { marketReview: { blocks: projected.blocks, levels: [{ symbol: 'SOXX', supportLevels: '快照时支撑' }] } })).status, 200);
    const stored = h.sqlite.prepare('SELECT market_review_json FROM daily_review_archive WHERE archive_date=?').get(dates.history).market_review_json;
    assert.equal((await h.request(`/api/reviews/${dates.history}/snapshot`, { snapshotReason: '测试' })).status, 200);
    assert.equal((await h.request(`/api/reviews/${dates.history}`, { marketReview: { blocks: projected.blocks, levels: [{ symbol: 'SOXX', supportLevels: '之后改写' }] } })).status, 200);
    const snapshot = h.sqlite.prepare('SELECT * FROM daily_review_snapshots WHERE archive_date=? ORDER BY version_no DESC LIMIT 1').get(dates.history);
    assert.equal(snapshot.market_review_json, stored);
    assert.equal(JSON.parse(snapshot.symbol_levels_json).SOXX.supportLevels, '快照时支撑');
    assert.equal(snapshot.market_sentiment_blocks_json, h.sqlite.prepare('SELECT market_sentiment_blocks_json FROM daily_review_archive WHERE archive_date=?').get(dates.history).market_sentiment_blocks_json);

    assert.equal((await h.request(`/api/reviews/${dates.olderRotation}/snapshot`, {})).status, 200);
    const legacy = h.sqlite.prepare('SELECT * FROM daily_review_snapshots WHERE archive_date=?').get(dates.olderRotation);
    assert.deepEqual([legacy.market_review_json, legacy.symbol_levels_json], [null, null]);
    assert.equal(h.sqlite.prepare('SELECT market_review_json FROM daily_review_archive WHERE archive_date=?').get(dates.olderRotation).market_review_json, null);
  } finally { h.close(); }
});

test('US4 列表：新文档摘要取主题名与思考，旧记录仍用旧列，且不逐行查价位', async () => {
  const h = await createHarness({ seed: seedMarketReviewFixture });
  try {
    const response = await h.request(`/api/reviews?from=${dates.mixedBaseline}&to=${dates.history}`);
    assert.equal(response.status, 200);
    const byDate = Object.fromEntries(response.body.items.map(item => [item.archive_date, item.daily_thesis]));
    assert.equal(byDate[dates.mixedBaseline], '标普500：基线大盘思考 / 半导体板块：新基线 SOXX 轮动，不能被基线前内容覆盖');
    assert.equal(byDate[dates.history], '标普500点位 / 半导体 SOXX');
    assert.equal(h.events.filter(event => event.table === 'daily_review_symbol_levels').length, 0);
  } finally { h.close(); }
});
