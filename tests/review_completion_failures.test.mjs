import test from 'node:test';
import assert from 'node:assert/strict';
import {createHarness} from './helpers/review-completion-harness.mjs';
import {assertEquivalent,assertConverged} from './helpers/review-completion-compare.mjs';
import {reviewDate,previousDate} from './helpers/review-completion-fixtures.mjs';

// 故障安全以候选自身为准，不再与旧实现的写序列逐条对齐：本轮刻意消除了保存路径上
// 恒空的账户补建写，候选的写事件比旧实现少，二者写序列本就不应再相同。
// 断言的属性：任意写边界失败都返回 500；清除故障后重试成功，最终状态收敛到一次
// 干净完成的终态。批次内「中途失败不留部分写」由 review_completion_atomicity.test.mjs 保证；
// 成功路径与基线的业务等价由 review_completion_contract.test.mjs 保证。
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
// 新闻数超限的路径本轮未改动，仍与基线逐行对齐。
test('existing limit and partial writes preserved {"news":101,"plans":2,"sourceIds":true}',async()=>{
 const fixture={news:101,plans:2,sourceIds:true};
 const a=await createHarness({baseline:true,fixture}),b=await createHarness({fixture});
 try{const ra=await a.complete(),rb=await b.complete();assert.equal(ra.status,500);assertEquivalent(ra,rb);assertEquivalent(a.snapshot(),b.snapshot());}finally{a.close();b.close();}
});

// 计划数过多时，清理旧计划的 DELETE 绑定参数超过 D1 单语句 100 个上限，两端同样失败。
// 但候选把正文与计划写进同一个 batch，50 条一片的分片边界与旧实现不同，残留行数本就不该
// 再与基线逐行对齐。改为校验候选自身的残留是安全的：当日计划只可能是本次提交的子集，
// 历史日计划不受影响，复盘也不会被误标为已完成。
test('existing limit keeps the candidate residue safe {"news":0,"plans":100}',async()=>{
 const fixture={news:0,plans:100};
 const a=await createHarness({baseline:true,fixture}),b=await createHarness({fixture});
 try{
  const ra=await a.complete(),rb=await b.complete();
  assert.equal(rb.status,500);assertEquivalent(ra,rb);
  const submitted=new Set(b.payload.actionPlans.map(plan=>plan.symbol));
  const snapshot=b.snapshot();
  const sameDay=snapshot.daily_review_action_plans.filter(row=>row.archive_date===reviewDate);
  assert.ok(sameDay.length>0);
  assert.ok(sameDay.every(row=>submitted.has(row.symbol)),'当日残留计划必须都来自本次提交');
  assert.equal(snapshot.daily_review_action_plans.filter(row=>row.archive_date===previousDate).length,fixture.plans);
  assert.notEqual(snapshot.daily_review_archive.find(row=>row.archive_date===reviewDate).review_status,'reviewed');
 }finally{a.close();b.close();}
});
