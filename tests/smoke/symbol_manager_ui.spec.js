import { test, expect } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:8787';
test('symbol manager page can add and hide a temporary symbol', async ({ page }) => {
  const tempSymbol = `TSMOKE${Date.now().toString().slice(-6)}`;
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });

  await page.getByRole('button', { name: '标的管理' }).click();
  await expect(page.getByRole('heading', { name: '标的管理' })).toBeVisible();
  await expect(page.locator('#symbolsIndexList')).toBeVisible();
  await expect(page.locator('#symbolsSectorList')).toBeVisible();
  await expect(page.locator('#symbolsStockList')).toBeVisible();

  await page.getByRole('button', { name: '手动添加' }).click();
  const form = page.locator('#symbolManualForm');
  await expect(form).toBeVisible();
  await form.locator('input[name="symbol"]').fill(tempSymbol);
  await form.locator('input[name="yahoo_symbol"]').fill(tempSymbol);
  await form.locator('input[name="display_name"]').fill('测试个股');
  await form.locator('select[name="symbol_type"]').selectOption('stock');
  await form.locator('input[name="aliases"]').fill(`${tempSymbol}, 测试个股`);
  await form.getByRole('button', { name: '添加标的' }).click();

  const row = page.locator('.symbol-row', { hasText: tempSymbol }).first();
  await expect(row).toBeVisible();
  await expect(row).toContainText('测试个股');

  page.once('dialog', async (dialog) => {
    await dialog.accept();
  });
  await row.getByRole('button', { name: '隐藏' }).click();
  await expect(row).toContainText('已隐藏');

  page.once('dialog', async (dialog) => {
    await dialog.accept();
  });
  await row.getByRole('button', { name: '显示' }).click();
  await expect(row).toContainText('显示中');
});
