import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {localDB} from '../src/local-db.mjs';
import {createState,bookKey} from '../src/engine.mjs';
import worker from '../dist/server/index.js';

test('English Worker preserves historical ledger while translating API, chart and CSV output',async()=>{
 const db=localDB(':memory:',path.resolve('drizzle')),now=Math.floor(Date.now()/60000)*60,key=bookKey('ETH-USDT');
 const s=createState('ETH-USDT',now-3600);s.lastT=now-60;s.finished=true;s.bots[0].qty=1;s.bots[0].entry=2500;
 const reason='短均线向上、动量为正：3× 做多，使用约 50% 保证金 · 行情：Gate';s.bots[0].reason=reason;
 await db.prepare('INSERT INTO arena VALUES (?,?,?,?)').bind(key,0,JSON.stringify(s),'test').run();
 await db.prepare('INSERT INTO trades VALUES (?,?,?,?,?,?,?,?,?,?,?)').bind('english-fixture',key,now-60,'fire','开多',2500,2500,1.75,reason,now,0).run();
 const previousFetch=globalThis.fetch;
 globalThis.fetch=async()=>new Response(JSON.stringify(Array.from({length:120},(_,i)=>[(now-7140+i*60)*1000,'2500','2510','2490','2505','10'])));
 try{
  for(const route of ['/','/app.js','/launch.md','/api/health','/api/strategy','/api/arena','/api/chart','/api/trades.csv','/api/missing','/api/arena?market=UNKNOWN']){
   const response=await worker.fetch(new Request('https://local.test'+route),{DB:db},{}),body=await response.text();
   assert.equal(/\p{Script=Han}/u.test(body),false,'Chinese remains in '+route);
   if(route==='/api/arena'){const data=JSON.parse(body);assert.equal(data.bots[0].name,'Charmander');assert.equal(data.logs[0].action,'Open long');assert.equal(data.positions[0].openedAt,now-60);assert.equal(data.bots[0].equity,s.bots[0].equity);}
   if(route==='/api/chart')assert.equal(JSON.parse(body).trades[0].action,'Open long');
   if(route==='/api/trades.csv')assert.ok(body.includes('Open long')&&body.includes('Source: Gate'));
  }
  const original=await db.prepare('SELECT action,reason FROM trades WHERE id=?').bind('english-fixture').first();assert.equal(original.action,'开多');assert.equal(original.reason,reason);
 }finally{globalThis.fetch=previousFetch;db.close();}
});
