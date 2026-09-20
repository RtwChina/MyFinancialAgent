import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { seedReview, reviewDate } from './review-completion-fixtures.mjs';
export const root=path.resolve(import.meta.dirname,'../..');
export const baselineRoot=path.join(root,'.tests/review-completion/baseline');
export async function createHarness({ baseline=false, fixture={}, failure=null }={}) {
 const source=baseline?baselineRoot:root;
 const sqlite=new DatabaseSync(':memory:');
 for(const name of fs.readdirSync(path.join(source,'cloudflare/migrations')).filter(x=>x.endsWith('.sql')).sort()) sqlite.exec(fs.readFileSync(path.join(source,'cloudflare/migrations',name),'utf8'));
 const payload=seedReview(sqlite,fixture); const events=[];const counts=new Map();let stage='';let calls=0;let prepares=0;let roundTrips=0;let fault=failure;
 function statement(sql,values=[]) {
  return {sql,values,bind(...args){return statement(sql,args);},
   async run(){roundTrips++;return execute(sql,values,'run');},
   async all(){roundTrips++;return {results:execute(sql,values,'all')};},
   async first(column){roundTrips++;const row=execute(sql,values,'all')[0]||null;return column?row?.[column]??null:row;},
  };
 }
 function execute(sql,values,kind){
  calls++;
  const write=/^\s*(INSERT|UPDATE|DELETE|REPLACE)/i.test(sql);
  const table=sql.match(/(?:INTO|UPDATE|FROM)\s+(\w+)/i)?.[1];
  const signature=`${stage}:${sql.replace(/\s+/g,' ').trim()}`;
  const index=(counts.get(signature)||0)+1;counts.set(signature,index);
  const key=`${signature}:${index}`;
  const event={stage,table,key,values,write};
  if(write){events.push(event);if(fault?.key===key && fault.when==='before')throw new Error('injected write failure');}
  if(values.length>100)throw new Error('D1_ERROR: too many SQL variables');
  const result=kind==='run'?sqlite.prepare(sql).run(...values):sqlite.prepare(sql).all(...values).map(x=>({...x}));
  if(write && fault?.key===key && fault.when==='after')throw new Error('injected response lost');
  return kind==='run'?{success:true,meta:{changes:Number(result.changes),last_row_id:Number(result.lastInsertRowid)}}:result;
 }
 let rolledBack=[];
 const DB={prepare(sql){prepares++;return statement(sql);},async batch(statements){roundTrips++;const mark=events.length;sqlite.exec('SAVEPOINT d1_batch');try{const out=[];for(const s of statements){const rows=execute(s.sql,s.values,'all');out.push({success:true,results:rows});}sqlite.exec('RELEASE d1_batch');return out;}catch(e){sqlite.exec('ROLLBACK TO d1_batch; RELEASE d1_batch');rolledBack=events.slice(mark).map(x=>x.key);throw e;}}};
 const worker=(await import(pathToFileURL(path.join(source,'cloudflare/worker/src/index.js')).href)).default;
 async function request(url,body){stage=url.endsWith('/complete')?'complete':body?'save':'read';const response=await worker.fetch(new Request(`http://localhost${url}`,body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:undefined),{DB,APP_ENV:'test'});return {status:response.status,body:await response.json()};}
 function snapshot(){return Object.fromEntries(sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(({name})=>[name,sqlite.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all().map(x=>({...x}))]));}
 return {sqlite,DB,payload,events,request,snapshot,stats:()=>({calls,prepares,roundTrips}),rolledBack:()=>rolledBack,clearFailure(){fault=null;counts.clear();rolledBack=[];},setFailure(next){fault=next;counts.clear();rolledBack=[];},async complete(body={}){const saved=await request(`/api/reviews/${reviewDate}`,payload);if(saved.status!==200)return saved;return request(`/api/reviews/${reviewDate}/complete`,{accountSnapshot:{accounts:[],notes:''},...body});},close(){sqlite.close();}};
}
