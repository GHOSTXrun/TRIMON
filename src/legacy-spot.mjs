export const MARKETS=['BTC-USDT','ETH-USDT','SOL-USDT'];
export const RULES={version:'TRIMON-0.2.0',capital:10000,fee:.001,slippage:.0005,maxDrawdown:.20,days:30,granularity:60,model:'deterministic-rules'};
export const AGENTS=[{id:'fire',name:'小火龙',type:'激进趋势派',color:'#ff965c'},{id:'grass',name:'妙蛙种子',type:'稳健配置派',color:'#a9ed7a'},{id:'water',name:'杰尼龟',type:'短线战术派',color:'#69cffa'}];
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
export function decide(id,closed,weight){
 const p=closed.slice(-20).map(c=>c[4]);if(p.length<20)throw Error('Warmup requires 20 closed candles');
 const fast=mean(p.slice(-5)),slow=mean(p),last=p.at(-1),momentum=last/p.at(-4)-1,deviation=last/fast-1;
 if(id==='fire')return fast>slow&&momentum>0?{target:.85,reason:'5 分钟均价高于 20 分钟均价，且 3 分钟动量为正，目标仓位 85%'}:{target:0,reason:'趋势条件不满足，退出至现金'};
 if(id==='grass')return {target:fast>slow?.30:.10,reason:fast>slow?'趋势偏强，目标仓位 30%，保留 70% 现金':'趋势偏弱，目标仓位 10%，保留 90% 现金'};
 if(deviation<-.0007)return {target:.55,reason:'低于 5 分钟均价超过 0.07%，目标仓位 55%'};
 if(deviation>.0005||momentum<-.003)return {target:0,reason:'回归目标到达，或下行动量超过 0.30%，退出短线'};
 return {target:weight,reason:'未触发短线条件，维持当前仓位'};
}
export function createState(market,now){
 const start=Math.floor(now/60)*60;
 return {market,rules:RULES,startedAt:start,endsAt:start+RULES.days*86400,lastT:start-60,lastPrice:0,updatedAt:0,baselineQty:0,baselineCash:10000,baselineStarted:false,totalTrades:0,finished:false,bots:AGENTS.map(a=>({...a,cash:10000,qty:0,equity:10000,peak:10000,drawdown:0,trades:0,dead:false,reason:'等待首个完整交易分钟'}))};
}
export function rebalance(state,b,target,p,t,reason,recordedAt,force=false){
 const equity=b.cash+b.qty*p,delta=equity*target-b.qty*p;
 if(!force&&Math.abs(delta)<equity*.025)return null;
 const combined=RULES.fee+RULES.slippage;
 const amount=delta>0?Math.min(delta,b.cash/(1+combined)):Math.max(delta,-b.qty*p);
 if(Math.abs(amount)<.000001)return null;
 const cost=Math.abs(amount)*combined;
 b.qty=Math.max(0,b.qty+amount/p);if(b.qty<1e-10)b.qty=0;b.cash-=amount+cost;if(Math.abs(b.cash)<1e-8)b.cash=0;b.trades++;state.totalTrades++;
 return {id:state.market+':'+t+':'+b.id+':'+b.trades,market:state.market,t,agent:b.id,action:amount>0?'买入':'卖出',price:p,amount:Math.abs(amount),cost,reason,recordedAt,catchup:recordedAt-(t+60)>90?1:0};
}
export function advance(original,raw,now){
 const s=structuredClone(original),trades=[],snapshots=[];
 const candles=[...new Map(raw.filter(c=>Array.isArray(c)&&c.length>=5&&c.slice(0,5).every(Number.isFinite)&&c.slice(1,5).every(p=>p>0)&&c[0]+60<=now).map(c=>[c[0],c])).values()].sort((a,b)=>a[0]-b[0]);
 for(let i=20;i<candles.length;i++){
  const c=candles[i],t=c[0];if(t<=s.lastT||s.finished)continue;
  if(t!==s.lastT+60)break; // Never silently skip a gap or fabricate a candle.
  const closed=candles.slice(i-20,i);if(closed.some((x,j)=>j>0&&x[0]!==closed[j-1][0]+60))break;
  if(!s.baselineStarted){s.baselineQty=10000/(c[3]*(1+RULES.fee+RULES.slippage));s.baselineCash=0;s.baselineStarted=true;}
  for(const b of s.bots){
   if(!b.dead){const equity=b.cash+b.qty*c[3],decision=decide(b.id,closed,b.qty*c[3]/equity);b.reason=decision.reason;const tr=rebalance(s,b,decision.target,c[3],t,decision.reason,now);if(tr)trades.push(tr);}
   b.equity=b.cash+b.qty*c[4];b.peak=Math.max(b.peak,b.equity);b.drawdown=Math.max(b.drawdown,(b.peak-b.equity)/b.peak*100);
   if(!b.dead&&b.drawdown>=20){const tr=rebalance(s,b,0,c[4],t,'分钟收盘回撤达到 20%，强制清仓并淘汰',now,true);if(tr)trades.push(tr);b.dead=true;b.reason='已触发淘汰线；本季不再交易';}
   if(t+60>=s.endsAt){const tr=rebalance(s,b,0,c[4],t,'30 天赛季结束，清仓结算',now,true);if(tr)trades.push(tr);}
   b.equity=b.cash+b.qty*c[4];b.drawdown=Math.max(b.drawdown,(b.peak-b.equity)/b.peak*100);
  }
  if(t+60>=s.endsAt){s.baselineCash=s.baselineQty*c[4]*(1-RULES.fee-RULES.slippage);s.baselineQty=0;s.finished=true;}
  s.lastPrice=c[4];s.lastT=t;s.updatedAt=now;snapshots.push({market:s.market,t:t+60,price:c[4],values:[...s.bots.map(b=>b.equity),s.baselineCash+s.baselineQty*c[4]]});
 }
 return {state:s,trades,snapshots};
}
export async function fetchCandles(market,start,end,fetcher=fetch){
 const u=new URL('https://data-api.binance.vision/api/v3/klines');u.searchParams.set('symbol',market.replace('-',''));u.searchParams.set('interval','1m');u.searchParams.set('startTime',String(Math.floor(start*1000)));u.searchParams.set('endTime',String(Math.floor(end*1000)));u.searchParams.set('limit','1000');
 const res=await fetcher(u,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(12000)});if(!res.ok)throw Error('行情服务返回 '+res.status);const data=await res.json();if(!Array.isArray(data))throw Error('行情格式异常');return data.map(c=>[Number(c[0])/1000,Number(c[3]),Number(c[2]),Number(c[1]),Number(c[4]),Number(c[5])]);
}
export async function ensureArena(db,market,now){
 const state=createState(market,now);await db.prepare('INSERT OR IGNORE INTO arena (market,version,state,write_token) VALUES (?,0,?,?)').bind(market,JSON.stringify(state),'init').run();
 return db.prepare('SELECT version,state FROM arena WHERE market=?').bind(market).first();
}
export async function tick(db,market,now=Date.now()/1000,fetcher=fetch){
 const row=await ensureArena(db,market,now),s=JSON.parse(row.state);
 if(s.finished||s.lastT+120>now)return s;
 const end=Math.min(Math.floor(now/60)*60,s.lastT+60*11,s.endsAt),start=s.lastT-60*20;
 const data=await fetchCandles(market,start,end,fetcher),result=advance(s,data,now);
 if(!result.snapshots.length)throw Error('缺少连续的完整分钟线，已暂停推进');
 const token=crypto.randomUUID();const statements=[db.prepare('UPDATE arena SET state=?,version=version+1,write_token=? WHERE market=? AND version=?').bind(JSON.stringify(result.state),token,market,row.version)];
 for(const p of result.snapshots)statements.push(db.prepare('INSERT OR IGNORE INTO snapshots (market,t,values_json,price) SELECT ?,?,?,? WHERE EXISTS (SELECT 1 FROM arena WHERE market=? AND write_token=?)').bind(market,p.t,JSON.stringify(p.values),p.price,market,token));
 for(const t of result.trades)statements.push(db.prepare('INSERT OR IGNORE INTO trades (id,market,t,agent,action,price,amount,cost,reason,recorded_at,catchup) SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM arena WHERE market=? AND write_token=?)').bind(t.id,market,t.t,t.agent,t.action,t.price,t.amount,t.cost,t.reason,Math.floor(now),t.catchup,market,token));
 await db.batch(statements);return JSON.parse((await db.prepare('SELECT state FROM arena WHERE market=?').bind(market).first()).state);
}
export async function getArena(db,market,now=Date.now()/1000){
 const row=await ensureArena(db,market,now),s=JSON.parse(row.state),stride=Math.max(1,Math.ceil((s.lastT-s.startedAt)/60/600));
 const points=await db.prepare('SELECT t,values_json,price FROM snapshots WHERE market=? AND (t % ?=0 OR t>=?) ORDER BY t LIMIT 1000').bind(market,stride*60,s.lastT-60).all();
 const recent=await db.prepare('SELECT * FROM trades WHERE market=? ORDER BY t DESC,id DESC LIMIT 60').bind(market).all();
 return {...s,serverTime:now,history:[{t:s.startedAt,values:[10000,10000,10000,10000]},...points.results.map(p=>({t:p.t,values:JSON.parse(p.values_json)}))],logs:recent.results.map(t=>({...t,name:AGENTS.find(a=>a.id===t.agent).name,color:AGENTS.find(a=>a.id===t.agent).color,p:t.price,recordedAt:t.recorded_at})),lagSeconds:Math.max(0,now-s.lastT-60),sampleMinutes:stride};
}

