import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8787';
const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH;

if (executablePath) test.use({ launchOptions: { executablePath } });

test('batch review fills historical dates, reserves latest date, and continues after failure', async ({ page }) => {
  const requestedDates = [];
  const dialogs = [];
  const pendingDates = ['2026-05-12', '2026-05-08', '2026-05-11', '2026-05-07'];

  await page.route('**/api/**', (route) => route.fulfill({
    contentType: 'application/json', body: JSON.stringify({ items: [], total: 0 }),
  }));
  await page.route(/\/api\/reviews\/\d{4}-\d{2}-\d{2}\/bootstrap$/, (route) => route.fulfill({
    contentType: 'application/json', body: JSON.stringify({
      latestArchiveDate: '2026-05-12', draft: { review_status: 'initialized' },
      analysis: { daily_major_events: '[大盘] 当天新闻总结' }, news: [],
      structuredNotes: {
        marketSentiment: { blocks: [{ title: '沿用大盘', children: [] }] },
        sectorRotation: { blocks: [{ title: '沿用板块', children: [] }] },
      },
    }),
  }));
  await page.route('**/api/reviews/pending?limit=all', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        latestClosedDate: '2026-05-12',
        latestArchiveDate: '2026-05-12',
        items: pendingDates.map((archiveDate) => ({ archiveDate, reviewStatus: 'initialized' })),
      }),
    });
  });
  await page.route(/\/api\/reviews\/\d{4}-\d{2}-\d{2}\/complete$/, async (route) => {
    const archiveDate = route.request().url().match(/reviews\/(\d{4}-\d{2}-\d{2})\/complete$/)?.[1];
    requestedDates.push(archiveDate);
    expect(route.request().postDataJSON()).toEqual(expect.objectContaining({
      onlyIfPending: true,
      autoFill: expect.objectContaining({
        reviewerNewsNotes: expect.stringContaining('当天新闻总结'),
        marketSentimentBlocks: [expect.objectContaining({ title: '沿用大盘' })],
        sectorRotationBlocks: [expect.objectContaining({ title: '沿用板块' })],
      }),
      completionSource: 'batch',
    }));
    if (archiveDate === '2026-05-07') {
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: '模拟失败' }) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, archiveDate, reviewStatus: 'reviewed' }),
    });
  });
  page.on('dialog', async (dialog) => {
    dialogs.push({ type: dialog.type(), message: dialog.message() });
    await dialog.accept();
  });

  await page.goto(BASE_URL, { waitUntil: 'load' });
  const batchButton = page.getByRole('button', { name: '复盘全部待处理' });
  await expect(batchButton).toBeVisible();
  await batchButton.click();

  await expect(page.locator('#batchReviewStatus')).toContainText('已完成 2 个，跳过 0 个，失败 1 个：2026-05-07');
  await expect(batchButton).toBeEnabled();
  await expect(batchButton).toHaveText('复盘全部待处理');
  expect(requestedDates).toEqual(['2026-05-07', '2026-05-08', '2026-05-11']);
  expect(dialogs[0]).toEqual(expect.objectContaining({ type: 'confirm' }));
  expect(dialogs[0].message).toContain('最新一次（2026-05-12）保留手动复盘');
  expect(dialogs.at(-1)).toEqual(expect.objectContaining({ type: 'alert' }));
});

for (const onlyLatest of [true, false]) {
  test(onlyLatest ? 'only the latest pending date needs no automatic work' : 'a reviewed latest date does not reserve another pending date', async ({ page }) => {
    const completed = [];
    const dates = onlyLatest ? ['2026-05-12'] : ['2026-05-11'];
    await page.route('**/api/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      let result = { items: [], total: 0 };
      if (path.endsWith('/pending')) result = {
        latestArchiveDate: '2026-05-12', latestClosedDate: '2026-05-12',
        items: dates.map((archiveDate) => ({ archiveDate, reviewStatus: 'initialized' })),
      };
      if (path.endsWith('/bootstrap')) result = {
        latestArchiveDate: '2026-05-12', draft: { review_status: 'initialized' },
        news: [], analysis: {}, structuredNotes: {},
      };
      if (path.endsWith('/complete')) {
        completed.push(path);
        result = { ok: true, reviewStatus: 'reviewed' };
      }
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(result) });
    });
    page.on('dialog', (dialog) => dialog.accept());
    await page.goto(BASE_URL, { waitUntil: 'load' });
    await page.getByRole('button', { name: '复盘全部待处理' }).click();
    await expect(page.locator('#batchReviewStatus')).toContainText(
      onlyLatest ? '没有需要自动复盘的历史日期' : '批量复盘完成：完成 1 个',
    );
    expect(completed).toEqual(onlyLatest ? [] : ['/api/reviews/2026-05-11/complete']);
  });
}

test('batch persisted autofill preserves empty notes and continues past a failed earlier day',async({page})=>{
 const {mountReview}=await import('../helpers/review-completion-browser.mjs');
 const f=await mountReview(page,{fixture:{historical:true,news:3,plans:2}});
 try{
  await page.locator('#closeDrawerBtn').click();
  f.h.sqlite.exec("INSERT INTO daily_review_archive (archive_date,review_status) VALUES ('2026-09-13','initialized'),('2026-09-14','initialized'); UPDATE daily_review_archive SET market_sentiment_blocks_json='[]' WHERE archive_date='2026-09-16'");
  await page.route('http://review.test/api/reviews/2026-09-13/complete',r=>r.fulfill({status:500,contentType:'application/json',body:'{"error":"injected failure"}'}));
  await page.getByRole('button',{name:'复盘全部待处理',exact:true}).click();
  await expect(page.locator('#batchReviewStatus')).toContainText('失败 1 个');
  const rows=f.h.snapshot().daily_review_archive;
  expect(rows.find(x=>x.archive_date==='2026-09-17').review_status).toBe('initialized');
  expect(rows.find(x=>x.archive_date==='2026-09-13').review_status).toBe('initialized');
  expect(rows.find(x=>x.archive_date==='2026-09-14').review_status).toBe('reviewed');
  expect(rows.find(x=>x.archive_date==='2026-09-16').market_sentiment_blocks_json).toBe('[]');
  expect(f.h.snapshot().review_account_snapshots.every(x=>x.snapshot_source==='batch_review')).toBe(true);
  expect(f.requests.filter(x=>x.path.endsWith('/complete')).map(x=>x.path)).toEqual(['/api/reviews/2026-09-14/complete','/api/reviews/2026-09-16/complete']);
 }finally{f.h.close();}
});
