import test from 'node:test';
import assert from 'node:assert/strict';
import {createHarness} from './helpers/review-completion-harness.mjs';
import {assertEquivalent,assertConverged} from './helpers/review-completion-compare.mjs';

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
for(const fixture of [{news:0,plans:100},{news:101,plans:2,sourceIds:true}])test(`existing limit and partial writes preserved ${JSON.stringify(fixture)}`,async()=>{
 const a=await createHarness({baseline:true,fixture}),b=await createHarness({fixture});try{const ra=await a.complete(),rb=await b.complete();assert.equal(ra.status,500);assertEquivalent(ra,rb);assertEquivalent(a.snapshot(),b.snapshot());}finally{a.close();b.close();}
});
