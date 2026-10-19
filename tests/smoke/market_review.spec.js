import { test, expect } from '@playwright/test';
import { seedLocalMarketReview, assertTestEnvironment, queryLocalSql, executeLocalSql } from '../helpers/market-review-local.mjs';
import { createSymbolMarketBlock, createMarketReview, serializeMarketReview } from '../../cloudflare/web/market-review-model.js';
import { dates, legacyNotes } from '../helpers/market-review-fixtures.mjs';

const base = 'http://127.0.0.1:8787';
const reports = new URL('../reports/market-review-desktop/', import.meta.url).pathname;
test.describe.configure({ mode: 'default' });
test.setTimeout(60000);
test.use({ launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' } });
test.beforeAll(async () => { await assertTestEnvironment(base); });
async function resetSeed() {
  await seedLocalMarketReview(base);
  // Other suites share this local test DB; inheritance and batch counts read every review day,
  // so drop days outside the fixture to restore a deterministic baseline.
  const keep = Object.values(dates).map(date => `'${date}'`).join(',');
  const foreignDays = ['daily_review_archive_news', 'daily_review_snapshots', 'daily_review_action_plans', 'review_account_snapshots', 'daily_review_symbol_levels', 'daily_review_archive']
    .map(table => `DELETE FROM ${table} WHERE archive_date NOT IN (${keep});`).join(' ');
  // The shared fixture upserts known rows; also remove this suite's new empty-day rows.
  executeLocalSql(`${foreignDays} DELETE FROM daily_review_action_plans WHERE archive_date='${dates.empty}'; DELETE FROM daily_review_symbol_levels WHERE archive_date='${dates.empty}';`);
}
test.beforeEach(resetSeed);
test.afterAll(resetSeed);

async function openEmpty(page) {
  const errors = [], consoleErrors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push({ text: message.text(), url: message.location().url }); });
  await page.goto(base);
  await page.locator('#filtersForm [name="from"]').fill(dates.empty);
  await page.locator('#filtersForm [name="to"]').fill(dates.empty);
  await page.locator('#filtersForm button[type="submit"]').click();
  await page.locator('#reviewsList tr').filter({ hasText: dates.empty }).getByRole('button', { name: /开始复盘|编辑草稿/ }).click();
  await expect(page.locator('#reviewLoadingState')).toBeHidden();
  await expect(page.locator('#reviewDrawer')).toBeVisible();
  // This assertion intentionally failed on the old UI before importing the new model helpers.
  await expect(page.locator('#reviewStepNav')).toContainText('市场与板块');
  await page.locator('#reviewStepNav').getByRole('button', { name: /市场与板块/ }).click();
  return { errors, consoleErrors };
}
async function add(page, symbol) {
  await page.locator('#addMarketBlockBtn').click();
  const picker = await page.locator('.market-symbol-picker-panel').boundingBox();
  const viewport = page.viewportSize();
  expect(Math.abs(picker.x + picker.width / 2 - viewport.width / 2)).toBeLessThan(2);
  expect(Math.abs(picker.y + picker.height / 2 - viewport.height / 2)).toBeLessThan(2);
  await page.locator('#marketSymbolSearchInput').fill(symbol);
  await page.locator(`#marketSymbolResultList [data-market-symbol="${symbol}"]`).click();
  await expect(page.locator('#marketReviewDetail')).toBeVisible();
}
async function closeDetail(page) { await page.locator('#closeMarketDetailBtn').click(); }

for (const viewport of [{ width: 1440, height: 1000 }, { width: 1920, height: 1080 }]) {
  test(`US1 real empty day desktop ${viewport.width}: table, picker, detail, save and reopen`, async ({ page, request }, info) => {
    await page.setViewportSize(viewport);
    const runtime = await openEmpty(page);
    await expect(page.locator('[data-step="rotation"]')).toHaveCount(0);
    await expect(page.locator('#marketReviewTable th')).toHaveText(['标的', '支撑位', '压力位', '思考', '其他分析']);
    await expect(page.locator('#marketReviewTable tbody tr')).toHaveCount(0);
    await add(page, 'NOPRICE');
    await expect(page.locator('#marketDetailFields textarea')).toHaveCount(3);
    await expect(page.locator('#marketDetailTitle')).toContainText('NOPRICE');
    // Long enough to overflow the wider 1920 detail panel as well; textareas auto-grow.
    const body = '保持用户原文 <script>window.__unsafe = true</script> "思考"\n' + '长期判断与风险线 '.repeat(480);
    await page.locator('#marketDetailFields [data-market-kind="thinking"]').fill(body);
    await expect(page.locator('#finishMarketDetailBtn')).toBeInViewport();
    expect(await page.locator('#marketReviewDetail .market-detail-body').evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
    await page.screenshot({ path: `${reports}us2-us1-detail-${viewport.width}.png` });
    const detailBox = await page.locator('#marketReviewDetail .market-detail-panel').boundingBox();
    expect(detailBox.x + detailBox.width).toBeLessThanOrEqual(viewport.width);
    expect(Math.abs(detailBox.x + detailBox.width / 2 - viewport.width / 2)).toBeLessThan(2);
    await expect(page.locator('#marketDetailMetrics .action-plan-metric')).toHaveCount(2);
    await expect(page.locator('#marketDetailMetrics span')).toHaveText(['当前最近价格', '复盘日']);
    await expect(page.locator('#marketDetailMetrics strong')).toHaveText(['暂无', '暂无']);
    const marketInputStyle = await page.locator('#marketDetailFields [data-market-kind="support"]').evaluate(el => {
      const style = getComputedStyle(el);
      return ['fontFamily', 'fontSize', 'fontWeight', 'padding', 'borderRadius', 'borderColor', 'lineHeight', 'resize'].map(key => style[key]);
    });
    expect(await page.locator('#marketDetailFields > section').first().evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
    const toolbarMiddles = await page.locator('.market-child-add-toolbar > *').evaluateAll(els => els.map(el => { const box = el.getBoundingClientRect(); return box.y + box.height / 2; }));
    expect(Math.max(...toolbarMiddles) - Math.min(...toolbarMiddles)).toBeLessThan(1);
    await page.keyboard.press('Escape');
    await expect(page.locator('#marketReviewDetail')).toBeHidden();
    await expect(page.locator('#reviewDrawer')).toBeVisible();
    const row = page.locator('#marketReviewTable tbody tr').first();
    const blockId = await row.getAttribute('data-market-block-id');
    await row.focus(); await page.keyboard.press('Enter');
    await expect(page.locator('#marketReviewDetail')).toBeVisible(); await closeDetail(page);
    await row.focus(); await page.keyboard.press('Space');
    await expect(page.locator('#marketReviewDetail')).toBeVisible(); await closeDetail(page);
    await add(page, 'NOPRICE');
    await expect(page.locator('#marketReviewMessage')).toContainText('已存在');
    await expect(page.locator('#marketReviewTable tbody tr')).toHaveCount(1);
    await expect(page.locator('#marketReviewTable tbody tr').first()).toHaveAttribute('data-market-block-id', blockId);
    await closeDetail(page);
    await add(page, 'SPY'); await closeDetail(page);
    await add(page, 'GSPC'); await closeDetail(page);
    await page.locator('#marketAutoSortBtn').click();
    await expect(page.locator('#marketReviewTable tbody tr .action-plan-symbol')).toHaveText(['NOPRICE', 'SPY', 'GSPC']);
    await page.locator('#marketReviewTable tbody tr').first().click(); await closeDetail(page);
    const firstId = await page.locator('#marketReviewTable tbody tr').first().getAttribute('data-market-block-id');
    await page.locator('#marketMoveDownBtn').click();
    await expect(page.locator('#marketReviewTable tbody tr').nth(1)).toHaveAttribute('data-market-block-id', firstId);
    await page.locator('#marketMoveUpBtn').click();
    await expect(page.locator('#marketReviewTable tbody tr').first()).toHaveAttribute('data-market-block-id', firstId);
    await page.locator(`#reviewOutline [data-market-block-id="${blockId}"]`).click();
    await expect(page.locator('#marketDetailTitle')).toContainText('NOPRICE');
    await expect(page.locator('#marketDetailFields [data-market-kind="thinking"]')).toHaveValue(body);
    await closeDetail(page);
    const marker = await page.locator(`#marketReviewTable [data-market-block-id="${blockId}"] td`).first().evaluate(el => ({
      height: getComputedStyle(el, '::before').height,
      color: getComputedStyle(el, '::before').backgroundColor,
      shadow: getComputedStyle(el).boxShadow,
      rowHeight: el.clientHeight,
    }));
    expect(marker.color).toBe('rgb(37, 99, 235)'); expect(marker.shadow).toBe('none');
    expect(Math.abs(parseFloat(marker.height) - (marker.rowHeight - 24))).toBeLessThan(1);
    // The section banner carries the only accent bar; the container itself renders no ::before.
    expect(await page.locator('#marketReviewGroup').evaluate(el => getComputedStyle(el, '::before').content)).toBe('none');
    expect(await page.locator('.market-review-head').evaluate(el => getComputedStyle(el, '::before').backgroundColor)).toBe('rgb(194, 65, 53)');
    await expect(page.locator('.market-review-head .review-section-title')).toHaveCSS('color', 'rgb(194, 65, 53)');
    for (const id of ['addMarketBlockBtn', 'marketAutoSortBtn', 'marketMoveUpBtn', 'marketMoveDownBtn', 'marketDeleteBlockBtn']) await expect(page.locator(`#${id}`)).toBeInViewport();
    await page.locator(`#marketReviewTable [data-market-block-id="${blockId}"] td`).nth(3).locator('[data-full-text]').hover();
    await expect(page.locator('#actionPlanCellTooltip')).toContainText('<script>');
    expect(await page.evaluate(() => window.__unsafe)).toBeUndefined();
    await page.screenshot({ path: `${reports}us2-us1-table-${viewport.width}.png` });
    const save = page.waitForResponse(r => r.url().endsWith(`/api/reviews/${dates.empty}`) && r.request().method() === 'POST');
    await page.locator('#saveDraftBtn').click();
    const response = await save; expect(response.status()).toBe(200);
    const payload = response.request().postDataJSON();
    expect(payload).not.toHaveProperty('marketSentimentBlocks'); expect(payload).not.toHaveProperty('sectorRotationBlocks');
    expect(payload.marketReview.blocks).toHaveLength(3);
    expect(payload.marketReview.levels).toEqual([]);
    for (const block of payload.marketReview.blocks) for (const child of block.children) if (['support', 'resistance'].includes(child.kind)) expect(child).not.toHaveProperty('body');
    const stored = queryLocalSql(`SELECT market_review_json FROM daily_review_archive WHERE archive_date='${dates.empty}'`);
    expect(JSON.parse(stored[0].market_review_json).blocks.find(b => b.id === blockId).children.find(c => c.kind === 'thinking').body).toBe(body);
    await page.locator('#closeDrawerBtn').click();
    await openEmpty(page);
    await page.locator(`#marketReviewTable [data-market-block-id="${blockId}"]`).click();
    await expect(page.locator('#marketDetailFields [data-market-kind="thinking"]')).toHaveValue(body);
    await closeDetail(page);
    await page.locator('#exportActionPlanZonesBtn').click();
    await expect(page.locator('#actionPlanZoneExportModal')).toBeVisible();
    await page.locator('#closeActionPlanZoneExportBtn').click();
    await page.locator('#reviewStepNav').getByRole('button', { name: /操作计划/ }).click();
    await page.locator('#actionPlanAccountGroups [data-action="add-plan"]').first().click();
    await expect(page.locator('#actionPlanDetailModal')).toBeVisible();
    const planBox = await page.locator('#actionPlanDetailModal .action-plan-detail-panel').boundingBox();
    expect(Math.abs(planBox.x + planBox.width / 2 - viewport.width / 2)).toBeLessThan(2);
    expect(planBox.width).toBe(detailBox.width);
    const planInputStyle = await page.locator('#actionPlanSupportLevelsInput').evaluate(el => {
      const style = getComputedStyle(el);
      return ['fontFamily', 'fontSize', 'fontWeight', 'padding', 'borderRadius', 'borderColor', 'lineHeight', 'resize'].map(key => style[key]);
    });
    expect(marketInputStyle).toEqual(planInputStyle);
    await page.locator('#actionPlanSymbolPickerTrigger').click();
    await expect(page.locator('#actionPlanSymbolPickerPopover')).toBeVisible();
    await expect(page.locator('#marketSymbolPicker')).toBeHidden();
    await page.locator('#closeActionPlanDetailBtn').click();
    await info.attach('runtime', { body: JSON.stringify(runtime), contentType: 'application/json' });
    expect(runtime.errors).toEqual([]);
    // Existing site has no favicon; keep that baseline visible in the report, reject other console errors.
    expect(runtime.consoleErrors.filter(error => !error.url.endsWith('/favicon.ico'))).toEqual([]);
  });
}

test('US1 catalog status hidden without retry button; delete stays local until save', async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const runtime = await openEmpty(page);
  await expect(page.locator('.market-catalog-status')).toBeHidden();
  await expect(page.locator('#marketCatalogRetryBtn')).toHaveCount(0);
  await add(page, 'SOXX'); await closeDetail(page);
  await add(page, 'IGV'); await closeDetail(page);
  page.once('dialog', dialog => dialog.accept()); await page.locator('#marketDeleteBlockBtn').click();
  await expect(page.locator('#marketReviewTable tbody tr')).toHaveCount(1);
  expect(queryLocalSql(`SELECT market_review_json FROM daily_review_archive WHERE archive_date='${dates.empty}'`)[0].market_review_json).toBeNull();
  expect(runtime.errors).toEqual([]);
  await info.attach('runtime', { body: JSON.stringify(runtime), contentType: 'application/json' });
});

test('US1 bootstrap without catalog shows the hint, blocks adding and keeps the saved draft', async ({ page, request }) => {
  const bootstrap = await (await request.get(`${base}/api/reviews/${dates.empty}/bootstrap`)).json();
  const block = createSymbolMarketBlock({ symbol: 'SOXX', catalog: bootstrap.marketReviewSymbols, id: 'catalog-missing-us1' });
  block.children.find(child => child.kind === 'thinking').body = '目录失败也保留草稿';
  const json = serializeMarketReview(createMarketReview({ blocks: [block] }));
  executeLocalSql(`UPDATE daily_review_archive SET market_review_json='${json.replaceAll("'", "''")}' WHERE archive_date='${dates.empty}'`);
  await page.route(`**/api/reviews/${dates.empty}/bootstrap`, async route => {
    const response = await route.fetch();
    const data = await response.json();
    delete data.marketReviewSymbols;
    await route.fulfill({ response, json: data });
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  const runtime = await openEmpty(page);
  await expect(page.locator('.market-catalog-status')).toBeVisible();
  await expect(page.locator('#marketReviewMessage')).toContainText('标的目录读取失败');
  await expect(page.locator('#marketCatalogRetryBtn')).toHaveCount(0);
  await expect(page.locator('#addMarketBlockBtn')).toBeDisabled();
  await expect(page.locator('#marketReviewTable')).toContainText('目录失败也保留草稿');
  expect(runtime.errors).toEqual([]);
});

test('US1 actual Worker rejection preserves draft and real retry saves it', async ({ page }) => {
  const runtime = await openEmpty(page);
  await add(page, 'MU');
  await page.locator('#marketDetailFields [data-market-kind="thinking"]').fill('真实保存失败时草稿不丢');
  await closeDetail(page);
  executeLocalSql("UPDATE tracked_symbols SET is_active=0 WHERE symbol='MU'");
  try {
    const rejected = page.waitForResponse(r => r.url().endsWith(`/api/reviews/${dates.empty}`) && r.request().method() === 'POST');
    await page.locator('#saveDraftBtn').click(); expect((await rejected).status()).toBe(400);
    await expect(page.locator('#reviewFooterMessage')).toBeVisible();
    await expect(page.locator('#reviewFooterMessage')).toContainText('保存失败，草稿已保留');
    await expect(page.locator('#reviewFooterMessage')).toHaveClass(/error/);
    await expect(page.locator('#marketReviewRows')).toContainText('真实保存失败时草稿不丢');
    expect(queryLocalSql(`SELECT market_review_json FROM daily_review_archive WHERE archive_date='${dates.empty}'`)[0].market_review_json).toBeNull();
  } finally { executeLocalSql("UPDATE tracked_symbols SET is_active=1 WHERE symbol='MU'"); }
  const retried = page.waitForResponse(r => r.url().endsWith(`/api/reviews/${dates.empty}`) && r.request().method() === 'POST');
  await page.locator('#saveDraftBtn').click(); expect((await retried).status()).toBe(200);
  await expect(page.locator('#reviewFooterMessage')).toContainText('复盘已保存');
  await expect(page.locator('#reviewFooterMessage')).not.toHaveClass(/error/);
  expect(runtime.errors).toEqual([]);
});

test('US1 reviewed market stays read-only while rows and outline remain usable', async ({ page, request }) => {
  const bootstrap = await (await request.get(`${base}/api/reviews/${dates.empty}/bootstrap`)).json();
  const block = createSymbolMarketBlock({ symbol: 'SOXX', catalog: bootstrap.marketReviewSymbols, id: 'readonly-us1' });
  block.children.find(child => child.kind === 'thinking').body = '已保存判断';
  const json = serializeMarketReview(createMarketReview({ blocks: [block] }));
  executeLocalSql(`UPDATE daily_review_archive SET review_status='reviewed', market_review_json='${json.replaceAll("'", "''")}' WHERE archive_date='${dates.empty}'`);
  const writes = [], errors = [];
  page.on('request', request => { if (request.method() !== 'GET' && !request.url().includes('/account-impact/preview')) writes.push(request.url()); });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base);
  await page.locator('#filtersForm [name="from"]').fill(dates.empty);
  await page.locator('#filtersForm [name="to"]').fill(dates.empty);
  await page.locator('#filtersForm button[type="submit"]').click();
  await page.locator('#reviewsList tr').filter({ hasText: dates.empty }).getByRole('button', { name: '查看', exact: true }).click();
  await expect(page.locator('#reviewLoadingState')).toBeHidden();
  await page.locator('#reviewOutline [data-market-block-id="readonly-us1"]').click();
  await expect(page.locator('#marketReviewDetail')).toBeVisible();
  await expect(page.locator('#marketDetailFields textarea').first()).toHaveAttribute('readonly', '');
  await expect(page.locator('#marketDetailFields textarea').last()).toHaveAttribute('readonly', '');
  await closeDetail(page);
  for (const id of ['addMarketBlockBtn', 'marketAutoSortBtn', 'marketMoveUpBtn', 'marketMoveDownBtn', 'marketDeleteBlockBtn']) await expect(page.locator(`#${id}`)).toBeDisabled();
  await page.locator('#marketReviewRows tr').focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#marketReviewDetail')).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.locator('#reviewDrawer')).toBeVisible();
  expect(writes).toEqual([]); expect(errors).toEqual([]);
  expect(queryLocalSql(`SELECT market_review_json FROM daily_review_archive WHERE archive_date='${dates.empty}'`)[0].market_review_json).toBe(json);
});

const presets = { support: '支撑位', resistance: '压力位', thinking: '思考', cta: 'CTA 流动性', collar: 'JPM collar', eps: 'EPS 预计' };
const childBody = (page, id) => page.locator(`#marketDetailFields textarea[data-market-child-id="${id}"]`);
const childAction = (page, id, action) => page.locator(`#marketDetailFields button[data-market-child-action="${action}"][data-market-child-id="${id}"]`);
async function addChild(page, kind) {
  await page.locator('#marketChildKindSelect').selectOption(kind);
  await page.locator('#addMarketChildBtn').click();
  return page.locator('#marketDetailFields textarea').last().getAttribute('data-market-child-id');
}

async function editCustomTitle(page, childId, value) {
  await page.locator(`[data-market-child-id="${childId}"] .market-title-edit-btn`).click();
  const input = page.locator(`[data-market-title][data-market-child-id="${childId}"]`);
  await input.fill(value);
  await input.press('Enter');
}
async function childIds(page) {
  return page.locator('#marketDetailFields textarea').evaluateAll(inputs => inputs.map(input => input.dataset.marketChildId));
}
async function addCompletionPlan(page) {
  await page.locator('#actionPlanAccountGroups [data-action="add-plan"]').first().click();
  await page.locator('#actionPlanSymbolPickerTrigger').click();
  await page.locator('#actionPlanSymbolSearchInput').fill('MU');
  await page.locator('#actionPlanSymbolResultList [data-symbol-picker-value="MU"]').click();
  await page.locator('#actionPlanThinkingInput').fill('正常完成保留计划');
  await page.locator('#saveActionPlanDetailBtn').click();
}
async function openReviewed(page) {
  await page.goto(base);
  await page.locator('#filtersForm [name="from"]').fill(dates.empty);
  await page.locator('#filtersForm [name="to"]').fill(dates.empty);
  await page.locator('#filtersForm button[type="submit"]').click();
  await page.locator('#reviewsList tr').filter({ hasText: dates.empty }).getByRole('button', { name: '查看', exact: true }).click();
  await expect(page.locator('#reviewLoadingState')).toBeHidden();
}

for (const viewport of [{ width: 1440, height: 1000 }, { width: 1920, height: 1080 }]) {
  test(`US2 SM-MR-003 desktop ${viewport.width}: six presets, custom, stable sort/delete and save-reopen`, async ({ page, request }) => {
    await page.setViewportSize(viewport);
    const runtime = await openEmpty(page);
    await add(page, 'GSPC');
    // Red must be a missing UI control, not an import or environment failure.
    await expect(page.locator('#marketChildKindSelect')).toBeVisible();
    const writes = [];
    page.on('request', req => { if (req.method() === 'POST' && /\/api\/reviews\/[^/]+(?:\/complete)?$/.test(req.url())) writes.push(req); });
    for (const kind of ['support', 'resistance', 'thinking']) await expect(page.locator(`#marketChildKindSelect option[value="${kind}"]`)).toBeDisabled();
    for (const kind of ['cta', 'collar', 'eps']) await addChild(page, kind);
    for (const [kind, title] of Object.entries(presets)) {
      await expect(page.locator(`#marketChildKindSelect option[value="${kind}"]`)).toBeDisabled();
      await expect(page.locator(`#marketDetailFields textarea[data-market-kind="${kind}"]`)).toHaveAttribute('aria-label', title);
    }
    await expect(page.locator('#marketDetailFields [data-market-title]')).toHaveCount(0);
    const values = {
      support: '6550–6600（强）\n6400', resistance: '6800–6850', thinking: 'GSPC 判断：' + '长中文风险线 '.repeat(100),
      cta: 'CTA 6480/6450；卖出 $30.5bn', collar: 'JPM collar 6900 call / 5800 put', eps: '2026 EPS 300；2027 325.50',
    };
    for (const [kind, value] of Object.entries(values)) await page.locator(`#marketDetailFields textarea[data-market-kind="${kind}"]`).fill(value);
    const first = await addChild(page, 'custom');
    await editCustomTitle(page, first, '自定义风险 <b>原文</b>');
    await childBody(page, first).fill('500–510（强）\n金额 $1,234.56；<script>window.__us2unsafe = true</script>');
    const second = await addChild(page, 'custom');
    await editCustomTitle(page, second, '空正文允许保存');
    await expect(page.locator('#marketDetailFields .market-title-edit-btn')).toHaveCount(2);
    await expect(page.locator('#marketChildKindSelect option[value="custom"]')).toBeEnabled();
    await expect(page.locator('#marketReviewRows')).toContainText('自定义风险 <b>原文</b>');
    // The outline lists first-level themes only; second-level analysis lives in the detail.
    await expect(page.locator('#reviewOutline [data-market-child-id], #reviewOutline .review-outline-item.child')).toHaveCount(0);
    await expect(page.locator('#reviewOutline [data-market-block-id]')).toHaveCount(1);
    const original = await childIds(page);
    await expect(page.locator('#marketDetailFields button[data-market-child-action="up"], #marketDetailFields button[data-market-child-action="down"]')).toHaveCount(0);
    await expect(page.locator('#marketReviewRows .shared-levels-hint')).toHaveCount(0);
    await expect(page.locator('#marketSharedLevelsHint')).toContainText('仅价位共用');
    await expect(page.locator('#marketDetailTipBubble')).toBeHidden();
    await page.locator('.market-detail-tip').hover();
    await expect(page.locator('#marketDetailTipBubble')).toBeVisible();
    await expect(page.locator('#marketDetailTipBubble')).toContainText('完成编辑后统一保存复盘');
    expect(original.indexOf(second)).toBe(original.length - 1);
    const removed = await addChild(page, 'custom');
    page.once('dialog', dialog => dialog.dismiss()); await childAction(page, removed, 'delete').click();
    await expect(childBody(page, removed)).toHaveCount(1);
    page.once('dialog', dialog => dialog.accept()); await childAction(page, removed, 'delete').click();
    await expect(childBody(page, removed)).toHaveCount(0);
    const epsId = await page.locator('textarea[data-market-kind="eps"]').getAttribute('data-market-child-id');
    page.once('dialog', dialog => dialog.accept()); await childAction(page, epsId, 'delete').click();
    await expect(page.locator('#marketChildKindSelect option[value="eps"]')).toBeEnabled();
    await addChild(page, 'eps');
    await page.locator('textarea[data-market-kind="eps"]').fill(values.eps);
    // The detail body may still be scrolling after re-adding a child; measure both in one frame.
    const levelBoxes = () => page.evaluate(() => ['support', 'resistance', 'cta'].map(kind => {
      const { x, y, width } = document.querySelector(`textarea[data-market-kind="${kind}"]`).getBoundingClientRect();
      return { x, y, width };
    }));
    const [support, resistance, wide] = await levelBoxes();
    expect(Math.abs(support.y - resistance.y)).toBeLessThan(2);
    expect(resistance.x).toBeGreaterThan(support.x + support.width);
    expect(wide.width).toBeGreaterThan(support.width * 1.8);
    await expect(page.locator('#finishMarketDetailBtn')).toBeInViewport();
    await page.screenshot({ path: `${reports}us2-detail-${viewport.width}.png` });
    const order = await childIds(page);
    await page.locator('#marketReviewDetail .market-detail-body').evaluate(el => { el.scrollTop = 0; });
    await expect(page.locator('#marketChildKindSelect')).toBeInViewport();
    await page.screenshot({ path: `${reports}us2-detail-top-${viewport.width}.png` });
    await page.locator('#finishMarketDetailBtn').click();
    await expect(page.locator('#marketReviewDetail')).toBeHidden();
    expect(writes).toEqual([]);
    expect(queryLocalSql(`SELECT market_review_json FROM daily_review_archive WHERE archive_date='${dates.empty}'`)[0].market_review_json).toBeNull();
    await expect(page.locator('#marketReviewRows .action-plan-symbol')).toHaveText(['GSPC']);
    const saved = page.waitForResponse(r => r.url().endsWith(`/api/reviews/${dates.empty}`) && r.request().method() === 'POST');
    await page.locator('#saveDraftBtn').click();
    const response = await saved; expect(response.status()).toBe(200);
    const payload = response.request().postDataJSON();
    expect(payload.marketReview.blocks).toHaveLength(1);
    expect(payload.marketReview.blocks[0].symbol).toBe('GSPC');
    expect(payload.marketReview.blocks[0].children.map(child => child.id)).toEqual(order);
    await page.locator('#closeDrawerBtn').click(); await openEmpty(page);
    await page.locator('#marketReviewRows tr').click();
    expect(await childIds(page)).toEqual(order);
    await expect(page.locator('#reviewOutline [data-market-child-id]')).toHaveCount(0);
    for (const [kind, value] of Object.entries(values)) await expect(page.locator(`textarea[data-market-kind="${kind}"]`)).toHaveValue(value);
    await expect(page.locator(`[data-market-child-id="${first}"] .field-title`).first()).toHaveText('自定义风险 <b>原文</b>');
    await expect(childBody(page, second)).toHaveValue('');
    const bootstrap = await (await request.get(`${base}/api/reviews/${dates.empty}/bootstrap`)).json();
    expect(bootstrap.structuredNotes.marketReview.blocks[0].children.map(child => child.id)).toEqual(order);
    expect(await page.evaluate(() => window.__us2unsafe)).toBeUndefined();
    expect(runtime.errors).toEqual([]);
  });
}

test('US2 editing custom title to blank blocks save, edit-pencil confirms rename and preserves every field', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const runtime = await openEmpty(page);
  await add(page, 'GSPC');
  await expect(page.locator('#marketChildKindSelect')).toBeVisible();
  const id = await addChild(page, 'custom');
  await childBody(page, id).fill('不得吞错丢失这段数字 325.50');
  const order = await childIds(page);
  // Rename via pencil button.
  await editCustomTitle(page, id, '修正标题');
  await expect(page.locator(`[data-market-child-id="${id}"] .field-title`).first()).toHaveText('修正标题');
  const writes = [];
  page.on('request', req => { if (req.method() === 'POST' && /\/api\/reviews\/[^/]+(?:\/complete)?$/.test(req.url())) writes.push(req.url()); });
  const saved = page.waitForResponse(r => r.url().endsWith(`/api/reviews/${dates.empty}`) && r.request().method() === 'POST');
  await closeDetail(page); await page.locator('#saveDraftBtn').click(); expect((await saved).status()).toBe(200);
  const stored = JSON.parse(queryLocalSql(`SELECT market_review_json FROM daily_review_archive WHERE archive_date='${dates.empty}'`)[0].market_review_json);
  expect(stored.blocks[0].children.map(child => child.id)).toEqual(order);
  expect(stored.blocks[0].children.find(child => child.id === id)).toMatchObject({ title: '修正标题', body: '不得吞错丢失这段数字 325.50' });
  expect(runtime.errors).toEqual([]);
});

test('US2 reviewed and legacy detail disable all child changes, retain readable title/body and never POST', async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const bootstrap = await (await request.get(`${base}/api/reviews/${dates.empty}/bootstrap`)).json();
  const block = createSymbolMarketBlock({ symbol: 'GSPC', catalog: bootstrap.marketReviewSymbols, id: 'readonly-us2' });
  block.children.push({ id: 'readonly-custom', kind: 'custom', title: '只读标题', body: '只读正文 325.50' });
  const legacy = { id: 'legacy-us2', type: 'legacy', symbol: null, title: '历史原文', legacyOrigin: { date: dates.empty, group: 'market', index: 0, title: '历史原文' }, children: [{ id: 'legacy-custom', kind: 'custom', title: '原始标题', body: '原文 6550–6600' }] };
  const json = serializeMarketReview(createMarketReview({ blocks: [block, legacy] }));
  executeLocalSql(`UPDATE daily_review_archive SET review_status='reviewed', market_review_json='${json.replaceAll("'", "''")}' WHERE archive_date='${dates.empty}'`);
  const writes = [], errors = [];
  page.on('request', req => { if (req.method() === 'POST' && !req.url().includes('/account-impact/preview')) writes.push(req.url()); });
  page.on('pageerror', error => errors.push(error.message));
  await openReviewed(page);
  for (const [blockId, childId] of [[block.id, 'readonly-custom'], [legacy.id, 'legacy-custom']]) {
    await page.locator(`#reviewOutline [data-market-block-id="${blockId}"]`).click();
    await expect(page.locator('#marketChildKindSelect')).toBeDisabled(); await expect(page.locator('#addMarketChildBtn')).toBeDisabled();
    await expect(page.locator(`[data-market-child-id="${childId}"] .field-title`).first()).toBeVisible();
    await expect(page.locator(`[data-market-child-id="${childId}"] .market-title-edit-btn`)).toHaveCount(0);
    await expect(childBody(page, childId)).toHaveJSProperty('readOnly', true);
    // Second-level children only support delete; reordering controls are never rendered.
    for (const action of ['up', 'down']) await expect(childAction(page, childId, action)).toHaveCount(0);
    await expect(childAction(page, childId, 'delete')).toBeDisabled();
    expect(await page.locator('#marketDetailFields button[data-market-child-action]').evaluateAll(buttons => buttons.length > 0 && buttons.every(button => button.disabled))).toBe(true);
    await closeDetail(page);
  }
  // Legacy remains immutable even after entering the surrounding review's edit mode.
  await page.locator('#initializeBtn').click();
  await page.locator(`#reviewOutline [data-market-block-id="${legacy.id}"]`).click();
  await expect(page.locator('#addMarketChildBtn')).toBeDisabled();
  await expect(childBody(page, 'legacy-custom')).toHaveJSProperty('readOnly', true);
  await expect(page.locator('[data-market-child-id="legacy-custom"] .field-title').first()).toHaveText('原始标题');
  await expect(page.locator('[data-market-child-id="legacy-custom"] .market-title-edit-btn')).toHaveCount(0);
  for (const action of ['up', 'down']) await expect(childAction(page, 'legacy-custom', action)).toHaveCount(0);
  await expect(childAction(page, 'legacy-custom', 'delete')).toBeDisabled();
  expect(writes).toEqual([]); expect(errors).toEqual([]);
  expect(queryLocalSql(`SELECT market_review_json FROM daily_review_archive WHERE archive_date='${dates.empty}'`)[0].market_review_json).toBe(json);
});

test('US2 normal completion requires news, one market step and plan; saves before complete and keeps summary optional', async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const runtime = await openEmpty(page);
  await expect(page.locator('#reviewStepNav').getByRole('button', { name: /市场与板块/ })).toHaveCount(1);
  await expect(page.locator('.review-step-panel[data-step="rotation"]')).toHaveCount(0);
  async function blocked(pattern) {
    const dialogPromise = page.waitForEvent('dialog');
    const click = page.locator('#nextStepBtn').click();
    const dialog = await dialogPromise; expect(dialog.message()).toMatch(pattern); await dialog.accept(); await click;
  }
  await page.locator('#reviewStepNav').getByRole('button', { name: /新闻总结/ }).click();
  await page.locator('textarea[name="reviewerNewsNotes"]').fill('');
  await blocked(/新闻/);
  await page.locator('textarea[name="reviewerNewsNotes"]').fill('US2 正常完成：新闻主线');
  await page.locator('#nextStepBtn').click(); await blocked(/市场与板块/);
  await add(page, 'GSPC'); await expect(page.locator('#marketChildKindSelect')).toBeVisible();
  await addChild(page, 'collar'); await page.locator('textarea[data-market-kind="collar"]').fill('6900 call / 5800 put');
  await page.locator('#finishMarketDetailBtn').click(); await page.locator('#nextStepBtn').click(); await blocked(/操作计划/);
  await addCompletionPlan(page); await page.locator('#nextStepBtn').click();
  await expect(page.locator('textarea[name="tradingSummary"]')).toHaveValue('');
  const posts = [];
  page.on('response', response => { if (response.request().method() === 'POST' && /\/api\/reviews\/[^/]+(?:\/complete)?$/.test(response.url())) posts.push({ path: new URL(response.url()).pathname, status: response.status(), body: response.request().postDataJSON() }); });
  const completed = page.waitForResponse(r => r.url().endsWith(`/api/reviews/${dates.empty}/complete`) && r.request().method() === 'POST');
  await page.locator('#nextStepBtn').click(); expect((await completed).status()).toBe(200);
  await expect(page.locator('#reviewDrawer')).toBeHidden();
  expect(posts.map(post => [post.path, post.status])).toEqual([[`/api/reviews/${dates.empty}`, 200], [`/api/reviews/${dates.empty}/complete`, 200]]);
  expect(posts[0].body.marketReview.blocks[0].symbol).toBe('GSPC'); expect(posts[0].body.tradingSummary).toBe('');
  const bootstrap = await (await request.get(`${base}/api/reviews/${dates.empty}/bootstrap`)).json();
  expect(bootstrap.draft.review_status).toBe('reviewed'); expect(bootstrap.draft.reviewer_news_notes).toBe('US2 正常完成：新闻主线');
  expect(bootstrap.actionPlans.some(plan => plan.symbol === 'MU')).toBe(true);
  expect(bootstrap.structuredNotes.marketReview.blocks[0].children.find(child => child.kind === 'collar').body).toBe('6900 call / 5800 put');
  await openReviewed(page); await page.locator('#marketReviewRows tr').click();
  await expect(page.locator('textarea[data-market-kind="collar"]')).toHaveValue('6900 call / 5800 put');
  expect(runtime.errors).toEqual([]);
});

// US3 uses saved new documents only. All SQL stays in the verified local test D1.
const sqlText = value => `'${String(value).replaceAll("'", "''")}'`;
const us3Support = '  501–511（强）\n  490  ';
const us3Resistance = '  580–590  ';
const planRows = (page, account, symbol, live = false) => page.locator(`${live ? '#accountLivePlans' : '#actionPlanAccountGroups'} [data-account-id="${account}"] tbody tr`).filter({ has: page.locator('.action-plan-symbol', { hasText: new RegExp(`^${symbol}$`) }) });
async function seedUs3(request) {
  const bootstrap = await (await request.get(`${base}/api/reviews/${dates.empty}/bootstrap`)).json();
  const blocks = ['SOXX', 'GSPC'].map(symbol => createSymbolMarketBlock({ symbol, catalog: bootstrap.marketReviewSymbols, id: `us3-${symbol}` }));
  blocks[1].children.push({ id: 'us3-collar', kind: 'collar', title: 'JPM collar', body: '6900 call / 5800 put' });
  const json = serializeMarketReview(createMarketReview({ blocks }));
  executeLocalSql(`
    DELETE FROM account_live_action_plans WHERE account_id=3 AND symbol='SOXX';
    DELETE FROM daily_review_action_plans WHERE archive_date=${sqlText(dates.latest)} AND account_id=3 AND symbol='SOXX';
    DELETE FROM daily_review_action_plans WHERE archive_date=${sqlText(dates.empty)};
    DELETE FROM daily_review_symbol_levels WHERE archive_date IN (${sqlText(dates.empty)},${sqlText(dates.latest)});
    UPDATE daily_review_archive SET review_status='draft', market_review_json=${sqlText(json)} WHERE archive_date IN (${sqlText(dates.empty)},${sqlText(dates.latest)});
    INSERT INTO daily_review_action_plans (archive_date,account_id,symbol,action_type,current_position,position_amount,entry_plan,take_profit_plan,stop_loss_plan,thinking,key_levels,support_levels,resistance_levels,sort_order,market_type)
      SELECT ${sqlText(dates.empty)},account_id,symbol,action_type,current_position,position_amount,entry_plan,take_profit_plan,stop_loss_plan,thinking,key_levels,support_levels,resistance_levels,sort_order,market_type FROM daily_review_action_plans WHERE archive_date=${sqlText(dates.latest)};
    UPDATE daily_review_action_plans SET entry_plan='账户独立记录 '||account_id, take_profit_plan='止盈 '||account_id, stop_loss_plan='止损 '||account_id, thinking='账户独立思考 '||account_id, position_amount=account_id*12345.67, key_levels='  key raw '||account_id||'  ', support_levels=' raw support '||account_id||' ', resistance_levels=' raw resistance '||account_id||' ' WHERE archive_date=${sqlText(dates.empty)} AND symbol='SOXX';
    UPDATE account_live_action_plans SET entry_plan='live独立记录 '||account_id,take_profit_plan='live止盈 '||account_id,stop_loss_plan='live止损 '||account_id,thinking='live思考 '||account_id,key_levels='  live key '||account_id||'  ',support_levels=' raw live '||account_id||' ',resistance_levels=' raw live resistance '||account_id||' ' WHERE symbol='SOXX';
    INSERT INTO stock_raw (symbol,k_date,current_price,change_percent) SELECT symbol,${sqlText(dates.empty)},current_price,change_percent FROM stock_raw WHERE k_date=${sqlText(dates.latest)} AND symbol IN ('SOXX','GSPC') AND NOT EXISTS (SELECT 1 FROM stock_raw target WHERE target.k_date=${sqlText(dates.empty)} AND target.symbol=stock_raw.symbol);
    INSERT INTO daily_review_symbol_levels (archive_date,symbol,support_levels,resistance_levels) VALUES
      (${sqlText(dates.empty)},'SOXX',${sqlText(us3Support)},${sqlText(us3Resistance)}),
      (${sqlText(dates.empty)},'IGV','  out of view 90–95  ','  out of view 110  '),
      (${sqlText(dates.latest)},'SOXX','  D support 505  ','  D resistance 575  '),
      (${sqlText(dates.latest)},'MU','90-95','120');
  `);
}
test.beforeEach(async ({ request }, info) => { if (info.title.startsWith('US3')) await seedUs3(request); });
test.afterEach(async ({}, info) => {
  if (info.title.startsWith('US3')) executeLocalSql(`
    DELETE FROM daily_review_symbol_levels WHERE archive_date=${sqlText(dates.latest)};
    DELETE FROM stock_raw WHERE k_date=${sqlText(dates.empty)} AND symbol IN ('SOXX','GSPC');
    DELETE FROM account_live_action_plans WHERE account_id=3 AND symbol='SOXX';
    DELETE FROM daily_review_action_plans WHERE archive_date=${sqlText(dates.latest)} AND account_id=3 AND symbol='SOXX';
  `);
});
async function openUs3(page) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  return openEmpty(page);
}
async function marketRow(page, symbol) {
  if (await page.locator('#reviewStepNav').isVisible()) await page.locator('#reviewStepNav').getByRole('button', { name: /市场与板块/ }).click();
  else await page.locator('#reviewOutline').getByRole('button', { name: '市场与板块', exact: true }).click();
  await page.locator('#marketReviewRows tr').filter({ has: page.locator('.action-plan-symbol', { hasText: new RegExp(`^${symbol}$`) }) }).click();
}
async function openPlan(page, account, symbol, live = false) {
  if (!live) {
    if (await page.locator('#reviewStepNav').isVisible()) await page.locator('#reviewStepNav').getByRole('button', { name: /操作计划/ }).click();
    else await page.locator('#reviewOutline').getByRole('button', { name: '个股操作', exact: true }).click();
  }
  await planRows(page, account, symbol, live).click();
  await expect(page.locator('#actionPlanDetailModal')).toBeVisible();
}
async function saveUs3(page, status = 200) {
  const pending = page.waitForResponse(r => r.url().endsWith(`/api/reviews/${dates.empty}`) && r.request().method() === 'POST');
  await page.locator('#saveDraftBtn').click();
  const response = await pending; expect(response.status()).toBe(status);
  return response;
}
const independentFields = 'account_id,symbol,action_type,current_position,position_amount,entry_plan,take_profit_plan,stop_loss_plan,thinking,key_levels,support_levels,resistance_levels,market_type';
const dailyEvidence = () => queryLocalSql(`SELECT ${independentFields} FROM daily_review_action_plans WHERE archive_date=${sqlText(dates.empty)} ORDER BY account_id,symbol`);
const liveEvidence = () => queryLocalSql(`SELECT ${independentFields} FROM account_live_action_plans ORDER BY account_id,symbol`);
const levelEvidence = date => queryLocalSql(`SELECT symbol,support_levels,resistance_levels FROM daily_review_symbol_levels WHERE archive_date=${sqlText(date)} ORDER BY symbol`);
async function bootstrapUs3(request) { return (await request.get(`${base}/api/reviews/${dates.empty}/bootstrap`)).json(); }
async function newPlan(page, account, symbol, live = false) {
  if (!live) await page.locator('#reviewStepNav').getByRole('button', { name: /操作计划/ }).click();
  await page.locator(`${live ? '#accountLivePlans' : '#actionPlanAccountGroups'} [data-account-id="${account}"] [data-action="add-plan"]`).click();
  await page.locator('#actionPlanSymbolPickerTrigger').click();
  await page.locator('#actionPlanSymbolSearchInput').fill(symbol);
  await page.locator(`[data-symbol-picker-value="${symbol}"]`).click();
}

for (const width of [1440, 1920]) test(`US3 desktop ${width}: bidirectional shared prices, raw text, response projection and historical isolation`, async ({ page, request }) => {
  const before = dailyEvidence(), liveBefore = liveEvidence(), latestBefore = levelEvidence(dates.latest);
  const runtime = await openUs3(page); await page.setViewportSize({ width, height: width === 1440 ? 1000 : 1080 });
  await marketRow(page, 'SOXX');
  await expect(page.locator('textarea[data-market-kind="support"]')).toHaveValue(us3Support);
  await expect(page.locator('#marketSharedLevelsHint')).toContainText('老虎-美股');
  await expect(page.locator('#marketSharedLevelsHint')).toContainText('东方财富-国内');
  const support = '  510–520（强）\n  500  ';
  await page.locator('textarea[data-market-kind="support"]').fill(support);
  await page.screenshot({ path: `${reports}us3-market-${width}.png` });
  await closeDetail(page);
  for (const account of [1, 2]) {
    await openPlan(page, account, 'SOXX');
    await expect(page.locator('#actionPlanSupportLevelsInput')).toHaveValue(support);
    await expect(page.locator('#actionPlanSharedLevelsHint')).toContainText('仅价位共用');
    await expect(page.locator('#actionPlanSharedLevelsHint')).toContainText('不是交易');
    await page.locator('#closeActionPlanDetailBtn').click();
  }
  await openPlan(page, 2, 'SOXX');
  const resistance = '  600–610\n  625  ';
  await page.locator('#actionPlanResistanceLevelsInput').fill(resistance);
  await expect(planRows(page, 1, 'SOXX')).toContainText('600–610');
  await page.screenshot({ path: `${reports}us3-plan-${width}.png` });
  const box = await page.locator('#actionPlanDetailModal .action-plan-detail-panel').boundingBox();
  expect(Math.abs(box.x + box.width / 2 - width / 2)).toBeLessThan(2);
  await page.locator('#saveActionPlanDetailBtn').click();
  await marketRow(page, 'SOXX'); await expect(page.locator('textarea[data-market-kind="resistance"]')).toHaveValue(resistance); await closeDetail(page);
  const saved = await saveUs3(page), payload = saved.request().postDataJSON();
  expect(payload.marketReview.levels).toEqual([{ symbol: 'SOXX', supportLevels: support, resistanceLevels: resistance }]);
  for (const plan of payload.actionPlans) { expect(plan).not.toHaveProperty('supportLevels'); expect(plan).not.toHaveProperty('resistanceLevels'); }
  expect(dailyEvidence()).toEqual(before); expect(liveEvidence()).toEqual(liveBefore); expect(levelEvidence(dates.latest)).toEqual(latestBefore);
  const data = await bootstrapUs3(request);
  for (const plan of data.actionPlans.filter(p => p.symbol === 'SOXX')) expect(plan).toMatchObject({ supportLevels: support, resistanceLevels: resistance });
  await saveUs3(page); // success clears dirty, never replays old writes
  const clean = (await saveUs3(page)).request().postDataJSON(); expect(clean.marketReview.levels).toEqual([]);
  await page.locator('#closeDrawerBtn').click(); await openUs3(page); await marketRow(page, 'SOXX');
  await expect(page.locator('textarea[data-market-kind="support"]')).toHaveValue(support); expect(runtime.errors).toEqual([]);
});

test('US3 actual nonempty plan changes supplement GOLD/MU; new market and plan inherit out-of-view shared values', async ({ page, request }) => {
  await openUs3(page);
  await add(page, 'IGV'); await expect(page.locator('textarea[data-market-kind="support"]')).toHaveValue('  out of view 90–95  '); await closeDetail(page);
  await newPlan(page, 1, 'GOLD'); await page.locator('#actionPlanSupportLevelsInput').fill('  3300–3350  '); await page.locator('#saveActionPlanDetailBtn').click();
  await openPlan(page, 1, 'MU'); await page.locator('#actionPlanResistanceLevelsInput').fill('  150–160  '); await page.locator('#saveActionPlanDetailBtn').click();
  await marketRow(page, 'GOLD'); await expect(page.locator('textarea[data-market-kind="support"]')).toHaveValue('  3300–3350  '); await closeDetail(page);
  await marketRow(page, 'MU'); await expect(page.locator('textarea[data-market-kind="resistance"]')).toHaveValue('  150–160  '); await closeDetail(page);
  await newPlan(page, 2, 'IGV'); await expect(page.locator('#actionPlanSupportLevelsInput')).toHaveValue('  out of view 90–95  '); await page.locator('#saveActionPlanDetailBtn').click();
  const payload = (await saveUs3(page)).request().postDataJSON();
  expect(payload.marketReview.levels.map(p => p.symbol)).toEqual(['GOLD', 'MU']);
  expect((await bootstrapUs3(request)).structuredNotes.marketReview.blocks.map(b => b.symbol)).toEqual(['SOXX', 'GSPC', 'IGV', 'GOLD', 'MU']);
});

test('US3 deleting theme and price child never changes levels; save, position, same-value, sort and delete plan never resurrect', async ({ page, request }) => {
  const before = levelEvidence(dates.empty);
  await openUs3(page); await marketRow(page, 'SOXX');
  const id = await page.locator('textarea[data-market-kind="support"]').getAttribute('data-market-child-id');
  page.once('dialog', d => d.accept()); await childAction(page, id, 'delete').click(); await closeDetail(page);
  await marketRow(page, 'GSPC'); await closeDetail(page);
  page.once('dialog', d => d.accept()); await page.locator('#marketDeleteBlockBtn').click();
  await openPlan(page, 1, 'SOXX'); await page.locator('#actionPlanPositionSelect').selectOption('15%-20%');
  await page.locator('#actionPlanSupportLevelsInput').fill(us3Support); await page.locator('#saveActionPlanDetailBtn').click();
  await page.locator('#actionPlanAccountGroups [data-account-id="1"] [data-action="sort-plan"]').click();
  await openPlan(page, 1, 'MU'); await page.locator('#closeActionPlanDetailBtn').click();
  await page.locator('#actionPlanAccountGroups [data-account-id="1"] [data-action="delete-selected"]').click();
  const payload = (await saveUs3(page)).request().postDataJSON(); expect(payload.marketReview.levels).toEqual([]);
  expect(levelEvidence(dates.empty)).toEqual(before);
  const data = await bootstrapUs3(request); expect(data.structuredNotes.marketReview.blocks.map(b => b.symbol)).toEqual(['SOXX']);
  expect(data.structuredNotes.marketReview.blocks[0].children.some(c => c.kind === 'support')).toBe(false);
  await page.locator('#closeDrawerBtn').click(); await openUs3(page); await marketRow(page, 'SOXX');
  await expect(page.locator('textarea[data-market-kind="support"]')).toHaveCount(0);
});

test('US3 clear is authoritative across both accounts after save/reopen despite old raw evidence', async ({ page, request }) => {
  const before = dailyEvidence(); await openUs3(page); await openPlan(page, 1, 'SOXX');
  await page.locator('#actionPlanSupportLevelsInput').fill(''); await page.locator('#actionPlanResistanceLevelsInput').fill(''); await page.locator('#saveActionPlanDetailBtn').click();
  await marketRow(page, 'SOXX'); await expect(page.locator('textarea[data-market-kind="support"]')).toHaveValue(''); await closeDetail(page);
  await saveUs3(page); expect(dailyEvidence()).toEqual(before);
  expect((await bootstrapUs3(request)).symbolLevels.SOXX).toEqual({ supportLevels: '', resistanceLevels: '' });
  await page.locator('#closeDrawerBtn').click(); await openUs3(page);
  for (const account of [1, 2]) { await openPlan(page, account, 'SOXX'); await expect(page.locator('#actionPlanSupportLevelsInput')).toHaveValue(''); await expect(page.locator('#actionPlanResistanceLevelsInput')).toHaveValue(''); await page.locator('#closeActionPlanDetailBtn').click(); }
});

test('US3 reviewed locks prices in both editors, shared account hints stay readable and GETs never write', async ({ page }) => {
  executeLocalSql(`UPDATE daily_review_archive SET review_status='reviewed' WHERE archive_date=${sqlText(dates.empty)}`);
  const before = dailyEvidence(), levels = levelEvidence(dates.empty), writes = [];
  page.on('request', r => { if (r.method() !== 'GET' && !r.url().includes('/account-impact/preview')) writes.push(r.url()); });
  await page.setViewportSize({ width: 1440, height: 1000 }); await openReviewed(page); await marketRow(page, 'SOXX');
  await expect(page.locator('textarea[data-market-kind="support"]')).toBeDisabled(); await closeDetail(page);
  await openPlan(page, 2, 'SOXX'); await expect(page.locator('#actionPlanSupportLevelsInput')).toBeDisabled(); await expect(page.locator('#actionPlanResistanceLevelsInput')).toBeDisabled();
  await expect(page.locator('#actionPlanSharedLevelsHint')).toContainText('老虎-美股'); expect(writes).toEqual([]); expect(dailyEvidence()).toEqual(before); expect(levelEvidence(dates.empty)).toEqual(levels);
});

test('US3 real Worker constraint failure retains dirty review prices and structure for retry', async ({ page }) => {
  const before = levelEvidence(dates.empty); await openUs3(page); await marketRow(page, 'SOXX');
  await page.locator('textarea[data-market-kind="support"]').fill('  retry 515  '); await closeDetail(page);
  executeLocalSql(`CREATE TRIGGER us3_reject_review BEFORE UPDATE ON daily_review_symbol_levels WHEN NEW.archive_date=${sqlText(dates.empty)} BEGIN SELECT RAISE(ABORT,'US3 local failure'); END;`);
  try {
    await saveUs3(page, 500); await expect(page.locator('#reviewFooterMessage')).toContainText('草稿已保留'); expect(levelEvidence(dates.empty)).toEqual(before);
    await openPlan(page, 2, 'SOXX'); await expect(page.locator('#actionPlanSupportLevelsInput')).toHaveValue('  retry 515  '); await page.locator('#closeActionPlanDetailBtn').click();
  } finally { executeLocalSql('DROP TRIGGER IF EXISTS us3_reject_review;'); }
  const payload = (await saveUs3(page)).request().postDataJSON(); expect(payload.marketReview.levels).toEqual([{ symbol: 'SOXX', supportLevels: '  retry 515  ' }]);
});

async function openLiveUs3(page) {
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto(base); await page.locator('[data-view="accounts"]').click();
  await expect(planRows(page, 1, 'SOXX', true)).toBeVisible();
}
async function saveLiveUs3(page, method = 'PUT', status = 200) {
  const pending = page.waitForResponse(r => /\/api\/account-live-action-plans(?:\/\d+)?$/.test(r.url()) && r.request().method() === method);
  await page.locator('#saveActionPlanDetailBtn').click(); const response = await pending; expect(response.status()).toBe(status); return response;
}
test('US3 live real PUT sends only changed price; other account fields/key and unsubmitted shared price remain intact', async ({ page, request }) => {
  const before = liveEvidence(), other = before.find(p => p.account_id === 2 && p.symbol === 'SOXX');
  const levelBefore = levelEvidence(dates.latest).find(p => p.symbol === 'SOXX');
  const shownBefore = (await (await request.get(`${base}/api/account-live-action-plans`)).json()).items.filter(p => p.symbol === 'SOXX');
  expect(shownBefore.length).toBeGreaterThan(1); expect(shownBefore.every(p => p.resistanceLevels === levelBefore.resistance_levels)).toBe(true);
  await openLiveUs3(page); await openPlan(page, 1, 'SOXX', true);
  await expect(page.locator('#actionPlanSupportLevelsInput')).toHaveValue('  D support 505  ');
  await page.locator('#actionPlanSupportLevelsInput').fill('  live changed 520  ');
  await expect(planRows(page, 2, 'SOXX', true)).toContainText('live changed 520');
  const response = await saveLiveUs3(page); expect(response.request().postDataJSON()).toEqual({ supportLevels: '  live changed 520  ' });
  await expect(page.locator('#actionPlanDetailModal')).toBeHidden();
  const current = liveEvidence().find(p => p.account_id === 2 && p.symbol === 'SOXX');
  // With a latest archive day, live price columns are mirrors of that day's authority:
  // the omitted resistance keeps its shared value and stale mirrors are realigned to it.
  const levelAfter = levelEvidence(dates.latest).find(p => p.symbol === 'SOXX');
  expect(levelAfter).toEqual({ ...levelBefore, support_levels: '  live changed 520  ' });
  const { support_levels: oldSupport, resistance_levels: oldResistance, ...otherRest } = other;
  const { support_levels: newSupport, resistance_levels: newResistance, ...currentRest } = current;
  expect(newSupport).toBe('  live changed 520  '); expect(newResistance).toBe(levelBefore.resistance_levels); expect(currentRest).toEqual(otherRest);
  const shownAfter = (await (await request.get(`${base}/api/account-live-action-plans`)).json()).items.filter(p => p.symbol === 'SOXX');
  expect(shownAfter.every(p => p.supportLevels === '  live changed 520  ')).toBe(true);
  expect(shownAfter.map(p => [p.id, p.resistanceLevels])).toEqual(shownBefore.map(p => [p.id, p.resistanceLevels]));
});

test('US3 live sorting PUT contains only sortOrder, position PUT only changed position and neither revives themes', async ({ page, request }) => {
  executeLocalSql(`UPDATE daily_review_archive SET market_review_json='{"version":1,"blocks":[],"conflicts":[]}' WHERE archive_date=${sqlText(dates.latest)}`);
  const levels = levelEvidence(dates.latest);
  const nonprice = () => queryLocalSql('SELECT account_id,symbol,action_type,position_amount,entry_plan,take_profit_plan,stop_loss_plan,thinking,key_levels FROM account_live_action_plans ORDER BY account_id,symbol');
  const before = nonprice(); await openLiveUs3(page);
  const puts = []; page.on('request', r => { if (r.method() === 'PUT' && r.url().includes('/api/account-live-action-plans/')) puts.push(r); });
  const refreshed = page.waitForResponse(r => r.url().endsWith('/api/account-live-action-plans') && r.request().method() === 'GET');
  await page.locator('#accountLivePlans [data-account-id="1"] [data-action="sort-plan"]').click(); await refreshed;
  expect(puts.length).toBeGreaterThan(0); for (const put of puts) expect(Object.keys(put.postDataJSON())).toEqual(['sortOrder']);
  await openPlan(page, 1, 'SOXX', true); await page.locator('#actionPlanPositionSelect').selectOption('20%-25%');
  expect((await saveLiveUs3(page)).request().postDataJSON()).toEqual({ currentPosition: '20%-25%' });
  expect(nonprice()).toEqual(before); expect(levelEvidence(dates.latest)).toEqual(levels);
  expect((await (await request.get(`${base}/api/reviews/${dates.latest}/bootstrap`)).json()).structuredNotes.marketReview.blocks).toEqual([]);
});

test('US3 live real failure retains shared draft and unchanged persistent baseline until retry', async ({ page }) => {
  await openLiveUs3(page); await openPlan(page, 1, 'SOXX', true); await page.locator('#actionPlanResistanceLevelsInput').fill('  retry live 600  ');
  const before = liveEvidence(), levels = levelEvidence(dates.latest);
  executeLocalSql("CREATE TRIGGER us3_reject_live BEFORE UPDATE ON account_live_action_plans WHEN NEW.symbol='SOXX' BEGIN SELECT RAISE(ABORT,'US3 local live failure'); END;");
  try {
    page.once('dialog', d => d.accept()); const rejected = await saveLiveUs3(page, 'PUT', 500); expect(rejected.request().postDataJSON()).toEqual({ resistanceLevels: '  retry live 600  ' });
    await expect(page.locator('#actionPlanDetailModal')).toBeVisible(); await expect(page.locator('#actionPlanResistanceLevelsInput')).toHaveValue('  retry live 600  ');
    expect(liveEvidence()).toEqual(before); expect(levelEvidence(dates.latest)).toEqual(levels);
  } finally { executeLocalSql('DROP TRIGGER IF EXISTS us3_reject_live;'); }
  expect((await saveLiveUs3(page)).request().postDataJSON()).toEqual({ resistanceLevels: '  retry live 600  ' });
});

test('US3 live new account plan omits unchanged inherited shared prices and does not revive removed theme', async ({ page, request }) => {
  executeLocalSql(`UPDATE daily_review_archive SET market_review_json='{"version":1,"blocks":[],"conflicts":[]}' WHERE archive_date=${sqlText(dates.latest)}`);
  await openLiveUs3(page); await newPlan(page, 3, 'SOXX', true); await expect(page.locator('#actionPlanSupportLevelsInput')).toHaveValue('  D support 505  ');
  const payload = (await saveLiveUs3(page, 'POST')).request().postDataJSON(); expect(payload).not.toHaveProperty('supportLevels'); expect(payload).not.toHaveProperty('resistanceLevels');
  const data = await (await request.get(`${base}/api/reviews/${dates.latest}/bootstrap`)).json(); expect(data.structuredNotes.marketReview.blocks).toEqual([]);
  expect(data.actionPlans.find(p => p.accountId === 3 && p.symbol === 'SOXX').supportLevels).toBe('  D support 505  ');
});

test('US3 latest market price saves to live projections, historical E stays untouched and account fields remain independent', async ({ page, request }) => {
  const historical = dailyEvidence(), historicalLevels = levelEvidence(dates.empty);
  const nonprice = () => queryLocalSql('SELECT account_id,symbol,action_type,current_position,position_amount,entry_plan,take_profit_plan,stop_loss_plan,thinking,key_levels FROM account_live_action_plans ORDER BY account_id,symbol');
  // Latest review preserves its own daily trading fields when syncing the live set.
  executeLocalSql(`UPDATE daily_review_action_plans SET entry_plan='daily D record '||account_id,take_profit_plan='daily D profit '||account_id,stop_loss_plan='daily D stop '||account_id,thinking='daily D thought '||account_id WHERE archive_date=${sqlText(dates.latest)}`);
  const dailyBefore = queryLocalSql(`SELECT account_id,symbol,action_type,current_position,position_amount,entry_plan,take_profit_plan,stop_loss_plan,thinking FROM daily_review_action_plans WHERE archive_date=${sqlText(dates.latest)} ORDER BY account_id,symbol`);
  const keysBefore = nonprice().map(p => p.key_levels);
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto(base);
  await page.locator('#filtersForm [name="from"]').fill(dates.latest); await page.locator('#filtersForm [name="to"]').fill(dates.latest); await page.locator('#filtersForm button[type="submit"]').click();
  await page.locator('#reviewsList tr').filter({ hasText: dates.latest }).getByRole('button', { name: /开始复盘|编辑草稿/ }).click();
  await expect(page.locator('#reviewLoadingState')).toBeHidden(); await marketRow(page, 'SOXX');
  await page.locator('textarea[data-market-kind="support"]').fill('  latest market 530  '); await closeDetail(page);
  const pending = page.waitForResponse(r => r.url().endsWith(`/api/reviews/${dates.latest}`) && r.request().method() === 'POST'); await page.locator('#saveDraftBtn').click(); expect((await pending).status()).toBe(200);
  const live = await (await request.get(`${base}/api/account-live-action-plans`)).json(); expect(live.items.filter(p => p.symbol === 'SOXX').every(p => p.supportLevels === '  latest market 530  ')).toBe(true);
  expect(nonprice().map(p => p.key_levels)).toEqual(keysBefore);
  expect(nonprice().map(({ key_levels, ...p }) => p)).toEqual(dailyBefore);
  expect(dailyEvidence()).toEqual(historical); expect(levelEvidence(dates.empty)).toEqual(historicalLevels);
  await page.locator('#closeDrawerBtn').click(); await openLiveUs3(page); await openPlan(page, 2, 'SOXX', true); await expect(page.locator('#actionPlanSupportLevelsInput')).toHaveValue('  latest market 530  ');
});

test('US3 live clear after deleted theme is authoritative on reopen and never supplements structure', async ({ page, request }) => {
  executeLocalSql(`UPDATE daily_review_archive SET market_review_json='{"version":1,"blocks":[],"conflicts":[]}' WHERE archive_date=${sqlText(dates.latest)}`);
  await openLiveUs3(page); await openPlan(page, 1, 'SOXX', true);
  await page.locator('#actionPlanSupportLevelsInput').fill(''); await page.locator('#actionPlanResistanceLevelsInput').fill('');
  expect((await saveLiveUs3(page)).request().postDataJSON()).toEqual({ supportLevels: '', resistanceLevels: '' });
  await page.reload(); await page.locator('[data-view="accounts"]').click(); await expect(planRows(page, 2, 'SOXX', true)).toBeVisible(); await openPlan(page, 2, 'SOXX', true);
  await expect(page.locator('#actionPlanSupportLevelsInput')).toHaveValue(''); await expect(page.locator('#actionPlanResistanceLevelsInput')).toHaveValue('');
  const latest = await (await request.get(`${base}/api/reviews/${dates.latest}/bootstrap`)).json(); expect(latest.structuredNotes.marketReview.blocks).toEqual([]); expect(latest.symbolLevels.SOXX).toEqual({ supportLevels: '', resistanceLevels: '' });
});

// US4 historical notes, inheritance, first-conflict evidence and batch completion.
const fixtureLevelDates = [dates.mixedBaseline, dates.explicitEmptyLevels];
const us4TouchedDates = [dates.empty, dates.mixedTarget, dates.history, dates.latest];
function cleanUs4() {
  const touched = us4TouchedDates.map(sqlText).join(',');
  executeLocalSql(`
    DELETE FROM daily_review_symbol_levels WHERE archive_date NOT IN (${fixtureLevelDates.map(sqlText).join(',')});
    DELETE FROM daily_review_action_plans WHERE archive_date IN (${sqlText(dates.empty)},${sqlText(dates.mixedTarget)});
    DELETE FROM review_account_snapshots WHERE archive_date IN (${touched});
    DELETE FROM daily_review_snapshots WHERE archive_date IN (${touched});
    DELETE FROM daily_review_archive_news WHERE archive_date IN (${sqlText(dates.empty)},${sqlText(dates.mixedTarget)});
  `);
}
test.beforeEach(async ({}, info) => { if (info.title.startsWith('US4')) cleanUs4(); });
test.afterEach(async ({}, info) => { if (info.title.startsWith('US4')) { cleanUs4(); await resetSeed(); } });

async function openDate(page, date, button = /开始复盘|编辑草稿/) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base);
  await page.locator('#filtersForm [name="from"]').fill(date);
  await page.locator('#filtersForm [name="to"]').fill(date);
  await page.locator('#filtersForm button[type="submit"]').click();
  await page.locator('#reviewsList tr').filter({ hasText: date }).getByRole('button', { name: button, exact: typeof button === 'string' }).click();
  await expect(page.locator('#reviewLoadingState')).toBeHidden();
  await expect(page.locator('#reviewDrawer')).toBeVisible();
  if (await page.locator('#reviewStepNav').isVisible()) await page.locator('#reviewStepNav').getByRole('button', { name: /市场与板块/ }).click();
  else await page.locator('#reviewOutline').getByRole('button', { name: '市场与板块', exact: true }).click();
  return errors;
}
const blockRow = (page, id) => page.locator(`#marketReviewRows tr[data-market-block-id="${id}"]`);
async function readBlockDetail(page, id) {
  await blockRow(page, id).click();
  await expect(page.locator('#marketReviewDetail')).toBeVisible();
  const detail = await page.evaluate(() => {
    const inputs = [...document.querySelectorAll('#marketDetailFields textarea')];
    const titles = [...document.querySelectorAll('#marketDetailFields .field-title')].map(el => el.textContent);
    return {
      values: [...inputs.map(input => input.value), ...titles],
      locked: inputs.every(input => input.readOnly || input.disabled),
      origin: document.querySelector('#marketLegacyOrigin').textContent,
      conflicts: [...document.querySelectorAll('#marketLevelConflicts pre')].map(pre => pre.textContent),
      conflictLabels: [...document.querySelectorAll('#marketLevelConflicts .market-conflict-source')].map(span => span.textContent),
      summary: document.querySelector('#marketLevelConflicts summary')?.textContent || '',
    };
  });
  await closeDetail(page);
  return detail;
}
const archiveEvidence = date => queryLocalSql(`SELECT archive_date,review_status,reviewer_news_notes,market_sentiment_blocks_json,sector_rotation_blocks_json,market_review_json FROM daily_review_archive WHERE archive_date=${sqlText(date)}`)[0];
const storedReview = date => JSON.parse(archiveEvidence(date).market_review_json);
const groupLabel = { market: '大盘盘点', rotation: '大宗商品与板块轮动' };

for (const viewport of [{ width: 1440, height: 1000 }, { width: 1920, height: 1080 }]) test(`US4 SM-MR-006 desktop ${viewport.width}: reviewed history keeps every original text read-only with zero writes`, async ({ page, request }) => {
  await page.setViewportSize(viewport);
  const bootstrap = await (await request.get(`${base}/api/reviews/${dates.history}/bootstrap`)).json();
  const before = archiveEvidence(dates.history), plansBefore = queryLocalSql(`SELECT * FROM daily_review_action_plans WHERE archive_date=${sqlText(dates.history)} ORDER BY id`);
  const writes = []; page.on('request', r => { if (r.method() !== 'GET' && !r.url().includes('/account-impact/preview')) writes.push(r.url()); });
  const errors = await openDate(page, dates.history, '查看');
  await expect(page.locator('#marketReviewRows tr')).toHaveCount(bootstrap.structuredNotes.marketReview.blocks.length);
  await expect(page.locator('#marketReviewRows .market-legacy-badge')).toHaveCount(4);
  const planValues = queryLocalSql(`SELECT support_levels FROM daily_review_action_plans WHERE archive_date=${sqlText(dates.history)} AND symbol='SOXX'`).map(p => p.support_levels).filter(Boolean);
  const found = new Set();
  for (const [group, notes] of Object.entries(legacyNotes)) for (const [index, note] of notes.entries()) {
    const projected = bootstrap.structuredNotes.marketReview.blocks.find(b => b.legacyOrigin?.group === group && b.legacyOrigin.index === index);
    expect(projected, `${group}/${index}`).toBeTruthy();
    const detail = await readBlockDetail(page, projected.id);
    expect(detail.locked).toBe(true);
    expect(detail.origin).toContain(`${dates.history} ${groupLabel[group]} 第 ${index + 1} 项「${note.title}」`);
    const visible = [...detail.values, ...detail.conflicts];
    for (const child of note.children) expect(visible, `${note.title} / ${child.title}`).toContain(child.body);
    for (const child of projected.children.filter(c => c.kind === 'custom')) expect(detail.values).toContain(child.title);
    detail.conflicts.forEach(value => found.add(value));
    if (projected.symbol === 'SOXX' && index === 0) {
      expect(detail.summary).toContain('历史价位来源差异 1 项');
      expect(detail.conflictLabels.some(label => label.startsWith('首次采用'))).toBe(true);
      expect(detail.conflictLabels.filter(label => label.startsWith('未采纳'))).toHaveLength(3);
      await blockRow(page, projected.id).click();
      await page.locator('#marketLevelConflicts summary').click();
      await page.screenshot({ path: `${reports}us4-history-conflict-${viewport.width}.png` });
      await closeDetail(page);
    }
  }
  for (const value of planValues) expect([...found]).toContain(value);
  for (const id of ['addMarketBlockBtn', 'marketDeleteBlockBtn']) await expect(page.locator(`#${id}`)).toBeDisabled();
  await page.screenshot({ path: `${reports}us4-history-table-${viewport.width}.png` });
  expect(writes).toEqual([]); expect(errors).toEqual([]);
  expect(archiveEvidence(dates.history)).toEqual(before);
  expect(queryLocalSql(`SELECT * FROM daily_review_action_plans WHERE archive_date=${sqlText(dates.history)} ORDER BY id`)).toEqual(plansBefore);
  expect(levelEvidence(dates.history)).toEqual([]);
});

test('US4 SM-MR-006 legacy blocks: delete preserves stable ids and never changes plans or live state', async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const blocks = (await (await request.get(`${base}/api/reviews/${dates.history}/bootstrap`)).json()).structuredNotes.marketReview.blocks;
  const id = (group, index) => blocks.find(b => b.legacyOrigin?.group === group && b.legacyOrigin.index === index).id;
  const breadth = id('market', 1);
  const planContent = () => queryLocalSql(`SELECT * FROM daily_review_action_plans WHERE archive_date=${sqlText(dates.history)} ORDER BY id`).map(({ updated_at, sort_order, ...plan }) => plan);
  const accountOrder = () => queryLocalSql(`SELECT account_id, group_concat(symbol) symbols FROM (SELECT account_id, symbol FROM daily_review_action_plans WHERE archive_date=${sqlText(dates.history)} ORDER BY account_id, sort_order, id) GROUP BY account_id`);
  const before = archiveEvidence(dates.history), liveBefore = liveEvidence(), plansBefore = planContent(), orderBefore = accountOrder();
  const errors = await openDate(page, dates.history, '查看');
  await page.locator('#initializeBtn').click();
  await blockRow(page, breadth).click(); await closeDetail(page);
  page.once('dialog', dialog => { expect(dialog.message()).toContain('市场广度'); dialog.accept(); });
  await page.locator('#marketDeleteBlockBtn').click();
  await expect(blockRow(page, breadth)).toHaveCount(0);
  const pending = page.waitForResponse(r => r.url().endsWith(`/api/reviews/${dates.history}`) && r.request().method() === 'POST');
  await page.locator('#saveDraftBtn').click(); expect((await pending).status()).toBe(200);
  const stored = storedReview(dates.history);
  expect(stored.blocks.some(b => b.id === breadth)).toBe(false);
  const originalIds = new Set(blocks.map(b => b.id));
  expect(stored.blocks.every(b => originalIds.has(b.id))).toBe(true);
  const after = archiveEvidence(dates.history);
  expect(after.market_sentiment_blocks_json).toBe(before.market_sentiment_blocks_json);
  expect(after.sector_rotation_blocks_json).toBe(before.sector_rotation_blocks_json);
  expect(liveEvidence()).toEqual(liveBefore);
  expect(planContent()).toEqual(plansBefore); expect(accountOrder()).toEqual(orderBefore);
  expect(errors).toEqual([]);
});

for (const viewport of [{ width: 1440, height: 1000 }, { width: 1920, height: 1080 }]) test(`US4 SM-MR-001/007 desktop ${viewport.width}: latest inherited notes, first conflict frozen on save and never re-merged`, async ({ page, request }) => {
  await page.setViewportSize(viewport);
  const bootstrap = await (await request.get(`${base}/api/reviews/${dates.latest}/bootstrap`)).json();
  expect(bootstrap.structuredNotes.marketReview.source).toBe('inherited');
  const initialConflicts = bootstrap.structuredNotes.marketReview.conflicts;
  const soxx = bootstrap.structuredNotes.marketReview.blocks.find(b => b.legacyOrigin?.group === 'rotation' && b.legacyOrigin.index === 0).id;
  const before = archiveEvidence(dates.latest);
  const errors = await openDate(page, dates.latest);
  await expect(page.locator('#reviewStepNav').getByRole('button', { name: /市场与板块/ })).toHaveCount(1);
  await expect(page.locator('.review-step-panel[data-step="rotation"]')).toHaveCount(0);
  await expect(page.locator('#marketReviewTable')).toHaveCount(1);
  await expect(page.locator('#marketReviewRows tr')).toHaveCount(bootstrap.structuredNotes.marketReview.blocks.length);
  // Every row carries a short light bar; only the selected row turns dark blue.
  const markers = await page.locator('#marketReviewRows tr').evaluateAll(rows => rows.map(row => {
    const style = getComputedStyle(row.querySelector('td'), '::before');
    return { selected: row.classList.contains('selected'), color: style.backgroundColor, width: style.width, height: parseFloat(style.height), rowHeight: row.querySelector('td').clientHeight };
  }));
  for (const marker of markers) {
    expect(marker.color).toBe(marker.selected ? 'rgb(37, 99, 235)' : 'rgb(191, 219, 254)');
    expect(marker.width).toBe('3px'); expect(Math.abs(marker.height - (marker.rowHeight - 24))).toBeLessThan(1);
  }
  expect(markers.filter(marker => marker.selected).length).toBeLessThanOrEqual(1);
  await blockRow(page, soxx).click();
  const box = await page.locator('#marketReviewDetail .market-detail-panel').boundingBox();
  expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThan(2);
  await expect(page.locator('#marketLevelConflicts')).toBeVisible();
  await page.locator('#marketLevelConflicts summary').click();
  await page.screenshot({ path: `${reports}us4-latest-conflict-${viewport.width}.png` });
  await closeDetail(page);
  const first = await readBlockDetail(page, soxx);
  expect(first.summary).toContain('历史价位来源差异 2 项');
  expect(first.conflicts).toEqual(expect.arrayContaining(['505-515', '500–510（强）', '480 原第二块，不能合并丢失', '575']));
  expect(first.conflictLabels.filter(label => label.startsWith('当前值（与首次采用一致）'))).toHaveLength(2);
  expect(archiveEvidence(dates.latest)).toEqual(before);
  await saveDate(page, dates.latest);
  const saved = storedReview(dates.latest);
  expect(saved.conflicts).toEqual(initialConflicts);
  expect(saved.blocks.map(b => b.id)).toEqual(bootstrap.structuredNotes.marketReview.blocks.map(b => b.id));
  expect(levelEvidence(dates.latest).find(row => row.symbol === 'SOXX')).toEqual({ symbol: 'SOXX', support_levels: '505-515', resistance_levels: '575' });
  expect(archiveEvidence(dates.latest).market_sentiment_blocks_json).toBe(before.market_sentiment_blocks_json);
  await blockRow(page, soxx).click();
  await page.locator('textarea[data-market-kind="support"]').fill('  530 新值  ');
  await closeDetail(page);
  await saveDate(page, dates.latest);
  expect(storedReview(dates.latest).conflicts).toEqual(initialConflicts);
  expect(levelEvidence(dates.latest).find(row => row.symbol === 'SOXX').support_levels).toBe('  530 新值  ');
  expect(liveEvidence().filter(p => p.symbol === 'SOXX').every(p => p.support_levels === '  530 新值  ')).toBe(true);
  await page.locator('#closeDrawerBtn').click();
  await openDate(page, dates.latest);
  const reopened = await readBlockDetail(page, soxx);
  expect(reopened.values).toContain('  530 新值  ');
  expect(reopened.conflicts).toEqual(expect.arrayContaining(['505-515', '500–510（强）', '  530 新值  ']));
  expect(reopened.conflictLabels.filter(label => label === '当前值')).toHaveLength(1);
  expect(errors).toEqual([]);
});
async function saveDate(page, date) {
  const pending = page.waitForResponse(r => r.url().endsWith(`/api/reviews/${date}`) && r.request().method() === 'POST');
  await page.locator('#saveDraftBtn').click(); expect((await pending).status()).toBe(200);
}

test('US4 first live edit on unmaterialized latest freezes pre-write inherited structure and evidence, then applies the patch', async ({ page, request }) => {
  const bootstrap = await (await request.get(`${base}/api/reviews/${dates.latest}/bootstrap`)).json();
  expect(archiveEvidence(dates.latest).market_review_json).toBeNull();
  await openLiveUs3(page); await openPlan(page, 1, 'SOXX', true);
  await expect(page.locator('#actionPlanSupportLevelsInput')).toHaveValue('505-515');
  await page.locator('#actionPlanSupportLevelsInput').fill('  510 live首次  ');
  expect((await saveLiveUs3(page)).request().postDataJSON()).toEqual({ supportLevels: '  510 live首次  ' });
  const stored = storedReview(dates.latest);
  expect(stored.blocks.map(b => b.id)).toEqual(bootstrap.structuredNotes.marketReview.blocks.map(b => b.id));
  expect(stored.blocks.find(b => b.symbol === 'GSPC').children.find(c => c.kind === 'collar').body).toBe('6900 call / 5800 put');
  expect(stored.conflicts).toEqual(bootstrap.structuredNotes.marketReview.conflicts);
  expect(stored.conflicts.find(c => c.field === 'supportLevels').selectedValue).toBe('505-515');
  const after = await (await request.get(`${base}/api/reviews/${dates.latest}/bootstrap`)).json();
  expect(after.symbolLevels.SOXX.supportLevels).toBe('  510 live首次  ');
  expect(after.structuredNotes.marketReview.source).not.toBe('inherited');
  const errors = await openDate(page, dates.latest);
  const soxx = bootstrap.structuredNotes.marketReview.blocks.find(b => b.legacyOrigin?.group === 'rotation' && b.legacyOrigin.index === 0).id;
  const detail = await readBlockDetail(page, soxx);
  expect(detail.conflicts).toEqual(expect.arrayContaining(['505-515', '  510 live首次  ']));
  expect(detail.conflictLabels).toContain('当前值');
  expect(errors).toEqual([]);
});

async function runBatch(page) {
  await page.goto(base);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '复盘全部待处理', exact: true }).click();
  await expect(page.locator('#batchReviewStatus')).toContainText(/批量复盘完成|失败/, { timeout: 30000 });
  return page.locator('#batchReviewStatus').textContent();
}
const sourceDates = [dates.mixedOlderRotation, dates.mixedBaseline, dates.mixedNewerMarket];

test('US4 IT-MR-002 SM-MR-010 mixed inheritance shows newer market + baseline rotation, batch persists it and reserves latest', async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const bootstrap = await (await request.get(`${base}/api/reviews/${dates.mixedTarget}/bootstrap`)).json();
  const blocks = bootstrap.structuredNotes.marketReview.blocks;
  expect(bootstrap.structuredNotes.marketReview.sourceDates).toEqual([dates.mixedNewerMarket, dates.mixedBaseline]);
  const sourcesBefore = sourceDates.map(archiveEvidence), sourceLevelsBefore = sourceDates.map(levelEvidence), latestBefore = archiveEvidence(dates.latest);
  const writes = []; page.on('request', r => { if (r.method() !== 'GET' && !r.url().includes('/account-impact/preview')) writes.push(r.url()); });
  const errors = await openDate(page, dates.mixedTarget);
  await expect(page.locator('#marketReviewRows .action-plan-symbol')).toHaveText(['GSPC', 'SOXX', 'MU']);
  const gspc = await readBlockDetail(page, blocks[0].id);
  expect(gspc.values).toContain('更晚 market 替换基线 market，保留轮动和 MU');
  expect(gspc.origin).toContain(`${dates.mixedNewerMarket} 大盘盘点 第 1 项「标普500 GSPC 更新判断」`);
  const soxx = await readBlockDetail(page, blocks[1].id);
  expect(soxx.values).toEqual(expect.arrayContaining(['520 新基线支撑', '新基线 SOXX 轮动，不能被基线前内容覆盖']));
  expect((await readBlockDetail(page, blocks[2].id)).values).toContain('无旧来源的新建主题必须保留');
  const pageText = await page.locator('#reviewDrawer').innerText();
  for (const frozen of ['1111 冻结旧值', '222 冻结旧值', '基线大盘思考']) expect(pageText).not.toContain(frozen);
  expect(writes).toEqual([]);
  await page.locator('#closeDrawerBtn').click();
  const status = await runBatch(page);
  expect(status).toContain('批量复盘完成：完成 2 个，跳过 0 个');
  const target = archiveEvidence(dates.mixedTarget);
  expect(target.review_status).toBe('reviewed');
  expect(JSON.parse(target.market_review_json).blocks.map(b => [b.id, b.symbol])).toEqual(blocks.map(b => [b.id, b.symbol]));
  expect(levelEvidence(dates.mixedTarget)).toEqual(expect.arrayContaining([
    { symbol: 'SOXX', support_levels: '520 新基线支撑', resistance_levels: '580 新基线压力' },
    { symbol: 'MU', support_levels: '90-95', resistance_levels: '120' },
  ]));
  expect(sourceDates.map(archiveEvidence)).toEqual(sourcesBefore);
  expect(sourceDates.map(levelEvidence)).toEqual(sourceLevelsBefore);
  expect(archiveEvidence(dates.latest)).toEqual(latestBefore);
  expect(queryLocalSql(`SELECT snapshot_source FROM review_account_snapshots WHERE archive_date=${sqlText(dates.mixedTarget)}`)).toEqual([{ snapshot_source: 'batch_review' }]);
  await openDate(page, dates.mixedTarget, '查看');
  await expect(page.locator('#marketReviewRows .action-plan-symbol')).toHaveText(['GSPC', 'SOXX', 'MU']);
  expect(errors).toEqual([]);
});

test('US4 SM-MR-010 explicitly saved empty market is not refilled by batch completion', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const errors = await openDate(page, dates.mixedTarget);
  for (let i = 0; i < 3; i++) {
    await page.locator('#marketReviewRows tr').first().click(); await closeDetail(page);
    page.once('dialog', dialog => dialog.accept()); await page.locator('#marketDeleteBlockBtn').click();
  }
  await expect(page.locator('#marketReviewRows tr')).toHaveCount(0);
  await saveDate(page, dates.mixedTarget);
  expect(storedReview(dates.mixedTarget).blocks).toEqual([]);
  await page.locator('#closeDrawerBtn').click();
  expect(await runBatch(page)).toContain('批量复盘完成：完成 2 个');
  const target = archiveEvidence(dates.mixedTarget);
  expect(target.review_status).toBe('reviewed'); expect(JSON.parse(target.market_review_json).blocks).toEqual([]);
  await openDate(page, dates.mixedTarget, '查看');
  await expect(page.locator('#marketReviewRows tr')).toHaveCount(0);
  expect(errors).toEqual([]);
});
