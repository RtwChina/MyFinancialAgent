import test from 'node:test';
import assert from 'node:assert/strict';
import {createHarness} from './helpers/review-completion-harness.mjs';
import {assertEquivalent,assertConverged} from './helpers/review-completion-compare.mjs';

// 写入合批后，批次内失败整体回滚，落库状态不再逐条对齐基线。
// 这里不放宽成「随便什么状态都行」，而是精确断言：候选状态 == 基线执行到该批次开始前的状态。
async function assertRollbackMatchesBaselineCut(fixture,candidate,baseline){
 const rolled=candidate.rolledBack();
 if(!rolled.length){assertEquivalent(baseline.snapshot(),candidate.snapshot());return;}
 const cut=await createHarness({baseline:true,fixture,failure:{key:rolled[0],when:'before'}});
 try{
  assert.equal((await cut.complete()).status,500);
  assertEquivalent(cut.snapshot(),candidate.snapshot());
 }finally{cut.close();}
}

test('each committed-write boundary and retry agrees with baseline',async()=>{
 const fixture={news:3,plans:3};const oracle=await createHarness({baseline:true,fixture});await oracle.complete();
 const keys=oracle.events.map(x=>x.key);oracle.close();
 for(const key of keys)for(const when of ['before','after']){
  const a=await createHarness({baseline:true,fixture,failure:{key,when}}),b=await createHarness({fixture,failure:{key,when}});
  try{
   const ra=await a.complete(),rb=await b.complete();assert.equal(ra.status,500,`${when} ${key}`);assertEquivalent(ra,rb);
   await assertRollbackMatchesBaselineCut(fixture,b,a);
   assert.deepEqual(a.events.map(x=>x.key),b.events.map(x=>x.key));
   a.clearFailure();b.clearFailure();assertEquivalent(await a.complete(),await b.complete());assertConverged(a.snapshot(),b.snapshot());
  }finally{a.close();b.close();}
 }
});
for(const fixture of [{news:0,plans:100},{news:101,plans:2,sourceIds:true}])test(`existing limit and partial writes preserved ${JSON.stringify(fixture)}`,async()=>{
 const a=await createHarness({baseline:true,fixture}),b=await createHarness({fixture});try{const ra=await a.complete(),rb=await b.complete();assert.equal(ra.status,500);assertEquivalent(ra,rb);assertEquivalent(a.snapshot(),b.snapshot());}finally{a.close();b.close();}
});
