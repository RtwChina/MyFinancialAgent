import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8787';
const SYMBOLS = {
  exact: 'FSUMEX',
  estimated: 'FSUMEST',
  zero: 'FSUMZRO',
  unavailable: 'FSUMNAV',
  cross: 'FSUMCRS',
  ui: 'FSUMUI',
};
const USD_CNY_REFERENCE_RATE = 6.8;

function formatMoneyWan(value, currency) {
  const prefix = currency === 'CNY' ? '¥' : '$';
  return `${prefix}${(Number(value) / 10000).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}万`;
}

test.describe.configure({ mode: 'serial' });

function sqlQuote(value) {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replaceAll("'", "''")}'`;
}

function d1(command) {
  const output = execFileSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'my-financial-agent', '--config', 'wrangler.toml', '--local', '--command', command],
    { cwd: process.cwd(), encoding: 'utf8' },
  );
  const clean = output.replace(/\u001b\[[0-9;]*m/g, '');
  const start = clean.lastIndexOf('\n[');
  const jsonText = start >= 0 ? clean.slice(start + 1) : clean.slice(clean.indexOf('['));
  if (!jsonText.trim().startsWith('[')) return [];
  return JSON.parse(jsonText)[0]?.results || [];
}

async function createAccount(request, name, currency, totalAssets) {
  const response = await request.post(`${BASE_URL}/api/investment-accounts`, {
    data: {
      name,
      broker: 'fund-summary-test',
      accountType: 'stock',
      region: currency === 'USD' ? 'US' : 'CN',
      currency,
      totalAssets,
      enabled: true,
      sortOrder: 9700 + Math.floor(Math.random() * 100),
    },
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()).item;
}

async function createLivePlan(request, account, symbol, data = {}) {
  const response = await request.post(`${BASE_URL}/api/account-live-action-plans`, {
    data: {
      accountId: account.id,
      symbol,
      actionType: '持仓观察',
      currentPosition: '0-5%',
      marketType: account.currency === 'CNY' ? '大A' : '美股',
      ...data,
    },
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()).item;
}

test.afterEach(async ({ request }) => {
  d1(`DELETE FROM account_live_action_plans WHERE symbol IN (${Object.values(SYMBOLS).map(sqlQuote).join(', ')});`);
  const accounts = await (await request.get(`${BASE_URL}/api/investment-accounts`)).json();
  for (const account of accounts.items.filter((item) => String(item.name || '').startsWith('汇总测试-'))) {
    await request.delete(`${BASE_URL}/api/investment-accounts/${account.id}`);
  }
});

test('fund summary groups current live plans by currency and amount source', async ({ request }) => {
  const stamp = Date.now();
  const usd = await createAccount(request, `汇总测试-USD-${stamp}`, 'USD', 32000);
  const cnyA = await createAccount(request, `汇总测试-CNY-A-${stamp}`, 'CNY', 260000);
  const cnyB = await createAccount(request, `汇总测试-CNY-B-${stamp}`, 'CNY', 170000);
  const noAssets = await createAccount(request, `汇总测试-NA-${stamp}`, 'CNY', null);

  await createLivePlan(request, usd, SYMBOLS.exact, {
    currentPosition: '15%-20%',
    positionAmount: 6400,
  });
  await createLivePlan(request, usd, SYMBOLS.estimated, {
    currentPosition: '15%-20%',
  });
  await createLivePlan(request, usd, SYMBOLS.zero, {
    actionType: '准备开仓',
    currentPosition: '0%',
  });
  await createLivePlan(request, noAssets, SYMBOLS.unavailable, {
    currentPosition: '15%-20%',
  });
  await createLivePlan(request, cnyA, SYMBOLS.cross, {
    currentPosition: '10%-15%',
    positionAmount: 26000,
  });
  await createLivePlan(request, cnyB, SYMBOLS.cross, {
    currentPosition: '10%-15%',
  });

  const response = await request.get(`${BASE_URL}/api/account-fund-summary`);
  expect(response.ok()).toBeTruthy();
  const json = await response.json();

  const usdGroup = json.groups.find((group) => group.currency === 'USD');
  expect(usdGroup).toBeTruthy();
  const exact = usdGroup.symbols.find((item) => item.symbol === SYMBOLS.exact);
  const estimated = usdGroup.symbols.find((item) => item.symbol === SYMBOLS.estimated);
  const zero = usdGroup.symbols.find((item) => item.symbol === SYMBOLS.zero);
  expect(exact.totalAmount).toBe(6400);
  expect(exact.currencyAssetPercent).toBeCloseTo((6400 / usdGroup.totalAssets) * 100, 4);
  expect(exact.accountCells[0]).toEqual(expect.objectContaining({
    accountId: usd.id,
    amount: 6400,
    source: 'exact',
  }));
  expect(estimated.totalAmount).toBe(5600);
  expect(estimated.currencyAssetPercent).toBeCloseTo((5600 / usdGroup.totalAssets) * 100, 4);
  expect(estimated.accountCells[0]).toEqual(expect.objectContaining({
    accountId: usd.id,
    amount: 5600,
    source: 'estimated',
    estimateLabel: '15%-20% → 17.5%',
  }));
  expect(zero).toBeUndefined();

  const cnyGroup = json.groups.find((group) => group.currency === 'CNY');
  expect(cnyGroup).toBeTruthy();
  const cross = cnyGroup.symbols.find((item) => item.symbol === SYMBOLS.cross);
  expect(cross.totalAmount).toBe(47250);
  expect(cross.currencyAssetPercent).toBeCloseTo((47250 / cnyGroup.totalAssets) * 100, 4);
  expect(cross.accountCells).toEqual(expect.arrayContaining([
    expect.objectContaining({ accountId: cnyA.id, amount: 26000, accountSharePercent: 10, source: 'exact' }),
    expect.objectContaining({ accountId: cnyB.id, amount: 21250, accountSharePercent: 12.5, source: 'estimated' }),
  ]));

  const unavailable = cnyGroup.symbols.find((item) => item.symbol === SYMBOLS.unavailable);
  expect(unavailable.totalAmount).toBeNull();
  expect(unavailable.accountCells[0]).toEqual(expect.objectContaining({
    accountId: noAssets.id,
    amount: null,
    source: 'unavailable',
  }));
});

test('fund summary UI renders currency sections, account columns, and estimate tooltip', async ({ page, request }) => {
  const stamp = Date.now();
  const usd = await createAccount(request, `汇总测试-UI-USD-${stamp}`, 'USD', 32000);
  await createLivePlan(request, usd, SYMBOLS.ui, {
    currentPosition: '15%-20%',
  });
  await createLivePlan(request, usd, SYMBOLS.exact, {
    currentPosition: '5%-10%',
    positionAmount: 2400,
  });

  await page.goto(BASE_URL, { waitUntil: 'load' });
  await expect(page.locator('.nav-chip[data-view="fundSummary"]')).toHaveCount(0);
  await page.locator('.nav-chip[data-view="accounts"]').click();
  const [summaryPage] = await Promise.all([
    page.waitForEvent('popup'),
    page.locator('#showFundSummaryBtn').click(),
  ]);
  await summaryPage.waitForLoadState('load');
  await expect(page.locator('#accountsView')).toHaveClass(/active/);
  await expect(summaryPage).toHaveURL(/\?view=fundSummary$/);

  const view = summaryPage.locator('#fundSummaryView');
  await expect(view).toHaveClass(/active/);
  await expect(summaryPage.locator('.nav-chip[data-view="accounts"]')).toHaveClass(/active/);
  await expect(view.locator('#backToAccountsBtn')).toHaveCount(0);
  await expect(view).toContainText('资金分布汇总');
  await expect(view).toContainText('USD');
  await expect(view).toContainText(usd.name);
  await expect(view).toContainText(SYMBOLS.ui);
  await expect(view).toContainText('$0.56万');
  const symbolRow = view.locator('.fund-summary-symbol-row', { hasText: SYMBOLS.ui });
  const exactRow = view.locator('.fund-summary-symbol-row', { hasText: SYMBOLS.exact });
  const usdHeaders = await symbolRow.locator('xpath=ancestor::section[1]//thead//th').evaluateAll((headers) => (
    headers.map((header) => header.textContent.trim())
  ));
  expect(usdHeaders[0]).toBe('标的');
  expect(usdHeaders.indexOf(usd.name)).toBeGreaterThan(0);
  expect(usdHeaders.indexOf(usd.name)).toBeLessThan(usdHeaders.indexOf('总金额'));
  expect(usdHeaders.at(-2)).toBe('总金额');
  expect(usdHeaders.at(-1)).toBe('占总资产');
  const uiSummaryResponse = await request.get(`${BASE_URL}/api/account-fund-summary`);
  const uiSummary = await uiSummaryResponse.json();
  const uiUsdGroup = uiSummary.groups.find((group) => group.currency === 'USD');
  const uiSymbol = uiUsdGroup.symbols.find((item) => item.symbol === SYMBOLS.ui);
  const usdSection = view.locator('.fund-summary-section', { hasText: '美元账户' });
  const cnySection = view.locator('.fund-summary-section', { hasText: '人民币账户' });
  await expect(usdSection.locator('.fund-summary-account-strip')).toContainText(usd.name);
  const sectionChildren = await usdSection.locator(':scope > *').evaluateAll((nodes) => (
    nodes.map((node) => node.className)
  ));
  expect(sectionChildren.indexOf('fund-summary-accounts')).toBeGreaterThan(sectionChildren.indexOf('fund-summary-head'));
  expect(sectionChildren.indexOf('fund-summary-accounts')).toBeLessThan(sectionChildren.indexOf('fund-summary-matrix-wrap'));
  const cnyAssetsReference = `(约 ${formatMoneyWan(uiUsdGroup.totalAssets * USD_CNY_REFERENCE_RATE, 'CNY')}，按 6.80)`;
  const cnyPositionReference = `(约 ${formatMoneyWan(uiUsdGroup.positionAmount * USD_CNY_REFERENCE_RATE, 'CNY')}，按 6.80)`;
  const cnyUnallocatedReference = `(约 ${formatMoneyWan(uiUsdGroup.unallocatedAmount * USD_CNY_REFERENCE_RATE, 'CNY')})`;
  const cnyUiSymbolReference = `(约 ${formatMoneyWan(uiSymbol.totalAmount * USD_CNY_REFERENCE_RATE, 'CNY')})`;
  await expect(usdSection).toContainText(cnyAssetsReference.replace('，按 6.80', ''));
  await expect(usdSection).toContainText(cnyPositionReference.replace('，按 6.80', ''));
  await expect(usdSection).toContainText(cnyUnallocatedReference);
  await expect(symbolRow).toContainText(cnyUiSymbolReference);
  const usdAccountCard = usdSection.locator('.fund-summary-account-card', { hasText: usd.name });
  await expect(usdAccountCard).toContainText(`(约 ${formatMoneyWan(usd.totalAssets * USD_CNY_REFERENCE_RATE, 'CNY')})`);
  await expect(usdAccountCard).toContainText(`(约 ${formatMoneyWan(8000 * USD_CNY_REFERENCE_RATE, 'CNY')})`);
  const palette = await usdSection.evaluate((section) => ({
    header: getComputedStyle(section.querySelector('.fund-summary-head')).backgroundColor,
    accountBand: getComputedStyle(section.querySelector('.fund-summary-accounts')).backgroundColor,
    accountCard: getComputedStyle(section.querySelector('.fund-summary-account-card')).backgroundColor,
    accountTrack: getComputedStyle(section.querySelector('.fund-summary-track')).backgroundColor,
    accountFill: getComputedStyle(section.querySelector('.fund-summary-track i')).backgroundColor,
    symbolTrack: getComputedStyle(section.querySelector('.fund-summary-mini-track')).backgroundColor,
    symbolFill: getComputedStyle(section.querySelector('.fund-summary-mini-track i')).backgroundColor,
  }));
  expect(palette.header).toBe('rgb(255, 255, 255)');
  expect(palette.accountBand).toBe('rgb(255, 255, 255)');
  expect(palette.accountCard).toBe('rgb(237, 245, 255)');
  expect(palette.accountTrack).toBe('rgb(237, 226, 205)');
  expect(palette.accountFill).toBe('rgb(176, 122, 26)');
  expect(palette.symbolTrack).toBe('rgb(237, 226, 205)');
  expect(palette.symbolFill).toBe('rgb(176, 122, 26)');
  await expect(usdSection).not.toContainText('，按 6.80)');
  await expect(cnySection).not.toContainText('约 ¥');
  const rateMark = usdSection.locator('.fund-summary-rate-mark');
  await expect(rateMark).toHaveCount(1);
  await rateMark.hover();
  await expect(usdSection.locator('.fund-summary-rate-tooltip')).toContainText('1 USD = 6.80 CNY');
  await expect(symbolRow).toContainText(`${Number(uiSymbol.currencyAssetPercent.toFixed(2))}%`);
  await expect(symbolRow.locator('.fund-summary-estimate-mark')).toHaveCount(1);
  await symbolRow.locator('.fund-summary-estimate-mark').hover();
  await expect(symbolRow.locator('.fund-summary-tooltip')).toContainText('15%-20% → 17.5%');
  await expect(exactRow.locator('.fund-summary-estimate-mark')).toHaveCount(0);
  await expect(exactRow.locator('.fund-summary-mini-track i.exact')).toHaveCount(0);
  await expect(view).not.toContainText('手填金额');
  await expect(view).not.toContainText('备注');
  await expect(view).not.toContainText('来源');

  const layout = await summaryPage.evaluate(() => ({
    bodyOverflow: document.body.scrollWidth > window.innerWidth + 1,
    tableOverflow: [...document.querySelectorAll('.fund-summary-matrix-wrap')]
      .some((el) => el.scrollWidth > el.clientWidth + 1),
  }));
  expect(layout.bodyOverflow).toBeFalsy();
});
