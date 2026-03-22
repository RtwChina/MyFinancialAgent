import { test, expect } from '@playwright/test';

test.describe('导航切换测试', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // 等待页面加载完成
    await page.waitForSelector('.nav-chip.active');
  });

  test('默认显示复盘工作台', async ({ page }) => {
    const reviewsView = page.locator('#reviewsView');
    await expect(reviewsView).toHaveClass(/active/);

    const activeNav = page.locator('.nav-chip.active');
    await expect(activeNav).toHaveAttribute('data-view', 'reviews');
  });

  test('点击"新闻检索"切换到 news 视图', async ({ page }) => {
    await page.click('.nav-chip[data-view="news"]');

    const newsView = page.locator('#newsView');
    await expect(newsView).toHaveClass(/active/);

    const activeNav = page.locator('.nav-chip.active');
    await expect(activeNav).toHaveAttribute('data-view', 'news');
  });

  test('点击"标的管理"切换到 symbols 视图', async ({ page }) => {
    await page.click('.nav-chip[data-view="symbols"]');

    const symbolsView = page.locator('#symbolsView');
    await expect(symbolsView).toHaveClass(/active/);

    const activeNav = page.locator('.nav-chip.active');
    await expect(activeNav).toHaveAttribute('data-view', 'symbols');
  });

  test('点击"关键词管理"切换到 keywords 视图', async ({ page }) => {
    await page.click('.nav-chip[data-view="keywords"]');

    const keywordsView = page.locator('#keywordsView');
    await expect(keywordsView).toHaveClass(/active/);

    const activeNav = page.locator('.nav-chip.active');
    await expect(activeNav).toHaveAttribute('data-view', 'keywords');
  });

  test('点击"ReadMe"切换到 readme 视图', async ({ page }) => {
    await page.click('.nav-chip[data-view="readme"]');

    const readmeView = page.locator('#readmeView');
    await expect(readmeView).toHaveClass(/active/);

    const activeNav = page.locator('.nav-chip.active');
    await expect(activeNav).toHaveAttribute('data-view', 'readme');
  });
});