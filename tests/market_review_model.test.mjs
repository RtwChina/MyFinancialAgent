import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MARKET_REVIEW_VERSION,
  MARKET_REVIEW_PRESETS,
  createMarketReview,
  serializeMarketReview,
  assembleMarketReview,
  patchMarketReviewLevels,
  createSymbolMarketBlock,
  changeMarketBlockSymbol,
  searchMarketReviewSymbols,
  validateMarketReviewBlocks,
  addMarketChild,
  updateMarketChildTitle,
  moveMarketChild,
  deleteMarketChild,
  convertLegacyMarketReview,
  projectMarketReview,
  linkLegacyMarketBlock,
} from '../cloudflare/web/market-review-model.js';
import { dates as fixtureDates, legacyNotes } from './helpers/market-review-fixtures.mjs';

const symbolBlock = {
  id: 'soxx-1', type: 'symbol', symbol: 'SOXX',
  identity: { catalogId: 19, displayCode: 'SOXX', displayName: '半导体板块' },
  children: [
    { id: 'support-1', kind: 'support', title: '支撑位', body: '旧支撑镜像' },
    { id: 'thinking-1', kind: 'thinking', title: '思考', body: '观察\n原文 "500" <b>不改写</b>' },
    { id: 'resistance-1', kind: 'resistance', title: '压力位', body: '旧压力镜像' },
    { id: 'custom-1', kind: 'custom', title: '风险 500/480', body: '风险原文' },
  ],
};
const legacyBlock = {
  id: 'legacy-1', type: 'legacy', symbol: null, title: '存储/光通信',
  legacyOrigin: { date: '2026-10-12', group: 'rotation', index: 1, id: '重复原id', title: '存储/光通信' },
  children: [{ id: 'legacy-support-1', kind: 'support', title: '支持（原文）', body: '500/480，不猜标的' }],
};

function document() {
  return createMarketReview({
    blocks: [symbolBlock, legacyBlock],
    conflicts: [{ id: 'conflict-1', symbol: 'SOXX', field: 'supportLevels', selectedValue: '500', selectedSource: { group: 'rotation' }, alternatives: [{ value: '480', accountId: 1 }] }],
    sourceDates: [{ group: 'rotation', date: '2026-10-12' }],
  });
}

test('基础：版本与六种预设协议字面量固定', () => {
  assert.equal(MARKET_REVIEW_VERSION, 1);
  assert.deepEqual(MARKET_REVIEW_PRESETS, {
    support: '支撑位', resistance: '压力位', thinking: '思考',
    cta: 'CTA 流动性', collar: 'JPM collar', eps: 'EPS 预计',
  });
});

test('基础：空文档是明确的 version=1 结构', () => {
  assert.deepEqual(createMarketReview(), { version: 1, blocks: [], conflicts: [], sourceDates: [] });
});

test('基础：存储剥离 symbol 价位正文，不剥离思考、自定义、legacy 原文和来源', () => {
  const value = document();
  const before = structuredClone(value);
  const saved = JSON.parse(serializeMarketReview(value));
  assert.equal(saved.version, 1);
  assert.equal(Object.hasOwn(saved.blocks[0].children[0], 'body'), false);
  assert.equal(Object.hasOwn(saved.blocks[0].children[2], 'body'), false);
  assert.deepEqual(saved.blocks[0].children[1], symbolBlock.children[1]);
  assert.deepEqual(saved.blocks[0].children[3], symbolBlock.children[3]);
  assert.deepEqual(saved.blocks[1], legacyBlock);
  assert.deepEqual(saved.conflicts, value.conflicts);
  assert.deepEqual(saved.sourceDates, value.sourceDates);
  assert.deepEqual(value, before);
});

test('基础：按 symbol 装配正文并保留块和二级稳定身份与顺序', () => {
  const value = document();
  const levels = { SOXX: { supportLevels: '500–510（强）', resistanceLevels: '560\n570' } };
  const before = structuredClone(value);
  const assembled = assembleMarketReview(value, levels);
  assert.equal(assembled.blocks[0].children[0].body, '500–510（强）');
  assert.equal(assembled.blocks[0].children[2].body, '560\n570');
  assert.deepEqual(assembled.blocks.map(block => block.id), before.blocks.map(block => block.id));
  assert.deepEqual(assembled.blocks[0].children.map(child => child.id), before.blocks[0].children.map(child => child.id));
  assert.deepEqual(assembled.blocks[1], legacyBlock);
  assert.deepEqual(assembled.conflicts, before.conflicts);
  assert.deepEqual(value, before);
  assert.deepEqual(levels, { SOXX: { supportLevels: '500–510（强）', resistanceLevels: '560\n570' } });
});

test('基础：权威空字符串不会回填 JSON 中的旧价位镜像', () => {
  const assembled = assembleMarketReview(document(), { SOXX: { supportLevels: '', resistanceLevels: '' } });
  assert.equal(assembled.blocks[0].children[0].body, '');
  assert.equal(assembled.blocks[0].children[2].body, '');
});

test('基础：缺失映射只呈现空值，不推测价位、不增加主题/二级', () => {
  const value = document();
  const assembled = assembleMarketReview(value, { MU: { supportLevels: '100', resistanceLevels: '120' } });
  assert.equal(assembled.blocks[0].children[0].body, '');
  assert.equal(assembled.blocks[0].children[2].body, '');
  assert.deepEqual(assembled.blocks.map(block => block.id), value.blocks.map(block => block.id));
});

test('基础：展示代码不能充当系统键，GSPC/SPY 与 IXIC/QQQ 不合并', () => {
  const symbols = ['GSPC', 'SPY', 'IXIC', 'QQQ', 'TNX'];
  const value = createMarketReview({ blocks: symbols.map(symbol => ({
    id: `block-${symbol}`, type: 'symbol', symbol,
    identity: { displayCode: symbol === 'TNX' ? 'US10Y' : symbol },
    children: [{ id: `support-${symbol}`, kind: 'support', title: '支撑位' }],
  })) });
  const levels = Object.fromEntries(symbols.map((symbol, index) => [symbol, { supportLevels: String(index), resistanceLevels: '' }]));
  levels.US10Y = { supportLevels: '999', resistanceLevels: '' };
  assert.deepEqual(assembleMarketReview(value, levels).blocks.map(block => block.children[0].body), ['0', '1', '2', '3', '4']);
});

test('基础：序列化不保存响应 source，输入不被共享引用修改', () => {
  const value = document();
  value.source = 'inherited';
  const saved = JSON.parse(serializeMarketReview(value));
  assert.equal(Object.hasOwn(saved, 'source'), false);
  const assembled = assembleMarketReview(value, {});
  assembled.blocks[0].identity.displayName = '不能污染输入';
  assembled.conflicts[0].selectedValue = '510';
  assert.equal(value.blocks[0].identity.displayName, '半导体板块');
  assert.equal(value.conflicts[0].selectedValue, '500');
});

test('基础：仅清空主题不会因仍有日期价位映射而重新建主题', () => {
  const value = createMarketReview();
  assert.deepEqual(assembleMarketReview(value, { SOXX: { supportLevels: '500', resistanceLevels: '560' } }), value);
});

test('基础：__proto__ 系统键只读取自身价位映射，不读取继承值或污染原型', () => {
  const value = createMarketReview({ blocks: [{
    id: '__proto__', type: 'symbol', symbol: '__proto__',
    children: [{ id: 'proto-support', kind: 'support', title: '支撑位' }],
  }] });
  const ownLevels = JSON.parse('{"__proto__":{"supportLevels":"原文 500","resistanceLevels":""}}');
  assert.equal(assembleMarketReview(value, ownLevels).blocks[0].children[0].body, '原文 500');
  const inheritedLevels = Object.create({ __proto__: { supportLevels: '不能继承' } });
  assert.equal(assembleMarketReview(value, inheritedLevels).blocks[0].children[0].body, '');
  assert.equal(Object.hasOwn(Object.prototype, 'supportLevels'), false);
});

const catalog = [
  { id: 1, symbol: 'GSPC', display_name: '标普500指数', name: 'S&P 500 Index', aliases: '["标普","大盘指数"]', is_active: 1, symbol_type: 'index' },
  { id: 2, symbol: 'SPY', displayName: '标普500ETF', name: 'SPDR S&P 500 ETF', aliases: ['标普', '大盘ETF'], isActive: true, symbolType: 'sector' },
  { id: 3, symbol: 'IXIC', displayName: '纳斯达克综合指数', aliases: ['纳指'], isActive: 1 },
  { id: 4, symbol: 'QQQ', display_name: '纳斯达克100ETF', aliases: '["纳指"]', is_active: 1 },
  { id: 19, symbol: 'SOXX', displayName: '半导体板块', aliases: ['芯片'], isActive: 1 },
  { id: 6, symbol: 'MU', display_name: '美光科技', name: 'Micron', aliases: '["存储"]', is_active: 1 },
  { id: 7, symbol: 'SNDK', displayName: '闪迪', aliases: ['存储'], isActive: 1 },
  { id: 8, symbol: 'GOLD', display_name: '黄金期货', aliases: ['黄金'], is_active: 1, symbol_type: 'index' },
  { id: 9, symbol: 'NOPRICE', name: '无行情候选', aliases: ['尚未采集'], is_active: 1 },
  { id: 10, symbol: 'OLDETF', displayName: '已停用ETF', aliases: ['停用'], isActive: 0 },
  { id: 11, symbol: 'TNX', displayCode: 'US10Y', displayName: '十年期国债收益率', aliases: [], isActive: 1 },
  { id: 12, symbol: '通信ETF', display_name: '通信行业ETF', aliases: ['通信'], is_active: 1 },
];

function editableBlock(symbol = 'SOXX', id = 'editable') {
  return {
    id, type: 'symbol', symbol,
    identity: { catalogId: 19, displayCode: symbol, displayName: '可信旧名称' },
    children: [
      { id: `${id}-thinking`, kind: 'thinking', title: '思考', body: '  原文\n"500" <script>不改写</script>  ' },
      { id: `${id}-custom`, kind: 'custom', title: '  风险判断  ', body: '\n 自定义原文 \n' },
    ],
  };
}

function historicalSymbol(id, index, symbol = 'SOXX') {
  return {
    ...editableBlock(symbol, id),
    legacyOrigin: { date: '2026-10-12', group: 'rotation', index, id: '重复旧id', title: '  SOXX 原判断  ' },
  };
}

function expectStatus(status, operation) {
  assert.throws(operation, error => {
    assert.equal(error.status, status, error.message);
    assert.equal(typeof error.message, 'string');
    assert.ok(error.message.length > 0);
    return true;
  });
}

test('US1：搜索完整启用目录，保留原对象与顺序且不按行情/分组筛选', () => {
  const before = structuredClone(catalog);
  const found = searchMarketReviewSymbols(catalog, '  ');
  assert.deepEqual(found, catalog.filter(item => item.is_active === 1 || item.isActive === 1 || item.isActive === true));
  found.forEach(item => assert.equal(item, catalog.find(original => original.symbol === item.symbol)));
  assert.ok(found.some(item => item.symbol === 'GOLD'));
  assert.ok(found.some(item => item.symbol === 'NOPRICE'));
  assert.deepEqual(catalog, before);
});

test('US1：代码、snake/camel显示名称、name和JSON/数组aliases均可搜索', () => {
  for (const [query, expected] of [
    [' sOxX ', ['SOXX']], ['半导体', ['SOXX']], ['SPDR', ['SPY']],
    ['Micron', ['MU']], ['大盘指数', ['GSPC']], ['芯片', ['SOXX']],
    ['尚未采集', ['NOPRICE']], ['通信ETF', ['通信ETF']],
  ]) {
    assert.deepEqual(searchMarketReviewSymbols(catalog, query).map(item => item.symbol), expected, query);
  }
});

test('US1：共享别名返回全部可区分候选，不合并指数与ETF或猜未知token', () => {
  for (const [query, expected] of [['标普', ['GSPC', 'SPY']], ['纳指', ['IXIC', 'QQQ']], ['存储', ['MU', 'SNDK']]]) {
    assert.deepEqual(searchMarketReviewSymbols(catalog, query).map(item => item.symbol), expected);
  }
  assert.deepEqual(searchMarketReviewSymbols(catalog, 'UNKNOWNXYZ'), []);
  assert.deepEqual(searchMarketReviewSymbols(catalog, '停用'), []);
});

test('US1：新块只有symbol身份，默认三种二级及基于block id的稳定唯一child id', () => {
  const before = structuredClone(catalog);
  const block = createSymbolMarketBlock({ symbol: 'SOXX', catalog, id: 'new-soxx' });
  assert.equal(block.id, 'new-soxx');
  assert.equal(block.type, 'symbol');
  assert.equal(block.symbol, 'SOXX');
  assert.deepEqual(block.identity, { catalogId: 19, displayCode: 'SOXX', displayName: '半导体板块' });
  assert.equal(Object.hasOwn(block, 'legacyOrigin'), false);
  assert.equal(Object.hasOwn(block, 'title'), false);
  assert.deepEqual(block.children.map(child => [child.kind, child.title, child.body]), [
    ['support', '支撑位', ''], ['resistance', '压力位', ''], ['thinking', '思考', ''],
  ]);
  assert.equal(new Set([block.id, ...block.children.map(child => child.id)]).size, 4);
  assert.ok(block.children.every(child => child.id.startsWith(block.id)));
  assert.deepEqual(createSymbolMarketBlock({ symbol: 'SOXX', catalog, id: block.id }), block);
  assert.deepEqual(catalog, before);
});

test('US1：省略id仅生成一次UUID，children不再随机；不同新块身份不同', t => {
  let calls = 0;
  t.mock.method(globalThis.crypto, 'randomUUID', () => `uuid-${++calls}`);
  const first = createSymbolMarketBlock({ symbol: 'MU', catalog });
  const second = createSymbolMarketBlock({ symbol: 'SPY', catalog });
  assert.equal(calls, 2);
  assert.equal(first.id, 'uuid-1');
  assert.equal(second.id, 'uuid-2');
  assert.ok(first.children.every(child => child.id.startsWith(first.id)));
  assert.ok(second.children.every(child => child.id.startsWith(second.id)));
});

test('US1：无行情/黄金/中文系统键可新建，GSPC/SPY、IXIC/QQQ分别可建', () => {
  let blocks = [];
  for (const symbol of ['NOPRICE', 'GOLD', '通信ETF', 'GSPC', 'SPY', 'IXIC', 'QQQ']) {
    blocks = [...blocks, createSymbolMarketBlock({ symbol, catalog, blocks, id: `new-${symbol}` })];
  }
  assert.deepEqual(validateMarketReviewBlocks(blocks, { catalog }).map(block => block.symbol), blocks.map(block => block.symbol));
});

test('US1：TNX已有displayCode快照可显示US10Y，但系统键必须TNX且不提前推导展示代码', () => {
  const block = createSymbolMarketBlock({ symbol: 'TNX', catalog, id: 'tnx' });
  assert.equal(block.symbol, 'TNX');
  assert.deepEqual(block.identity, { catalogId: 11, displayCode: 'US10Y', displayName: '十年期国债收益率' });
  assert.equal(searchMarketReviewSymbols(catalog, 'US10Y')[0], catalog.find(item => item.symbol === 'TNX'));
  expectStatus(400, () => createSymbolMarketBlock({ symbol: 'US10Y', catalog, id: 'wrong-key' }));
  const plainCatalog = [{ id: 11, symbol: 'TNX', displayName: '十年期国债收益率', isActive: 1 }];
  assert.equal(createSymbolMarketBlock({ symbol: 'TNX', catalog: plainCatalog, id: 'plain-tnx' }).identity.displayCode, 'TNX');
});

test('US1：新建重复409且定位首个已有块，不覆盖原文', () => {
  const blocks = [historicalSymbol('first-soxx', 0), historicalSymbol('second-soxx', 1)];
  const before = structuredClone(blocks);
  assert.throws(() => createSymbolMarketBlock({ symbol: 'SOXX', catalog, blocks, id: 'duplicate' }), error => {
    assert.equal(error.status, 409);
    assert.equal(error.blockId, 'first-soxx');
    return true;
  });
  assert.deepEqual(blocks, before);
});

test('US1：不存在/停用/展示值/别名/大小写变形不能新建身份', () => {
  for (const symbol of ['UNKNOWNXYZ', 'OLDETF', 'US10Y', '芯片', 'soxx', ' SOXX ', '', null, 19]) {
    expectStatus(400, () => createSymbolMarketBlock({ symbol, catalog, id: 'invalid-symbol' }));
  }
});

test('US1：只含思考/自定义时更换保留block id、child id、标题、顺序和正文，不修改输入', () => {
  const block = editableBlock();
  const blocks = [editableBlock('SPY', 'spy'), block];
  const before = structuredClone({ block, blocks, catalog });
  const changed = changeMarketBlockSymbol(block, { symbol: 'MU', catalog, blocks });
  assert.equal(changed.id, block.id);
  assert.equal(changed.symbol, 'MU');
  assert.deepEqual(changed.identity, { catalogId: 6, displayCode: 'MU', displayName: '美光科技' });
  assert.deepEqual(changed.children, block.children);
  changed.children[0].body = '不能污染输入';
  assert.deepEqual({ block, blocks, catalog }, before);
});

test('US1：含support或resistance即使body空/未存也409，不按正文猜kind', () => {
  for (const kind of ['support', 'resistance']) {
    for (const body of ['', undefined]) {
      const block = editableBlock();
      block.children.push({ id: `price-${kind}`, kind, title: MARKET_REVIEW_PRESETS[kind], ...(body === undefined ? {} : { body }) });
      expectStatus(409, () => changeMarketBlockSymbol(block, { symbol: 'MU', catalog, blocks: [block] }));
    }
  }
});

test('US1：更换重复目标409；相同系统键为无损操作，不把自己当重复', () => {
  const block = editableBlock();
  const blocks = [block, editableBlock('MU', 'mu')];
  expectStatus(409, () => changeMarketBlockSymbol(block, { symbol: 'MU', catalog, blocks }));
  const withPrice = { ...block, children: [{ id: 'support', kind: 'support', title: '支撑位', body: '' }] };
  assert.equal(changeMarketBlockSymbol(withPrice, { symbol: 'SOXX', catalog, blocks: [withPrice] }).symbol, 'SOXX');
});

test('US1：验证返回新数组并以服务端目录重建identity，不信客户端伪造快照', () => {
  const block = editableBlock();
  block.identity = { catalogId: 999, displayCode: 'FAKE', displayName: '假身份', injected: true };
  const before = structuredClone(block);
  const result = validateMarketReviewBlocks([block], { catalog });
  assert.deepEqual(result[0].identity, { catalogId: 19, displayCode: 'SOXX', displayName: '半导体板块' });
  assert.deepEqual(result[0].children, block.children);
  result[0].children[0].body = '返回值独立';
  assert.deepEqual(block, before);
  const withoutIdentity = editableBlock('NOPRICE', 'no-price');
  delete withoutIdentity.identity;
  assert.deepEqual(validateMarketReviewBlocks([withoutIdentity], { catalog })[0].identity,
    { catalogId: 9, displayCode: 'NOPRICE', displayName: '无行情候选' });
});

test('US1：相同可信block id及symbol的停用/硬删身份仍可编辑，采用existing.identity', () => {
  for (const symbol of ['OLDETF', 'HARDDELETED']) {
    const existing = editableBlock(symbol, `old-${symbol}`);
    const submitted = structuredClone(existing);
    submitted.identity = { catalogId: 666, displayCode: '伪造', displayName: '伪造快照' };
    submitted.children[0].body = '  继续编辑旧标的\n';
    const result = validateMarketReviewBlocks([submitted], { catalog, existingBlocks: [existing] });
    assert.deepEqual(result[0].identity, existing.identity);
    assert.equal(result[0].children[0].body, submitted.children[0].body);
    result[0].identity.displayName = '返回值独立';
    assert.equal(existing.identity.displayName, '可信旧名称');
    expectStatus(400, () => validateMarketReviewBlocks([{ ...submitted, id: 'copied' }], { catalog, existingBlocks: [existing] }));
    expectStatus(400, () => validateMarketReviewBlocks([{ ...submitted, symbol: 'OTHERDELETED' }], { catalog, existingBlocks: [existing] }));
  }
});

test('US1：最终submitted仍有价位kind禁止更换，明确删掉全部价位children则允许', () => {
  const existing = { ...editableBlock(), children: [
    { id: 'support', kind: 'support', title: '支撑位' },
    { id: 'resistance', kind: 'resistance', title: '压力位', body: '' },
    ...editableBlock().children,
  ] };
  const submitted = { ...structuredClone(existing), symbol: 'MU' };
  expectStatus(409, () => validateMarketReviewBlocks([submitted], { catalog, existingBlocks: [existing] }));
  submitted.children = submitted.children.filter(child => child.kind !== 'support' && child.kind !== 'resistance');
  const result = validateMarketReviewBlocks([submitted], { catalog, existingBlocks: [existing] });
  assert.equal(result[0].id, existing.id);
  assert.equal(result[0].symbol, 'MU');
  assert.deepEqual(result[0].children, existing.children.slice(2));
  assert.deepEqual(result[0].identity, { catalogId: 6, displayCode: 'MU', displayName: '美光科技' });
  const noPriceExisting = editableBlock();
  const priceSubmitted = { ...submitted, children: [{ id: 'new-support', kind: 'support', title: '支撑位' }] };
  expectStatus(409, () => validateMarketReviewBlocks([priceSubmitted], { catalog, existingBlocks: [noPriceExisting] }));
});

test('US1：blocks/catalog/existingBlocks及每个block/child必须是非null数组/对象', () => {
  for (const invalid of [null, undefined, {}, '[]', 1]) {
    expectStatus(400, () => validateMarketReviewBlocks(invalid, { catalog }));
  }
  for (const invalid of [null, [], 'block', 1]) {
    expectStatus(400, () => validateMarketReviewBlocks([invalid], { catalog }));
  }
  for (const invalid of [null, undefined, {}, '[]', 1]) {
    expectStatus(400, () => validateMarketReviewBlocks([{ ...editableBlock(), children: invalid }], { catalog }));
  }
  for (const invalid of [null, [], 'child', 1]) {
    expectStatus(400, () => validateMarketReviewBlocks([{ ...editableBlock(), children: [invalid] }], { catalog }));
  }
  expectStatus(400, () => validateMarketReviewBlocks([], { catalog: null }));
  expectStatus(400, () => validateMarketReviewBlocks([], { catalog, existingBlocks: null }));
  assert.deepEqual(validateMarketReviewBlocks([], { catalog }), []);
});

test('US1：block/child id均为非空string且全document唯一，不静默trim或重新生成', () => {
  for (const id of ['', '  ', null, 1, undefined]) {
    expectStatus(400, () => validateMarketReviewBlocks([{ ...editableBlock(), id }], { catalog }));
    expectStatus(400, () => validateMarketReviewBlocks([{ ...editableBlock(), children: [{ ...editableBlock().children[0], id }] }], { catalog }));
    expectStatus(400, () => createSymbolMarketBlock({ symbol: 'MU', catalog, id }));
  }
  const first = editableBlock('SOXX', 'first');
  const second = editableBlock('MU', 'second');
  for (const blocks of [
    [first, { ...second, id: first.id }],
    [first, { ...second, id: first.children[0].id }],
    [{ ...first, children: [{ ...first.children[0], id: first.id }] }],
    [first, { ...second, children: [{ ...second.children[0], id: first.children[0].id }] }],
  ]) expectStatus(400, () => validateMarketReviewBlocks(blocks, { catalog }));
  const spaced = { ...first, id: ' stable id ' };
  assert.equal(validateMarketReviewBlocks([spaced], { catalog })[0].id, spaced.id);
});

test('US1：仅symbol/legacy类型，symbol必须为严格启用目录系统键', () => {
  for (const type of [undefined, null, 'custom', 'macro', 'Symbol']) {
    expectStatus(400, () => validateMarketReviewBlocks([{ ...editableBlock(), type }], { catalog }));
  }
  for (const symbol of [undefined, null, 19, '', 'soxx', ' SOXX ', 'US10Y', 'UNKNOWNXYZ', 'OLDETF']) {
    expectStatus(400, () => validateMarketReviewBlocks([{ ...editableBlock(), symbol }], { catalog }));
  }
});

test('US1：二级known kind与title/body严格字符串，price可省略存储body但不能null', () => {
  const block = editableBlock();
  for (const kind of [undefined, null, 'unknown', '__proto__', 'constructor', 1]) {
    expectStatus(400, () => validateMarketReviewBlocks([{ ...block, children: [{ id: 'bad-child', kind, title: '思考', body: '' }] }], { catalog }));
  }
  for (const kind of [...Object.keys(MARKET_REVIEW_PRESETS), 'custom']) {
    for (const field of ['title', 'body']) {
      for (const invalid of [null, 0, {}, [], true]) {
        const child = { id: 'bad-child', kind, title: MARKET_REVIEW_PRESETS[kind] ?? '自定义', body: '', [field]: invalid };
        expectStatus(400, () => validateMarketReviewBlocks([{ ...block, children: [child] }], { catalog }));
      }
    }
  }
  expectStatus(400, () => validateMarketReviewBlocks([{ ...block, children: [{ id: 'missing-body', kind: 'thinking', title: '思考' }] }], { catalog }));
  const storedPrice = { id: 'stored-price', kind: 'support', title: '支撑位' };
  assert.deepEqual(validateMarketReviewBlocks([{ ...block, children: [storedPrice] }], { catalog })[0].children, [storedPrice]);
});

test('US1：新边界preset标题固定/custom标题非空，不trim原文或借历史标题放宽', () => {
  for (const kind of Object.keys(MARKET_REVIEW_PRESETS)) {
    expectStatus(400, () => validateMarketReviewBlocks([{ ...editableBlock(), children: [{ id: 'wrong-title', kind, title: '历史任意标题', body: '' }] }], { catalog }));
  }
  for (const title of ['', '  ', '\n\t']) {
    expectStatus(400, () => validateMarketReviewBlocks([{ ...editableBlock(), children: [{ id: 'empty-custom', kind: 'custom', title, body: '' }] }], { catalog }));
  }
  const block = editableBlock();
  assert.deepEqual(validateMarketReviewBlocks([block], { catalog })[0].children, block.children);
});

test('US1：新结构preset至多一个，多个custom保持顺序和空正文', () => {
  const block = editableBlock();
  const child = block.children[0];
  expectStatus(400, () => validateMarketReviewBlocks([{ ...block, children: [child, { ...child, id: 'another-thinking' }] }], { catalog }));
  const customs = [{ id: 'c1', kind: 'custom', title: '风险', body: '' }, { id: 'c2', kind: 'custom', title: '风险', body: '\n' }];
  assert.deepEqual(validateMarketReviewBlocks([{ ...block, children: customs }], { catalog })[0].children, customs);
});

test('US1：新建重复symbol409，不能伪造或复制legacyOrigin绕过', () => {
  const first = editableBlock('SOXX', 'first');
  expectStatus(409, () => validateMarketReviewBlocks([first, editableBlock('SOXX', 'second')], { catalog }));
  expectStatus(400, () => validateMarketReviewBlocks([historicalSymbol('new-history', 1)], { catalog }));
  const existing = historicalSymbol('trusted', 0);
  for (const origin of [existing.legacyOrigin, { ...existing.legacyOrigin, index: 1 }]) {
    const fake = { ...editableBlock('SOXX', 'fake'), legacyOrigin: origin };
    expectStatus(400, () => validateMarketReviewBlocks([existing, fake], { catalog, existingBlocks: [existing] }));
  }
  expectStatus(409, () => validateMarketReviewBlocks([existing, editableBlock('SOXX', 'fresh')], { catalog, existingBlocks: [existing] }));
});

test('US1：可信existing不同date/group/index的历史重复可无损保留、编辑、排序或删掉部分', () => {
  const existingBlocks = [historicalSymbol('h1', 0), historicalSymbol('h2', 1), historicalSymbol('h3', 0)];
  existingBlocks[2].legacyOrigin.group = 'market';
  const submitted = structuredClone(existingBlocks).reverse();
  submitted[0].children[0].body = '  继续编辑第三块 \n';
  const result = validateMarketReviewBlocks(submitted, { catalog, existingBlocks });
  assert.deepEqual(result.map(block => block.id), ['h3', 'h2', 'h1']);
  assert.equal(result[0].children[0].body, submitted[0].children[0].body);
  assert.deepEqual(result.map(block => block.legacyOrigin), submitted.map(block => block.legacyOrigin));
  assert.equal(validateMarketReviewBlocks(submitted.slice(1), { catalog, existingBlocks }).length, 2);
  assert.equal(validateMarketReviewBlocks(submitted.slice(2), { catalog, existingBlocks }).length, 1);
});

test('US1：不能篡改trusted来源任何字段或宽松标准化date/group/index', () => {
  const existing = historicalSymbol('trusted', 0);
  for (const patch of [
    { date: '2026/10/12' }, { date: '2026-10-13' }, { group: 'Rotation' }, { group: ' rotation ' },
    { index: '0' }, { index: -1 }, { title: existing.legacyOrigin.title.trim() }, { id: '伪造原id' },
  ]) {
    expectStatus(400, () => validateMarketReviewBlocks([{ ...existing, legacyOrigin: { ...existing.legacyOrigin, ...patch } }], { catalog, existingBlocks: [existing] }));
  }
  expectStatus(400, () => validateMarketReviewBlocks([{ ...existing, legacyOrigin: null }], { catalog, existingBlocks: [existing] }));
  const omitted = structuredClone(existing);
  delete omitted.legacyOrigin;
  assert.deepEqual(validateMarketReviewBlocks([omitted], { catalog, existingBlocks: [existing] })[0].legacyOrigin, existing.legacyOrigin);
});

test('US1：每可信date/group/index来源至多一次，不能靠不同旧id或不同symbol复用', () => {
  const first = historicalSymbol('first', 0);
  const second = historicalSymbol('second', 0, 'MU');
  second.legacyOrigin.id = '另一个原id';
  second.legacyOrigin.title = '另一个标题';
  expectStatus(400, () => validateMarketReviewBlocks([first, second], { catalog, existingBlocks: [first, second] }));
});

test('US1：新legacy块400，无可信来源不能伪造自由一级', () => {
  expectStatus(400, () => validateMarketReviewBlocks([legacyBlock], { catalog }));
  const withoutOrigin = structuredClone(legacyBlock);
  delete withoutOrigin.legacyOrigin;
  expectStatus(400, () => validateMarketReviewBlocks([withoutOrigin], { catalog, existingBlocks: [withoutOrigin] }));
});

test('US1：现存legacy原文逐字段保留/删除，不trim、不推导预设标题或投影价位', () => {
  const existing = structuredClone(legacyBlock);
  existing.title = '  存储/光通信 \n';
  existing.children[0].body = '  500/480\n 不猜标的  ';
  const before = structuredClone(existing);
  const reorderedKeys = { children: structuredClone(existing.children), legacyOrigin: { ...existing.legacyOrigin }, title: existing.title, symbol: null, type: 'legacy', id: existing.id };
  const result = validateMarketReviewBlocks([reorderedKeys], { catalog, existingBlocks: [existing] });
  assert.deepEqual(result, [existing]);
  const assembled = assembleMarketReview(createMarketReview({ blocks: result }), { SOXX: { supportLevels: '覆盖错误' } });
  assert.deepEqual(assembled.blocks[0], existing);
  assert.deepEqual(JSON.parse(serializeMarketReview(assembled)).blocks[0], existing);
  assert.deepEqual(validateMarketReviewBlocks([], { catalog, existingBlocks: [existing] }), []);
  result[0].children[0].body = '不能污染可信来源';
  assert.deepEqual(existing, before);
});

test('US1：现存legacy不可修改原标题/正文/child顺序与身份，错误409且不自动关联', () => {
  const existing = structuredClone(legacyBlock);
  for (const mutate of [
    block => { block.title += '改写'; },
    block => { block.children[0].title = '支撑位'; },
    block => { block.children[0].body = ''; },
    block => { block.children[0].id = 'changed-child'; },
    block => { block.children = []; },
    block => { block.type = 'symbol'; block.symbol = 'MU'; },
  ]) {
    const submitted = structuredClone(existing);
    mutate(submitted);
    expectStatus(409, () => validateMarketReviewBlocks([submitted], { catalog, existingBlocks: [existing] }));
  }
  expectStatus(400, () => validateMarketReviewBlocks([{ ...existing, symbol: 'MU' }], { catalog, existingBlocks: [existing] }));
});

test('US1：__proto__/constructor系统键与id为普通字符串，目录索引不使用对象原型', () => {
  const protoCatalog = [...catalog, { id: 99, symbol: '__proto__', displayName: '原型同名资产', aliases: ['原型'], isActive: 1 }];
  const block = createSymbolMarketBlock({ symbol: '__proto__', catalog: protoCatalog, id: '__proto__' });
  assert.equal(block.symbol, '__proto__');
  assert.deepEqual(block.identity, { catalogId: 99, displayCode: '__proto__', displayName: '原型同名资产' });
  assert.equal(searchMarketReviewSymbols(protoCatalog, '原型')[0], protoCatalog.at(-1));
  assert.equal(validateMarketReviewBlocks([block], { catalog: protoCatalog })[0].id, '__proto__');
  expectStatus(400, () => createSymbolMarketBlock({ symbol: 'constructor', catalog: protoCatalog, id: 'constructor' }));
  assert.equal(Object.hasOwn(Object.prototype, 'catalogId'), false);
});

function assertIndependentBlock(result, input) {
  assert.notEqual(result, input);
  assert.notEqual(result.children, input.children);
  assert.notEqual(result.identity, input.identity);
  if (input.legacyOrigin) assert.notEqual(result.legacyOrigin, input.legacyOrigin);
  for (const child of result.children) {
    const original = input.children.find(item => item.id === child.id);
    if (original) assert.notEqual(child, original);
  }
}

test('US2：GSPC可依次新增六种预设，按kind固定标题且空正文，原块不变', () => {
  let block = { ...editableBlock('GSPC', 'gspc'), children: [] };
  for (const [kind, title] of Object.entries(MARKET_REVIEW_PRESETS)) {
    const before = structuredClone(block);
    const added = addMarketChild(block, { kind, title: '不能改预设', id: `gspc-${kind}` });
    assert.deepEqual(added.children, [...before.children, { id: `gspc-${kind}`, kind, title, body: '' }]);
    assert.equal(added.symbol, 'GSPC');
    assert.equal(added.id, 'gspc');
    assertIndependentBlock(added, block);
    assert.deepEqual(block, before);
    block = added;
  }
  assert.deepEqual(validateMarketReviewBlocks([block], { catalog })[0].children, block.children);
});

test('US2：每种已有预设再次新增均409，不覆盖原文或修改输入', () => {
  for (const [kind, title] of Object.entries(MARKET_REVIEW_PRESETS)) {
    const block = { ...editableBlock(), children: [{ id: 'existing', kind, title, body: '原文 500/480' }] };
    const before = structuredClone(block);
    expectStatus(409, () => addMarketChild(block, { kind, id: 'duplicate' }));
    assert.deepEqual(block, before);
  }
});

test('US2：多个同名custom可追加，标题保留原空格与数字区间，正文默认为空', () => {
  const block = editableBlock('GSPC');
  const title = '  波动风险 500–510 / $480\n  ';
  const first = addMarketChild(block, { kind: 'custom', title, id: 'c1' });
  const second = addMarketChild(first, { kind: 'custom', title, id: 'c2' });
  assert.deepEqual(second.children.slice(-2), [
    { id: 'c1', kind: 'custom', title, body: '' },
    { id: 'c2', kind: 'custom', title, body: '' },
  ]);
  assert.deepEqual(second.children.slice(0, -2), block.children);
  assertIndependentBlock(first, block);
  assertIndependentBlock(second, first);
});

test('US2：custom新增标题必须非空string，缺失/空白/非string均400', () => {
  const block = editableBlock();
  const before = structuredClone(block);
  expectStatus(400, () => addMarketChild(block, { kind: 'custom', id: 'c' }));
  for (const title of [undefined, null, '', '  ', '\n\t', 0, true, {}, [], ['风险']]) {
    expectStatus(400, () => addMarketChild(block, { kind: 'custom', title, id: 'c' }));
  }
  assert.deepEqual(block, before);
});

test('US2：新增未知kind与非法options类型明确400，不借对象原型匹配预设', () => {
  const block = editableBlock();
  for (const kind of [undefined, null, '', 'unknown', 'Support', '__proto__', 'constructor', 1, {}, ['cta']]) {
    expectStatus(400, () => addMarketChild(block, { kind, title: '风险', id: 'new' }));
  }
  for (const options of [null, [], 'custom', 1, true]) {
    expectStatus(400, () => addMarketChild(block, options));
  }
  expectStatus(400, () => addMarketChild(block));
});

test('US2：省略child id只生成一次UUID，后续改名/排序/边界/删除不生成id', t => {
  let calls = 0;
  t.mock.method(globalThis.crypto, 'randomUUID', () => `child-uuid-${++calls}`);
  const block = editableBlock();
  const added = addMarketChild(block, { kind: 'custom', title: '风险' });
  assert.equal(added.children.at(-1).id, 'child-uuid-1');
  const renamed = updateMarketChildTitle(added, 'child-uuid-1', '  新风险  ');
  const moved = moveMarketChild(renamed, 'child-uuid-1', -1);
  const boundary = moveMarketChild(moved, block.children[0].id, -1);
  const removed = deleteMarketChild(boundary, 'child-uuid-1');
  assert.deepEqual(removed, block);
  const next = addMarketChild(removed, { kind: 'cta' });
  assert.equal(next.children.at(-1).id, 'child-uuid-2');
  assert.equal(calls, 2);
});

test('US2：显式id保留原字符，不随机；空值与本block/children冲突均400', t => {
  let calls = 0;
  t.mock.method(globalThis.crypto, 'randomUUID', () => { calls++; return 'unused'; });
  const block = editableBlock();
  for (const id of [undefined, null, '', '  ', 0, true, {}, [], block.id, ...block.children.map(child => child.id)]) {
    expectStatus(400, () => addMarketChild(block, { kind: 'custom', title: '风险', id }));
  }
  for (const id of [' stable child id ', '__proto__', 'constructor']) {
    assert.equal(addMarketChild(block, { kind: 'custom', title: '风险', id }).children.at(-1).id, id);
  }
  assert.equal(calls, 0);
});

test('US2：生成id无效或碰撞时400且不重新随机，原块不变', t => {
  const block = editableBlock();
  const before = structuredClone(block);
  const generated = ['', '  ', null, 1, block.id, block.children[0].id];
  let calls = 0;
  t.mock.method(globalThis.crypto, 'randomUUID', () => generated[calls++]);
  for (let index = 0; index < generated.length; index++) {
    expectStatus(400, () => addMarketChild(block, { kind: 'custom', title: '风险' }));
    assert.equal(calls, index + 1);
  }
  assert.deepEqual(block, before);
});

test('US2：只有custom可改标题，保留空格/body/id/kind/顺序/来源，输入引用独立', () => {
  const block = historicalSymbol('history-edit', 0);
  const before = structuredClone(block);
  const title = '  新风险 $500 / 480–510\n  ';
  const changed = updateMarketChildTitle(block, 'history-edit-custom', title);
  const expected = structuredClone(before);
  expected.children[1].title = title;
  assert.deepEqual(changed, expected);
  assertIndependentBlock(changed, block);
  changed.children[0].body = '不能污染正文';
  changed.identity.displayName = '不能污染身份';
  changed.legacyOrigin.title = '不能污染来源';
  assert.deepEqual(block, before);
});

test('US2：custom改名空白/缺失/非string均400，所有预设改名包括同名均409', () => {
  const block = editableBlock();
  for (const title of [undefined, null, '', '  ', '\n\t', 0, true, {}, [], ['风险']]) {
    expectStatus(400, () => updateMarketChildTitle(block, 'editable-custom', title));
  }
  for (const [kind, title] of Object.entries(MARKET_REVIEW_PRESETS)) {
    const presetBlock = { ...block, children: [{ id: 'preset', kind, title, body: '' }] };
    for (const nextTitle of [title, '改预设', '']) {
      expectStatus(409, () => updateMarketChildTitle(presetBlock, 'preset', nextTitle));
    }
  }
});

test('US2：二级上移/下移只交换相邻项，id、原文和其他字段稳定', () => {
  const block = structuredClone(symbolBlock);
  const before = structuredClone(block);
  const moved = moveMarketChild(block, 'custom-1', -1);
  assert.deepEqual(moved.children.map(child => child.id), ['support-1', 'thinking-1', 'custom-1', 'resistance-1']);
  assert.deepEqual(moved.children, [before.children[0], before.children[1], before.children[3], before.children[2]]);
  assertIndependentBlock(moved, block);
  const restored = moveMarketChild(moved, 'custom-1', 1);
  assert.deepEqual(restored, before);
  assertIndependentBlock(restored, moved);
  assert.deepEqual(block, before);
});

test('US2：首项上移/末项下移/单项边界原序列不变且所有嵌套引用独立', () => {
  const block = historicalSymbol('boundary', 0);
  for (const [input, childId, delta] of [
    [block, 'boundary-thinking', -1], [block, 'boundary-custom', 1],
    [{ ...block, children: [block.children[0]] }, 'boundary-thinking', -1],
    [{ ...block, children: [block.children[0]] }, 'boundary-thinking', 1],
  ]) {
    const result = moveMarketChild(input, childId, delta);
    assert.deepEqual(result, input);
    assertIndependentBlock(result, input);
  }
});

test('US2：delta仅允许数字±1，零/字符串/非整数/非数字明确400', () => {
  const block = editableBlock();
  const before = structuredClone(block);
  for (const delta of [undefined, null, 0, 2, -2, 0.5, '1', '-1', true, {}, [], NaN, Infinity]) {
    expectStatus(400, () => moveMarketChild(block, 'editable-custom', delta));
  }
  assert.deepEqual(block, before);
});

test('US2：按稳定child id删除预设/custom，只移除目标且返回独立block', () => {
  const block = structuredClone(symbolBlock);
  const before = structuredClone(block);
  for (const child of block.children) {
    const result = deleteMarketChild(block, child.id);
    assert.deepEqual(result, { ...before, children: before.children.filter(item => item.id !== child.id) });
    assertIndependentBlock(result, block);
  }
  const single = { ...block, children: [block.children[0]] };
  assert.deepEqual(deleteMarketChild(single, single.children[0].id).children, []);
  assert.deepEqual(block, before);
});

test('US2：删除价位child不碰日期symbolLevels，也不自动重建child或主题', () => {
  const value = document();
  const levels = { SOXX: { supportLevels: '  500–510 / $480\n', resistanceLevels: '' } };
  const before = structuredClone({ value, levels });
  let block = deleteMarketChild(value.blocks[0], 'support-1');
  block = deleteMarketChild(block, 'resistance-1');
  const updated = createMarketReview({ ...value, blocks: [block, value.blocks[1]] });
  const saved = JSON.parse(serializeMarketReview(updated));
  const assembled = assembleMarketReview(saved, levels);
  assert.deepEqual(assembled, updated);
  assert.deepEqual(assembled.blocks[0].children.map(child => child.id), ['thinking-1', 'custom-1']);
  assert.deepEqual({ value, levels }, before);
});

test('US2：改名/排序/删除的childId必须非空string且精确存在，非法类型/未知id均400', () => {
  const block = editableBlock();
  const before = structuredClone(block);
  for (const childId of [undefined, null, '', '  ', 0, true, {}, [], ['editable-custom'], 'missing', block.id, ' editable-custom ']) {
    expectStatus(400, () => updateMarketChildTitle(block, childId, '新风险'));
    expectStatus(400, () => moveMarketChild(block, childId, 1));
    expectStatus(400, () => deleteMarketChild(block, childId));
  }
  const spaced = { ...block, children: [{ id: ' exact id ', kind: 'custom', title: '风险', body: '' }] };
  assert.equal(updateMarketChildTitle(spaced, ' exact id ', '新风险').children[0].id, ' exact id ');
  assert.deepEqual(deleteMarketChild(spaced, ' exact id ').children, []);
  assert.deepEqual(block, before);
});

test('US2：四个接口仅symbol可操作，legacy全部409且原文/身份/来源不变', () => {
  const block = structuredClone(legacyBlock);
  const before = structuredClone(block);
  expectStatus(409, () => addMarketChild(block, { kind: 'custom', title: '风险', id: 'new' }));
  expectStatus(409, () => updateMarketChildTitle(block, 'legacy-support-1', '新标题'));
  expectStatus(409, () => moveMarketChild(block, 'legacy-support-1', -1));
  expectStatus(409, () => deleteMarketChild(block, 'legacy-support-1'));
  assert.deepEqual(block, before);
});

test('US2：四个接口拒绝非法block类型/children/id/畸形二级，明确400而非原生异常', () => {
  const block = editableBlock();
  const invalidBlocks = [
    undefined, null, [], 'block', 1, true, {},
    ...[undefined, null, 'custom', 'Symbol', 1].map(type => ({ ...block, type })),
    ...[undefined, null, '', '  ', 1].map(id => ({ ...block, id })),
    ...[undefined, null, {}, '[]', 1].map(children => ({ ...block, children })),
    ...[null, [], 'child', 1, { id: 'bad', kind: 'unknown', title: '风险', body: '' }].map(child => ({ ...block, children: [child] })),
    { ...block, children: [{ ...block.children[0], id: block.id }] },
    { ...block, children: [block.children[0], { ...block.children[1], id: block.children[0].id }] },
  ];
  for (const invalid of invalidBlocks) {
    expectStatus(400, () => addMarketChild(invalid, { kind: 'custom', title: '风险', id: 'new' }));
    expectStatus(400, () => updateMarketChildTitle(invalid, 'editable-custom', '新标题'));
    expectStatus(400, () => moveMarketChild(invalid, 'editable-custom', 1));
    expectStatus(400, () => deleteMarketChild(invalid, 'editable-custom'));
  }
});

test('US2：存储price省略body仍可新增/改名/排序/删除，其他原文不被补写', () => {
  const block = JSON.parse(serializeMarketReview(createMarketReview({ blocks: [symbolBlock] }))).blocks[0];
  const before = structuredClone(block);
  const added = addMarketChild(block, { kind: 'eps', id: 'eps' });
  assert.deepEqual(added.children.at(-1), { id: 'eps', kind: 'eps', title: 'EPS 预计', body: '' });
  const renamed = updateMarketChildTitle(added, 'custom-1', '  风险 $500/480  ');
  assert.equal(renamed.children.find(child => child.id === 'custom-1').title, '  风险 $500/480  ');
  const moved = moveMarketChild(renamed, 'support-1', 1);
  assert.deepEqual(moved.children.map(child => child.id), ['thinking-1', 'support-1', 'resistance-1', 'custom-1', 'eps']);
  assert.equal(Object.hasOwn(moved.children.find(child => child.id === 'support-1'), 'body'), false);
  const removed = deleteMarketChild(moved, 'resistance-1');
  assert.equal(removed.children.some(child => child.id === 'resistance-1'), false);
  assert.equal(Object.hasOwn(removed.children.find(child => child.id === 'support-1'), 'body'), false);
  assert.deepEqual(block, before);
});

test('US2：GSPC的CTA/collar/EPS数字区间与空正文保存重开无损，不绑定JPM或自动计算', () => {
  let block = { ...editableBlock('GSPC', 'gspc-text'), children: [] };
  for (const kind of [...Object.keys(MARKET_REVIEW_PRESETS), 'custom']) {
    block = addMarketChild(block, { kind, title: '  风险 $500/480  ', id: `text-${kind}` });
  }
  assert.equal(block.children.length, 7);
  const texts = {
    thinking: '', cta: '  CTA $1,234.50\n500–510 / 480  ',
    collar: 'JPM collar 5750–5800\n$5,000，不绑定JPM股票', eps: '  EPS 预计 $6.25 / 6.50\n',
  };
  block = { ...block, children: block.children.map(child => Object.hasOwn(texts, child.kind) ? { ...child, body: texts[child.kind] } : child) };
  block = moveMarketChild(block, 'text-eps', -1);
  block = updateMarketChildTitle(block, 'text-custom', '  风险 500–510 / $480  ');
  const value = createMarketReview({ blocks: [block] });
  const levels = { GSPC: { supportLevels: '', resistanceLevels: '  5800–5850\n' } };
  const assembled = assembleMarketReview(value, levels);
  const reopened = assembleMarketReview(JSON.parse(serializeMarketReview(assembled)), levels);
  assert.deepEqual(reopened, assembled);
  assert.deepEqual(reopened.blocks.map(item => item.symbol), ['GSPC']);
  assert.deepEqual(reopened.blocks[0].children.map(child => child.id), block.children.map(child => child.id));
  for (const [kind, body] of Object.entries(texts)) {
    assert.equal(reopened.blocks[0].children.find(child => child.kind === kind).body, body);
  }
  assert.equal(reopened.blocks[0].children.find(child => child.kind === 'support').body, '');
  assert.equal(reopened.blocks[0].children.find(child => child.kind === 'custom').body, '');
  assert.equal(reopened.blocks[0].children.find(child => child.kind === 'custom').title, '  风险 500–510 / $480  ');
});

function priceBody(value, kind, blockIndex = 0) {
  return value.blocks[blockIndex].children.find(child => child.kind === kind)?.body;
}

function assertUniqueMarketIds(value) {
  const ids = value.blocks.flatMap(block => [block.id, ...block.children.map(child => child.id)]);
  assert.equal(new Set(ids).size, ids.length);
}

// T030：仅覆盖纯共用价位模型；日期身份校验和 blocksFinal 的选择由写入口负责。
test('US3：字段补丁更新唯一映射，省略字段保持，price正文始终从映射装配', () => {
  const value = document();
  const levels = { SOXX: { supportLevels: '500', resistanceLevels: '560' }, MU: { supportLevels: '100', resistanceLevels: '120' } };
  const patches = [{ symbol: 'SOXX', supportLevels: '  510–520 / $500\n  ' }];
  const before = structuredClone({ value, levels, patches });
  const result = patchMarketReviewLevels(value, levels, patches);
  assert.deepEqual(Object.keys(result).sort(), ['marketReview', 'symbolLevels']);
  assert.deepEqual(result.symbolLevels, { SOXX: { supportLevels: patches[0].supportLevels, resistanceLevels: '560' }, MU: levels.MU });
  assert.equal(priceBody(result.marketReview, 'support'), patches[0].supportLevels);
  assert.equal(priceBody(result.marketReview, 'resistance'), '560');
  assert.deepEqual(result.marketReview.blocks[0].children.map(child => child.id), value.blocks[0].children.map(child => child.id));
  assert.deepEqual(result.marketReview.blocks[0].children.filter(child => !['support', 'resistance'].includes(child.kind)),
    value.blocks[0].children.filter(child => !['support', 'resistance'].includes(child.kind)));
  assert.deepEqual(result.marketReview.blocks[1], legacyBlock);
  assert.deepEqual(result.marketReview.conflicts, value.conflicts);
  assert.deepEqual(result.marketReview.sourceDates, value.sourceDates);
  assert.notEqual(result.symbolLevels, levels);
  assert.notEqual(result.symbolLevels.MU, levels.MU);
  assertIndependentBlock(result.marketReview.blocks[0], value.blocks[0]);
  result.symbolLevels.MU.supportLevels = '返回值独立';
  result.marketReview.conflicts[0].selectedValue = '返回值独立';
  result.marketReview.sourceDates[0].date = '2026-10-16';
  result.marketReview.blocks[1].children[0].body = '返回值独立';
  assert.deepEqual({ value, levels, patches }, before);
});

test('US3：明确清空为权威空串，保存重开不回退到旧正文或计划镜像', () => {
  const value = document();
  const levels = { SOXX: { supportLevels: '500', resistanceLevels: '560' } };
  const first = patchMarketReviewLevels(value, levels, [{ symbol: 'SOXX', supportLevels: '' }]);
  assert.deepEqual(first.symbolLevels.SOXX, { supportLevels: '', resistanceLevels: '560' });
  assert.equal(priceBody(first.marketReview, 'support'), '');
  const cleared = patchMarketReviewLevels(first.marketReview, first.symbolLevels, [{ symbol: 'SOXX', resistanceLevels: '' }]);
  assert.deepEqual(cleared.symbolLevels.SOXX, { supportLevels: '', resistanceLevels: '' });
  const stored = JSON.parse(serializeMarketReview(cleared.marketReview));
  assert.equal(Object.hasOwn(stored.blocks[0].children[0], 'body'), false);
  assert.equal(Object.hasOwn(stored.blocks[0].children[2], 'body'), false);
  assert.deepEqual(assembleMarketReview(stored, cleared.symbolLevels), cleared.marketReview);
  assert.deepEqual(cleared.marketReview.blocks[1], legacyBlock);
});

test('US3：新symbol无row时两字段默认空，不supplement不新增主题', () => {
  const value = createMarketReview();
  const result = patchMarketReviewLevels(value, {}, [
    { symbol: 'MU', resistanceLevels: '120' }, { symbol: 'SOXX', supportLevels: '' },
  ]);
  assert.deepEqual(result.symbolLevels, {
    MU: { supportLevels: '', resistanceLevels: '120' }, SOXX: { supportLevels: '', resistanceLevels: '' },
  });
  assert.deepEqual(result.marketReview, value);
});

test('US3：空补丁仍克隆并装配全部现存price，绝不按非空映射补结构', t => {
  t.mock.method(globalThis.crypto, 'randomUUID', () => assert.fail('空补丁不得生成id'));
  const value = document();
  const levels = { SOXX: { supportLevels: '500', resistanceLevels: '' }, MU: { supportLevels: '100', resistanceLevels: '120' } };
  const result = patchMarketReviewLevels(value, levels, [], { supplement: true });
  assert.deepEqual(result.marketReview, assembleMarketReview(value, levels));
  assert.deepEqual(result.symbolLevels, levels);
  assert.notEqual(result.symbolLevels.SOXX, levels.SOXX);
  assert.deepEqual(patchMarketReviewLevels(createMarketReview(), levels, [], { supplement: true }).marketReview.blocks, []);
});

test('US3：不supplement时blocksFinal删除优先，非空补丁也不新增主题或价位二级', t => {
  t.mock.method(globalThis.crypto, 'randomUUID', () => assert.fail('最终结构不得生成id'));
  const value = createMarketReview({ blocks: [editableBlock(), legacyBlock] });
  const patches = [{ symbol: 'SOXX', supportLevels: '510', resistanceLevels: '570' }, { symbol: 'MU', supportLevels: '110' }];
  for (const options of [undefined, { catalog, supplement: false }]) {
    const result = patchMarketReviewLevels(value, {}, patches, options);
    assert.deepEqual(result.marketReview, value);
    assert.equal(result.symbolLevels.MU.supportLevels, '110');
    assert.deepEqual(patchMarketReviewLevels(createMarketReview(), {}, patches, options).marketReview.blocks, []);
  }
});

test('US3：存在的两项空row不以旧price body兜底，比较写前映射而非镜像', t => {
  t.mock.method(globalThis.crypto, 'randomUUID', () => assert.fail('未变化不得补结构'));
  const value = createMarketReview({ blocks: [editableBlock()] });
  const levels = { SOXX: { supportLevels: '', resistanceLevels: '' } };
  const result = patchMarketReviewLevels(value, levels, [{ symbol: 'SOXX', supportLevels: '' }], { supplement: true });
  assert.deepEqual(result.marketReview, value);
  const mirrored = patchMarketReviewLevels(document(), levels, [{ symbol: 'SOXX', resistanceLevels: '' }], { supplement: true });
  assert.equal(priceBody(mirrored.marketReview, 'support'), '');
  assert.equal(priceBody(mirrored.marketReview, 'resistance'), '');
  const equal = patchMarketReviewLevels(value, { SOXX: { supportLevels: '500', resistanceLevels: '560' } },
    [{ symbol: 'SOXX', supportLevels: '500', resistanceLevels: '560' }], { supplement: true });
  assert.deepEqual(equal.marketReview, value);
});

test('US3：patches必须为数组，null/对象/数字/字符串不隐式当空补丁', () => {
  for (const patches of [undefined, null, {}, 0, true, '[]']) {
    expectStatus(400, () => patchMarketReviewLevels(createMarketReview(), {}, patches));
  }
});

test('US3：每项补丁必须为非null对象，拒绝数组与其他原始类型', () => {
  for (const patch of [undefined, null, [], 'SOXX', 1, true]) {
    expectStatus(400, () => patchMarketReviewLevels(createMarketReview(), {}, [patch]));
  }
});

test('US3：symbol必须是own非空string，拒绝继承键与null/数字/空白', () => {
  for (const symbol of [undefined, null, 19, true, {}, [], '', '  ', '\n\t']) {
    expectStatus(400, () => patchMarketReviewLevels(createMarketReview(), {}, [{ symbol, supportLevels: '500' }]));
  }
  const inherited = Object.create({ symbol: 'SOXX' });
  inherited.supportLevels = '500';
  expectStatus(400, () => patchMarketReviewLevels(createMarketReview(), {}, [inherited]));
});

test('US3：至少一个own价位字段且每个提交字段均须string，不把null/数字/undefined当清空', () => {
  const inherited = Object.create({ supportLevels: '不能读取', resistanceLevels: '不能读取' });
  inherited.symbol = 'SOXX';
  for (const patch of [{ symbol: 'SOXX' }, { symbol: 'SOXX', body: '500' }, inherited]) {
    expectStatus(400, () => patchMarketReviewLevels(createMarketReview(), {}, [patch]));
  }
  for (const field of ['supportLevels', 'resistanceLevels']) {
    for (const invalid of [undefined, null, 500, NaN, Infinity, true, {}, [], ['500']]) {
      const other = field === 'supportLevels' ? 'resistanceLevels' : 'supportLevels';
      expectStatus(400, () => patchMarketReviewLevels(createMarketReview(), {}, [{ symbol: 'SOXX', [field]: invalid, [other]: '' }]));
    }
  }
});

test('US3：重复symbol补丁400，先验证所有补丁再尝试补结构，输入不变', t => {
  t.mock.method(globalThis.crypto, 'randomUUID', () => assert.fail('非法补丁不得补结构'));
  const value = document();
  const levels = { SOXX: { supportLevels: '500', resistanceLevels: '560' } };
  const before = structuredClone({ value, levels });
  for (const patches of [
    [{ symbol: 'MU', supportLevels: '100' }, { symbol: 'MU', resistanceLevels: '120' }],
    [{ symbol: 'MU', supportLevels: '100' }, { symbol: 'SOXX', resistanceLevels: null }],
  ]) expectStatus(400, () => patchMarketReviewLevels(value, levels, patches, { catalog, supplement: true }));
  assert.deepEqual({ value, levels }, before);
});

test('US3：纯补丁不做日期身份验证，不trim/uppercase/按展示值或别名合并系统键', () => {
  const symbols = ['GSPC', 'SPY', 'IXIC', 'QQQ', 'TNX', 'US10Y', 'soxx', ' SOXX ', '芯片', '通信ETF', 'HARDDELETED'];
  const result = patchMarketReviewLevels(createMarketReview(), {}, symbols.map((symbol, index) => ({ symbol, supportLevels: `${index}` })));
  assert.deepEqual(Object.keys(result.symbolLevels), symbols);
  symbols.forEach((symbol, index) => assert.deepEqual(result.symbolLevels[symbol], { supportLevels: `${index}`, resistanceLevels: '' }));
  assert.deepEqual(result.marketReview.blocks, []);
});

test('US3：补丁与映射不读取继承symbol/row/field，原型getter也不能参与比较或装配', () => {
  const forbidden = () => assert.fail('不得读取原型值');
  const patchPrototype = Object.defineProperty({}, 'resistanceLevels', { get: forbidden });
  const patch = Object.assign(Object.create(patchPrototype), { symbol: 'SOXX', supportLevels: '510' });
  const row = Object.assign(Object.create(Object.defineProperty({}, 'resistanceLevels', { get: forbidden })), { supportLevels: '500' });
  const levels = Object.assign(Object.create(Object.defineProperty({}, 'MU', { get: forbidden })), { SOXX: row });
  const result = patchMarketReviewLevels(document(), levels, [patch, { symbol: 'MU', resistanceLevels: '120' }]);
  assert.deepEqual(result.symbolLevels.SOXX, { supportLevels: '510' });
  assert.deepEqual(result.symbolLevels.MU, { supportLevels: '', resistanceLevels: '120' });
  assert.equal(priceBody(result.marketReview, 'resistance'), '');
  // 直接装配也必须只读row的own字段，而非把原型当作价位来源。
  assert.equal(priceBody(assembleMarketReview(document(), levels), 'resistance'), '');
});

test('US3：__proto__/constructor/toString均为普通own系统键，新增和更新不污染原型', () => {
  const symbols = ['__proto__', 'constructor', 'toString'];
  const value = createMarketReview({ blocks: symbols.map(symbol => ({
    ...editableBlock(symbol, `key-${symbol}`),
    children: [{ id: `key-${symbol}-support`, kind: 'support', title: '支撑位' }],
  })) });
  const levels = JSON.parse('{"__proto__":{"supportLevels":"旧支撑","resistanceLevels":"旧压力"}}');
  const result = patchMarketReviewLevels(value, levels, symbols.map(symbol => ({ symbol, supportLevels: `  ${symbol} 原文  ` })));
  symbols.forEach((symbol, index) => {
    assert.equal(Object.hasOwn(result.symbolLevels, symbol), true);
    assert.equal(priceBody(result.marketReview, 'support', index), `  ${symbol} 原文  `);
    assert.equal(result.symbolLevels[symbol].resistanceLevels, index === 0 ? '旧压力' : '');
  });
  assert.equal(Object.getPrototypeOf(result.symbolLevels), Object.prototype);
  const added = patchMarketReviewLevels(createMarketReview(), {}, [{ symbol: '__proto__', resistanceLevels: '新值' }]);
  assert.equal(Object.hasOwn(added.symbolLevels, '__proto__'), true);
  assert.deepEqual(added.symbolLevels.__proto__, { supportLevels: '', resistanceLevels: '新值' });
  assert.equal(Object.hasOwn(Object.prototype, 'supportLevels'), false);
  assert.equal(Object.hasOwn(Object.prototype, 'resistanceLevels'), false);
});

test('US3：supplement新主题用目录身份和默认三child，只生成一次稳定block UUID', t => {
  let calls = 0;
  t.mock.method(globalThis.crypto, 'randomUUID', () => `supplement-${++calls}`);
  const value = document();
  const levels = { MU: { supportLevels: '', resistanceLevels: '  120\n' } };
  const before = structuredClone({ value, levels, catalog });
  const result = patchMarketReviewLevels(value, levels, [{ symbol: 'MU', supportLevels: '  100–105\n' }], { catalog, supplement: true });
  assert.equal(calls, 1);
  assert.deepEqual(result.marketReview.blocks.map(block => block.id), ['soxx-1', 'legacy-1', 'supplement-1']);
  const block = result.marketReview.blocks[2];
  assert.deepEqual(block.identity, { catalogId: 6, displayCode: 'MU', displayName: '美光科技' });
  assert.deepEqual(block.children.map(child => [child.id, child.kind, child.title, child.body]), [
    ['supplement-1-support', 'support', '支撑位', '  100–105\n'],
    ['supplement-1-resistance', 'resistance', '压力位', '  120\n'],
    ['supplement-1-thinking', 'thinking', '思考', ''],
  ]);
  assertUniqueMarketIds(result.marketReview);
  block.identity.displayName = '返回值不能污染目录';
  assert.deepEqual({ value, levels, catalog }, before);
});

test('US3：多个新标的按补丁顺序各建一次，双field只建一个主题且保留严格键', t => {
  let calls = 0;
  t.mock.method(globalThis.crypto, 'randomUUID', () => `many-${++calls}`);
  const symbols = ['GSPC', 'SPY', 'IXIC', 'QQQ', 'TNX', '通信ETF'];
  const result = patchMarketReviewLevels(createMarketReview(), {}, symbols.map(symbol => ({ symbol, supportLevels: '  500  ', resistanceLevels: '560' })),
    { catalog, supplement: true });
  assert.equal(calls, symbols.length);
  assert.deepEqual(result.marketReview.blocks.map(block => block.symbol), symbols);
  assert.equal(result.marketReview.blocks[4].identity.displayCode, 'US10Y');
  assert.ok(result.marketReview.blocks.every(block => block.children.length === 3));
  assertUniqueMarketIds(result.marketReview);
});

test('US3：只有补新主题才要求catalog已启用严格身份，失败不修改输入', () => {
  for (const symbol of ['UNKNOWNXYZ', 'OLDETF', 'US10Y', '芯片', 'soxx', ' SOXX ']) {
    const value = document();
    const levels = { SOXX: { supportLevels: '500', resistanceLevels: '560' } };
    const before = structuredClone({ value, levels });
    expectStatus(400, () => patchMarketReviewLevels(value, levels, [{ symbol, supportLevels: '100' }], { catalog, supplement: true }));
    assert.deepEqual({ value, levels }, before);
  }
  for (const directory of [undefined, null, {}, []]) {
    expectStatus(400, () => patchMarketReviewLevels(createMarketReview(), {}, [{ symbol: 'MU', supportLevels: '100' }],
      { catalog: directory, supplement: true }));
  }
});

test('US3：已有停用/硬删身份补changed价位child无需catalog，identity与原文稳定', t => {
  let calls = 0;
  t.mock.method(globalThis.crypto, 'randomUUID', () => `old-price-${++calls}`);
  for (const symbol of ['OLDETF', 'HARDDELETED']) {
    const block = editableBlock(symbol, `old-${symbol}`);
    const value = createMarketReview({ blocks: [block] });
    const before = structuredClone(value);
    const result = patchMarketReviewLevels(value, {}, [{ symbol, resistanceLevels: '  560\n' }], { supplement: true });
    const added = result.marketReview.blocks[0];
    assert.deepEqual(added.identity, block.identity);
    assert.deepEqual(added.children.slice(0, 2), block.children);
    assert.deepEqual(added.children.at(-1), { id: `old-price-${calls}`, kind: 'resistance', title: '压力位', body: '  560\n' });
    assert.equal(added.children.some(child => child.kind === 'support'), false);
    assert.deepEqual(value, before);
    assertUniqueMarketIds(result.marketReview);
  }
  assert.equal(calls, 2);
});

test('US3：已有主题只补changed非空对应kind，不能补其他省略/未变/已删除维度', t => {
  let calls = 0;
  t.mock.method(globalThis.crypto, 'randomUUID', () => `changed-only-${++calls}`);
  const value = createMarketReview({ blocks: [{ ...editableBlock(), children: [] }] });
  const levels = { SOXX: { supportLevels: '500', resistanceLevels: '560' } };
  for (const patch of [
    { symbol: 'SOXX', supportLevels: '510' },
    { symbol: 'SOXX', supportLevels: '510', resistanceLevels: '560' },
    { symbol: 'SOXX', supportLevels: '510', resistanceLevels: '' },
  ]) {
    const result = patchMarketReviewLevels(value, levels, [patch], { supplement: true });
    assert.deepEqual(result.marketReview.blocks[0].children, [
      { id: `changed-only-${calls}`, kind: 'support', title: '支撑位', body: '510' },
    ]);
  }
  assert.equal(calls, 3);
});

test('US3：双字段真正非空变化分别补二级，保持现有顺序/标题/正文与稳定id', t => {
  let calls = 0;
  t.mock.method(globalThis.crypto, 'randomUUID', () => `two-price-${++calls}`);
  const value = createMarketReview({ blocks: [historicalSymbol('two', 0)] });
  const result = patchMarketReviewLevels(value, {}, [{ symbol: 'SOXX', supportLevels: '500', resistanceLevels: '560' }], { supplement: true });
  assert.equal(calls, 2);
  assert.deepEqual(result.marketReview.blocks[0].children.slice(0, 2), value.blocks[0].children);
  assert.deepEqual(result.marketReview.blocks[0].children.slice(2), [
    { id: 'two-price-1', kind: 'support', title: '支撑位', body: '500' },
    { id: 'two-price-2', kind: 'resistance', title: '压力位', body: '560' },
  ]);
  assert.deepEqual(result.marketReview.blocks[0].legacyOrigin, value.blocks[0].legacyOrigin);
  assertUniqueMarketIds(result.marketReview);
});

test('US3：空补丁/clear/空白/未变化mirror均不能复活已删主题或child，也不要求目录', t => {
  t.mock.method(globalThis.crypto, 'randomUUID', () => assert.fail('不能复活删除结构'));
  const levels = { SOXX: { supportLevels: '500', resistanceLevels: '560' } };
  for (const value of [createMarketReview(), createMarketReview({ blocks: [editableBlock()] })]) {
    for (const patches of [
      [], [{ symbol: 'SOXX', supportLevels: '' }], [{ symbol: 'SOXX', resistanceLevels: '\n\t  ' }],
      [{ symbol: 'SOXX', supportLevels: '500', resistanceLevels: '560' }],
    ]) {
      const result = patchMarketReviewLevels(value, levels, patches, { catalog: null, supplement: true });
      assert.deepEqual(result.marketReview, value);
      for (const patch of patches) {
        for (const field of ['supportLevels', 'resistanceLevels']) {
          if (Object.hasOwn(patch, field)) assert.equal(result.symbolLevels.SOXX[field], patch[field]);
        }
      }
    }
  }
});

test('US3：变化按原string精确比较，仅用trim判断非空，不标准化写入原文', t => {
  let calls = 0;
  t.mock.method(globalThis.crypto, 'randomUUID', () => `raw-${++calls}`);
  const value = createMarketReview({ blocks: [{ ...editableBlock(), children: [] }] });
  const result = patchMarketReviewLevels(value, { SOXX: { supportLevels: '500', resistanceLevels: '' } },
    [{ symbol: 'SOXX', supportLevels: '  500\n' }], { supplement: true });
  assert.equal(calls, 1);
  assert.equal(result.symbolLevels.SOXX.supportLevels, '  500\n');
  assert.equal(priceBody(result.marketReview, 'support'), '  500\n');
  // 旧镜像恰好等于新值，也不能掩盖共用row发生的真实变化。
  const mirrored = patchMarketReviewLevels(document(), { SOXX: { supportLevels: '', resistanceLevels: '' } },
    [{ symbol: 'SOXX', supportLevels: symbolBlock.children[0].body }], { supplement: true });
  assert.equal(priceBody(mirrored.marketReview, 'support'), symbolBlock.children[0].body);
  assert.equal(calls, 1);
});

test('US3：所有历史重复symbol主题均装配，未补结构时身份/来源/顺序无损', () => {
  const first = addMarketChild(historicalSymbol('h-price-1', 0), { kind: 'support', id: 'h-support-1' });
  const second = addMarketChild(historicalSymbol('h-price-2', 1), { kind: 'resistance', id: 'h-resistance-2' });
  const third = addMarketChild(historicalSymbol('h-price-3', 2), { kind: 'support', id: 'h-support-3' });
  const value = createMarketReview({ blocks: [second, legacyBlock, first, third] });
  const result = patchMarketReviewLevels(value, {}, [{ symbol: 'SOXX', supportLevels: '500', resistanceLevels: '560' }]);
  assert.equal(priceBody(result.marketReview, 'resistance', 0), '560');
  assert.equal(priceBody(result.marketReview, 'support', 2), '500');
  assert.equal(priceBody(result.marketReview, 'support', 3), '500');
  assert.deepEqual(result.marketReview, assembleMarketReview(value, result.symbolLevels));
  assert.deepEqual(result.marketReview.blocks[1], legacyBlock);
  assertUniqueMarketIds(result.marketReview);
});

test('US3：历史重复symbol每块可补changed对应kind，不合并也不恢复其他已删price', t => {
  let calls = 0;
  t.mock.method(globalThis.crypto, 'randomUUID', () => `history-price-${++calls}`);
  const existingPrice = addMarketChild(historicalSymbol('dup-2', 1), { kind: 'support', id: 'existing-support' });
  const value = createMarketReview({ blocks: [historicalSymbol('dup-1', 0), existingPrice, historicalSymbol('dup-3', 2), legacyBlock] });
  const before = structuredClone(value);
  const result = patchMarketReviewLevels(value, { SOXX: { supportLevels: '500', resistanceLevels: '560' } },
    [{ symbol: 'SOXX', supportLevels: '510', resistanceLevels: '560' }], { supplement: true });
  assert.equal(calls, 2);
  assert.deepEqual(result.marketReview.blocks.map(block => block.id), value.blocks.map(block => block.id));
  result.marketReview.blocks.slice(0, 3).forEach((block, index) => {
    assert.equal(priceBody(result.marketReview, 'support', index), '510');
    assert.equal(block.children.some(child => child.kind === 'resistance'), false);
    assert.deepEqual(block.children.slice(0, 2), value.blocks[index].children.slice(0, 2));
    assert.deepEqual(block.legacyOrigin, value.blocks[index].legacyOrigin);
    assert.deepEqual(block.identity, value.blocks[index].identity);
  });
  assert.equal(result.marketReview.blocks[1].children.at(-1).id, 'existing-support');
  assert.deepEqual(result.marketReview.blocks[3], legacyBlock);
  assert.deepEqual(value, before);
  assertUniqueMarketIds(result.marketReview);
});

test('US3：legacy原文不参与price更新或补二级，同名标题也不当symbol主题', () => {
  const legacy = structuredClone(legacyBlock);
  legacy.title = 'SOXX';
  const value = createMarketReview({ blocks: [legacy] });
  const before = structuredClone(value);
  const result = patchMarketReviewLevels(value, {}, [{ symbol: 'SOXX', supportLevels: '  500\n', resistanceLevels: '' }], { catalog, supplement: true });
  assert.deepEqual(result.marketReview.blocks[0], legacy);
  assert.equal(result.marketReview.blocks[1].symbol, 'SOXX');
  assert.equal(result.marketReview.blocks[1].children.length, 3);
  assert.deepEqual(value, before);
  assert.deepEqual(JSON.parse(serializeMarketReview(result.marketReview)).blocks[0], legacy);
});

test('US3：重复保存不再生成id，删除后保存未变mirror/clear不复活且共用row保留', t => {
  let calls = 0;
  t.mock.method(globalThis.crypto, 'randomUUID', () => `roundtrip-${++calls}`);
  const patches = [{ symbol: 'MU', supportLevels: '100', resistanceLevels: '120' }];
  const first = patchMarketReviewLevels(createMarketReview(), {}, patches, { catalog, supplement: true });
  const reopened = assembleMarketReview(JSON.parse(serializeMarketReview(first.marketReview)), first.symbolLevels);
  const equal = patchMarketReviewLevels(reopened, first.symbolLevels, patches, { supplement: true });
  assert.equal(calls, 1);
  assert.deepEqual(equal, first);
  const removedChild = deleteMarketChild(equal.marketReview.blocks[0], 'roundtrip-1-support');
  const deletedPrice = createMarketReview({ blocks: [removedChild] });
  const priceMirror = patchMarketReviewLevels(deletedPrice, equal.symbolLevels, patches, { supplement: true });
  assert.deepEqual(priceMirror.marketReview, deletedPrice);
  const deletedBlock = patchMarketReviewLevels(createMarketReview(), equal.symbolLevels, patches, { supplement: true });
  assert.deepEqual(deletedBlock.marketReview.blocks, []);
  assert.deepEqual(deletedBlock.symbolLevels, equal.symbolLevels);
  const cleared = patchMarketReviewLevels(deletedBlock.marketReview, deletedBlock.symbolLevels,
    [{ symbol: 'MU', supportLevels: '', resistanceLevels: '' }], { supplement: true });
  assert.deepEqual(cleared.marketReview.blocks, []);
  assert.deepEqual(cleared.symbolLevels.MU, { supportLevels: '', resistanceLevels: '' });
  assert.equal(calls, 1);
});

test('US3：symbolLevels必须为对象映射，拒绝null/数组/数字/字符串而非原生异常', () => {
  for (const levels of [undefined, null, [], 1, true, '{}']) {
    expectStatus(400, () => patchMarketReviewLevels(createMarketReview(), levels, [{ symbol: 'SOXX', supportLevels: '500' }]));
  }
});

// T040：真实纯模型断言，不捕获尚未实现的接口来冒充成功；不用 SQL/DB/mock。
// 只构造原 archive/日价位/账户计划行，转换和来源选择一律调用被测接口。
const migrationCatalog = catalog.map(item => {
  if (item.symbol === 'GSPC') return { ...item, aliases: ['标普', '大盘指数', '标普500点位'] };
  if (item.symbol === 'MU') return { ...item, aliases: ['存储', 'Micron'] };
  if (item.symbol === 'SNDK') return { ...item, aliases: ['存储', 'Micron'] };
  return structuredClone(item);
}).concat([
  { id: 20, symbol: 'XLC', display_name: '通信服务', aliases: '["通信服务ETF"]', is_active: 1 },
  { id: 21, symbol: 'XLK', display_name: '科技板块', aliases: ['科技ETF'], is_active: 1 },
  { id: 22, symbol: 'IGV', display_name: '软件板块', aliases: ['软件ETF'], is_active: 1 },
]);
const legacyInput = () => ({
  date: fixtureDates.history, marketBlocks: structuredClone(legacyNotes.market),
  rotationBlocks: structuredClone(legacyNotes.rotation), catalog: structuredClone(migrationCatalog),
});

function assertOrigin(block, raw, date, group, index) {
  assert.equal(block.id, `legacy-${date}-${group}-${index}`);
  assert.deepEqual(block.legacyOrigin, {
    date, group, index, id: raw.id, title: raw.title,
    children: raw.children.map((child, childIndex) => ({
      index: childIndex, id: child.id, title: child.title, body: child.body,
    })),
  });
  assert.deepEqual(block.children.map(child => child.id), raw.children.map((_, childIndex) => `${block.id}-${childIndex}`));
  raw.children.forEach((child, childIndex) => {
    assert.equal(block.legacyOrigin.children[childIndex].title, child.title);
    assert.equal(block.legacyOrigin.children[childIndex].body, child.body);
  });
}

function rawReviewRow(date, { market = null, rotation = null, review = null, status = 'reviewed' } = {}) {
  return {
    archive_date: date, review_status: status,
    market_review_json: review === null ? null : JSON.stringify(review),
    market_sentiment_blocks_json: market === null ? null : JSON.stringify(market),
    sector_rotation_blocks_json: rotation === null ? null : JSON.stringify(rotation),
  };
}

function rawNote(title, support = '', resistance = '', id = 'repeated-old-id') {
  return { id, title, children: [
    { id: 'repeated-child-id', title: '支撑位', body: support },
    { id: 'repeated-child-id', title: '压力位', body: resistance },
  ] };
}

function rawLevel(date, symbol, support, resistance) {
  return { archive_date: date, symbol, support_levels: support, resistance_levels: resistance };
}

function rawPlan(date, symbol, support, resistance, extra = {}) {
  return {
    archive_date: date, symbol, support_levels: support, resistance_levels: resistance,
    id: 1, account_id: 1, account_sort_order: 0, sort_order: 0, ...extra,
  };
}

function projectInput(extra = {}) {
  return {
    archiveDate: fixtureDates.latest, target: rawReviewRow(fixtureDates.latest, { status: 'initialized' }),
    catalog: migrationCatalog, ...extra,
  };
}

for (const [symbol, group, index] of [
  ['GSPC', 'market', 0], ['SOXX', 'rotation', 0], ['QQQ', 'rotation', 2],
  ['GOLD', 'rotation', 3], ['SPY', 'rotation', 4], ['XLC', 'rotation', 5],
  ['XLK', 'rotation', 6], ['IGV', 'rotation', 7],
]) {
  test(`US4 T040：同源 ${symbol} 全部二级及来源原文字串保存重开逐项一致`, () => {
    const input = legacyInput();
    const before = structuredClone(input);
    const converted = convertLegacyMarketReview(input);
    const block = converted.blocks.find(item => item.legacyOrigin.group === group && item.legacyOrigin.index === index);
    const raw = legacyNotes[group][index];
    assert.equal(converted.version, 1);
    assert.equal(block.type, 'symbol');
    assert.equal(block.symbol, symbol);
    assertOrigin(block, raw, input.date, group, index);
    const stored = JSON.parse(serializeMarketReview(converted));
    const levels = { [symbol]: { supportLevels: '独立共用支撑', resistanceLevels: '独立共用压力' } };
    const reopened = assembleMarketReview(stored, levels).blocks.find(item => item.id === block.id);
    assert.deepEqual(reopened.legacyOrigin, block.legacyOrigin);
    block.children.forEach((child, childIndex) => {
      if (!['support', 'resistance'].includes(child.kind)) {
        assert.equal(child.body, raw.children[childIndex].body);
        assert.equal(reopened.children[childIndex].body, raw.children[childIndex].body);
      }
    });
    assert.deepEqual(input, before);
  });
}

test('US4 T040：同源顺序不变，旧重复一级/child id按来源序号产生唯一稳定身份', () => {
  const input = legacyInput();
  const converted = convertLegacyMarketReview(input);
  assert.equal(converted.blocks.length, legacyNotes.market.length + legacyNotes.rotation.length);
  const expected = [
    ...legacyNotes.market.map((raw, index) => ({ raw, group: 'market', index })),
    ...legacyNotes.rotation.map((raw, index) => ({ raw, group: 'rotation', index })),
  ];
  expected.forEach(({ raw, group, index }, blockIndex) => assertOrigin(converted.blocks[blockIndex], raw, input.date, group, index));
  assertUniqueMarketIds(converted);
  assert.deepEqual(convertLegacyMarketReview(input), converted);
  const soxx = converted.blocks.filter(block => block.symbol === 'SOXX');
  assert.equal(soxx.length, 2);
  assert.notEqual(soxx[0].id, soxx[1].id);
  assert.equal(soxx[1].legacyOrigin.children[0].body, '480 原第二块，不能合并丢失');
});

test('US4 T040：GSPC保留国债/CTA/collar/EPS/负伽马，不搬TNX、不复制一级判断到新维度', () => {
  const converted = convertLegacyMarketReview(legacyInput());
  const gspc = converted.blocks[0];
  assert.deepEqual(gspc.children.map(child => [child.kind, child.title]), [
    ['support', '支撑位'], ['resistance', '压力位'], ['cta', 'CTA 流动性'],
    ['collar', 'JPM collar'], ['eps', 'EPS 预计'], ['custom', '国债'], ['custom', '负伽马'],
  ]);
  assert.equal(gspc.legacyOrigin.title, '标普500点位');
  assert.equal(gspc.children.length, legacyNotes.market[0].children.length);
  assert.equal(gspc.children[5].body, '10Y 4.2% 压制估值');
  assert.equal(converted.blocks.some(block => block.symbol === 'TNX' || block.symbol === 'JPM'), false);
});

test('US4 T040：有限预设映射首项规范title，全部重复预设转custom保留原title/body', () => {
  const titles = ['支撑位 (Support)', '支持', '压力位', '压力位', '思考', '思考',
    'CTA', 'CTA流动性', 'JPM collar', 'JPM collar', 'EPS预计', 'EPS 预计'];
  const raw = { id: 'old', title: 'SOXX  500–510（动态判断） ', children: titles.map((title, index) => ({
    id: 'same-child', title, body: `  原文 ${index}\n500–510 / $480  `,
  })) };
  const input = { date: fixtureDates.history, marketBlocks: [], rotationBlocks: [raw], catalog: migrationCatalog };
  const block = convertLegacyMarketReview(input).blocks[0];
  assertOrigin(block, raw, input.date, 'rotation', 0);
  assert.deepEqual(block.children.map(child => child.kind), [
    'support', 'custom', 'resistance', 'custom', 'thinking', 'custom',
    'cta', 'custom', 'collar', 'custom', 'eps', 'custom',
  ]);
  block.children.forEach((child, index) => {
    assert.equal(child.title, index % 2 === 0 ? MARKET_REVIEW_PRESETS[child.kind] : titles[index]);
    if (child.kind !== 'support' && child.kind !== 'resistance') assert.equal(child.body, raw.children[index].body);
  });
  assert.equal(block.children.length, raw.children.length);
});

test('US4 T040：不能明确kind的额外判断title只作custom，不按数字/大小写/前缀猜预设', () => {
  const raw = { id: 'raw', title: 'GSPC 跌破6500会加速', children: [
    '支持但尚未确认', '支撑位 500–510 待验证', 'CTA风险', 'EPS估算?', 'Thinking', '国债',
  ].map((title, index) => ({ id: `old-${index}`, title, body: `  ${index} 原文\n` })) };
  const converted = convertLegacyMarketReview({ date: fixtureDates.history, marketBlocks: [raw], rotationBlocks: [], catalog: migrationCatalog });
  assert.equal(converted.blocks[0].legacyOrigin.title, raw.title);
  assert.deepEqual(converted.blocks[0].children.map(child => [child.kind, child.title, child.body]),
    raw.children.map(child => ['custom', child.title, child.body]));
  assert.equal(converted.blocks[0].children.length, raw.children.length);
});

test('US4 T040：无法关联的全部legacy child含price也只读，空白/HTML/引号原文无损', () => {
  const raw = {
    id: '  old id  ', title: '  存储/光通信 \n',
    children: [
      { id: 'dup', title: '支撑位 (Support)', body: '  500/480\n <script>原文</script>  ' },
      { id: 'dup', title: "  O'Brien <b>原文</b>  ", body: "\nIt's '证据'  \n" },
      { id: '', title: '', body: '  空标题证据不丢  ' },
    ],
  };
  const input = { date: fixtureDates.history, marketBlocks: [], rotationBlocks: [raw], catalog: migrationCatalog };
  const converted = convertLegacyMarketReview(input);
  const block = converted.blocks[0];
  assert.equal(block.type, 'legacy');
  assert.equal(block.symbol, null);
  assert.equal(block.title, raw.title);
  assertOrigin(block, raw, input.date, 'rotation', 0);
  block.children.forEach((child, index) => {
    assert.equal(child.title, raw.children[index].title);
    assert.equal(child.body, raw.children[index].body);
    assert.equal(child.readOnly, true);
  });
  assert.deepEqual(JSON.parse(serializeMarketReview(assembleMarketReview(converted, {
    SOXX: { supportLevels: '错误覆盖', resistanceLevels: '错误覆盖' },
  }))), converted);
});

for (const [title, expected] of [
  ['QQQ / SPY 相对强弱', null], ['SOXX / XLC 板块比较', null],
  ['Micron', null], ['存储', null], ['UNKNOWNXYZ 软件板块', null],
  ['XSOXXY 半导体板块', null], ['软件ETF', 'IGV'], ['已停用ETF', 'OLDETF'],
  ['已停用 OLDETF', 'OLDETF'], ['标普500点位', 'GSPC'],
  ['标普 SOXX 优先明确系统code', 'SOXX'],
]) {
  test(`US4 T040：严格唯一归属 ${title} → ${expected ?? 'legacy'}`, () => {
    const raw = { id: 'raw', title, children: [{ id: 'c', title: '思考', body: 'MU / LITE 正文不能参与身份猜测' }] };
    const block = convertLegacyMarketReview({ date: fixtureDates.history, marketBlocks: [], rotationBlocks: [raw], catalog: migrationCatalog }).blocks[0];
    assert.equal(block.type, expected === null ? 'legacy' : 'symbol');
    assert.equal(block.symbol, expected);
    assert.equal(block.legacyOrigin.title, title);
    assert.equal(block.legacyOrigin.children[0].body, raw.children[0].body);
  });
}

test('US4 T040：唯一完整display_name/alias才匹配；inactive别名也参与历史歧义', () => {
  const directory = [...migrationCatalog, { id: 30, symbol: 'OLDCHIP', display_name: '老芯片ETF', aliases: ['芯片'], is_active: 0 }];
  const titles = ['半导体板块', '半导体', '芯片', '标普', '纳指'];
  const converted = convertLegacyMarketReview({
    date: fixtureDates.history, marketBlocks: [], catalog: directory,
    rotationBlocks: titles.map(title => ({ id: 'old', title, children: [] })),
  });
  assert.deepEqual(converted.blocks.map(block => block.symbol), ['SOXX', null, null, null, null]);
});

test('US4 T040：GSPC/SPY、IXIC/QQQ、TNX展示严格分离，不新建US10Y系统键', () => {
  const titles = ['GSPC 标普指数', 'SPY 标普ETF', 'IXIC 纳指综合', 'QQQ 纳指ETF', 'TNX 国债'];
  const converted = convertLegacyMarketReview({
    date: fixtureDates.history, marketBlocks: titles.map(title => rawNote(title, title)),
    rotationBlocks: [], catalog: migrationCatalog,
  });
  assert.deepEqual(converted.blocks.map(block => block.symbol), ['GSPC', 'SPY', 'IXIC', 'QQQ', 'TNX']);
  assert.equal(converted.blocks[4].identity.displayCode, 'US10Y');
  assert.equal(converted.blocks.some(block => block.symbol === 'US10Y'), false);
  converted.blocks.forEach((block, index) => assert.equal(block.legacyOrigin.children[0].body, titles[index]));
});

test('US4 T040：本日市场逐字段优先，空字段由账户顺序计划兜底，未采纳原文成证据', () => {
  const market = [rawNote('半导体 SOXX', '500', '')];
  const result = projectMarketReview(projectInput({
    target: rawReviewRow(fixtureDates.latest, { market, rotation: [], status: 'initialized' }),
    planRows: [
      rawPlan(fixtureDates.latest, 'SOXX', '480', '540', { id: 11, account_id: 1 }),
      rawPlan(fixtureDates.latest, 'SOXX', '490', '550', { id: 12, account_id: 2 }),
    ],
  }));
  assert.equal(result.marketReview.source, 'legacy');
  assert.deepEqual(result.symbolLevels.SOXX, { supportLevels: '500', resistanceLevels: '540' });
  const support = result.marketReview.conflicts.find(item => item.field === 'supportLevels');
  assert.equal(support.selectedSource.type, 'market');
  assert.deepEqual(support.alternatives.map(item => [item.value, item.source.accountId]), [['480', 1], ['490', 2]]);
  const resistance = result.marketReview.conflicts.find(item => item.field === 'resistanceLevels');
  assert.equal(resistance.selectedSource.accountId, 1);
  assert.deepEqual(resistance.alternatives.map(item => item.value), ['550']);
  assert.equal(result.marketReview.blocks[0].children.find(child => child.kind === 'support').body, '500');
  assert.deepEqual(result.document.conflicts, result.marketReview.conflicts);
});

test('US4 T040：已存价位行含双空为权威，不回退市场/计划且不产生证据', () => {
  const result = projectMarketReview(projectInput({
    target: rawReviewRow(fixtureDates.latest, { market: [rawNote('SOXX', '500', '560')], rotation: [] }),
    levelRows: [rawLevel(fixtureDates.latest, 'SOXX', '', '')],
    planRows: [rawPlan(fixtureDates.latest, 'SOXX', '480', '540')],
  }));
  assert.deepEqual(result.symbolLevels.SOXX, { supportLevels: '', resistanceLevels: '' });
  assert.deepEqual(result.marketReview.conflicts, []);
});

test('US4 T040：NULL 才沿用，已存 [] 是本日明确空；两组都存在不跨日', () => {
  const history = [rawReviewRow(fixtureDates.history, { market: [rawNote('GSPC 旧大盘', '6500')], rotation: [rawNote('SOXX 旧轮动', '500')] })];
  const partial = projectMarketReview(projectInput({
    target: rawReviewRow(fixtureDates.latest, { market: [], rotation: null, status: 'initialized' }), history, allowInheritance: true,
  }));
  assert.deepEqual(partial.marketReview.blocks.map(block => [block.symbol, block.legacyOrigin.group]), [['SOXX', 'rotation']]);
  assert.equal(partial.marketReview.source, 'inherited');
  assert.deepEqual(partial.marketReview.sourceDates, [fixtureDates.history]);
  const explicit = projectMarketReview(projectInput({
    target: rawReviewRow(fixtureDates.latest, { market: [], rotation: [], status: 'initialized' }), history, allowInheritance: true,
  }));
  assert.deepEqual([explicit.marketReview.blocks, explicit.marketReview.source], [[], 'legacy']);
  const detail = projectMarketReview(projectInput({ target: rawReviewRow(fixtureDates.latest, { status: 'initialized' }), history }));
  assert.deepEqual([detail.marketReview.blocks, detail.marketReview.source], [[], 'empty']);
  const saved = projectMarketReview(projectInput({ target: rawReviewRow(fixtureDates.latest, { review: createMarketReview() }), history, allowInheritance: true }));
  assert.deepEqual([saved.marketReview.blocks, saved.marketReview.source], [[], 'saved']);
});

test('US4 T040：新基线后只替换同 group，冻结旧列与基线前组排除，空中间日与未完成日跳过', () => {
  const baseline = createMarketReview({ blocks: [
    { ...historicalSymbol('base-gspc', 0, 'GSPC'), legacyOrigin: { date: '2026-09-20', group: 'market', index: 0, id: 'm', title: 'GSPC' } },
    { ...historicalSymbol('base-soxx', 0), legacyOrigin: { date: '2026-09-20', group: 'rotation', index: 0, id: 'r', title: 'SOXX' } },
    editableBlock('MU', 'base-mu'),
  ] });
  const history = [
    rawReviewRow('2026-09-20', { rotation: [rawNote('SOXX 基线前', '1')] }),
    rawReviewRow('2026-09-22', { review: baseline, market: [rawNote('GSPC 冻结', '2')], rotation: [rawNote('SOXX 冻结', '3')] }),
    rawReviewRow('2026-09-24', { market: [rawNote('GSPC 更晚', '6600')] }),
    rawReviewRow('2026-09-25', { market: [], rotation: [] }),
    rawReviewRow('2026-09-26', { market: [rawNote('GSPC 未完成', '9')], status: 'draft' }),
  ];
  const result = projectMarketReview(projectInput({
    archiveDate: '2026-09-27', target: rawReviewRow('2026-09-27', { status: 'initialized' }), history, allowInheritance: true,
    historyLevels: { '2026-09-22': { SOXX: { supportLevels: '520 基线', resistanceLevels: '' }, MU: { supportLevels: '90', resistanceLevels: '120' } } },
  }));
  assert.deepEqual(result.marketReview.blocks.map(block => block.id), ['legacy-2026-09-24-market-0', 'base-soxx', 'base-mu']);
  assert.deepEqual([...result.marketReview.sourceDates].sort(), ['2026-09-22', '2026-09-24']);
  assert.deepEqual(result.symbolLevels.GSPC, { supportLevels: '6600', resistanceLevels: '' });
  assert.deepEqual(result.symbolLevels.SOXX, { supportLevels: '520 基线', resistanceLevels: '' });
  assert.deepEqual(result.symbolLevels.MU, { supportLevels: '90', resistanceLevels: '120' });
  assert.equal(JSON.stringify(result).includes('冻结'), false);
});

test('US4 T040：本日计划优先沿用来源，沿用差异留证据；关联历史块保留原文不写价位', () => {
  const history = [rawReviewRow(fixtureDates.history, { market: [rawNote('SOXX', '450 沿用')], rotation: [] })];
  const result = projectMarketReview(projectInput({
    target: rawReviewRow(fixtureDates.latest, { status: 'initialized' }), history, allowInheritance: true,
    planRows: [rawPlan(fixtureDates.latest, 'SOXX', '480', '')],
  }));
  assert.equal(result.symbolLevels.SOXX.supportLevels, '480');
  assert.deepEqual(result.marketReview.conflicts[0].alternatives.map(item => [item.value, item.source.date]), [['450 沿用', fixtureDates.history]]);

  const legacy = convertLegacyMarketReview({ date: fixtureDates.history, marketBlocks: [rawNote('存储', '500', '560')], rotationBlocks: [], catalog: migrationCatalog }).blocks[0];
  const linked = linkLegacyMarketBlock(legacy, { symbol: 'MU', catalog: migrationCatalog, blocks: [legacy] });
  assert.equal(linked.type, 'symbol');
  assert.deepEqual(linked.legacyOrigin, legacy.legacyOrigin);
  assert.deepEqual(linked.children.map(child => [child.kind, child.title, child.body]), [['custom', '支撑位', '500'], ['custom', '压力位', '560']]);
  assert.deepEqual(validateMarketReviewBlocks([linked], { catalog: migrationCatalog, existingBlocks: [legacy] }), [linked]);
  expectStatus(409, () => validateMarketReviewBlocks([{ ...linked, children: [{ ...linked.children[0], body: '改写' }, linked.children[1]] }], { catalog: migrationCatalog, existingBlocks: [legacy] }));
  const mu = editableBlock('MU', 'existing-mu');
  expectStatus(409, () => linkLegacyMarketBlock(legacy, { symbol: 'MU', catalog: migrationCatalog, blocks: [mu, legacy] }));
  expectStatus(409, () => validateMarketReviewBlocks([mu, linked], { catalog: migrationCatalog, existingBlocks: [mu, legacy] }));
});

test('US4 T040：大盘组沿用原导出标普识别，轮动组同标题与 ETF 标题不猜 GSPC', () => {
  const raw = title => ({ id: 'raw', title, children: [] });
  const converted = convertLegacyMarketReview({
    date: fixtureDates.history, catalog,
    marketBlocks: [raw('标普500点位'), raw('标普500 震荡，CTA 卖出放缓'), raw('标普500ETF 走势')],
    rotationBlocks: [raw('标普500点位')],
  });
  assert.deepEqual(converted.blocks.map(block => block.symbol), ['GSPC', 'GSPC', null, null]);
});
