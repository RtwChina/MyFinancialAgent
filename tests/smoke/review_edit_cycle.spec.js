import { test, expect } from '@playwright/test';
import { queryLocalSql } from '../helpers/market-review-local.mjs';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8787';
const REVIEW_DATE = '2026-03-13';
const SORT_REVIEW_DATE = '2026-03-12';
const ZERO_REVIEW_DATE = '2026-03-14';
const CARRY_SOURCE_DATE = '2026-03-09';
const CARRY_TARGET_DATE = '2026-03-10';
const CARRY_NOTES_SOURCE_DATE = '2026-03-16';
const CARRY_NOTES_TARGET_DATE = '2026-03-17';
const NOTE_BLOCK_REVIEW_DATE = '2026-03-15';

// The save endpoint trusts the client's accountId (the page always sends one); seeded plans must name their account.
let US_ACCOUNT_ID;
test.beforeAll(async () => {
  const accounts = await (await fetch(`${BASE_URL}/api/investment-accounts`)).json();
  US_ACCOUNT_ID = accounts.items.find((item) => item.name === '老虎-美股').id;
});

// Same isolated local test D1 the 8787 Worker reads; rows keep wrangler's pretty JSON for text assertions.
function d1(command) {
  return JSON.stringify(queryLocalSql(command), null, 2);
}

// Existing rows (e.g. migration-seeded MSFT) are shared with other suites; only toggle availability.
function seedTrackedSymbol({ symbol, yahooSymbol = symbol, displayName, symbolType = 'stock', marketType = '美股', active = 1, sortOrder = 1000 }) {
  d1(`INSERT INTO tracked_symbols (symbol, yahoo_symbol, display_name, symbol_type, market_type, aliases, is_active, sort_order, created_at, updated_at)
      VALUES ('${symbol}', '${yahooSymbol}', '${displayName}', '${symbolType}', '${marketType}', '["${symbol}","${displayName}"]', ${active}, ${sortOrder}, datetime('now'), datetime('now'))
      ON CONFLICT(symbol) DO UPDATE SET is_active=excluded.is_active;`);
}

function seedPlanSymbols(symbols) {
  symbols.forEach((symbol, index) => {
    seedTrackedSymbol({ symbol, displayName: symbol, sortOrder: 5000 + index });
  });
}

// The shared test DB holds many newer fixture days, so locate a day by filtering rather than by list position.
async function showReviewDate(page, date) {
  await page.locator('#filtersForm input[name="from"]').fill(date);
  await page.locator('#filtersForm input[name="to"]').fill(date);
  await page.locator('#filtersForm').getByRole('button', { name: '查询' }).click();
  await expect(page.locator('#reviewsList tr', { hasText: date }).first()).toBeVisible();
}

// A draft needs one market theme for the plan step to unlock, exactly as in the browser.
function marketReviewDraft(thinking) {
  return { blocks: [{ id: 'draft-gspc', type: 'symbol', symbol: 'GSPC', children: [
    { id: 'draft-gspc-thinking', kind: 'thinking', title: '思考', body: thinking },
  ] }], levels: [] };
}

async function openMarketDetail(page, symbol) {
  await page.locator('#addMarketBlockBtn').click();
  await page.locator('#marketSymbolSearchInput').fill(symbol);
  await page.locator(`#marketSymbolResultList [data-market-symbol="${symbol}"]`).click();
  await expect(page.locator('#marketReviewDetail')).toBeVisible();
  await expect(page.locator('#marketDetailTitle')).toContainText(symbol);
}

async function addMarketTheme(page, symbol, thinking) {
  await openMarketDetail(page, symbol);
  await page.locator('#marketDetailFields [data-market-kind="thinking"]').fill(thinking);
  await page.locator('#closeMarketDetailBtn').click();
  await expect(page.locator('#marketReviewDetail')).toBeHidden();
}

function marketThinking(review, symbol) {
  return review.blocks.find((block) => block.symbol === symbol)?.children.find((child) => child.kind === 'thinking')?.body;
}

async function selectActionPlanSymbol(page, query, symbol = query) {
  await page.locator('#actionPlanSymbolPickerTrigger').click();
  await page.locator('#actionPlanSymbolSearchInput').fill(query);
  const row = page.locator('#actionPlanSymbolResultList [data-symbol-picker-value]', { hasText: symbol }).first();
  await expect(row).toBeVisible();
  await row.click();
  await expect(page.locator('#actionPlanSymbolInput')).toHaveValue(symbol);
}

test('review can be completed, reopened, edited, and saved again', async ({ page, request }) => {
  // Initialization copies every live plan into an empty day; start clean so adding MU is not a duplicate.
  d1(`DELETE FROM account_live_action_plans;
      DELETE FROM daily_review_symbol_levels WHERE archive_date='${REVIEW_DATE}';
      DELETE FROM daily_review_action_plans WHERE archive_date='${REVIEW_DATE}';
      DELETE FROM daily_review_archive WHERE archive_date='${REVIEW_DATE}';`);
  await request.post(`${BASE_URL}/api/reviews/${REVIEW_DATE}/initialize`);

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await showReviewDate(page, REVIEW_DATE);
  const row = page.locator('#reviewsList tr', { hasText: REVIEW_DATE }).first();
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: /开始复盘|继续复盘|进入复盘|编辑草稿|查看/ }).click();

  await expect(page.locator('#reviewDrawer')).toBeVisible();
  if (await page.locator('#initializeBtn').filter({ hasText: '编辑' }).isVisible()) {
    await page.locator('#initializeBtn').click();
    await expect(page.locator('textarea[name="reviewerNewsNotes"]')).toHaveJSProperty('readOnly', false);
  }
  await page.locator('textarea[name="reviewerNewsNotes"]').fill('本地冒烟：先完成一轮复盘。');
  await page.getByRole('button', { name: '下一步' }).click();
  await addMarketTheme(page, 'GSPC', '本地冒烟：大盘变量已记录。');
  await addMarketTheme(page, 'GOLD', '本地冒烟：板块轮动已记录。');
  await page.getByRole('button', { name: '下一步' }).click();
  if (await page.locator('#emptyActionPlanStateUs').isVisible()) {
    await page.locator('#addActionPlanUsBtn').click();
  } else {
    await page.locator('#actionPlanRowsUs tr').first().click();
  }
  await expect(page.locator('#actionPlanDetailModal')).toBeVisible();
  await selectActionPlanSymbol(page, 'MU');
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
  const savedMarket = bootstrapJson.structuredNotes.marketReview;
  expect(marketThinking(savedMarket, 'GSPC')).toBe('本地冒烟：大盘变量已记录。');
  expect(marketThinking(savedMarket, 'GOLD')).toBe('本地冒烟：板块轮动已记录。');
  expect(bootstrapJson.structuredNotes).not.toHaveProperty('marketSentiment');
  expect(bootstrapJson.structuredNotes).not.toHaveProperty('sectorRotation');
  expect(bootstrapJson.draft).not.toHaveProperty('market_sentiment');
  expect(bootstrapJson.draft).not.toHaveProperty('sector_rotation');
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
  await showReviewDate(page, REVIEW_DATE);
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

test('market themes can be added, reordered, child-deleted, saved, and reopened in the single market step', async ({ page, request }) => {
  await request.post(`${BASE_URL}/api/reviews/${NOTE_BLOCK_REVIEW_DATE}/initialize`);
  const initial = await (await request.get(`${BASE_URL}/api/reviews/${NOTE_BLOCK_REVIEW_DATE}/bootstrap`)).json();
  // Earlier days may already be inherited here; only add themes the day does not have yet.
  const inheritedSymbols = initial.structuredNotes.marketReview.blocks.map((block) => block.symbol);
  const [first, second] = ['SOXX', 'IGV', 'XLK', 'XLC', 'QQQ', 'SPY'].filter((symbol) => !inheritedSymbols.includes(symbol));

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.locator('#filtersForm input[name="from"]').fill(NOTE_BLOCK_REVIEW_DATE);
  await page.locator('#filtersForm input[name="to"]').fill(NOTE_BLOCK_REVIEW_DATE);
  await page.locator('#filtersForm').getByRole('button', { name: '查询' }).click();
  const row = page.locator('#reviewsList tr', { hasText: NOTE_BLOCK_REVIEW_DATE }).first();
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: /开始复盘|继续复盘|进入复盘|编辑草稿|查看/ }).click();

  await page.locator('textarea[name="reviewerNewsNotes"]').fill('结构化块冒烟：新闻总结。');
  await page.getByRole('button', { name: '下一步' }).click();
  await expect(page.locator('[data-step="rotation"]')).toHaveCount(0);

  await addMarketTheme(page, first, '避险需求升温。');
  await openMarketDetail(page, second);
  await page.locator('#marketDetailFields [data-market-kind="thinking"]').fill('流动性边际改善。');
  const resistanceId = await page.locator('#marketDetailFields [data-market-kind="resistance"]').getAttribute('data-market-child-id');
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator(`#marketDetailFields button[data-market-child-action="delete"][data-market-child-id="${resistanceId}"]`).click();
  await expect(page.locator('#marketDetailFields [data-market-kind="resistance"]')).toHaveCount(0);
  await page.locator('#closeMarketDetailBtn').click();

  const rows = page.locator('#marketReviewRows tr');
  const symbols = () => rows.locator('.action-plan-symbol').allTextContents();
  const before = await symbols();
  const firstIndex = before.indexOf(first);
  expect(before.indexOf(second)).toBe(firstIndex + 1);
  await rows.nth(firstIndex + 1).click();
  await page.locator('#closeMarketDetailBtn').click();
  await page.locator('#marketMoveUpBtn').click();
  const after = await symbols();
  expect(after.indexOf(second)).toBe(firstIndex);
  expect(after.indexOf(first)).toBe(firstIndex + 1);
  const save = page.waitForResponse((r) => r.url().endsWith(`/api/reviews/${NOTE_BLOCK_REVIEW_DATE}`) && r.request().method() === 'POST');
  await page.locator('#saveDraftBtn').click();
  expect((await save).status()).toBe(200);

  const bootstrap = await (await request.get(`${BASE_URL}/api/reviews/${NOTE_BLOCK_REVIEW_DATE}/bootstrap`)).json();
  const saved = bootstrap.structuredNotes.marketReview.blocks;
  expect(saved.map((block) => block.symbol)).toEqual(after);
  expect(marketThinking(bootstrap.structuredNotes.marketReview, first)).toBe('避险需求升温。');
  expect(saved.find((block) => block.symbol === second).children.map((child) => child.kind)).not.toContain('resistance');

  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('#filtersForm input[name="from"]').fill(NOTE_BLOCK_REVIEW_DATE);
  await page.locator('#filtersForm input[name="to"]').fill(NOTE_BLOCK_REVIEW_DATE);
  await page.locator('#filtersForm').getByRole('button', { name: '查询' }).click();
  await page.locator('#reviewsList tr', { hasText: NOTE_BLOCK_REVIEW_DATE }).first().getByRole('button', { name: /开始复盘|继续复盘|进入复盘|编辑草稿|查看/ }).click();
  await page.getByText('2. 市场与板块', { exact: true }).click();
  await expect(page.locator('#marketReviewRows tr .action-plan-symbol')).toHaveText(after);
  await page.locator('#marketReviewRows tr').nth(firstIndex).click();
  await expect(page.locator('#marketDetailTitle')).toContainText(second);
  await expect(page.locator('#marketDetailFields [data-market-kind="thinking"]')).toHaveValue('流动性边际改善。');
  await expect(page.locator('#marketDetailFields [data-market-kind="resistance"]')).toHaveCount(0);
});
test('action plans can be auto sorted by current position descending', async ({ page, request }) => {
  seedPlanSymbols(['LOW', 'HIGH', 'MID', 'SMALL']);
  await request.post(`${BASE_URL}/api/reviews/${SORT_REVIEW_DATE}`, {
    data: {
      reviewStatus: 'draft',
      reviewerNewsNotes: '自动排序冒烟：新闻总结。',
      marketReview: marketReviewDraft('自动排序冒烟：大盘盘点。'),
      tradingSummary: '',
      actionPlans: [
        { accountId: US_ACCOUNT_ID, symbol: 'LOW', actionType: '持仓观察', currentPosition: '0-5%' },
        { accountId: US_ACCOUNT_ID, symbol: 'HIGH', actionType: '持仓观察', currentPosition: '>30%' },
        { accountId: US_ACCOUNT_ID, symbol: 'MID', actionType: '持仓观察', currentPosition: '20%-25%' },
        { accountId: US_ACCOUNT_ID, symbol: 'SMALL', actionType: '持仓观察', currentPosition: '10%-15%' },
      ],
    },
  });

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await showReviewDate(page, SORT_REVIEW_DATE);
  const row = page.locator('#reviewsList tr', { hasText: SORT_REVIEW_DATE }).first();
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: /开始复盘|继续复盘|进入复盘|编辑草稿|查看/ }).click();

  await expect(page.locator('#reviewDrawer')).toBeVisible();
  await page.evaluate(() => {
    const step = [...document.querySelectorAll('.step-chip')]
      .find((el) => el.textContent.trim() === '3. 操作计划');
    step?.removeAttribute('disabled');
  });
  await page.getByText('3. 操作计划', { exact: true }).click();
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
      marketReview: marketReviewDraft('零仓位冒烟：大盘盘点。'),
      tradingSummary: '',
      actionPlans: [
        { accountId: US_ACCOUNT_ID, symbol: 'BASE', actionType: '持仓观察', currentPosition: '0-5%' },
      ],
    },
  });

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await showReviewDate(page, ZERO_REVIEW_DATE);
  const row = page.locator('#reviewsList tr', { hasText: ZERO_REVIEW_DATE }).first();
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: /开始复盘|继续复盘|进入复盘|编辑草稿|查看/ }).click();

  await expect(page.locator('#reviewDrawer')).toBeVisible();
  await page.getByText('3. 操作计划', { exact: true }).click();
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

test('closing a newly added action plan discards the temporary symbol', async ({ page, request }) => {
  // Own date: 2026-02-20 belongs to the zone export suite and would add its plans to this account group.
  const cancelReviewDate = '2026-02-21';
  const symbolList = await (await request.get(`${BASE_URL}/api/symbols?active=0`)).json();
  const symbolsByCode = new Map((symbolList.items || []).map((item) => [item.symbol, item]));
  for (const symbol of ['CANCELKEEP', 'CANCELAUTO']) {
    const existing = symbolsByCode.get(symbol);
    const response = existing
      ? await request.put(`${BASE_URL}/api/symbols/${existing.id}`, { data: { is_active: 1 } })
      : await request.post(`${BASE_URL}/api/symbols`, {
        data: {
          symbol,
          yahoo_symbol: symbol,
          display_name: symbol,
          symbol_type: 'stock',
          market_type: '美股',
          aliases: [symbol],
          is_active: 1,
          sort_order: 5000,
        },
      });
    expect(response.ok()).toBeTruthy();
  }

  d1(`DELETE FROM daily_review_action_plans WHERE archive_date='${cancelReviewDate}';
      DELETE FROM daily_review_archive WHERE archive_date='${cancelReviewDate}';`);
  const accounts = await (await request.get(`${BASE_URL}/api/investment-accounts`)).json();
  const tiger = accounts.items.find((item) => item.name === '老虎-美股');
  // The save endpoint trusts the client's accountId (the page always sends one) and never invents a default account.
  const seeded = await request.post(`${BASE_URL}/api/reviews/${cancelReviewDate}`, {
    data: {
      reviewStatus: 'draft',
      reviewerNewsNotes: '取消新增标的回归：新闻总结。',
      marketReview: marketReviewDraft('取消新增标的回归：市场与板块。'),
      tradingSummary: '',
      actionPlans: [
        { accountId: tiger.id, symbol: 'CANCELKEEP', actionType: '持仓观察', currentPosition: '0-5%', marketType: '美股' },
      ],
    },
  });
  expect(seeded.ok()).toBeTruthy();

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.locator('#filtersForm input[name="from"]').fill(cancelReviewDate);
  await page.locator('#filtersForm input[name="to"]').fill(cancelReviewDate);
  await page.locator('#filtersForm').getByRole('button', { name: '查询' }).click();
  const reviewRow = page.locator('#reviewsList tr', { hasText: cancelReviewDate }).first();
  await expect(reviewRow).toBeVisible();
  await reviewRow.getByRole('button', { name: /开始复盘|继续复盘|进入复盘|编辑草稿|查看/ }).click();
  await expect(page.locator('#reviewDrawer')).toBeVisible();
  await page.getByText('3. 操作计划', { exact: true }).click();

  const accountGroup = page.locator('#actionPlanAccountGroups .action-plan-group', { hasText: 'CANCELKEEP' });
  const rows = accountGroup.locator('tbody tr');
  await expect(rows).toHaveCount(1);
  await accountGroup.locator('[data-action="add-plan"]').click();
  await expect(page.locator('#actionPlanDetailModal')).toBeVisible();
  await expect(rows).toHaveCount(2);
  await page.locator('#cancelActionPlanDetailBtn').click();
  await expect(page.locator('#actionPlanDetailModal')).toBeHidden();
  await expect(rows).toHaveCount(1);

  await page.locator('#saveDraftBtn').click();
  const bootstrap = await request.get(`${BASE_URL}/api/reviews/${cancelReviewDate}/bootstrap`);
  const bootstrapJson = await bootstrap.json();
  expect(bootstrapJson.actionPlans.map((plan) => plan.symbol)).toEqual(['CANCELKEEP']);
});

test('new review carries forward previous structured action plans without legacy asset text', async ({ request }) => {
  seedPlanSymbols(['CARRY']);
  // A new day receives plans only by copying live plans at initialization, prices included (they mirror the latest day).
  d1(`DELETE FROM account_live_action_plans;
      DELETE FROM daily_review_symbol_levels WHERE archive_date IN ('${CARRY_SOURCE_DATE}','${CARRY_TARGET_DATE}');
      DELETE FROM daily_review_action_plans WHERE archive_date IN ('${CARRY_SOURCE_DATE}','${CARRY_TARGET_DATE}');
      DELETE FROM daily_review_archive WHERE archive_date IN ('${CARRY_SOURCE_DATE}','${CARRY_TARGET_DATE}');`);
  await request.post(`${BASE_URL}/api/reviews/${CARRY_SOURCE_DATE}`, {
    data: {
      reviewStatus: 'reviewed',
      reviewerNewsNotes: '结构化沿用冒烟：新闻总结。',
      marketReview: { blocks: [], levels: [{ symbol: 'CARRY', supportLevels: '10-12（强）', resistanceLevels: '18-20（中）' }] },
      tradingSummary: '',
      actionPlans: [
        {
          accountId: US_ACCOUNT_ID,
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
  const live = await request.post(`${BASE_URL}/api/account-live-action-plans`, {
    data: {
      accountId: US_ACCOUNT_ID,
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
  });
  expect(live.ok()).toBeTruthy();
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
  expect(bootstrapJson).not.toHaveProperty('carryForward');
  for (const plan of bootstrapJson.actionPlans) {
    expect(plan).not.toHaveProperty('assetPlan');
    expect(plan).not.toHaveProperty('asset_plan');
  }
  // Live price writes also land on the latest fixture day; remove them so other suites keep their baseline.
  d1(`DELETE FROM daily_review_symbol_levels WHERE symbol='CARRY'; DELETE FROM account_live_action_plans WHERE symbol='CARRY';`);
});

test('initialized empty review carries forward the previous market review', async ({ request }) => {
  const sourceBlocks = [
    { id: 'carry-gspc', type: 'symbol', symbol: 'GSPC', children: [
      { id: 'carry-gspc-support', kind: 'support', title: '支撑位' },
      { id: 'carry-gspc-thinking', kind: 'thinking', title: '思考', body: '上一天大盘判断。' },
    ] },
    { id: 'carry-gold', type: 'symbol', symbol: 'GOLD', children: [
      { id: 'carry-gold-thinking', kind: 'thinking', title: '思考', body: '上一天板块判断。' },
    ] },
  ];
  d1(`DELETE FROM daily_review_symbol_levels WHERE archive_date IN ('${CARRY_NOTES_SOURCE_DATE}','${CARRY_NOTES_TARGET_DATE}');
      DELETE FROM daily_review_action_plans WHERE archive_date IN ('${CARRY_NOTES_SOURCE_DATE}','${CARRY_NOTES_TARGET_DATE}');
      DELETE FROM daily_review_archive WHERE archive_date IN ('${CARRY_NOTES_SOURCE_DATE}','${CARRY_NOTES_TARGET_DATE}');`);
  const saved = await request.post(`${BASE_URL}/api/reviews/${CARRY_NOTES_SOURCE_DATE}`, {
    data: {
      reviewStatus: 'reviewed',
      reviewerNewsNotes: '结构化笔记沿用冒烟：新闻总结。',
      marketReview: { blocks: sourceBlocks, levels: [{ symbol: 'GSPC', supportLevels: '6500-6550（强）', resistanceLevels: '' }] },
      tradingSummary: '',
      actionPlans: [],
    },
  });
  expect(saved.ok()).toBeTruthy();
  await request.post(`${BASE_URL}/api/reviews/${CARRY_NOTES_TARGET_DATE}/initialize`);

  const bootstrapJson = await (await request.get(`${BASE_URL}/api/reviews/${CARRY_NOTES_TARGET_DATE}/bootstrap`)).json();
  expect(bootstrapJson.draft.review_status).toBe('initialized');
  expect(bootstrapJson.draft).not.toHaveProperty('market_sentiment');
  expect(bootstrapJson.draft).not.toHaveProperty('sector_rotation');
  const inherited = bootstrapJson.structuredNotes.marketReview;
  expect(inherited.blocks.map((block) => [block.id, block.symbol])).toEqual([['carry-gspc', 'GSPC'], ['carry-gold', 'GOLD']]);
  expect(marketThinking(inherited, 'GSPC')).toBe('上一天大盘判断。');
  expect(marketThinking(inherited, 'GOLD')).toBe('上一天板块判断。');
  // Initialization never writes price rows for the new day.
  expect(queryLocalSql(`SELECT COUNT(*) AS n FROM daily_review_symbol_levels WHERE archive_date='${CARRY_NOTES_TARGET_DATE}'`)[0].n).toBe(0);
});
test('daily record button inserts the review date into the entry plan field', async ({ page, request }) => {
  const dailyRecordDate = '2026-05-08';
  seedPlanSymbols(['DATEBTN']);
  await request.post(`${BASE_URL}/api/reviews/${dailyRecordDate}`, {
    data: {
      reviewStatus: 'draft',
      reviewerNewsNotes: '每日记录冒烟：新闻总结。',
      marketReview: marketReviewDraft('每日记录冒烟：大盘盘点。'),
      tradingSummary: '',
      actionPlans: [
        { accountId: US_ACCOUNT_ID, symbol: 'DATEBTN', actionType: '持仓观察', currentPosition: '0-5%' },
      ],
    },
  });

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await showReviewDate(page, dailyRecordDate);
  const row = page.locator('#reviewsList tr', { hasText: dailyRecordDate }).first();
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: /开始复盘|继续复盘|进入复盘|编辑草稿|查看/ }).click();

  await expect(page.locator('#reviewDrawer')).toBeVisible();
  await page.getByText('3. 操作计划', { exact: true }).click();
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
      marketReview: marketReviewDraft('详情弹窗冒烟：大盘盘点。'),
      tradingSummary: '',
      actionPlans: [
        { accountId: US_ACCOUNT_ID, symbol: 'MODAL', actionType: '持仓观察', currentPosition: '0-5%', marketType: '美股' },
      ],
    },
  });

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await showReviewDate(page, detailModalDate);
  const row = page.locator('#reviewsList tr', { hasText: detailModalDate }).first();
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: /开始复盘|继续复盘|进入复盘|编辑草稿|查看/ }).click();

  await expect(page.locator('#reviewDrawer')).toBeVisible();
  await page.getByText('3. 操作计划', { exact: true }).click();
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
      marketReview: marketReviewDraft('管理标的冒烟：大盘盘点。'),
      tradingSummary: '',
      actionPlans: [],
    },
  });

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.locator('#filtersForm input[name="from"]').fill(managedDate);
  await page.locator('#filtersForm input[name="to"]').fill(managedDate);
  await page.locator('#filtersForm').getByRole('button', { name: '查询' }).click();
  const row = page.locator('#reviewsList tr', { hasText: managedDate }).first();
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: /开始复盘|继续复盘|进入复盘|编辑草稿|查看/ }).click();
  await expect(page.locator('#reviewDrawer')).toBeVisible();
  await page.getByRole('button', { name: '下一步' }).click();
  await addMarketTheme(page, 'GSPC', '管理标的冒烟：市场与板块。');
  await page.getByRole('button', { name: '下一步' }).click();
  await expect(page.getByText('3. 操作计划', { exact: true })).toBeEnabled();

  await page.locator('#addActionPlanUsBtn').click();
  await expect(page.locator('#actionPlanDetailModal')).toBeVisible();
  await expect(page.locator('#actionPlanSymbolPickerTrigger')).toBeVisible();
  await page.locator('#actionPlanSymbolPickerTrigger').click();
  await page.locator('#actionPlanSymbolSearchInput').fill('隐藏测试');
  await expect(page.locator('#actionPlanSymbolResultList [data-symbol-picker-value]', { hasText: '隐藏测试' })).toHaveCount(0);
  await page.locator('#actionPlanSymbolSearchInput').fill('MSFT');
  await page.locator('#actionPlanSymbolResultList [data-symbol-picker-value]', { hasText: 'MSFT' }).first().click();
  await expect(page.locator('#actionPlanSymbolInput')).toHaveValue('MSFT');
  await expect(page.locator('#actionPlanDetailTitle')).toHaveText('MSFT');
  await page.locator('#saveActionPlanDetailBtn').click();

  await page.locator('#addActionPlanCnBtn').click();
  await expect(page.locator('#actionPlanDetailModal')).toBeVisible();
  await selectActionPlanSymbol(page, '159206.SZ');
  await expect(page.locator('#actionPlanSymbolInput')).toHaveValue('159206.SZ');
  await page.locator('#saveActionPlanDetailBtn').click();

  await page.locator('#saveDraftBtn').click();
  const bootstrap = await request.get(`${BASE_URL}/api/reviews/${managedDate}/bootstrap`);
  const bootstrapJson = await bootstrap.json();
  expect(bootstrapJson.actionPlans).toEqual(expect.arrayContaining([
    expect.objectContaining({ symbol: 'MSFT', marketType: '美股' }),
    expect.objectContaining({ symbol: '159206.SZ', marketType: '大A' }),
  ]));
});

// Review saves trust plans picked in the UI; the catalog guard lives on live-plan creation.
test('live action plan creation rejects symbols outside symbol management', async ({ request }) => {
  d1(`DELETE FROM tracked_symbols WHERE symbol='FAKE123';
      DELETE FROM account_live_action_plans WHERE symbol='FAKE123';`);

  const response = await request.post(`${BASE_URL}/api/account-live-action-plans`, {
    data: { accountId: US_ACCOUNT_ID, symbol: 'FAKE123', actionType: '持仓观察', currentPosition: '0-5%', marketType: '美股' },
  });

  expect(response.status()).toBe(400);
  expect((await response.json()).error).toContain('操作计划标的不可用');
  const output = d1(`SELECT COUNT(*) AS cnt FROM account_live_action_plans WHERE symbol='FAKE123';`);
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
      marketReview: marketReviewDraft('价格指标冒烟：大盘盘点。'),
      tradingSummary: '',
      actionPlans: [
        { accountId: US_ACCOUNT_ID, symbol: 'MSFT', actionType: '持仓观察', currentPosition: '0-5%', marketType: '美股' },
        { accountId: US_ACCOUNT_ID, symbol: 'NEWPX', actionType: '准备开仓', currentPosition: '0%', marketType: '美股' },
      ],
    },
  });

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await showReviewDate(page, metricsDate);
  const row = page.locator('#reviewsList tr', { hasText: metricsDate }).first();
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: /开始复盘|继续复盘|进入复盘|编辑草稿|查看/ }).click();
  await expect(page.locator('#reviewDrawer')).toBeVisible();
  await page.getByText('3. 操作计划', { exact: true }).click();

  await page.locator('#actionPlanRowsUs tr', { hasText: 'MSFT' }).click();
  await expect(page.locator('#actionPlanMetrics')).toBeVisible();
  await expect(page.locator('#actionPlanDetailModal [data-metric="latest-price"]')).toContainText('110.00');
  await expect(page.locator('#actionPlanDetailModal [data-metric="day-change"]')).toContainText('+2.50%');
  await expect(page.locator('#actionPlanDetailModal [data-metric="week-change"]')).toContainText('+10.00%');
  await expect(page.locator('#actionPlanDetailModal [data-metric="month-change"]')).toContainText('+37.50%');
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
  seedTrackedSymbol({ symbol: 'SNAPUS', displayName: '美股快照', symbolType: 'stock', marketType: '美股', active: 1, sortOrder: 9202 });
  seedTrackedSymbol({ symbol: 'SNAPCN', displayName: '大A快照', symbolType: 'stock', marketType: '大A', active: 1, sortOrder: 9203 });
  seedTrackedSymbol({ symbol: 'SNAPETF', displayName: '板块快照', symbolType: 'sector', active: 1, sortOrder: 9204 });
  seedTrackedSymbol({ symbol: 'SNAPHIDE', displayName: '隐藏快照', symbolType: 'index', active: 0, sortOrder: 9201 });
  d1(`DELETE FROM stock_raw WHERE symbol IN ('SNAPOK','SNAPUS','SNAPCN','SNAPETF','SNAPHIDE','SNAPORPHAN');
      DELETE FROM daily_review_archive WHERE archive_date='${snapshotDate}';
      INSERT INTO stock_raw (k_date, stock_name, symbol, yahoo_symbol, current_price, change_percent, volume, captured_at)
        VALUES ('${snapshotDate}', '显示快照', 'SNAPOK', 'SNAPOK', 10, 1.2, 100, datetime('now'));
      INSERT INTO stock_raw (k_date, stock_name, symbol, yahoo_symbol, current_price, change_percent, volume, captured_at)
        VALUES ('${snapshotDate}', '美股快照', 'SNAPUS', 'SNAPUS', 11, 1.1, 100, datetime('now'));
      INSERT INTO stock_raw (k_date, stock_name, symbol, yahoo_symbol, current_price, change_percent, volume, captured_at)
        VALUES ('${snapshotDate}', '大A快照', 'SNAPCN', 'SNAPCN', 12, 1.3, 100, datetime('now'));
      INSERT INTO stock_raw (k_date, stock_name, symbol, yahoo_symbol, current_price, change_percent, volume, captured_at)
        VALUES ('${snapshotDate}', '板块快照', 'SNAPETF', 'SNAPETF', 13, 1.4, 100, datetime('now'));
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
  expect(bootstrapJson.prices.usStock.map((item) => item.symbol)).toContain('SNAPUS');
  expect(bootstrapJson.prices.cnStock.map((item) => item.symbol)).toContain('SNAPCN');
  expect(bootstrapJson.prices.sector.map((item) => item.symbol)).toContain('SNAPETF');
  expect(bootstrapJson.prices.index.map((item) => item.symbol)).toContain('SNAPOK');
});

test('long action plan table text shows a full hover tooltip', async ({ page, request }) => {
  const tooltipDate = '2026-05-10';
  const longRecord = '5 月 10 日：这是一段很长的每日记录，用来验证鼠标悬停时可以显示完整内容，而不会把表格撑高。';
  seedPlanSymbols(['TIP']);
  await request.post(`${BASE_URL}/api/reviews/${tooltipDate}`, {
    data: {
      reviewStatus: 'draft',
      reviewerNewsNotes: 'tooltip 冒烟：新闻总结。',
      marketReview: marketReviewDraft('tooltip 冒烟：大盘盘点。'),
      tradingSummary: '',
      actionPlans: [
        {
          accountId: US_ACCOUNT_ID,
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
  await showReviewDate(page, tooltipDate);
  const row = page.locator('#reviewsList tr', { hasText: tooltipDate }).first();
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: /开始复盘|继续复盘|进入复盘|编辑草稿|查看/ }).click();

  await expect(page.locator('#reviewDrawer')).toBeVisible();
  await page.getByText('3. 操作计划', { exact: true }).click();
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
      marketReview: marketReviewDraft('状态列冒烟：大盘盘点。'),
      tradingSummary: '',
      actionPlans: [
        { accountId: US_ACCOUNT_ID, symbol: 'HOLD', actionType: '持仓观察', currentPosition: '15%-20%', marketType: '美股' },
        { accountId: US_ACCOUNT_ID, symbol: 'OPEN', actionType: '准备开仓', currentPosition: '0%', marketType: '美股' },
        { accountId: US_ACCOUNT_ID, symbol: 'DONE', actionType: '已清仓复盘', currentPosition: '0%', marketType: '美股' },
      ],
    },
  });

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await showReviewDate(page, statusDate);
  const row = page.locator('#reviewsList tr', { hasText: statusDate }).first();
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: /开始复盘|继续复盘|进入复盘|编辑草稿|查看/ }).click();

  await expect(page.locator('#reviewDrawer')).toBeVisible();
  await page.evaluate(() => {
    const step = [...document.querySelectorAll('.step-chip')]
      .find((el) => el.textContent.trim() === '3. 操作计划');
    step?.removeAttribute('disabled');
  });
  await page.getByText('3. 操作计划', { exact: true }).click();
  await expect(page.locator('#actionPlanRowsUs tr', { hasText: 'HOLD' }).locator('.action-plan-target-cell')).toContainText('HOLD');
  await expect(page.locator('#actionPlanRowsUs tr', { hasText: 'HOLD' }).locator('.action-plan-target-cell')).not.toContainText('持仓观察');
  await expect(page.locator('#actionPlanRowsUs tr', { hasText: 'OPEN' }).locator('.action-plan-status-pill')).toHaveClass(/status-open/);
  await expect(page.locator('#actionPlanRowsUs tr', { hasText: 'OPEN' }).locator('.action-plan-status-pill')).toHaveText('准备开仓');
  await expect(page.locator('#actionPlanRowsUs tr', { hasText: 'DONE' })).toHaveCount(0);
  const closedSection = page.locator('#actionPlanRowsUsClosed').locator('xpath=ancestor::details[contains(@class, "action-plan-closed-section")]');
  await expect(closedSection).toContainText('已清仓复盘');
  await expect(closedSection).toContainText('1 个');
  await expect(closedSection).not.toHaveAttribute('open', '');
  await closedSection.evaluate((el) => { el.open = true; });
  await expect(page.locator('#actionPlanRowsUsClosed tr', { hasText: 'DONE' }).locator('.action-plan-status-pill')).toHaveClass(/status-closed/);
  await expect(page.locator('#actionPlanRowsUsClosed tr', { hasText: 'DONE' }).locator('.action-plan-status-pill')).toHaveText('清仓复盘');
  await expect(page.locator('.action-plan-table th').filter({ hasText: /^动作$/ })).toHaveCount(0);
});

test('review section titles are emphasized in red', async ({ page, request }) => {
  const titleStyleDate = '2026-05-13';
  seedPlanSymbols(['STYLE']);
  await request.post(`${BASE_URL}/api/reviews/${titleStyleDate}`, {
    data: {
      reviewStatus: 'draft',
      reviewerNewsNotes: '标题样式冒烟：新闻总结。',
      marketReview: marketReviewDraft('标题样式冒烟：大盘盘点。'),
      tradingSummary: '标题样式冒烟：深度总结。',
      actionPlans: [
        { accountId: US_ACCOUNT_ID, symbol: 'STYLE', actionType: '持仓观察', currentPosition: '0-5%', marketType: '美股' },
      ],
    },
  });

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await showReviewDate(page, titleStyleDate);
  const row = page.locator('#reviewsList tr', { hasText: titleStyleDate }).first();
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: /开始复盘|继续复盘|进入复盘|编辑草稿|查看/ }).click();

  await expect(page.locator('#reviewDrawer')).toBeVisible();
  await expect(page.locator('.snapshot-head h3', { hasText: '新闻总结与点评' })).not.toHaveClass(/review-section-title/);
  // 市场与板块 + 个股与资产操作计划 (market and rotation merged into one step).
  await expect(page.locator('.review-section-title')).toHaveCount(2);
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
  expect(titleStyles.every((style) => style.color === 'rgb(194, 65, 53)')).toBe(true);
  expect(titleStyles.every((style) => style.fontSize >= 16)).toBe(true);
  expect(titleStyles.every((style) => style.fontWeight >= 800)).toBe(true);
});
