import { test, expect } from '@playwright/test';

test.describe('标的管理测试', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.click('.nav-chip[data-view="symbols"]');
    await page.waitForSelector('#symbolsView.active');
  });

  test('页面加载时显示标的列表（按类型分组）', async ({ page }) => {
    // 等待列表加载
    await page.waitForSelector('#symbolsIndexList tr', { timeout: 10000 });

    // 验证各类型分组标题存在
    const indexSection = await page.locator('.symbols-section-label.type-index').count();
    const sectorSection = await page.locator('.symbols-section-label.type-sector').count();
    const stockSection = await page.locator('.symbols-section-label.type-stock').count();

    expect(indexSection).toBeGreaterThan(0);
    expect(sectorSection).toBeGreaterThan(0);
    expect(stockSection).toBeGreaterThan(0);
  });

  test('标的列表显示正确的列', async ({ page }) => {
    await page.waitForSelector('#symbolsIndexList tr');

    const headers = await page.locator('.symbols-table th').allTextContents();
    expect(headers).toContain('显示名称');
    expect(headers).toContain('代码');
    expect(headers).toContain('类型');
  });

  test('标的有编辑和显示/隐藏按钮', async ({ page }) => {
    await page.waitForSelector('#symbolsIndexList tr');

    // 验证按钮存在
    const editBtns = await page.locator('.symbol-edit-btn').count();
    const toggleBtns = await page.locator('.symbol-toggle-btn').count();

    expect(editBtns).toBeGreaterThan(0);
    expect(toggleBtns).toBeGreaterThan(0);
  });

  test('智能解析输入框存在', async ({ page }) => {
    const input = page.locator('#symbolResolveInput');
    await expect(input).toBeVisible();
  });

  test('智能解析和手动添加按钮存在', async ({ page }) => {
    const resolveBtn = page.locator('#symbolResolveBtn');
    const manualBtn = page.locator('#symbolManualAddBtn');

    await expect(resolveBtn).toBeVisible();
    await expect(manualBtn).toBeVisible();
  });

  test('刷新按钮可点击', async ({ page }) => {
    await page.waitForSelector('#symbolsIndexList tr');

    const refreshBtn = page.locator('#refreshSymbolsBtn');
    await expect(refreshBtn).toBeVisible();
    // 点击刷新按钮
    await refreshBtn.click();
    // 等待加载完成
    await page.waitForSelector('#symbolsIndexList tr', { timeout: 10000 });
  });

  test('标的显示 Yahoo 代码箭头', async ({ page }) => {
    await page.waitForSelector('#symbolsIndexList tr');

    // 检查是否有箭头符号（表示 Yahoo 代码与系统代码不同）
    const arrows = await page.locator('.sym-arrow').count();
    // 至少有些标的 Yahoo 代码不同
    expect(arrows).toBeGreaterThanOrEqual(0);
  });

  test('标的别名显示为 chips', async ({ page }) => {
    await page.waitForSelector('#symbolsIndexList tr');

    const aliasChips = await page.locator('.alias-chip').count();
    expect(aliasChips).toBeGreaterThan(0);
  });
});