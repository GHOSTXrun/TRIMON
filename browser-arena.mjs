import {createState,advance,fetchCandles,decide,RULES,MARKETS,reportRows} from './browser-engine.mjs';
import {english} from './browser-english.mjs';
const memory=new Map(), pending=new Map(), feeds=new Map();
const key=m=>'trimon-browser-v1:'+m;
let storageWarning='';
function load(m){try{const raw=localStorage.getItem(key(m));if(raw){const b=JSON.parse(raw);if(b.state?.market!==m||!Array.isArray(b.trades)||!Array.isArray(b.history))throw Error('Invalid saved ledger');return memory.get(m)?.state.lastT>b.state.lastT?memory.get(m):b;}}catch(e){throw Error('Saved browser ledger cannot be read. Export or clear this site storage to start again.');}return memory.get(m);}
function save(m,b){memory.set(m,b);try{localStorage.setItem(key(m),JSON.stringify(b));storageWarning='';}catch{storageWarning='Browser storage is full or unavailable. Keep this tab open; new records are in memory only.';}}
async function feed(m,start,end){const k=m+':'+start+':'+end,old=feeds.get(k);if(old&&Date.now()-old.at<8000)return old.data;const data=await fetchCandles(m,start,end);feeds.set(k,{at:Date.now(),data});if(feeds.size>12)feeds.delete(feeds.keys().next().value);return data;}
async function update(m){
 if(pending.has(m))return pending.get(m);
 const run=async()=>{const now=Date.now()/1000;let b=load(m),error=null;
 try{if(!b){const end=Math.floor(now/60)*60;const data=await feed(m,end-120*60,end);if(data.length<22)throw Error('Not enough historical candles');b={state:createState(m,data[20][0]),trades:[],history:[]};save(m,b);}
 const s=b.state;
 if(!s.finished&&s.lastT+120<=now){const end=Math.min(Math.floor(now/60)*60,s.lastT+121*60,s.endsAt),data=await feed(m,s.lastT-20*60,end);const result=advance(s,data,now);if(!result.snapshots.length)throw Error('Waiting for consecutive completed market candles');b.state=result.state;b.state.source=data.source;b.trades.push(...result.trades);b.history.push(...result.snapshots);save(m,b);}
 }catch(e){error=english(e.message);if(!b)throw e;}
 return present(b,now,error||storageWarning||null);
 };
 const task=(navigator.locks?navigator.locks.request(key(m),run):run()).finally(()=>pending.delete(m));pending.set(m,task);return task;
}
function present(b,now,error){const s=b.state,today=Math.floor((now+28800)/86400)*86400-28800;
 const positions=s.bots.map(a=>({agent:a.id,openedAt:a.qty?b.trades.findLast(t=>t.agent===a.id&&['开多','开空'].includes(t.action))?.t:null,stop:a.qty?a.entry+(a.peak*.8-a.cash)/a.qty:null,fee:a.fees*5/7,slippage:a.fees*2/7}));
 const reports=[today,today-86400].map(start=>{const end=start+86400,until=Math.min(end,s.lastT+60),label=new Date((start+28800)*1000).toISOString().slice(0,10),before=b.history.findLast(h=>h.t<=start),after=b.history.findLast(h=>h.t>start&&h.t<=until);if(!after)return {label,available:false,reason:'No settled records for this day in this browser.'};const counts=s.bots.map(a=>{const ts=b.trades.filter(t=>t.agent===a.id&&t.t>=start&&t.t<until);return {agent:a.id,n:ts.length,cost:ts.reduce((v,t)=>v+t.cost,0),catchup:ts.filter(t=>t.catchup).length};});return {label,available:true,complete:s.finished||s.lastT+60>=end,asOf:after.t,rows:reportRows(before?.values||[1000,1000,1000],after.values,counts)};});
 return english({...s,positions,reports,history:b.history.slice(-1000),logs:b.trades.slice(-60).reverse().map(t=>({...t,p:t.price,name:s.bots.find(a=>a.id===t.agent).name,color:s.bots.find(a=>a.id===t.agent).color})),serverTime:now,lagSeconds:Math.max(0,now-s.lastT-60),error,execution:'Browser simulation · Local records · Historical catch-up'});
}
export async function arenaRequest(path){const u=new URL(path,location.href),m=u.searchParams.get('market')||'ETH-USDT';if(!MARKETS.includes(m))throw Error('Unsupported market');let result;
 if(u.pathname==='/api/strategy')result={code:english(decide.toString()),rules:english(RULES)};
 else if(u.pathname==='/api/arena')result=await update(m);
 else if(u.pathname==='/api/chart'){const now=Date.now()/1000,end=Math.floor(now/60)*60+60,bars=await feed(m,end-120*60,end),b=load(m);result=english({bars,source:bars.source,lastPrice:bars.at(-1)[4],fetchedAt:now,trades:(b?.trades||[]).filter(t=>t.t>=bars[0][0]),positions:[]});}
 else throw Error('Unknown local request');return new Response(JSON.stringify(result),{headers:{'Content-Type':'application/json'}});
}
export function downloadTrades(m){const b=load(m),rows=[['time_utc','agent','action','reference_price','notional','cost','reason','backfilled'],...(b?.trades||[]).slice(-1000).map(t=>[new Date(t.t*1000).toISOString(),t.agent,english(t.action),t.price,t.amount,t.cost,english(t.reason),t.catchup])];const csv=rows.map(r=>r.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\r\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='TRIMON-browser-'+m+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
