import test from 'node:test';
import assert from 'node:assert/strict';
import {createHarness} from './helpers/review-completion-harness.mjs';
import {assertConverged} from './helpers/review-completion-compare.mjs';
import {reviewDate,previousDate} from './helpers/review-completion-fixtures.mjs';

// 写事件顺序可变；每个边界失败后的重试必须收敛到同一完整终态。
test('每个写失败点都返回错误且重试后收敛到干净终态',async()=>{
 const fixture={news:3,plans:3};
 const clean=await createHarness({fixture});
 assert.equal((await clean.complete()).status,200);
 const keys=clean.events.map(x=>x.key);const target=clean.snapshot();clean.close();
 for(const key of keys)for(const when of ['before','after']){
  const h=await createHarness({fixture,failure:{key,when}});
  try{
   assert.equal((await h.complete()).status,500,`${when} ${key} 应失败`);
   h.clearFailure();
   assert.equal((await h.complete()).status,200,`${when} ${key} 重试应成功`);
   assertConverged(h.snapshot(),target);
  }finally{h.close();}
 }
});
test('101 个新闻来源 id 保留单语句上限，失败前保存保留但新闻和历史日不变',async()=>{
 const fixture={news:101,plans:2,sourceIds:true};
 const h=await createHarness({fixture});
 try{
  const before=h.snapshot();
  const response=await h.complete();
  assert.equal(response.status,500);
  assert.match(response.body.error,/too many SQL variables/);
  const after=h.snapshot();
  for(const table of ['news_raw_data','daily_review_archive_news','review_account_snapshots','investment_accounts']) assert.deepEqual(after[table],before[table],table);
  assert.deepEqual(after.daily_review_action_plans.filter(row=>row.archive_date===previousDate),before.daily_review_action_plans.filter(row=>row.archive_date===previousDate));
  assert.deepEqual(after.daily_review_archive.filter(row=>row.archive_date===previousDate),before.daily_review_archive.filter(row=>row.archive_date===previousDate));
  assert.equal(after.daily_review_action_plans.filter(row=>row.archive_date===reviewDate).length,fixture.plans);
  const record=after.daily_review_archive.find(row=>row.archive_date===reviewDate);
  assert.equal(record.review_status,'initialized');
  assert.equal(record.reviewed_at,null);
  assert.equal(JSON.parse(record.market_review_json).blocks[0].children[0].body,'维持观察');
 }finally{h.close();}
});

test('100 条计划经集合 SQL 完整保存与完成，不超绑定上限、不影响历史日',async()=>{
 const fixture={news:0,plans:100};
 const h=await createHarness({fixture});
 try{
  const before=h.snapshot();
  const result=await h.complete();
  assert.equal(result.status,200);
  assert.equal(result.body.reviewStatus,'reviewed');
  const snapshot=h.snapshot();
  const sameDay=snapshot.daily_review_action_plans.filter(row=>row.archive_date===reviewDate);
  assert.equal(sameDay.length,fixture.plans);
  assert.deepEqual(sameDay.map(row=>[row.account_id,row.symbol,row.current_position,row.entry_plan,row.thinking]),h.payload.actionPlans.map(plan=>[plan.accountId,plan.symbol,plan.currentPosition,plan.entryPlan,plan.thinking]));
  assert.equal(snapshot.account_live_action_plans.length,fixture.plans);
  assert.deepEqual(snapshot.daily_review_action_plans.filter(row=>row.archive_date===previousDate),before.daily_review_action_plans.filter(row=>row.archive_date===previousDate));
  assert.deepEqual(snapshot.daily_review_archive.filter(row=>row.archive_date===previousDate),before.daily_review_archive.filter(row=>row.archive_date===previousDate));
  assert.equal(snapshot.daily_review_archive.find(row=>row.archive_date===reviewDate).review_status,'reviewed');
  assert.equal(snapshot.review_account_snapshots.filter(row=>row.archive_date===reviewDate).length,1);
  assert.ok(h.events.every(event=>event.values.length<=100));
 }finally{h.close();}
});
