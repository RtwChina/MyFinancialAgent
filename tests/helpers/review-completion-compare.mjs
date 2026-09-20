import assert from 'node:assert/strict';
const timeKeys=new Set(['updated_at','created_at','reviewed_at','archived_at','updatedAt','createdAt','reviewedAt','archivedAt']);
// Fixed seeded timestamps must stay literal; generated times must remain valid.
export function comparable(value,key='') {
 if(Array.isArray(value))return value.map(x=>comparable(x));
 if(value && typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,comparable(v,k)]));
 if(timeKeys.has(key)&&value!=null){assert.match(value,/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/);if(value.startsWith('2026-01-01'))return value;return '<generated-time>';}
 return value;
}
export function assertEquivalent(left,right){assert.deepEqual(comparable(left),comparable(right));}

// 每次完成复盘都会整表重建这三张表，自增 id 在基线自身重复执行时就会推进（1,2,3 → 4,5,6 → 7,8,9），
// 绝对值不是业务内容。用同表内的名次替代，仍能发现行数、相对顺序与重复性异常。
const rebuiltTables=new Set(['daily_review_archive_news','daily_review_action_plans','account_live_action_plans']);
export function canonicalRowIds(snapshot){
 return Object.fromEntries(Object.entries(snapshot).map(([table,rows])=>{
  if(!rebuiltTables.has(table)||!Array.isArray(rows))return [table,rows];
  const rank=new Map([...new Set(rows.map(row=>row.id))].sort((a,b)=>a-b).map((id,index)=>[id,index+1]));
  return [table,rows.map(row=>({...row,id:rank.get(row.id)??row.id}))];
 }));
}
export function assertConverged(left,right){assertEquivalent(canonicalRowIds(left),canonicalRowIds(right));}
