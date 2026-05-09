import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';

const BASE_URL = 'http://127.0.0.1:8787';

function d1(command) {
  return execFileSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'my-financial-agent', '--local', '--command', command],
    { cwd: `${process.cwd()}/cloudflare`, encoding: 'utf8' },
  );
}

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

test('resolved symbol fills an editable add form before saving', async ({ page }) => {
  let postedPayload = null;
  await page.route('**/api/symbols/resolve', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        resolved: {
          symbol: 'GE',
          yahoo_symbol: 'GE',
          display_name: '通用电气公司',
          symbol_type: 'stock',
          aliases: ['GE', '通用电气公司'],
        },
      }),
    });
  });
  await page.route('**/api/symbols', async (route) => {
    if (route.request().method() === 'POST') {
      postedPayload = route.request().postDataJSON();
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ item: { id: 900001, ...postedPayload } }),
      });
      return;
    }
    await route.continue();
  });

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '标的管理' }).click();
  await page.locator('#symbolResolveInput').fill('GE');
  await page.getByRole('button', { name: '智能解析' }).click();

  const form = page.locator('#symbolManualForm');
  await expect(form).toBeVisible();
  await expect(form.locator('input[name="symbol"]')).toHaveValue('GE');
  await expect(form.locator('input[name="display_name"]')).toHaveValue('通用电气公司');

  await form.locator('input[name="symbol"]').fill('GE.N');
  await form.locator('input[name="display_name"]').fill('GE 航空测试');
  await form.locator('input[name="aliases"]').fill('GE, GE Aerospace, 通用电气');
  await form.getByRole('button', { name: '确认添加' }).click();

  expect(postedPayload).toMatchObject({
    symbol: 'GE.N',
    yahoo_symbol: 'GE',
    display_name: 'GE 航空测试',
    symbol_type: 'stock',
    aliases: ['GE', 'GE Aerospace', '通用电气'],
  });
});

test('hidden symbol can be permanently deleted', async ({ page }) => {
  const tempSymbol = `TDEL${Date.now().toString().slice(-6)}`;
  d1(`DELETE FROM tracked_symbols WHERE symbol='${tempSymbol}';`);

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '标的管理' }).click();
  await page.getByRole('button', { name: '手动添加' }).click();
  const form = page.locator('#symbolManualForm');
  await form.locator('input[name="symbol"]').fill(tempSymbol);
  await form.locator('input[name="yahoo_symbol"]').fill(tempSymbol);
  await form.locator('input[name="display_name"]').fill('删除测试');
  await form.locator('select[name="symbol_type"]').selectOption('stock');
  await form.locator('input[name="aliases"]').fill(`${tempSymbol}, 删除测试`);
  await form.getByRole('button', { name: '添加标的' }).click();

  const row = page.locator('.symbol-row', { hasText: tempSymbol }).first();
  await expect(row).toBeVisible();
  await expect(row.getByRole('button', { name: '删除' })).toHaveCount(0);

  page.once('dialog', async (dialog) => dialog.accept());
  await row.getByRole('button', { name: '隐藏' }).click();
  await expect(row).toContainText('已隐藏');
  await expect(row.getByRole('button', { name: '删除' })).toBeVisible();

  page.once('dialog', async (dialog) => dialog.accept());
  await row.getByRole('button', { name: '删除' }).click();
  await expect(page.locator('.symbol-row', { hasText: tempSymbol })).toHaveCount(0);

  const output = d1(`SELECT COUNT(*) AS cnt FROM tracked_symbols WHERE symbol='${tempSymbol}';`);
  expect(output).toContain('"cnt": 0');
});

test('symbol visibility badge aligns with display name on one row', async ({ page, request }) => {
  const tempSymbol = `TALIGN${Date.now().toString().slice(-6)}`;
  d1(`DELETE FROM tracked_symbols WHERE symbol='${tempSymbol}';`);
  const created = await request.post(`${BASE_URL}/api/symbols`, {
    data: {
      symbol: tempSymbol,
      yahoo_symbol: tempSymbol,
      display_name: '超威半导体',
      symbol_type: 'stock',
      aliases: [tempSymbol, '超威半导体'],
    },
  });
  expect(created.ok()).toBeTruthy();

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '标的管理' }).click();
  const row = page.locator('.symbol-row', { hasText: tempSymbol }).first();
  await expect(row).toBeVisible();
  const nameBox = await row.locator('.symbol-name-stack strong').boundingBox();
  const badgeBox = await row.locator('.symbol-visibility-badge').boundingBox();
  expect(Math.abs((nameBox.y + nameBox.height / 2) - (badgeBox.y + badgeBox.height / 2))).toBeLessThan(6);

  page.once('dialog', async (dialog) => dialog.accept());
  await row.getByRole('button', { name: '隐藏' }).click();
  page.once('dialog', async (dialog) => dialog.accept());
  await row.getByRole('button', { name: '删除' }).click();
});

test('symbol system code can be renamed and related records migrate', async ({ page, request }) => {
  const suffix = Date.now().toString().slice(-6);
  const oldSymbol = `REN${suffix}`;
  const newSymbol = `RENX${suffix}`;
  const reviewDate = '2026-05-15';
  const cleanupSymbols = `'${oldSymbol}','${newSymbol}'`;

  d1(`DELETE FROM tracked_symbols WHERE symbol IN (${cleanupSymbols});
      DELETE FROM stock_raw WHERE symbol IN (${cleanupSymbols});
      DELETE FROM daily_review_action_plans WHERE symbol IN (${cleanupSymbols});
      DELETE FROM news_raw_data WHERE news_hash IN ('rename-${suffix}', 'rename-arch-${suffix}');
      DELETE FROM daily_review_archive_news WHERE news_hash IN ('rename-${suffix}', 'rename-arch-${suffix}');`);

  const created = await request.post(`${BASE_URL}/api/symbols`, {
    data: {
      symbol: oldSymbol,
      yahoo_symbol: oldSymbol,
      display_name: '重命名测试',
      symbol_type: 'stock',
      aliases: [oldSymbol, '重命名测试'],
    },
  });
  expect(created.ok()).toBeTruthy();
  const createdJson = await created.json();
  const symbolId = createdJson.item.id;

  d1(`INSERT INTO stock_raw (k_date, stock_name, symbol, yahoo_symbol, current_price, change_percent, volume, captured_at)
        VALUES ('${reviewDate}', '重命名测试', '${oldSymbol}', '${oldSymbol}', 12.3, 1.2, 100, datetime('now'));
      INSERT INTO daily_review_action_plans (archive_date, symbol, action_type, current_position, sort_order)
        VALUES ('${reviewDate}', '${oldSymbol}', '持仓观察', '0-5%', 0);
      INSERT INTO news_raw_data (pub_date, title, content, url, source, type, related_symbols, news_hash, captured_at)
        VALUES (datetime('now'), 'rename raw', '', 'https://example.com/${suffix}', 'test', 'stock', '["${oldSymbol}","KEEP"]', 'rename-${suffix}', datetime('now'));
      INSERT INTO daily_review_archive_news (archive_date, original_news_id, title, related_symbols, news_hash)
        VALUES ('${reviewDate}', 0, 'rename archive', '["${oldSymbol}","KEEP"]', 'rename-arch-${suffix}');`);

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '标的管理' }).click();
  const row = page.locator('.symbol-row', { hasText: oldSymbol }).first();
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: '编辑' }).click();
  const form = page.locator('#symbolManualForm');
  await expect(form).toBeVisible();
  await expect(form.locator('input[name="symbol"]')).not.toHaveAttribute('readonly', '');
  await form.locator('input[name="symbol"]').fill(newSymbol);
  await form.locator('input[name="display_name"]').fill('重命名测试新');
  await form.getByRole('button', { name: '保存修改' }).click();

  const updatedRow = page.locator('.symbol-row', { hasText: newSymbol }).first();
  await expect(updatedRow).toBeVisible();
  await expect(updatedRow).toContainText('重命名测试新');

  const queryOutput = d1(`SELECT 'stock' AS kind, symbol AS value FROM stock_raw WHERE k_date='${reviewDate}' AND symbol='${newSymbol}'
      UNION ALL SELECT 'plan', symbol FROM daily_review_action_plans WHERE archive_date='${reviewDate}' AND symbol='${newSymbol}'
      UNION ALL SELECT 'raw', related_symbols FROM news_raw_data WHERE news_hash='rename-${suffix}'
      UNION ALL SELECT 'archive', related_symbols FROM daily_review_archive_news WHERE news_hash='rename-arch-${suffix}'
      UNION ALL SELECT 'aliases', aliases FROM tracked_symbols WHERE id=${symbolId};`);
  expect(queryOutput).toContain(newSymbol);
  expect(queryOutput).toContain('KEEP');
  expect(queryOutput).toContain(oldSymbol);
  expect(queryOutput).not.toContain(`"value": "${oldSymbol}"`);

  d1(`DELETE FROM tracked_symbols WHERE symbol IN (${cleanupSymbols});
      DELETE FROM stock_raw WHERE symbol IN (${cleanupSymbols});
      DELETE FROM daily_review_action_plans WHERE symbol IN (${cleanupSymbols});
      DELETE FROM news_raw_data WHERE news_hash IN ('rename-${suffix}', 'rename-arch-${suffix}');
      DELETE FROM daily_review_archive_news WHERE news_hash IN ('rename-${suffix}', 'rename-arch-${suffix}');`);
});
