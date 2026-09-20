import {test,expect} from '@playwright/test';
import {mountReview} from '../helpers/review-completion-browser.mjs';
if(process.env.PLAYWRIGHT_EXECUTABLE_PATH)test.use({launchOptions:{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}});
for(const failSave of [true,false])test(failSave?'save failure does not complete':'completion failure restores saved draft and retries',async({page})=>{
 const f=await mountReview(page,{failSave,failComplete:!failSave});
 try{
  const error=page.waitForEvent('pageerror');await page.getByRole('button',{name:'完成复盘',exact:true}).click();await error;
  await expect(page.locator('#reviewDrawer')).toBeVisible();
  expect(f.h.snapshot().daily_review_archive.find(x=>x.archive_date==='2026-09-16').review_status).not.toBe('reviewed');
  if(failSave)expect(f.requests.filter(x=>x.path.endsWith('/complete'))).toHaveLength(0);
  else expect(f.requests.filter(x=>x.path==='/api/reviews')).toHaveLength(1);
  f.allowRequests();await page.getByRole('button',{name:'完成复盘',exact:true}).click();await expect(page.locator('#reviewDrawer')).toBeHidden();
 }finally{f.h.close();}
});
test('list refresh failure after completion does not undo persisted completion',async({page})=>{
 const f=await mountReview(page);try{
  await page.route('http://review.test/api/reviews?*',r=>r.fulfill({status:500,contentType:'application/json',body:'{"error":"list unavailable"}'}));
  await page.getByRole('button',{name:'完成复盘',exact:true}).click();await expect(page.locator('#reviewDrawer')).toBeHidden();
  expect(f.h.snapshot().daily_review_archive.find(x=>x.archive_date==='2026-09-16').review_status).toBe('reviewed');
  await expect(page.locator('#reviewsList')).toContainText('查询失败');
 }finally{f.h.close();}
});

test('completion shows progress until the refreshed list is visible',async({page})=>{
 const f=await mountReview(page);let releaseRefresh;
 try{
  const refreshGate=new Promise(resolve=>{releaseRefresh=resolve;});
  await page.route('http://review.test/api/reviews?*',async route=>{await refreshGate;await route.fallback();});
  const completion=page.getByRole('button',{name:'完成复盘',exact:true}).click();
  await expect(page.locator('#reviewSubmittingState')).toBeVisible();
  await expect(page.locator('#nextStepBtn')).toBeDisabled();
  releaseRefresh();await completion;
  await expect(page.locator('#reviewDrawer')).toBeHidden();
  const refreshedRow=page.locator('#reviewsList tr').filter({hasText:'2026-09-16'});
  await expect(refreshedRow).toBeInViewport();
  expect(f.h.snapshot().daily_review_archive.find(x=>x.archive_date==='2026-09-16').review_status).toBe('reviewed');
 }finally{releaseRefresh?.();f.h.close();}
});

test('action plan save controls stay visible in a long detail form',async({page})=>{
 await page.setViewportSize({width:1280,height:720});
 const f=await mountReview(page);try{
  await page.getByText('4. 操作计划',{exact:true}).click();
  await page.locator('#actionPlanAccountGroups tbody tr').first().click();
  await expect(page.locator('#actionPlanDetailModal')).toBeVisible();
  const buttonBox=await page.locator('#saveActionPlanDetailBtn').boundingBox();
  expect(buttonBox).not.toBeNull();
  expect(buttonBox.y+buttonBox.height).toBeLessThanOrEqual(720);
 }finally{f.h.close();}
});

test('two pages completing the same saved day keep baseline results',async({browser})=>{
 const {assertEquivalent}=await import('../helpers/review-completion-compare.mjs');
 const snapshots=[];
 for(const baseline of [true,false]){
  const context=await browser.newContext();const first=await context.newPage(),second=await context.newPage();let f;
  try{
   f=await mountReview(first,{baseline});await mountReview(second,{baseline,harness:f.h});
   await first.getByRole('button',{name:'完成复盘',exact:true}).click();await expect(first.locator('#reviewDrawer')).toBeHidden();
   await second.getByRole('button',{name:'完成复盘',exact:true}).click();await expect(second.locator('#reviewDrawer')).toBeHidden();
   snapshots.push(f.h.snapshot());
  }finally{await context.close();f?.h.close();}
 }
 assertEquivalent(snapshots[0],snapshots[1]);
});

test('lost completion response preserves baseline persisted state and retry',async({browser})=>{
 const {assertEquivalent}=await import('../helpers/review-completion-compare.mjs');
 const outcomes=[];
 for(const baseline of [true,false]){
  const context=await browser.newContext();const page=await context.newPage();let f;
  try{
   f=await mountReview(page,{baseline});
   const url='http://review.test/api/reviews/2026-09-16/complete';
   await page.route(url,async route=>{
    const result=await f.h.request('/api/reviews/2026-09-16/complete',route.request().postDataJSON());
    expect(result.status).toBe(200);await route.abort('failed');
   });
   const error=page.waitForEvent('pageerror');
   await page.getByRole('button',{name:'完成复盘',exact:true}).click();await error;
   await expect(page.locator('#reviewDrawer')).toBeVisible();
   const beforeRetry=f.h.snapshot();
   expect(beforeRetry.daily_review_archive.find(x=>x.archive_date==='2026-09-16').review_status).toBe('reviewed');
   await page.unroute(url);
   await page.getByRole('button',{name:'完成复盘',exact:true}).click();await expect(page.locator('#reviewDrawer')).toBeHidden();
   outcomes.push({beforeRetry,afterRetry:f.h.snapshot()});
  }finally{await context.close();f?.h.close();}
 }
 assertEquivalent(outcomes[0],outcomes[1]);
});

test('two pages overlap completion at the complete-request barrier',async({browser})=>{
 const {assertConverged}=await import('../helpers/review-completion-compare.mjs');
 const outcomes=[];
 for(const baseline of [true,false]){
  const context=await browser.newContext();const first=await context.newPage(),second=await context.newPage();let f;
  let arrivals=0;let releaseBarrier;const barrier=new Promise(resolve=>{releaseBarrier=resolve;});
  try{
   f=await mountReview(first,{baseline});await mountReview(second,{baseline,harness:f.h});
   const intercept=async route=>{
    arrivals+=1;if(arrivals===2)releaseBarrier();await barrier;
    const result=await f.h.request('/api/reviews/2026-09-16/complete',route.request().postDataJSON());
    await route.fulfill({status:result.status,contentType:'application/json',body:JSON.stringify(result.body)});
   };
   await first.route('http://review.test/api/reviews/2026-09-16/complete',intercept);
   await second.route('http://review.test/api/reviews/2026-09-16/complete',intercept);
   await Promise.all([
    first.getByRole('button',{name:'完成复盘',exact:true}).click(),
    second.getByRole('button',{name:'完成复盘',exact:true}).click(),
   ]);
   await expect(first.locator('#reviewDrawer')).toBeHidden();
   await expect(second.locator('#reviewDrawer')).toBeHidden();
   expect(arrivals).toBe(2);outcomes.push(f.h.snapshot());
  }finally{releaseBarrier?.();await context.close();f?.h.close();}
 }
 assertConverged(outcomes[0],outcomes[1]);
});

test('rapid consecutive completion clicks submit only once',async({page})=>{
 const f=await mountReview(page);try{
  await page.getByRole('button',{name:'完成复盘',exact:true}).dblclick();
  await expect(page.locator('#reviewDrawer')).toBeHidden();
  const businessWrites=f.requests.filter(x=>x.body&&!x.path.endsWith('/account-impact/preview')).map(x=>x.path);
  expect(businessWrites).toEqual(['/api/reviews/2026-09-16','/api/reviews/2026-09-16/complete']);
  expect(f.h.snapshot().daily_review_archive.find(x=>x.archive_date==='2026-09-16').review_status).toBe('reviewed');
 }finally{f.h.close();}
});
