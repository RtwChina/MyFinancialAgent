// 市场与板块的同源夹具：同一份 SQL 既用于 node:sqlite（db.exec），也由
// market-review-local.mjs 写入本地 D1，避免两套数据漂移。
export const dates = {
  empty: '2026-09-01',
  mixedOlderRotation: '2026-09-20',
  mixedBaseline: '2026-09-22',
  mixedNewerMarket: '2026-09-24',
  mixedTarget: '2026-09-25',
  savedEmpty: '2026-09-26',
  explicitEmptyLevels: '2026-09-27',
  olderMarket: '2026-10-08',
  olderRotation: '2026-10-09',
  history: '2026-10-12',
  emptyMiddle: '2026-10-13',
  latest: '2026-10-14',
};

export const accounts = { us: 1, cn: 2 };
export const noPriceSymbol = 'NOPRICE';
const fixtureTime = '2026-10-14 08:00:00';

const extraSymbols = [
  { symbol: 'SPY', yahoo: 'SPY', name: '标普500ETF', type: 'sector', aliases: ['SPY', 'SPDR S&P 500 ETF', '标普500ETF'], active: 1, sort: 20 },
  { symbol: 'QQQ', yahoo: 'QQQ', name: '纳斯达克100ETF', type: 'sector', aliases: ['QQQ', 'Invesco QQQ', '纳指100ETF'], active: 1, sort: 21 },
  { symbol: 'IGV', yahoo: 'IGV', name: '软件板块', type: 'sector', aliases: ['IGV', '软件ETF'], active: 1, sort: 22 },
  { symbol: 'OLDETF', yahoo: 'OLDETF', name: '已停用ETF', type: 'sector', aliases: ['OLDETF'], active: 0, sort: 99 },
  { symbol: noPriceSymbol, yahoo: noPriceSymbol, name: '无行情候选', type: 'stock', aliases: [noPriceSymbol, '无行情'], active: 1, sort: 98 },
];

const historyMarketNotes = [
  {
    id: 'market-1',
    title: '标普500点位',
    children: [
      { id: 'm1-support', title: '支撑位 (Support)', body: '6550–6600（强）\n6400' },
      { id: 'm1-resistance', title: '压力位', body: '6800–6850' },
      { id: 'm1-cta', title: 'CTA', body: 'CTA 加速卖出触发 6480/6450' },
      { id: 'm1-collar', title: 'JPM collar', body: '6900 call / 5800 put' },
      { id: 'm1-eps', title: 'EPS 预计', body: '2026 EPS 300' },
      { id: 'm1-bond', title: '国债', body: '10Y 4.2% 压制估值' },
      { id: 'm1-gamma', title: '负伽马', body: '6500' },
    ],
  },
  {
    id: 'market-2',
    title: '市场广度',
    children: [
      { id: 'm2-view', title: '判断', body: '广度走弱，<b>注意</b> "防守"' },
      { id: 'm2-quote', title: "O'Brien <b>原文</b>", body: "It's 500–510（强）\n'不要改写' <script>alert(\"test\")</script>" },
    ],
  },
];

const historyRotationNotes = [
  {
    id: 'rotation-1',
    title: '半导体 SOXX',
    children: [
      { id: 'r1-support', title: '支撑位', body: '500–510（强）' },
      { id: 'r1-resistance', title: '压力位', body: '560–570' },
      { id: 'r1-thinking', title: '思考', body: '观察板块强弱' },
    ],
  },
  {
    id: 'rotation-1',
    title: '存储/光通信',
    children: [{ id: 'r2-thinking', title: '思考', body: 'MU 与 LITE 分化' }],
  },
  {
    id: 'rotation-3',
    title: '纳斯达克 QQQ',
    children: [
      { id: 'r3-resistance', title: '压力位', body: '610-620' },
      { id: 'r3-support', title: '支撑位 (Support)', body: '580-590' },
      { id: 'r3-metric', title: '关键指标', body: '成交额 500-600 亿' },
    ],
  },
  {
    id: 'rotation-4',
    title: '黄金 GOLD',
    children: [
      { id: 'r4-support', title: '支撑位', body: '3300' },
      { id: 'r4-support-dup', title: '支撑位', body: '3200 重复预设' },
    ],
  },
  {
    id: 'rotation-5', title: '标普ETF SPY',
    children: [
      { id: 'r5-support', title: '支撑位', body: '650-660' },
      { id: 'r5-resistance', title: '压力位', body: '680-685' },
      { id: 'r5-thinking', title: '思考', body: 'SPY ETF 不等于 GSPC 指数' },
    ],
  },
  {
    id: 'rotation-6', title: '通信服务 XLC',
    children: [{ id: 'r6-support', title: '支撑位', body: '105-110' }, { id: 'r6-thinking', title: '思考', body: '观察通信服务' }],
  },
  {
    id: 'rotation-7', title: '科技 XLK',
    children: [{ id: 'r7-resistance', title: '压力位', body: '250-260' }, { id: 'r7-thinking', title: '思考', body: '科技板块轮动' }],
  },
  {
    id: 'rotation-8', title: '软件 IGV',
    children: [{ id: 'r8-support', title: '支撑位', body: '90-95' }, { id: 'r8-thinking', title: '思考', body: '软件板块强弱' }],
  },
  {
    id: 'rotation-1', title: 'SOXX 第二份原判断',
    children: [{ id: 'r1-support', title: '支撑位', body: '480 原第二块，不能合并丢失' }],
  },
  {
    id: 'rotation-cross', title: 'QQQ / SPY 相对强弱',
    children: [{ id: 'cross-support', title: '支撑位', body: 'QQQ 580 / SPY 650，不猜单一标的' }],
  },
  {
    id: 'rotation-ambiguous', title: 'Micron',
    children: [{ id: 'ambiguous-thinking', title: '思考', body: 'SNDK 和 MU 共享历史别名，保留原文' }],
  },
  {
    id: 'rotation-inactive', title: '已停用 OLDETF',
    children: [{ id: 'inactive-thinking', title: '思考', body: '目录停用后历史仍可读' }],
  },
];

export const legacyNotes = { market: historyMarketNotes, rotation: historyRotationNotes };

const olderMarketNotes = [{ id: 'old-m', title: '大盘旧判断', children: [{ id: 'old-m-1', title: '判断', body: '更早的大盘内容' }] }];
const olderRotationNotes = [{ id: 'old-r', title: '板块旧判断', children: [{ id: 'old-r-1', title: '判断', body: '较早的板块内容' }] }];

// 以下是 data-model.md 的已存 version=1 示例数据，不调用/实现旧数据转换模型。
// catalogId 在生成 SQL 时从真实 tracked_symbols 查询，不能使用示例 id 42。
const baselineReview = {
  version: 1,
  blocks: [
    {
      id: 'legacy-2026-09-20-market-0', type: 'symbol', symbol: 'GSPC',
      identity: { catalogId: null, displayCode: 'GSPC', displayName: '标普500' },
      legacyOrigin: { date: dates.mixedOlderRotation, group: 'market', id: 'mixed-m', index: 0, title: '标普500 GSPC 旧判断' },
      children: [
        { id: 'baseline-gspc-support', kind: 'support', title: '支撑位' },
        { id: 'baseline-gspc-thinking', kind: 'thinking', title: '思考', body: '基线大盘思考' },
      ],
    },
    {
      id: 'legacy-2026-09-20-rotation-0', type: 'symbol', symbol: 'SOXX',
      identity: { catalogId: null, displayCode: 'SOXX', displayName: '半导体板块' },
      legacyOrigin: { date: dates.mixedOlderRotation, group: 'rotation', id: 'mixed-r', index: 0, title: '半导体 SOXX 旧轮动' },
      children: [
        { id: 'baseline-soxx-support', kind: 'support', title: '支撑位' },
        { id: 'baseline-soxx-thinking', kind: 'thinking', title: '思考', body: '新基线 SOXX 轮动，不能被基线前内容覆盖' },
      ],
    },
    {
      id: 'new-mu-baseline', type: 'symbol', symbol: 'MU',
      identity: { catalogId: null, displayCode: 'MU', displayName: '美光科技' },
      children: [{ id: 'baseline-mu-thinking', kind: 'thinking', title: '思考', body: '无旧来源的新建主题必须保留' }],
    },
  ],
  conflicts: [],
};
const explicitEmptyReview = {
  version: 1,
  blocks: [{
    id: 'saved-soxx-empty', type: 'symbol', symbol: 'SOXX',
    identity: { catalogId: null, displayCode: 'SOXX', displayName: '半导体板块' },
    children: [
      { id: 'saved-soxx-support', kind: 'support', title: '支撑位' },
      { id: 'saved-soxx-resistance', kind: 'resistance', title: '压力位' },
      { id: 'saved-soxx-thinking', kind: 'thinking', title: '思考', body: '已存空权威，不能采用旧 500/480' },
    ],
  }],
  conflicts: [],
};
export const duplicateSourceReview = {
  version: 1,
  blocks: [
    structuredClone(baselineReview.blocks[1]),
    { ...structuredClone(baselineReview.blocks[1]), id: 'copied-source', children: [{ id: 'copied-thinking', kind: 'thinking', title: '思考', body: '非法复用来源输入' }] },
  ],
  conflicts: [],
};
const savedDocuments = new Map([
  [dates.mixedBaseline, baselineReview],
  [dates.savedEmpty, { version: 1, blocks: [], conflicts: [] }],
  [dates.explicitEmptyLevels, explicitEmptyReview],
]);

function sqlValue(value) {
  if (value == null) return 'NULL';
  if (typeof value === 'number') return String(value);
  return `'${String(value).replace(/'/g, "''")}'`;
}

// INSERT 带固定 fixture id 且仅在自然键缺失时执行；后续 UPDATE 保留现有 id。
// 不使用无条件 INSERT ... ON CONFLICT，避免冲突也推进 AUTOINCREMENT 序列。
function upsert(table, row, keys) {
  const columns = Object.keys(row);
  const where = keys.map((key) => `${key} = ${sqlValue(row[key])}`).join(' AND ');
  const updates = columns.filter((key) => key !== 'id' && !keys.includes(key));
  return [
    `INSERT INTO ${table} (${columns.join(', ')}) SELECT ${columns.map((column) => sqlValue(row[column])).join(', ')} WHERE NOT EXISTS (SELECT 1 FROM ${table} WHERE ${where});`,
    `UPDATE ${table} SET ${updates.map((key) => `${key} = ${sqlValue(row[key])}`).join(', ')} WHERE ${where};`,
  ].join('\n');
}

const archiveRows = [
  { archive_date: dates.empty, review_status: 'initialized', reviewer_news_notes: '', market_sentiment_blocks_json: null, sector_rotation_blocks_json: null },
  {
    archive_date: dates.mixedOlderRotation, review_status: 'reviewed', reviewer_news_notes: '基线前旧来源',
    market_sentiment_blocks_json: JSON.stringify([{ id: 'mixed-m', title: '标普500 GSPC 旧判断', children: [{ id: 'mixed-m-child', title: '支撑位', body: '6500' }] }]),
    sector_rotation_blocks_json: JSON.stringify([{ id: 'mixed-r', title: '半导体 SOXX 旧轮动', children: [{ id: 'mixed-r-child', title: '支撑位', body: '500' }] }]),
  },
  {
    archive_date: dates.mixedBaseline, review_status: 'reviewed', reviewer_news_notes: '已存新基线',
    market_sentiment_blocks_json: JSON.stringify([{ id: 'frozen-m', title: '冻结 GSPC 旧列不参与来源', children: [{ id: 'frozen-m-child', title: '支撑位', body: '1111 冻结旧值' }] }]),
    sector_rotation_blocks_json: JSON.stringify([{ id: 'frozen-r', title: '冻结 SOXX 旧列不参与来源', children: [{ id: 'frozen-r-child', title: '支撑位', body: '222 冻结旧值' }] }]),
  },
  {
    archive_date: dates.mixedNewerMarket, review_status: 'reviewed', reviewer_news_notes: '基线后仅 market 更新',
    market_sentiment_blocks_json: JSON.stringify([{ id: 'newer-m', title: '标普500 GSPC 更新判断', children: [{ id: 'newer-m-child', title: '思考', body: '更晚 market 替换基线 market，保留轮动和 MU' }] }]),
    sector_rotation_blocks_json: null,
  },
  { archive_date: dates.mixedTarget, review_status: 'initialized', reviewer_news_notes: '', market_sentiment_blocks_json: null, sector_rotation_blocks_json: null },
  { archive_date: dates.savedEmpty, review_status: 'reviewed', reviewer_news_notes: '已存明确空文档', market_sentiment_blocks_json: JSON.stringify(olderMarketNotes), sector_rotation_blocks_json: JSON.stringify(olderRotationNotes) },
  {
    archive_date: dates.explicitEmptyLevels, review_status: 'reviewed', reviewer_news_notes: '空价位权威和旧非空证据', market_sentiment_blocks_json: null,
    sector_rotation_blocks_json: JSON.stringify([{ id: 'empty-old-soxx', title: '半导体 SOXX', children: [{ id: 'empty-old-support', title: '支撑位', body: '500' }, { id: 'empty-old-resistance', title: '压力位', body: '570' }] }]),
  },
  { archive_date: dates.olderMarket, review_status: 'reviewed', reviewer_news_notes: '旧日新闻', market_sentiment_blocks_json: JSON.stringify(olderMarketNotes), sector_rotation_blocks_json: '[]' },
  { archive_date: dates.olderRotation, review_status: 'reviewed', reviewer_news_notes: '旧日新闻', market_sentiment_blocks_json: null, sector_rotation_blocks_json: JSON.stringify(olderRotationNotes) },
  { archive_date: dates.history, review_status: 'reviewed', reviewer_news_notes: '历史日新闻', market_sentiment_blocks_json: JSON.stringify(historyMarketNotes), sector_rotation_blocks_json: JSON.stringify(historyRotationNotes) },
  { archive_date: dates.emptyMiddle, review_status: 'reviewed', reviewer_news_notes: '空中间日', market_sentiment_blocks_json: '[]', sector_rotation_blocks_json: null },
  { archive_date: dates.latest, review_status: 'initialized', reviewer_news_notes: '', market_sentiment_blocks_json: null, sector_rotation_blocks_json: null },
];

function plan(archiveDate, accountId, symbol, extra = {}) {
  return {
    archive_date: archiveDate,
    account_id: accountId,
    symbol,
    action_type: '持仓观察',
    entry_plan: `${symbol} 每日记录`,
    take_profit_plan: '',
    stop_loss_plan: '',
    key_levels: extra.key_levels ?? null,
    support_levels: extra.support_levels ?? null,
    resistance_levels: extra.resistance_levels ?? null,
    current_position: extra.current_position ?? '5%-10%',
    position_amount: extra.position_amount ?? null,
    thinking: `${symbol} 账户思考`,
    sort_order: extra.sort_order ?? 0,
    market_type: '美股',
  };
}

const dailyPlans = [
  plan(dates.history, accounts.us, 'SOXX', { support_levels: '498–508', resistance_levels: '560–570', key_levels: '旧关键位 SOXX' }),
  plan(dates.history, accounts.cn, 'SOXX', { support_levels: '495', resistance_levels: '', sort_order: 0 }),
  plan(dates.history, accounts.us, 'MSFT', { support_levels: '400-410', resistance_levels: '450-460', sort_order: 1 }),
  plan(dates.latest, accounts.us, 'SOXX', { support_levels: '505-515', resistance_levels: '', key_levels: '最新关键位 SOXX' }),
  plan(dates.latest, accounts.cn, 'SOXX', { support_levels: '', resistance_levels: '575', sort_order: 0 }),
  plan(dates.latest, accounts.us, 'MU', { support_levels: '90-95', resistance_levels: '120', sort_order: 1, current_position: '10%-15%' }),
  plan(dates.explicitEmptyLevels, accounts.us, 'SOXX', { support_levels: '480', resistance_levels: '560', key_levels: '空权威日旧关键位仍保留' }),
  plan(dates.explicitEmptyLevels, accounts.us, 'MSFT', { support_levels: '400-410\n无效行\nEPS 预计 300', resistance_levels: '450-460\n450-460\n不是价位', sort_order: 1 }),
];

const livePlans = [
  { ...plan(null, accounts.us, 'SOXX', { support_levels: '505-515', resistance_levels: '', key_levels: '最新关键位 SOXX' }), archive_date: undefined },
  { ...plan(null, accounts.cn, 'SOXX', { support_levels: '', resistance_levels: '575' }), archive_date: undefined },
  { ...plan(null, accounts.us, 'MU', { support_levels: '90-95', resistance_levels: '120', sort_order: 1, current_position: '10%-15%' }), archive_date: undefined },
].map(({ archive_date, ...row }) => row);

const priceRows = [];
for (const symbol of ['GSPC', 'SOXX', 'QQQ', 'SPY', 'MU', 'GOLD', 'TNX', 'MSFT', 'XLC', 'XLK', 'IGV']) {
  for (const day of [dates.history, dates.latest]) {
    priceRows.push({ symbol, k_date: day, current_price: symbol === 'TNX' ? 4.21 : 100, change_percent: 1.2 });
  }
}
const levelRows = [
  { archive_date: dates.mixedBaseline, symbol: 'GSPC', support_levels: '6550–6600（强）\n6400', resistance_levels: '6800–6850' },
  { archive_date: dates.mixedBaseline, symbol: 'SOXX', support_levels: '520 新基线支撑', resistance_levels: '580 新基线压力' },
  { archive_date: dates.mixedBaseline, symbol: 'MU', support_levels: '90-95', resistance_levels: '120' },
  { archive_date: dates.explicitEmptyLevels, symbol: 'SOXX', support_levels: '', resistance_levels: '' },
];

export function marketReviewSeedSql() {
  const statements = [];
  for (const [index, item] of extraSymbols.entries()) {
    statements.push(upsert('tracked_symbols', {
      id: 20001 + index,
      symbol: item.symbol,
      yahoo_symbol: item.yahoo,
      display_name: item.name,
      symbol_type: item.type,
      market_type: '美股',
      aliases: JSON.stringify(item.aliases),
      is_active: item.active,
      sort_order: item.sort,
      created_at: fixtureTime,
      updated_at: fixtureTime,
    }, ['symbol']));
  }
  for (const row of archiveRows) {
    const document = savedDocuments.get(row.archive_date);
    statements.push(upsert('daily_review_archive', {
      ...row, trading_summary: '', reviewed_at: null, updated_at: fixtureTime,
      market_review_json: document ? JSON.stringify(document) : null,
    }, ['archive_date']));
    // 同源 SQL 从实际目录装配 identity，不在 JS 提前实现金融/历史模型。
    if (document) for (const [index, block] of document.blocks.entries()) {
      statements.push(`UPDATE daily_review_archive SET market_review_json = json_set(market_review_json, '$.blocks[${index}].identity.catalogId', (SELECT id FROM tracked_symbols WHERE symbol = ${sqlValue(block.symbol)}), '$.blocks[${index}].identity.displayName', (SELECT display_name FROM tracked_symbols WHERE symbol = ${sqlValue(block.symbol)})) WHERE archive_date = ${sqlValue(row.archive_date)};`);
    }
  }
  for (const [index, row] of dailyPlans.entries()) {
    statements.push(upsert('daily_review_action_plans', { id: 30001 + index, ...row, created_at: fixtureTime, updated_at: fixtureTime }, ['archive_date', 'account_id', 'symbol']));
  }
  for (const [index, row] of livePlans.entries()) {
    statements.push(upsert('account_live_action_plans', { id: 31001 + index, ...row, created_at: fixtureTime, updated_at: fixtureTime }, ['account_id', 'symbol']));
  }
  for (const [index, row] of priceRows.entries()) {
    statements.push(upsert('stock_raw', { id: 40001 + index, ...row, created_at: fixtureTime }, ['k_date', 'symbol']));
  }
  for (const row of levelRows) {
    statements.push(upsert('daily_review_symbol_levels', { ...row, created_at: fixtureTime, updated_at: fixtureTime }, ['archive_date', 'symbol']));
  }
  return statements.join('\n');
}

export function seedMarketReviewFixture(db) {
  const sql = marketReviewSeedSql();
  db.exec('SAVEPOINT market_review_fixture');
  try {
    db.exec(sql);
    db.exec('RELEASE market_review_fixture');
  } catch (error) {
    db.exec('ROLLBACK TO market_review_fixture; RELEASE market_review_fixture');
    throw error;
  }
}
