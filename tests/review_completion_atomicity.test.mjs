import test from 'node:test';
import assert from 'node:assert/strict';
import {createHarness} from './helpers/review-completion-harness.mjs';

function archiveNews(harness){
 return harness.sqlite.prepare('SELECT * FROM daily_review_archive_news ORDER BY rowid').all().map(x=>({...x}));
}

function livePlans(harness){
 return harness.sqlite.prepare('SELECT * FROM account_live_action_plans ORDER BY rowid').all().map(x=>({...x}));
}

function nthWriteKey(harness,fragment,position){
 const keys=harness.events.filter(x=>x.write&&x.key.includes(fragment)).map(x=>x.key);
 assert.ok(keys.length>position,`期望至少 ${position+1} 条 ${fragment} 写入，实际 ${keys.length}`);
 return keys[position];
}

// 归档新闻是先整表 DELETE 再逐条 INSERT，中途失败会留下「旧的删光、新的只插一半」的破损态。
// 合批之后 DELETE 与 INSERT 同属一个隐式事务，失败时旧归档必须原样保留。
test('新闻归档批次中途失败时不留下半删半插的破损归档',async()=>{
 const harness=await createHarness({fixture:{news:6,plans:2}});
 try{
  assert.equal((await harness.complete()).status,200);
  const before=archiveNews(harness);
  assert.equal(before.length,6);

  harness.setFailure({key:nthWriteKey(harness,'INSERT INTO daily_review_archive_news',3),when:'before'});
  assert.equal((await harness.complete()).status,500);

  assert.deepEqual(archiveNews(harness),before);
 }finally{harness.close();}
});

// 实时计划的清理 DELETE 排在 UPSERT 之后，中途失败会留下「新计划写了一半、旧计划还没清理」的混合态。
test('实时计划批次中途失败时不留下新旧混合的计划集合',async()=>{
 const harness=await createHarness({fixture:{news:2,plans:6}});
 try{
  assert.equal((await harness.complete()).status,200);
  const before=livePlans(harness);
  assert.equal(before.length,6);

  // 换成条目更少、内容不同的计划集，让尾部清理 DELETE 与 UPSERT 的结果都可观测。
  harness.payload.actionPlans=harness.payload.actionPlans.slice(0,3)
   .map(plan=>({...plan,thinking:'改写后的计划',entryPlan:'改为进场'}));

  harness.setFailure({key:nthWriteKey(harness,'INSERT INTO account_live_action_plans',1),when:'before'});
  assert.equal((await harness.complete()).status,500);

  assert.deepEqual(livePlans(harness),before);
 }finally{harness.close();}
});
