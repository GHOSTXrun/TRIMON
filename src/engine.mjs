export const MARKETS=['ETH-USDT','BTC-USDT','SOL-USDT'];
export const RULES={version:'TRIMON-PERP-1.0',capital:1000,fee:.0005,slippage:.0002,maxDrawdown:.20,days:30,granularity:60,fundingRate:.0001,fundingPeriod:28800,model:'deterministic-rules',priceSource:'Binance 现货参考行情',fundingModel:'每8小时固定0.01%，多付空收；非交易所实际费率'};
export const AGENTS=[{id:'fire',name:'小火龙',type:'激进趋势派',color:'#ff965c',leverage:3},{id:'grass',name:'妙蛙种子',type:'稳健配置派',color:'#a9ed7a',leverage:1},{id:'water',name:'杰尼龟',type:'短线战术派',color:'#69cffa',leverage:2}];
export const bookKey=market=>'perp-v1:'+market;
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
export function decide(id,closed,weight){
 const p=closed.slice(-20).map(c=>c[4]);if(p.length<20)throw Error('Warmup requires 20 closed candles');
 const fast=mean(p.slice(-5)),slow=mean(p),last=p.at(-1),momentum=last/p.at(-4)-1,deviation=last/fast-1;
 if(id==='fire')return fast>slow&&momentum>0?{target:1.5,reason:'短均线向上、动量为正：3× 做多，使用约 50% 保证金'}:fast<slow&&momentum<0?{target:-1.5,reason:'短均线向下、动量为负：3× 做空，使用约 50% 保证金'}:{target:0,reason:'趋势分歧，平仓等待'};
 if(id==='grass')return Math.abs(fast/slow-1)>.0004?{target:fast>slow?.4:-.4,reason:fast>slow?'趋势确认：1× 做多，使用约 40% 保证金':'趋势确认：1× 做空，使用约 40% 保证金'}:{target:0,reason:'趋势幅度不足 0.04%，空仓观察'};
 if(weight>0&&deviation>=0||weight<0&&deviation<=0)return {target:0,reason:'价格回归短均线，平仓落袋'};
 if(!weight&&Math.abs(deviation)>.0007)return {target:deviation<0?.8:-.8,reason:deviation<0?'低于短均线 0.07%：2× 做多回归':'高于短均线 0.07%：2× 做空回归'};
 return {target:weight,reason:weight?'持仓等待价格回归短均线':'等待偏离短均线超过 0.07%'};
}
export function createState(market,now){const start=Math.floor(now/60)*60;return {market,rules:RULES,startedAt:start,endsAt:start+RULES.days*86400,lastT:start-60,lastPrice:0,updatedAt:0,baselineQty:0,baselineCash:1000,baselineStarted:false,totalTrades:0,finished:false,bots:AGENTS.map(a=>({...a,cash:1000,qty:0,entry:0,equity:1000,peak:1000,drawdown:0,trades:0,realized:0,fees:0,funding:0,unrealized:0,margin:0,dead:false,reason:'等待首个完整交易分钟'}))};}
export const equityAt=(b,p)=>b.cash+b.qty*(p-b.entry);
export function execute(s,b,qty,p,t,reason,now){
 const closing=qty===0,amount=Math.abs(closing?b.qty:qty)*p;if(!amount)return null;
 const cost=amount*(RULES.fee+RULES.slippage),action=closing?(b.qty>0?'平多':'平空'):(qty>0?'开多':'开空');
 if(closing){const pnl=b.qty*(p-b.entry);b.cash+=pnl;b.realized+=pnl;b.qty=0;b.entry=0;}else{if(b.qty)throw Error('Close before opening');b.qty=qty;b.entry=p;}
 b.cash-=cost;b.fees+=cost;b.trades++;s.totalTrades++;
 return {id:bookKey(s.market)+':'+t+':'+b.id+':'+b.trades,market:s.market,t,agent:b.id,action,price:p,amount,cost,reason,recordedAt:now,catchup:now-(t+60)>90?1:0};
}
export function advance(original,raw,now){
 const s=structuredClone(original),trades=[],snapshots=[];
 const candles=[...new Map(raw.filter(c=>Array.isArray(c)&&c.length>=5&&c.slice(0,5).every(Number.isFinite)&&c.slice(1,5).every(p=>p>0)&&c[0]+60<=now&&c[1]<=Math.min(c[3],c[4])&&c[2]>=Math.max(c[3],c[4])).map(c=>[c[0],c])).values()].sort((a,b)=>a[0]-b[0]);
 const trade=(b,q,p,t,reason)=>{const tr=execute(s,b,q,p,t,reason,now);if(tr)trades.push(tr);};
 for(let i=20;i<candles.length;i++){
  const c=candles[i],t=c[0];if(t<=s.lastT||s.finished)continue;if(t!==s.lastT+60)break;
  const closed=candles.slice(i-20,i);if(closed.some((x,j)=>j&&x[0]!==closed[j-1][0]+60))break;
  const prices=closed.map(x=>x[4]),fast=mean(prices.slice(-5)),slow=mean(prices);s.signal={t,fast,slow,last:prices.at(-1),momentum:(prices.at(-1)/prices.at(-4)-1)*100,deviation:(prices.at(-1)/fast-1)*100,spread:(fast/slow-1)*100};
  for(const b of s.bots){
   // Funding is a disclosed fixed simulation assumption, charged only once per boundary.
   if(b.qty&&t%RULES.fundingPeriod===0){const payment=b.qty*c[3]*RULES.fundingRate;b.cash-=payment;b.funding+=payment;}
   const floor=b.peak*(1-RULES.maxDrawdown);
   if(!b.dead&&equityAt(b,c[3])<=floor){trade(b,0,c[3],t,'开盘跳空触及回撤线，平仓淘汰');b.dead=true;}
   if(!b.dead){const eq=equityAt(b,c[3]),weight=b.qty*c[3]/eq,d=decide(b.id,closed,weight);b.reason=d.reason;
    if(Math.sign(d.target)!==Math.sign(b.qty)){
     trade(b,0,c[3],t,d.reason);
     if(d.target){const amount=b.cash*Math.abs(d.target)/(1+Math.abs(d.target)*(RULES.fee+RULES.slippage));trade(b,Math.sign(d.target)*amount/c[3],c[3],t,d.reason);}
    }
    if(b.qty){const stop=b.entry+(floor-b.cash)/b.qty;if(b.qty>0&&c[1]<=stop||b.qty<0&&c[2]>=stop){trade(b,0,stop,t,'分钟高低价触及 20% 回撤止损，平仓淘汰');b.dead=true;}}
   }
   if(t+60>=s.endsAt)trade(b,0,c[4],t,'30 天模拟合约赛结束，平仓结算');
   b.equity=equityAt(b,c[4]);b.unrealized=b.qty*(c[4]-b.entry);b.margin=Math.abs(b.qty)*b.entry/b.leverage;b.peak=Math.max(b.peak,b.equity);b.drawdown=Math.max(b.drawdown,(b.peak-b.equity)/b.peak*100);if(b.dead)b.reason='已触发回撤淘汰线，本赛季不再开仓';
  }
  if(t+60>=s.endsAt)s.finished=true;
  s.lastPrice=c[4];s.lastT=t;s.updatedAt=now;snapshots.push({market:s.market,t:t+60,price:c[4],values:[...s.bots.map(b=>b.equity),1000]});
 }
 return {state:s,trades,snapshots};
}

const feedCooldown=new Map();
export async function fetchCandles(market,start,end,fetcher=fetch){
 const sources=[
 {name:'Binance',url:()=>{const u=new URL('https://data-api.binance.vision/api/v3/klines');u.search=new URLSearchParams({symbol:market.replace('-',''),interval:'1m',startTime:String(Math.floor(start*1000)),endTime:String(Math.floor(end*1000)),limit:'1000'});return u;},read:d=>Array.isArray(d)?d.map(c=>[+c[0]/1000,+c[3],+c[2],+c[1],+c[4],+c[5]]):[]},
 {name:'Gate',url:()=>{const u=new URL('https://api.gateio.ws/api/v4/spot/candlesticks');u.search=new URLSearchParams({currency_pair:market.replace('-','_'),interval:'1m',from:String(Math.floor(start)),to:String(Math.min(Math.floor(end),Math.floor(Date.now()/1000)))});return u;},read:d=>Array.isArray(d)?d.map(c=>[+c[0],+c[4],+c[3],+c[5],+c[2],+c[6]]):[]},
 {name:'OKX',url:()=>{const u=new URL('https://www.okx.com/api/v5/market/history-candles');u.search=new URLSearchParams({instId:market,bar:'1m',after:String(Math.floor(end*1000)+1),before:String(Math.floor(start*1000)-1),limit:'300'});return u;},read:d=>d.code==='0'&&Array.isArray(d.data)?d.data.map(c=>[+c[0]/1000,+c[3],+c[2],+c[1],+c[4],+c[5]]):[]},
 {name:'Coinbase',url:()=>{const u=new URL('https://api.exchange.coinbase.com/products/'+market+'/candles');u.search=new URLSearchParams({granularity:'60',start:new Date(start*1000).toISOString(),end:new Date(end*1000).toISOString()});return u;},read:d=>Array.isArray(d)?d.map(c=>c.map(Number)):[]}
 ];
 const errors=[];
 for(const provider of sources){if(fetcher===fetch&&(feedCooldown.get(provider.name)||0)>Date.now()){errors.push(provider.name+': 冷却重试中');continue;}try{const res=await fetcher(provider.url(),{headers:{Accept:'application/json'},signal:AbortSignal.timeout(4000)});if(!res.ok){if(fetcher===fetch)feedCooldown.set(provider.name,Date.now()+(res.status===403?600000:Math.max(30,Number(res.headers.get('Retry-After'))||60)*1000));throw Error('HTTP '+res.status);}const raw=provider.read(await res.json());const bars=[...new Map(raw.filter(c=>c.length>=5&&c.slice(0,5).every(Number.isFinite)&&c.slice(1,5).every(p=>p>0)&&c[0]>=start&&c[0]<=end&&c[1]<=Math.min(c[3],c[4])&&c[2]>=Math.max(c[3],c[4])).map(c=>[c[0],c])).values()].sort((a,b)=>a[0]-b[0]);if(!bars.length)throw Error('无有效分钟线');bars.source=provider.name;return bars;}catch(err){errors.push(provider.name+': '+err.message);}}
 throw Error('公开行情暂不可用（'+errors.join('；')+'）');
}
export async function ensureArena(db,market,now){
 const state=createState(market,now);await db.prepare('INSERT OR IGNORE INTO arena (market,version,state,write_token) VALUES (?,0,?,?)').bind(bookKey(market),JSON.stringify(state),'init').run();
 return db.prepare('SELECT version,state FROM arena WHERE market=?').bind(bookKey(market)).first();
}
export async function tick(db,market,now=Date.now()/1000,fetcher=fetch){
 const row=await ensureArena(db,market,now),s=JSON.parse(row.state);
 if(s.finished||s.lastT+120>now)return s;
 const end=Math.min(Math.floor(now/60)*60,s.lastT+60*121,s.endsAt),start=s.lastT-60*20;
 const data=await fetchCandles(market,start,end,fetcher),result=advance(s,data,now);result.state.source=data.source||'Binance';for(const tr of result.trades)tr.reason+=' · 行情：'+result.state.source;
 if(!result.snapshots.length)throw Error('缺少连续的完整分钟线，已暂停推进');
 const token=crypto.randomUUID();const statements=[db.prepare('UPDATE arena SET state=?,version=version+1,write_token=? WHERE market=? AND version=?').bind(JSON.stringify(result.state),token,bookKey(market),row.version)];
 for(const p of result.snapshots)statements.push(db.prepare('INSERT OR IGNORE INTO snapshots (market,t,values_json,price) SELECT ?,?,?,? WHERE EXISTS (SELECT 1 FROM arena WHERE market=? AND write_token=?)').bind(bookKey(market),p.t,JSON.stringify(p.values),p.price,bookKey(market),token));
 for(const t of result.trades)statements.push(db.prepare('INSERT OR IGNORE INTO trades (id,market,t,agent,action,price,amount,cost,reason,recorded_at,catchup) SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM arena WHERE market=? AND write_token=?)').bind(t.id,bookKey(market),t.t,t.agent,t.action,t.price,t.amount,t.cost,t.reason,Math.floor(now),t.catchup,bookKey(market),token));
 await db.batch(statements);return JSON.parse((await db.prepare('SELECT state FROM arena WHERE market=?').bind(bookKey(market)).first()).state);
}
export async function getArena(db,market,now=Date.now()/1000){
 const row=await ensureArena(db,market,now),s=JSON.parse(row.state),stride=Math.max(1,Math.ceil((s.lastT-s.startedAt)/60/600));
 const points=await db.prepare('SELECT t,values_json,price FROM snapshots WHERE market=? AND (t % ?=0 OR t>=?) ORDER BY t LIMIT 1000').bind(bookKey(market),stride*60,s.lastT-60).all();
 const recent=await db.prepare('SELECT * FROM trades WHERE market=? ORDER BY t DESC,id DESC LIMIT 60').bind(bookKey(market)).all();
 const brief=await getBrief(db,s,now);
 return {...s,...brief,serverTime:now,history:[{t:s.startedAt,values:[1000,1000,1000,1000]},...points.results.map(p=>({t:p.t,values:JSON.parse(p.values_json)}))],logs:recent.results.map(t=>({...t,name:AGENTS.find(a=>a.id===t.agent).name,color:AGENTS.find(a=>a.id===t.agent).color,p:t.price,recordedAt:t.recorded_at})),lagSeconds:Math.max(0,now-s.lastT-60),sampleMinutes:stride};
}


export function reportRows(startValues,endValues,counts){return AGENTS.map((a,i)=>({agent:a.id,start:startValues[i],end:endValues[i],pnl:endValues[i]-startValues[i],returnPct:(endValues[i]/startValues[i]-1)*100,trades:counts.find(c=>c.agent===a.id)?.n||0,cost:counts.find(c=>c.agent===a.id)?.cost||0,catchup:counts.find(c=>c.agent===a.id)?.catchup||0}));}
export async function getBrief(db,s,now){
 const key=bookKey(s.market),today=Math.floor((now+28800)/86400)*86400-28800;
 const positions=await Promise.all(s.bots.map(async b=>{const open=b.qty?await db.prepare("SELECT t FROM trades WHERE market=? AND agent=? AND action IN ('开多','开空') ORDER BY t DESC LIMIT 1").bind(key,b.id).first():null;return {agent:b.id,openedAt:open?.t||null,stop:b.qty?b.entry+(b.peak*(1-RULES.maxDrawdown)-b.cash)/b.qty:null,fee:b.fees*RULES.fee/(RULES.fee+RULES.slippage),slippage:b.fees*RULES.slippage/(RULES.fee+RULES.slippage)};}));
 const reports=await Promise.all([today,today-86400].map(async start=>{
  const end=start+86400,until=Math.min(end,s.lastT+60),label=new Date((start+28800)*1000).toISOString().slice(0,10);
  if(until<=Math.max(start,s.startedAt))return {label,available:false,reason:s.startedAt>=end?'该日比赛尚未开始':'该日账本尚未推进，请等待行情恢复'};
  const before=await db.prepare('SELECT values_json,t FROM snapshots WHERE market=? AND t<=? ORDER BY t DESC LIMIT 1').bind(key,start).first();
  const after=await db.prepare('SELECT values_json,t FROM snapshots WHERE market=? AND t>? AND t<=? ORDER BY t DESC LIMIT 1').bind(key,start,until).first();
  if(!after)return {label,available:false,reason:'暂无已结算分钟记录'};
  const counts=await db.prepare('SELECT agent,COUNT(*) n,SUM(cost) cost,SUM(catchup) catchup FROM trades WHERE market=? AND t>=? AND t<? GROUP BY agent').bind(key,start,until).all();
  const rows=reportRows(before?JSON.parse(before.values_json):[1000,1000,1000],JSON.parse(after.values_json),counts.results);
  return {label,available:true,complete:s.lastT+60>=end||s.finished,from:Math.max(start,s.startedAt),asOf:after.t,rows};
 }));return {positions,reports};
}
