import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createState,getBrief,bookKey} from '../src/engine.mjs';import {localDB} from '../src/local-db.mjs';
test('daily report uses UTC+8 boundaries, saved equity, complete flags and separate costs',async()=>{
 const start=Date.parse('2026-09-19T16:00:00Z')/1000,db=localDB(path.join(fs.mkdtempSync(path.join(os.tmpdir(),'brief-')),'db.sqlite'),path.resolve('drizzle')),s=createState('ETH-USDT',start-3600),key=bookKey(s.market);
 s.lastT=start+60;s.bots[0].qty=1;s.bots[0].entry=100;s.bots[0].cash=1000;s.bots[0].fees=7;
 for(const [t,v] of [[start-60,[990,1000,1000]],[start,[995,1000,1000]],[start+120,[1005,998,1000]]])await db.prepare('INSERT INTO snapshots VALUES (?,?,?,?)').bind(key,t,JSON.stringify(v),100).run();
 await db.prepare('INSERT INTO trades VALUES (?,?,?,?,?,?,?,?,?,?,?)').bind('opening',key,start,'fire','开多',100,100,.07,'test',start+200,1).run();
 const out=await getBrief(db,s,start+150);assert.equal(out.reports[0].label,'2026-09-20');assert.equal(out.reports[0].rows[0].pnl,10);assert.equal(out.reports[0].rows[0].trades,1);assert.equal(out.reports[0].rows[0].catchup,1);assert.equal(out.reports[0].complete,false);assert.equal(out.reports[1].complete,true);assert.equal(out.positions[0].openedAt,start);assert.equal(out.positions[0].fee,5);assert.equal(out.positions[0].slippage,2);
 const lag=await getBrief(db,{...s,lastT:start-120},start+150);assert.equal(lag.reports[0].available,false);db.close();
});
