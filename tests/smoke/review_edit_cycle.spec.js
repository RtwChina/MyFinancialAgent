import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8787';
const REVIEW_DATE = '2026-03-13';
const SORT_REVIEW_DATE = '2026-03-12';
const ZERO_REVIEW_DATE = '2026-03-14';
const CARRY_SOURCE_DATE = '2026-03-09';
const CARRY_TARGET_DATE = '2026-03-10';
const NOTE_BLOCK_REVIEW_DATE = '2026-03-15';

function d1(command) {
  return execFileSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'my-financial-agent', '--local', '--command', command],
    { cwd: `${process.cwd()}/cloudflare`, encoding: 'utf8' },
  );
}

function seedTrackedSymbol({ symbol, yahooSymbol = symbol, displayName, symbolType = 'stock', active = 1, sortOrder = 1000 }) {
  d1(`INSERT INTO tracked_symbols (symbol, yahoo_symbol, display_name, symbol_type, aliases, is_active, sort_order, created_at, updated_at)
      VALUES ('${symbol}', '${yahooSymbol}', '${displayName}', '${symbolType}', '["${symbol}","${displayName}"]', ${active}, ${sortOrder}, datetime('now'), datetime('now'))
      ON CONFLICT(symbol) DO UPDATE SET
        yahoo_symbol=excluded.yahoo_symbol,
        display_name=excluded.display_name,
        symbol_type=excluded.symbol_type,
        aliases=excluded.aliases,
        is_active=excluded.is_active,
        sort_order=excluded.sort_order,
      updated_at=datetime('now');`);
}

function seedPlanSymbols(symbols) {
  symbols.forEach((symbol, index) => {
    seedTrackedSymbol({ symbol, displayName: symbol, sortOrder: 5000 + index });
  });
}

async function fillStructuredNote(page, field, sectionTitle, subsectionTitle, body) {
  const editor = page.locator(`#${field}BlockEditor`);
  if (await editor.locator('.structured-note-section').count() === 0) {
    await page.locator(`[data-note-add-section="${field}"]`).click();
  }
  await editor.locator('.structured-note-section').first().locator('.structured-note-section-head input').fill(sectionTitle);
  await editor.locator('.structured-note-subsection').first().locator('.structured-note-subsection-head input').fill(subsectionTitle);
  await editor.locator('.structured-note-subsection').first().locator('textarea').fill(body);
}

test('review can be completed, reopened, edited, and saved again', async ({ page, request }) => {
  await request.post(`${BASE_URL}/api/reviews/${REVIEW_DATE}/initialize`);

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  const row = page.locator('#reviewsList tr', { hasText: REVIEW_DATE }).first();
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: /开始复盘|继续复盘|进入复盘|查看/ }).click();

  await expect(page.locator('#reviewDrawer')).toBeVisible();
  if (await page.locator('#initializeBtn').filter({ hasText: '编辑' }).isVisible()) {
    await page.locator('#initializeBtn').click();
    await expect(page.locator('textarea[name="reviewerNewsNotes"]')).toHaveJSProperty('readOnly', false);
  }
  await page.locator('textarea[name="reviewerNewsNotes"]').fill('本地冒烟：先完成一轮复盘。');
  await page.getByRole('button', { name: '下一步' }).click();
  await fillStructuredNote(page, 'marketSentiment', '标普500', '流动性', '本地冒烟：大盘变量已记录。');
  await page.getByRole('button', { name: '下一步' }).click();
  await fillStructuredNote(page, 'sectorRotation', '黄金', '利率影响', '本地冒烟：板块轮动已记录。');
  await page.getByRole('button', { name: '下一步' }).click();
  if (await page.locator('#emptyActionPlanStateUs').isVisible()) {
    await page.locator('#addActionPlanUsBtn').click();
  } else {
    await page.locator('#actionPlanRowsUs tr').first().click();
  }
  await expect(page.locator('#actionPlanDetailModal')).toBeVisible();
  await page.locator('#actionPlanSymbolSelect').selectOption('MU');
  await page.locator('#actionPlanActionSelect').selectOption('持仓观察');
  await page.locator('#actionPlanPositionSelect').selectOption('0-5%');
  await page.locator('#actionPlanEntryInput').fill('本地冒烟：回踩支撑区再观察。');
  await page.locator('#actionPlanTakeProfitInput').fill('本地冒烟：突破压力位后分批止盈。');
  await page.locator('#actionPlanStopLossInput').fill('本地冒烟：跌破支撑位降低仓位。');
  await page.locator('#actionPlanSupportLevelsInput').fill('82-88（中）');
  await page.locator('#actionPlanResistanceLevelsInput').fill('95-102（中）');
  await page.locator('#actionPlanThinkingInput').fill('本地冒烟：结构化计划保存验证。');
  await page.locator('#saveActionPlanDetailBtn').click();
  await expect(page.locator('#actionPlanDetailModal')).toBeHidden();
  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByRole('button', { name: '完成复盘' }).click();

  await expect(page.locator('#reviewDrawer')).toBeHidden();
  const bootstrap = await request.get(`${BASE_URL}/api/reviews/${REVIEW_DATE}/bootstrap`);
  const bootstrapJson = await bootstrap.json();
  expect(bootstrapJson.structuredNotes.marketSentiment.blocks).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        title: '标普500',
        children: expect.arrayContaining([
          expect.objectContaining({ title: '流动性', body: '本地冒烟：大盘变量已记录。' }),
        ]),
      }),
    ]),
  );
  expect(bootstrapJson.structuredNotes.sectorRotation.blocks).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        title: '黄金',
        children: expect.arrayContaining([
          expect.objectContaining({ title: '利率影响', body: '本地冒烟：板块轮动已记录。' }),
        ]),
      }),
    ]),
  );
  expect(bootstrapJson.draft.market_sentiment).toContain('# 标普500');
  expect(bootstrapJson.draft.sector_rotation).toContain('## 利率影响');
  expect(bootstrapJson.actionPlans).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        symbol: 'MU',
        actionType: '持仓观察',
        currentPosition: '0-5%',
        supportLevels: '82-88（中）',
        resistanceLevels: '95-102（中）',
      }),
    ]),
  );

  await page.locator('#filtersForm select[name="status"]').selectOption('reviewed');
  await page.locator('#filtersForm').getByRole('button', { name: '查询' }).click();
  const reviewedRow = page.locator('#reviewsList tr', { hasText: REVIEW_DATE }).first();
  await expect(reviewedRow).toBeVisible();
  await reviewedRow.getByRole('button', { name: /查看|继续复盘|开始复盘/ }).click();

  await expect(page.locator('#reviewStatusBadge')).toContainText('已复盘');
  await expect(page.locator('#initializeBtn')).toHaveText('编辑');
  await expect(page.locator('textarea[name="reviewerNewsNotes"]')).toHaveJSProperty('readOnly', true);

  await page.locator('#initializeBtn').click();
  await expect(page.locator('#initializeBtn')).toHaveText('退出编辑');
  await expect(page.locator('textarea[name="reviewerNewsNotes"]')).toHaveJSProperty('readOnly', false);
  await page.locator('textarea[name="reviewerNewsNotes"]').fill('本地冒烟：已复盘后再次编辑并保存。');
  await page.locator('#saveDraftBtn').click();

  await expect(page.locator('#initializeBtn')).toHaveText('编辑');
  await expect(page.locator('textarea[name="reviewerNewsNotes"]')).toHaveJSProperty('readOnly', true);
  await expect(page.locator('textarea[name="reviewerNewsNotes"]')).toHaveValue('本地冒烟：已复盘后再次编辑并保存。');
});

test('market and rotation structured note blocks can be added, reordered, deleted, saved, and reopened', async ({ page, request }) => {
  await request.post(`${BASE_URL}/api/reviews/${NOTE_BLOCK_REVIEW_DATE}/initialize`);

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  const row = page.locator('#reviewsList tr', { hasText: NOTE_BLOCK_REVIEW_DATE }).first();
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: /开始复盘|继续复盘|进入复盘|查看/ }).click();

  await page.locator('textarea[name="reviewerNewsNotes"]').fill('结构化块冒烟：新闻总结。');
  await page.getByRole('button', { name: '下一步' }).click();

  await fillStructuredNote(page, 'marketSentiment', '黄金', '战争影响', '避险需求升温。');
  await page.locator('[data-note-add-section="marketSentiment"]').click();
  const marketEditor = page.locator('#marketSentimentBlockEditor');
  await marketEditor.locator('.structured-note-section').nth(1).locator('.structured-note-section-head input').fill('标普500');
  await marketEditor.locator('.structured-note-section').nth(1).locator('.structured-note-subsection-head input').fill('流动性');
  await marketEditor.locator('.structured-note-section').nth(1).locator('textarea').fill('流动性边际改善。');
  await marketEditor.locator('.structured-note-section').nth(1).locator('.structured-note-section-head .structured-note-tools button').filter({ hasText: '↑' }).click();
  await marketEditor.locator('.structured-note-section').nth(1).getByRole('button', { name: '+ 二级' }).click();
  await marketEditor.locator('.structured-note-section').nth(1).locator('.structured-note-subsection').nth(1).locator('.structured-note-subsection-head input').fill('待删除维度');
  page.once('dialog', async (dialog) => dialog.accept());
  await marketEditor.locator('.structured-note-section').nth(1).locator('.structured-note-subsection').nth(1).locator('.structured-note-subsection-head .structured-note-tools button').filter({ hasText: '删除' }).click();

  await page.getByRole('button', { name: '下一步' }).click();
  await fillStructuredNote(page, 'sectorRotation', '半导体', '风险', '估值压力仍在。');
  await page.locator('#saveDraftBtn').click();

  const bootstrap = await (await request.get(`${BASE_URL}/api/reviews/${NOTE_BLOCK_REVIEW_DATE}/bootstrap`)).json();
  expect(bootstrap.structuredNotes.marketSentiment.blocks[0].title).toBe('标普500');
  expect(bootstrap.structuredNotes.marketSentiment.blocks[1].title).toBe('黄金');
  expect(bootstrap.structuredNotes.marketSentiment.blocks[1].children).toHaveLength(1);
  expect(bootstrap.structuredNotes.sectorRotation.blocks[0].children[0]).toEqual(
    expect.objectContaining({ title: '风险', body: '估值压力仍在。' }),
  );

  await page.reload({ waitUntil: 'networkidle' });
  const reopenedRow = page.locator('#reviewsList tr', { hasText: NOTE_BLOCK_REVIEW_DATE }).first();
  await reopenedRow.getByRole('button', { name: /开始复盘|继续复盘|进入复盘|查看/ }).click();
  await page.getByText('2. 大盘盘点', { exact: true }).click();
  await expect(page.locator('#marketSentimentBlockEditor .structured-note-section').first().locator('.structured-note-section-head input')).toHaveValue('标普500');
});

test('action plans can be auto sorted by current position descending', async ({ page, request }) => {
  seedPlanSymbols(['LOW', 'HIGH', 'MID', 'SMALL']);
  await request.post(`${BASE_URL}/api/reviews/${SORT_REVIEW_DATE}`, {
    data: {
      reviewStatus: 'draft',
      reviewerNewsNotes: '自动排序冒烟：新闻总结。',
      marketSentiment: '自动排序冒烟：大盘盘点。',
      sectorRotation: '自动排序冒烟：板块轮动。',
      tradingSummary: '',
      actionPlans: [
        { symbol: 'LOW', actionType: '持仓观察', currentPosition: '0-5%' },
        { symbol: 'HIGH', actionType: '持仓观察', currentPosition: '>30%' },
        { symbol: 'MID', actionType: '持仓观察', currentPosition: '20%-25%' },
        { symbol: 'SMALL', actionType: '持仓观察', currentPosition: '10%-15%' },
      ],
    },
  });

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  const row = page.locator('#reviewsList tr', { hasText: SORT_REVIEW_DATE }).first();
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: /开始复盘|继续复盘|进入复盘|查看/ }).click();

  await expect(page.locator('#reviewDrawer')).toBeVisible();
  await page.getByText('4. 操作计划', { exact: true }).click();
  if (await page.locator('#initializeBtn').filter({ hasText: '编辑' }).isVisible()) {
    await page.locator('#initializeBtn').click();
  }
  await expect(page.locator('#sortActionPlansUsBtn')).toBeVisible();
  await page.locator('#sortActionPlansUsBtn').click();

  await expect(page.locator('#actionPlanRowsUs tr .action-plan-symbol')).toHaveText(['HIGH', 'MID', 'SMALL', 'LOW']);
  await page.locator('#saveDraftBtn').click();

  const bootstrap = await request.get(`${BASE_URL}/api/reviews/${SORT_REVIEW_DATE}/bootstrap`);
  const bootstrapJson = await bootstrap.json();
  expect(bootstrapJson.actionPlans.map((plan) => `${plan.symbol}:${plan.currentPosition}:${plan.sortOrder}`)).toEqual([
    'HIGH:>30%:0',
    'MID:20%-25%:1',
    'SMALL:10%-15%:2',
    'LOW:0-5%:3',
  ]);
});

test('opening and closed action plans default current position to zero', async ({ page, request }) => {
  seedPlanSymbols(['BASE']);
  await request.post(`${BASE_URL}/api/reviews/${ZERO_REVIEW_DATE}`, {
    data: {
      reviewStatus: 'draft',
      reviewerNewsNotes: '零仓位冒烟：新闻总结。',
      marketSentiment: '零仓位冒烟：大盘盘点。',
      sectorRotation: '零仓位冒烟：板块轮动。',
      tradingSummary: '',
      actionPlans: [
        { symbol: 'BASE', actionType: '持仓观察', currentPosition: '0-5%' },
      ],
    },
  });

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  const row = page.locator('#reviewsList tr', { hasText: ZERO_REVIEW_DATE }).first();
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: /开始复盘|继续复盘|进入复盘|查看/ }).click();

  await expect(page.locator('#reviewDrawer')).toBeVisible();
  await page.getByText('4. 操作计划', { exact: true }).click();
  if (await page.locator('#initializeBtn').filter({ hasText: '编辑' }).isVisible()) {
    await page.locator('#initializeBtn').click();
  }

  await page.locator('#addActionPlanUsBtn').click();
  await expect(page.locator('#actionPlanDetailModal')).toBeVisible();
  await expect(page.locator('#actionPlanPositionSelect')).toHaveValue('0%');
  await page.locator('#actionPlanPositionSelect').selectOption('10%-15%');
  await page.locator('#actionPlanActionSelect').selectOption('已清仓复盘');
  await expect(page.locator('#actionPlanPositionSelect')).toHaveValue('0%');
  await page.locator('#saveActionPlanDetailBtn').click();
  await expect(page.locator('#actionPlanDetailModal')).toBeHidden();

  await page.locator('#saveDraftBtn').click();
  const bootstrap = await request.get(`${BASE_URL}/api/reviews/${ZERO_REVIEW_DATE}/bootstrap`);
  const bootstrapJson = await bootstrap.json();
  expect(bootstrapJson.actionPlans.at(-1)).toEqual(expect.objectContaining({
    actionType: '已清仓复盘',
    currentPosition: '0%',
  }));
});

test('new review carries forward previous structured action plans without legacy asset text', async ({ request }) => {
  seedPlanSymbols(['CARRY']);
  await request.post(`${BASE_URL}/api/reviews/${CARRY_SOURCE_DATE}`, {
    data: {
      reviewStatus: 'reviewed',
      reviewerNewsNotes: '结构化沿用冒烟：新闻总结。',
      marketSentiment: '结构化沿用冒烟：大盘盘点。',
      sectorRotation: '结构化沿用冒烟：板块轮动。',
      tradingSummary: '',
      actionPlans: [
        {
          symbol: 'CARRY',
          actionType: '持仓观察',
          currentPosition: '20%-25%',
          entryPlan: '上一天结构化开仓计划。',
          takeProfitPlan: '上一天结构化止盈计划。',
          stopLossPlan: '上一天结构化止损计划。',
          supportLevels: '10-12（强）',
          resistanceLevels: '18-20（中）',
          thinking: '上一天结构化思考。',
        },
      ],
    },
  });
  await request.post(`${BASE_URL}/api/reviews/${CARRY_TARGET_DATE}/initialize`);

  const bootstrap = await request.get(`${BASE_URL}/api/reviews/${CARRY_TARGET_DATE}/bootstrap`);
  const bootstrapJson = await bootstrap.json();
  expect(bootstrapJson.actionPlans).toEqual([
    expect.objectContaining({
      symbol: 'CARRY',
      actionType: '持仓观察',
      currentPosition: '20%-25%',
      supportLevels: '10-12（强）',
      resistanceLevels: '18-20（中）',
    }),
  ]);
  expect(bootstrapJson.draft).not.toHaveProperty('asset_plan');
  expect(bootstrapJson.carryForward).not.toHaveProperty('asset_plan');
});

test('daily record button inserts the review date into the entry plan field', async ({ page, request }) => {
  const dailyRecordDate = '2026-05-08';
  seedPlanSymbols(['DATEBTN']);
  await request.post(`${BASE_URL}/api/reviews/${dailyRecordDate}`, {
    data: {
      reviewStatus: 'draft',
      reviewerNewsNotes: '每日记录冒烟：新闻总结。',
      marketSentiment: '每日记录冒烟：大盘盘点。',
      sectorRotation: '每日记录冒烟：板块轮动。',
      tradingSummary: '',
      actionPlans: [
        { symbol: 'DATEBTN', actionType: '持仓观察', currentPosition: '0-5%' },
      ],
    },
  });

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  const row = page.locator('#reviewsList tr', { hasText: dailyRecordDate }).first();
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: /开始复盘|继续复盘|进入复盘|查看/ }).click();

  await expect(page.locator('#reviewDrawer')).toBeVisible();
  await page.getByText('4. 操作计划', { exact: true }).click();
  await page.locator('#actionPlanRowsUs tr', { hasText: 'DATEBTN' }).click();
  await expect(page.locator('#actionPlanDetailModal')).toBeVisible();
  await expect(page.locator('#actionPlanEditor').getByText('每日记录', { exact: true })).toBeVisible();
  await page.locator('#actionPlanEntryInput').fill('4 月 17 日：加仓');
  await page.locator('#appendDailyRecordDateBtn').click();
  await expect(page.locator('#actionPlanEntryInput')).toHaveValue('4 月 17 日：加仓\n5 月 8 日：');
  await page.locator('#saveActionPlanDetailBtn').click();
  await expect(page.locator('#actionPlanDetailModal')).toBeHidden();

  await page.locator('#saveDraftBtn').click();
  const bootstrap = await request.get(`${BASE_URL}/api/reviews/${dailyRecordDate}/bootstrap`);
  const bootstrapJson = await bootstrap.json();
  expect(bootstrapJson.actionPlans[0]).toEqual(expect.objectContaining({
    symbol: 'DATEBTN',
    entryPlan: '4 月 17 日：加仓\n5 月 8 日：',
  }));
});

test('action plan details open in a modal instead of inline under the table', async ({ page, request }) => {
  const detailModalDate = '2026-05-09';
  seedPlanSymbols(['MODAL']);
  await request.post(`${BASE_URL}/api/reviews/${detailModalDate}`, {
    data: {
      reviewStatus: 'draft',
      reviewerNewsNotes: '详情弹窗冒烟：新闻总结。',
      marketSentiment: '详情弹窗冒烟：大盘盘点。',
      sectorRotation: '详情弹窗冒烟：板块轮动。',
      tradingSummary: '',
      actionPlans: [
        { symbol: 'MODAL', actionType: '持仓观察', currentPosition: '0-5%', marketType: '美股' },
      ],
    },
  });

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  const row = page.locator('#reviewsList tr', { hasText: detailModalDate }).first();
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: /开始复盘|继续复盘|进入复盘|查看/ }).click();

  await expect(page.locator('#reviewDrawer')).toBeVisible();
  await page.getByText('4. 操作计划', { exact: true }).click();
  await expect(page.locator('#actionPlanDetailModal')).toBeHidden();
  await expect(page.locator('#actionPlanEditor')).toBeHidden();

  await page.locator('#actionPlanRowsUs tr', { hasText: 'MODAL' }).click();
  await expect(page.locator('#actionPlanDetailModal')).toBeVisible();
  await expect(page.locator('#actionPlanEditor')).toBeVisible();
  await expect(page.locator('#actionPlanDetailTitle')).toContainText('MODAL');

  await page.locator('#actionPlanEntryInput').fill('5 月 9 日：弹窗编辑。');
  await page.locator('#saveActionPlanDetailBtn').click();
  await expect(page.locator('#actionPlanDetailModal')).toBeHidden();

  await page.locator('#saveDraftBtn').click();
  const bootstrap = await request.get(`${BASE_URL}/api/reviews/${detailModalDate}/bootstrap`);
  const bootstrapJson = await bootstrap.json();
  expect(bootstrapJson.actionPlans[0]).toEqual(expect.objectContaining({
    symbol: 'MODAL',
    entryPlan: '5 月 9 日：弹窗编辑。',
  }));
});

test('action plans choose managed symbols and persist system codes', async ({ page, request }) => {
  const managedDate = '2026-02-14';
  seedTrackedSymbol({ symbol: 'MSFT', displayName: '微软', sortOrder: 10 });
  seedTrackedSymbol({ symbol: '159206.SZ', displayName: '卫星ETF', sortOrder: 11 });
  seedTrackedSymbol({ symbol: 'HIDDENX', displayName: '隐藏测试', active: 0, sortOrder: 12 });
  d1(`DELETE FROM daily_review_action_plans WHERE archive_date='${managedDate}';
      DELETE FROM daily_review_archive WHERE archive_date='${managedDate}';`);

  await request.post(`${BASE_URL}/api/reviews/${managedDate}`, {
    data: {
      reviewStatus: 'draft',
      reviewerNewsNotes: '管理标的冒烟：新闻总结。',
      marketSentiment: '管理标的冒烟：大盘盘点。',
      sectorRotation: '管理标的冒烟：板块轮动。',
      tradingSummary: '',
      actionPlans: [],
    },
  });

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  const row = page.locator('#reviewsList tr', { hasText: managedDate }).first();
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: /开始复盘|继续复盘|进入复盘|查看/ }).click();
  await expect(page.locator('#reviewDrawer')).toBeVisible();
  await page.getByText('4. 操作计划', { exact: true }).click();

  await page.locator('#addActionPlanUsBtn').click();
  await expect(page.locator('#actionPlanDetailModal')).toBeVisible();
  await expect(page.locator('#actionPlanSymbolSelect')).toBeVisible();
  await expect(page.locator('#actionPlanSymbolSelect option', { hasText: '隐藏测试' })).toHaveCount(0);
  await page.locator('#actionPlanSymbolSelect').selectOption('MSFT');
  await expect(page.locator('#actionPlanDetailTitle')).toHaveText('MSFT');
  await page.locator('#saveActionPlanDetailBtn').click();

  await page.locator('#addActionPlanCnBtn').click();
  await expect(page.locator('#actionPlanDetailModal')).toBeVisible();
  await page.locator('#actionPlanSymbolSelect').selectOption('159206.SZ');
  await expect(page.locator('#actionPlanMarketTypeSelect')).toHaveValue('大A');
  await page.locator('#saveActionPlanDetailBtn').click();

  await page.locator('#saveDraftBtn').click();
  const bootstrap = await request.get(`${BASE_URL}/api/reviews/${managedDate}/bootstrap`);
  const bootstrapJson = await bootstrap.json();
  expect(bootstrapJson.actionPlans).toEqual(expect.arrayContaining([
    expect.objectContaining({ symbol: 'MSFT', marketType: '美股' }),
    expect.objectContaining({ symbol: '159206.SZ', marketType: '大A' }),
  ]));
});

test('action plan save rejects symbols outside symbol management', async ({ request }) => {
  const unmanagedDate = '2026-02-15';
  d1(`DELETE FROM tracked_symbols WHERE symbol='FAKE123';
      DELETE FROM daily_review_action_plans WHERE archive_date='${unmanagedDate}';
      DELETE FROM daily_review_archive WHERE archive_date='${unmanagedDate}';`);

  const response = await request.post(`${BASE_URL}/api/reviews/${unmanagedDate}`, {
    data: {
      reviewStatus: 'draft',
      reviewerNewsNotes: '非管理标的冒烟：新闻总结。',
      marketSentiment: '非管理标的冒烟：大盘盘点。',
      sectorRotation: '非管理标的冒烟：板块轮动。',
      tradingSummary: '',
      actionPlans: [
        { symbol: 'FAKE123', actionType: '持仓观察', currentPosition: '0-5%', marketType: '美股' },
      ],
    },
  });

  expect(response.ok()).toBeFalsy();
  const output = d1(`SELECT COUNT(*) AS cnt FROM daily_review_action_plans WHERE archive_date='${unmanagedDate}' AND symbol='FAKE123';`);
  expect(output).toContain('"cnt": 0');
});

test('action plan detail modal shows price metrics and missing fallbacks', async ({ page, request }) => {
  const metricsDate = '2026-02-16';
  seedTrackedSymbol({ symbol: 'MSFT', displayName: '微软', sortOrder: 10 });
  seedTrackedSymbol({ symbol: 'NEWPX', displayName: '新标的无价格', sortOrder: 11 });
  d1(`DELETE FROM stock_raw WHERE symbol IN ('MSFT','NEWPX');
      DELETE FROM daily_review_action_plans WHERE archive_date='${metricsDate}';
      DELETE FROM daily_review_archive WHERE archive_date='${metricsDate}';
      INSERT INTO stock_raw (k_date, stock_name, symbol, yahoo_symbol, current_price, change_percent, volume, captured_at)
        VALUES ('2026-02-16', '微软', 'MSFT', 'MSFT', 110, 2.5, 100, datetime('now'));
      INSERT INTO stock_raw (k_date, stock_name, symbol, yahoo_symbol, current_price, change_percent, volume, captured_at)
        VALUES ('2026-02-09', '微软', 'MSFT', 'MSFT', 100, 1.0, 100, datetime('now'));
      INSERT INTO stock_raw (k_date, stock_name, symbol, yahoo_symbol, current_price, change_percent, volume, captured_at)
        VALUES ('2026-01-16', '微软', 'MSFT', 'MSFT', 80, -1.0, 100, datetime('now'));`);

  await request.post(`${BASE_URL}/api/reviews/${metricsDate}`, {
    data: {
      reviewStatus: 'draft',
      reviewerNewsNotes: '价格指标冒烟：新闻总结。',
      marketSentiment: '价格指标冒烟：大盘盘点。',
      sectorRotation: '价格指标冒烟：板块轮动。',
      tradingSummary: '',
      actionPlans: [
        { symbol: 'MSFT', actionType: '持仓观察', currentPosition: '0-5%', marketType: '美股' },
        { symbol: 'NEWPX', actionType: '准备开仓', currentPosition: '0%', marketType: '美股' },
      ],
    },
  });

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  const row = page.locator('#reviewsList tr', { hasText: metricsDate }).first();
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: /开始复盘|继续复盘|进入复盘|查看/ }).click();
  await expect(page.locator('#reviewDrawer')).toBeVisible();
  await page.getByText('4. 操作计划', { exact: true }).click();

  await page.locator('#actionPlanRowsUs tr', { hasText: 'MSFT' }).click();
  await expect(page.locator('#actionPlanMetrics')).toBeVisible();
  await expect(page.locator('[data-metric="latest-price"]')).toContainText('110.00');
  await expect(page.locator('[data-metric="day-change"]')).toContainText('+2.50%');
  await expect(page.locator('[data-metric="week-change"]')).toContainText('+10.00%');
  await expect(page.locator('[data-metric="month-change"]')).toContainText('+37.50%');
  await page.locator('#cancelActionPlanDetailBtn').click();

  await page.locator('#actionPlanRowsUs tr', { hasText: 'NEWPX' }).click();
  await expect(page.locator('#actionPlanMetrics')).toBeVisible();
  await expect(page.locator('#actionPlanMetrics')).toContainText('暂无');
  await page.locator('#actionPlanEntryInput').fill('价格缺失也可以编辑。');
  await page.locator('#saveActionPlanDetailBtn').click();
  await page.locator('#saveDraftBtn').click();

  const bootstrap = await request.get(`${BASE_URL}/api/reviews/${metricsDate}/bootstrap`);
  const bootstrapJson = await bootstrap.json();
  expect(bootstrapJson.actionPlans).toEqual(expect.arrayContaining([
    expect.objectContaining({ symbol: 'NEWPX', entryPlan: '价格缺失也可以编辑。' }),
  ]));
});

test('review price snapshot only includes active managed symbols', async ({ request }) => {
  const snapshotDate = '2026-02-18';
  seedTrackedSymbol({ symbol: 'SNAPOK', displayName: '显示快照', symbolType: 'index', active: 1, sortOrder: 9200 });
  seedTrackedSymbol({ symbol: 'SNAPHIDE', displayName: '隐藏快照', symbolType: 'index', active: 0, sortOrder: 9201 });
  d1(`DELETE FROM stock_raw WHERE symbol IN ('SNAPOK','SNAPHIDE','SNAPORPHAN');
      DELETE FROM daily_review_archive WHERE archive_date='${snapshotDate}';
      INSERT INTO stock_raw (k_date, stock_name, symbol, yahoo_symbol, current_price, change_percent, volume, captured_at)
        VALUES ('${snapshotDate}', '显示快照', 'SNAPOK', 'SNAPOK', 10, 1.2, 100, datetime('now'));
      INSERT INTO stock_raw (k_date, stock_name, symbol, yahoo_symbol, current_price, change_percent, volume, captured_at)
        VALUES ('${snapshotDate}', '隐藏快照', 'SNAPHIDE', 'SNAPHIDE', 20, 2.3, 100, datetime('now'));
      INSERT INTO stock_raw (k_date, stock_name, symbol, yahoo_symbol, current_price, change_percent, volume, captured_at)
        VALUES ('${snapshotDate}', '孤儿快照', 'SNAPORPHAN', 'SNAPORPHAN', 30, 3.4, 100, datetime('now'));`);

  const bootstrap = await request.get(`${BASE_URL}/api/reviews/${snapshotDate}/bootstrap`);
  const bootstrapJson = await bootstrap.json();
  const allSymbols = Object.values(bootstrapJson.prices)
    .flat()
    .map((item) => item.symbol);

  expect(allSymbols).toContain('SNAPOK');
  expect(allSymbols).not.toContain('SNAPHIDE');
  expect(allSymbols).not.toContain('SNAPORPHAN');
});

test('long action plan table text shows a full hover tooltip', async ({ page, request }) => {
  const tooltipDate = '2026-05-10';
  const longRecord = '5 月 10 日：这是一段很长的每日记录，用来验证鼠标悬停时可以显示完整内容，而不会把表格撑高。';
  seedPlanSymbols(['TIP']);
  await request.post(`${BASE_URL}/api/reviews/${tooltipDate}`, {
    data: {
      reviewStatus: 'draft',
      reviewerNewsNotes: 'tooltip 冒烟：新闻总结。',
      marketSentiment: 'tooltip 冒烟：大盘盘点。',
      sectorRotation: 'tooltip 冒烟：板块轮动。',
      tradingSummary: '',
      actionPlans: [
        {
          symbol: 'TIP',
          actionType: '持仓观察',
          currentPosition: '0-5%',
          marketType: '美股',
          entryPlan: longRecord,
        },
      ],
    },
  });

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  const row = page.locator('#reviewsList tr', { hasText: tooltipDate }).first();
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: /开始复盘|继续复盘|进入复盘|查看/ }).click();

  await expect(page.locator('#reviewDrawer')).toBeVisible();
  await page.getByText('4. 操作计划', { exact: true }).click();
  const tooltipCell = page.locator('#actionPlanRowsUs tr', { hasText: 'TIP' }).locator('[data-full-text]').first();
  await expect(tooltipCell).toHaveAttribute('data-full-text', longRecord);
  await tooltipCell.hover();
  await expect(page.locator('#actionPlanCellTooltip')).toBeVisible();
  await expect(page.locator('#actionPlanCellTooltip')).toHaveText(longRecord);
});

test('action plan list combines symbol and action into one colored status column', async ({ page, request }) => {
  const statusDate = '2026-05-11';
  seedPlanSymbols(['HOLD', 'OPEN', 'DONE']);
  await request.post(`${BASE_URL}/api/reviews/${statusDate}`, {
    data: {
      reviewStatus: 'draft',
      reviewerNewsNotes: '状态列冒烟：新闻总结。',
      marketSentiment: '状态列冒烟：大盘盘点。',
      sectorRotation: '状态列冒烟：板块轮动。',
      tradingSummary: '',
      actionPlans: [
        { symbol: 'HOLD', actionType: '持仓观察', currentPosition: '15%-20%', marketType: '美股' },
        { symbol: 'OPEN', actionType: '准备开仓', currentPosition: '0%', marketType: '美股' },
        { symbol: 'DONE', actionType: '已清仓复盘', currentPosition: '0%', marketType: '美股' },
      ],
    },
  });

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  const row = page.locator('#reviewsList tr', { hasText: statusDate }).first();
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: /开始复盘|继续复盘|进入复盘|查看/ }).click();

  await expect(page.locator('#reviewDrawer')).toBeVisible();
  await page.getByText('4. 操作计划', { exact: true }).click();
  await expect(page.locator('#actionPlanRowsUs tr', { hasText: 'HOLD' }).locator('.action-plan-target-cell')).toContainText('持仓观察');
  await expect(page.locator('#actionPlanRowsUs tr', { hasText: 'OPEN' }).locator('.action-plan-status-pill')).toHaveClass(/status-open/);
  await expect(page.locator('#actionPlanRowsUs tr', { hasText: 'DONE' }).locator('.action-plan-status-pill')).toHaveClass(/status-closed/);
  const holdSymbolBox = await page.locator('#actionPlanRowsUs tr', { hasText: 'HOLD' }).locator('.action-plan-symbol').boundingBox();
  const holdStatusBox = await page.locator('#actionPlanRowsUs tr', { hasText: 'HOLD' }).locator('.action-plan-status-pill').boundingBox();
  expect(holdStatusBox.y).toBeGreaterThan(holdSymbolBox.y + holdSymbolBox.height - 1);
  await expect(page.locator('#actionPlanRowsUs tr', { hasText: 'HOLD' }).locator('.action-plan-target-stack')).toBeVisible();
  const targetCellDisplay = await page.locator('#actionPlanRowsUs tr', { hasText: 'HOLD' }).locator('.action-plan-target-cell')
    .evaluate((cell) => window.getComputedStyle(cell).display);
  expect(targetCellDisplay).toBe('table-cell');
  await expect(page.locator('.action-plan-table th').filter({ hasText: /^动作$/ })).toHaveCount(0);
  await expect(page.locator('.action-plan-table th').filter({ hasText: '标的 / 动作' })).toHaveCount(2);
});

test('review section titles are emphasized in red', async ({ page, request }) => {
  const titleStyleDate = '2026-05-13';
  seedPlanSymbols(['STYLE']);
  await request.post(`${BASE_URL}/api/reviews/${titleStyleDate}`, {
    data: {
      reviewStatus: 'draft',
      reviewerNewsNotes: '标题样式冒烟：新闻总结。',
      marketSentiment: '标题样式冒烟：大盘盘点。',
      sectorRotation: '标题样式冒烟：板块轮动。',
      tradingSummary: '标题样式冒烟：深度总结。',
      actionPlans: [
        { symbol: 'STYLE', actionType: '持仓观察', currentPosition: '0-5%', marketType: '美股' },
      ],
    },
  });

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  const row = page.locator('#reviewsList tr', { hasText: titleStyleDate }).first();
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: /开始复盘|继续复盘|进入复盘|查看/ }).click();

  await expect(page.locator('#reviewDrawer')).toBeVisible();
  await expect(page.locator('.snapshot-head h3', { hasText: '新闻总结与点评' })).not.toHaveClass(/review-section-title/);
  await expect(page.locator('.review-section-title')).toHaveCount(5);
  const titleStyles = await page.locator('.review-section-title').evaluateAll((items) =>
    items.map((item) => {
      const style = window.getComputedStyle(item);
      return {
        color: style.color,
        fontSize: Number.parseFloat(style.fontSize),
        fontWeight: Number.parseInt(style.fontWeight, 10),
      };
    }),
  );
  expect(titleStyles.every((style) => style.color === 'rgb(180, 35, 24)')).toBe(true);
  expect(titleStyles.every((style) => style.fontSize >= 16)).toBe(true);
  expect(titleStyles.every((style) => style.fontWeight >= 800)).toBe(true);
});
