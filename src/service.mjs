import {english} from './english.mjs';
import {MARKETS,RULES,AGENTS,tick,getArena,decide,fetchCandles,bookKey} from './engine.mjs';
const active=new Map();const failures=new Map();
const chartCache=new Map();
export async function update(db,market){
 if(active.has(market))return active.get(market);
 const task=tick(db,market).then(s=>{failures.delete(market);return s;}).catch(e=>{failures.set(market,e.message);}).finally(()=>active.delete(market));active.set(market,task);return task;
}
const reply=(data,status=200)=>new Response(JSON.stringify(english(data)),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export async function api(request,env,mode='访问驱动，断线自动补算'){
 const url=new URL(request.url);if(!url.pathname.startsWith('/api/'))return null;
 if(request.method!=='GET')return reply({error:'只读接口'},405);
 if(url.pathname==='/api/health')return reply({project:'TRIMON',version:RULES.version,execution:mode,persistence:env.DB?'available':'unavailable',rules:RULES,agents:AGENTS});
 if(url.pathname==='/api/strategy')return reply({rules:RULES,code:decide.toString()});
 const market=url.searchParams.get('market')||'ETH-USDT';if(!MARKETS.includes(market))return reply({error:'不支持的市场'},400);
 try{
  if(url.pathname==='/api/chart'){
   const now=Date.now()/1000,end=Math.floor(now/60)*60+60,start=end-120*60;
   let cached=chartCache.get(market);
   if(!cached||now-cached.at>8){const data=await fetchCandles(market,start,end);const bars=data.filter(c=>c.slice(0,5).every(Number.isFinite)&&c.slice(1,5).every(p=>p>0)&&c[0]<now).sort((a,b)=>a[0]-b[0]);if(!bars.length)throw Error('暂无行情');cached={at:now,bars,source:data.source};chartCache.set(market,cached);}
   const rows=await env.DB.prepare('SELECT * FROM trades WHERE market=? AND t>=? ORDER BY t,id LIMIT 1500').bind(bookKey(market),cached.bars[0][0]).all();
   const positions=await Promise.all(AGENTS.map(async a=>{const last=await env.DB.prepare("SELECT price,t FROM trades WHERE market=? AND agent=? AND action IN ('开多','开空') ORDER BY t DESC,id DESC LIMIT 1").bind(bookKey(market),a.id).first();return {agent:a.id,lastBuy:last};}));
   return reply({market,source:cached.source,bars:cached.bars,trades:rows.results,positions,fetchedAt:cached.at,lastPrice:cached.bars.at(-1)[4],lastBarOpen:cached.bars.at(-1)[0],interval:60});
  }
  if(url.pathname==='/api/arena'){
   await update(env.DB,market);const data=await getArena(env.DB,market);return reply({...data,execution:mode,error:failures.get(market)||null});
  }
  if(url.pathname==='/api/trades.csv'){
   const rows=await env.DB.prepare('SELECT * FROM trades WHERE market=? ORDER BY t DESC,id DESC LIMIT 1000').bind(bookKey(market)).all();
   const escape=v=>'"'+String(english(v)).replaceAll('"','""')+'"';
   const lines=[['id','market','market_time_utc','recorded_at_utc','agent','action','reference_price_usdt','notional_usdt','fee_and_slippage_usdt','reason','catchup'],...rows.results.map(t=>[t.id,t.market,new Date(t.t*1000).toISOString(),new Date(t.recorded_at*1000).toISOString(),t.agent,t.action,t.price,t.amount,t.cost,t.reason,t.catchup])];
   return new Response('\ufeff'+lines.map(row=>row.map(escape).join(',')).join('\r\n'),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="TRIMON-'+market+'-latest-1000.csv"','Cache-Control':'no-store'}});
  }
  return reply({error:'接口不存在'},404);
 }catch(e){console.error('TRIMON API',e.message);return reply({error:'比赛服务暂不可用；已有记录不会被重置。'},503);}
}

