import { test, expect } from '@playwright/test';

test.describe('错误处理测试', () => {
  test('页面加载时环境显示正确', async ({ page }) => {
    await page.goto('/');

    // 等待环境加载
    await page.waitForSelector('#heroEnvironmentText', { timeout: 10000 });

    const envText = await page.locator('#heroEnvironmentText').textContent();
    // 环境文本应该包含"环境"字样或具体环境名
    expect(envText).toBeTruthy();
  });

  test('导航按钮全部可见', async ({ page }) => {
    await page.goto('/');

    const navButtons = await page.locator('.nav-chip').count();
    expect(navButtons).toBe(5); // 5 个导航按钮

    const labels = await page.locator('.nav-chip').allTextContents();
    expect(labels).toContain('复盘工作台');
    expect(labels).toContain('新闻检索');
    expect(labels).toContain('标的管理');
    expect(labels).toContain('关键词管理');
    expect(labels).toContain('ReadMe');
  });

  test('复盘工作台默认显示', async ({ page }) => {
    await page.goto('/');

    // 等待页面加载
    await page.waitForSelector('#reviewsView.active', { timeout: 10000 });

    const activeNav = await page.locator('.nav-chip.active').getAttribute('data-view');
    expect(activeNav).toBe('reviews');
  });

  test('ReadMe 页面渲染 Markdown', async ({ page }) => {
    await page.goto('/');
    await page.click('.nav-chip[data-view="readme"]');
    await page.waitForSelector('#readmeView.active');

    // 等待 ReadMe 内容加载
    await page.waitForSelector('#readmeContent', { timeout: 10000 });

    const content = await page.locator('#readmeContent').innerHTML();
    // 验证有内容渲染
    expect(content.length).toBeGreaterThan(0);
  });

  test('每日一句区域显示', async ({ page }) => {
    await page.goto('/');

    // 等待每日一句加载
    await page.waitForSelector('#dailyInsightSummary', { timeout: 10000 });

    const summary = await page.locator('#dailyInsightSummary').textContent();
    expect(summary).toBeTruthy();
    expect(summary!.length).toBeGreaterThan(0);
  });

  test('点击每日一句可展开详情', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#dailyInsightSummary');

    // 点击每日一句按钮
    await page.click('#dailyInsightToggle');

    // 验证模态框显示
    const modal = page.locator('#dailyInsightModal');
    await expect(modal).not.toHaveClass(/hidden/);

    // 关闭模态框
    await page.click('#closeDailyInsightBtn');
    await expect(modal).toHaveClass(/hidden/);
  });

  test('ESC 键关闭模态框', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#dailyInsightSummary');

    // 打开每日一句模态框
    await page.click('#dailyInsightToggle');
    await page.waitForSelector('#dailyInsightModal:not(.hidden)');

    // 按 ESC 关闭
    await page.keyboard.press('Escape');

    // 验证模态框关闭
    const modal = page.locator('#dailyInsightModal');
    await expect(modal).toHaveClass(/hidden/);
  });
});