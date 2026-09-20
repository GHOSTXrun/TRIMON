import {arenaRequest,downloadTrades} from './browser-arena.mjs';
'use strict';
const $=s=>document.querySelector(s);
const definitions=[{id:'fire',name:'Charmander',alias:'CHARMANDER / MOMENTUM',type:'Aggressive trend',color:'#ff965c',limit:.85},{id:'grass',name:'Bulbasaur',alias:'BULBASAUR / DEFENSIVE',type:'Defensive allocation',color:'#a9ed7a',limit:.30},{id:'water',name:'Squirtle',alias:'SQUIRTLE / SCALPER',type:'Short-term reversion',color:'#69cffa',limit:.55}];
const COST=.0007,INITIAL=1000;
let briefState=null,reportDay=0;
let bots=[],candles=[],history=[],logs=[],cursor=20,paused=false,phase='loading',market='ETH-USDT',generation=0,lastLiveMinute=0,lastPrice=0,lastTime=0,baseline=0,totalTrades=0,polling=false,sourceLabel='',replayTimer;
const fmt=n=>n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const pct=n=>(n>=0?'+':'')+n.toFixed(2)+'%';
const time=t=>new Date(t*1000).toLocaleString('en-US',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
function cards(){ $('#cards').innerHTML=definitions.map((d,i)=>`<article class="card" style="--c:${d.color}" id="${d.id}"><div class="card-top"><span class="serial">AGENT / 00${i+1}</span><span class="badge">Standby</span></div><div class="stage"><span class="coordinates">NEURAL UNIT 0${i+1}<br>SIMULATION / V.01</span><div class="character ${d.id}"><img src="characters.png" alt="${d.name} neon wireframe character"></div></div><div class="card-body"><div class="name-row"><h3>${d.name}</h3><span>${d.type}</span></div><p class="alias">${d.alias}</p><div class="money-row"><div><small>Simulated equity / USDT</small><strong class="equity">1,000.00</strong></div><span class="return">+0.00%</span></div><div class="mini-stats"><span>Max drawdown<b class="dd">0.00%</b></span><span>Position<b class="weight">Flat</b></span><span>Trades<b class="trades">0</b></span></div><div class="contract-details"></div><div class="thought">Awaiting market data…</div><button class="support-button" data-team="${d.id}">Support ${d.name}</button></div></article>`).join('');document.querySelectorAll('.stage').forEach(el=>{el.addEventListener('pointermove',e=>{const r=el.getBoundingClientRect();el.querySelector('.character').style.rotate=`${(e.clientX-r.left-r.width/2)/45}deg`;});el.addEventListener('pointerleave',()=>el.querySelector('.character').style.rotate='0deg');});}
function render(){
 bots.forEach(b=>{const el=$('#'+b.id);el.querySelector('.equity').textContent=fmt(b.equity);el.querySelector('.return').textContent=pct((b.equity/INITIAL-1)*100);el.querySelector('.dd').textContent=b.drawdown.toFixed(2)+'%';el.querySelector('.weight').textContent=b.qty?(b.qty>0?'Long':'Short')+' · '+b.leverage+'×':'Flat';el.querySelector('.trades').textContent=b.trades;el.querySelector('.contract-details').innerHTML='<span>Entry price<b>'+(b.qty?fmt(b.entry):'—')+'</b></span><span>Unrealized P&L<b>'+fmt(b.unrealized||0)+'</b></span><span>Margin used<b>'+fmt(b.margin||0)+'</b></span><span>Total costs<b>'+fmt((b.fees||0)+(b.funding||0))+'</b></span>'; el.querySelector('.thought').textContent=b.reason;el.querySelector('.badge').textContent=b.dead?'Eliminated':phase==='loading'?'Standby':phase==='ended'?'Settled':'Simulating';});
 $('#ranking').innerHTML=[...bots].sort((a,b)=>b.equity-a.equity).map((b,i)=>`<div class="rank" style="--c:${b.color}"><span class="rank-index">0${i+1}</span><div class="rank-name">${b.name}<small>${b.dead?'Eliminated':b.type}</small></div><strong>${pct((b.equity/INITIAL-1)*100)}</strong></div>`).join('');
 if(!chartData){$('#price').textContent=lastPrice?fmt(lastPrice)+' USDT':'—';$('#clock').textContent=lastTime?time(lastTime):'Awaiting market data';}$('#count').textContent=totalTrades+' simulated trades';
 $('#logs').innerHTML=logs.length?logs.slice(0,40).map(l=>`<tr><td>${time(l.t)}</td><td style="color:${l.color}">${l.name}</td><td class="${['Open long','Close short'].includes(l.action)?'buy':'sell'}">${l.action}</td><td>${fmt(l.p)}</td><td>${l.reason}${l.catchup?' · Backfilled':''}<br><small>Notional ${fmt(l.amount)} USDT · Cost ${fmt(l.cost)} USDT</small></td></tr>`).join(''):'<tr><td colspan="5">Awaiting a strategy trade signal.</td></tr>';
 renderPositions();renderBrief();
 draw();
}
let hoverX=null,chartFrame=0,chartData=null,chartBusy=false;
const chartColors=['#ff965c','#a9ed7a','#69cffa'];
async function refreshChart(){
 if(chartBusy)return;chartBusy=true;const selected=market;
 try{const r=await arenaRequest('/api/chart?market='+selected,{cache:'no-store',signal:AbortSignal.timeout(16000)});if(!r.ok)throw Error();const data=await r.json();if(selected!==market)return;if(!data.bars?.length)throw Error();chartData=data;
 $('#source').textContent=(data.source||'Public market data')+' spot reference · '+market+' · simulated perps';$('#price').textContent=fmt(data.lastPrice)+' USDT';$('#clock').textContent='Updated '+new Date(data.fetchedAt*1000).toLocaleTimeString('en-US',{hour12:false});
 $('#chart-state').textContent='Spot reference refreshes every 10 seconds · Simulated positions settle on completed minutes';$('#chart-state').classList.remove('chart-error');
 $('#range').textContent=time(data.bars[0][0])+' — '+time(data.bars.at(-1)[0]);draw();renderPositions();
 }catch{if(selected===market){$('#chart-state').textContent=chartData?'Feed interrupted. Showing saved candles while retrying another source.':'Candles unavailable. Retrying without generating substitute prices.';$('#chart-state').classList.add('chart-error');}}finally{chartBusy=false;if(selected!==market)refreshChart();}
}
function renderPositions(){
 $('#position-strip').innerHTML=bots.map(b=>{const held=Math.abs(b.qty)>1e-10,price=chartData?.lastPrice||lastPrice,pnl=held?b.qty*(price-b.entry):0;return `<div style="--c:${b.color}"><span class="position-name">${b.name}<em>${held?(b.qty>0?'Long':'Short')+' · '+b.leverage+'×':'Flat · waiting'}</em></span><strong>${Math.abs(b.qty).toFixed(6)} <small>${market.split('-')[0]}</small></strong><p>${held?'Entry price '+fmt(b.entry)+' · Unrealized P&L '+fmt(pnl)+' USDT':'No open position'}</p><p>Margin ${fmt(b.margin||0)} · Realized P&L ${fmt(b.realized||0)} USDT</p>${positionMore(b)}</div>`;}).join('');
}
function draw(){
 const c=$('#chart'),r=c.getBoundingClientRect(),dpr=devicePixelRatio||1;if(!r.width||!r.height)return;
 c.width=r.width*dpr;c.height=r.height*dpr;const ctx=c.getContext('2d');ctx.scale(dpr,dpr);
 const w=r.width,h=r.height,L=10,R=w<500?65:88,T=18,laneH=23,B=112,ph=h-T-B,pw=w-L-R,tip=$('#chart-tip');tip.hidden=true;
 ctx.font='12px Inter,"Segoe UI",sans-serif';
 if(!chartData?.bars?.length){ctx.fillStyle='#8fa5b8';ctx.textAlign='center';ctx.fillText('Awaiting market candles…',w/2,h/2);return;}
 const bars=chartData.bars,n=bars.length,step=pw/n,x=i=>L+(i+.5)*step;
 let lo=Math.min(...bars.map(b=>b[1])),hi=Math.max(...bars.map(b=>b[2]));const pad=Math.max((hi-lo)*.12,hi*.0001);lo-=pad;hi+=pad;
 const y=p=>T+(hi-p)/(hi-lo)*ph;
 for(let j=0;j<5;j++){const yy=T+j*ph/4;ctx.strokeStyle='#8ba5bf18';ctx.setLineDash([2,5]);ctx.beginPath();ctx.moveTo(L,yy);ctx.lineTo(w-R,yy);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#8da1b7';ctx.fillText(fmt(hi-(hi-lo)*j/4),w-R+8,yy+4);}
 const bodyW=Math.max(1,Math.min(9,step*.7));
 bars.forEach((b,i)=>{const xx=x(i),color=b[4]>=b[3]?'#56cfaf':'#ed7587';ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(xx,y(b[2]));ctx.lineTo(xx,y(b[1]));ctx.stroke();ctx.globalAlpha=i===n-1?.72:1;ctx.fillRect(xx-bodyW/2,Math.min(y(b[3]),y(b[4])),bodyW,Math.max(1,Math.abs(y(b[3])-y(b[4]))));ctx.globalAlpha=1;});
 // Position references are explicitly the most recent buy, not cost-basis averages.
 bots.forEach((b,k)=>{const last={price:b.entry};if(!b.qty||!last.price||last.price<lo||last.price>hi)return;ctx.strokeStyle=chartColors[k]+'88';ctx.setLineDash([5,5]);ctx.beginPath();ctx.moveTo(L,y(last.price));ctx.lineTo(w-R,y(last.price));ctx.stroke();ctx.setLineDash([]);});
 const latest=bars.at(-1)[4];ctx.strokeStyle='#dce8f366';ctx.setLineDash([2,3]);ctx.beginPath();ctx.moveTo(L,y(latest));ctx.lineTo(w-R,y(latest));ctx.stroke();ctx.setLineDash([]);
 const indexFor=t=>bars.findIndex(b=>Math.floor(b[0]/60)===Math.floor(t/60));
 bots.forEach((b,k)=>{const yy=T+ph+24+k*laneH;ctx.fillStyle='#8da3b31b';ctx.fillRect(L,yy-9,pw,19);ctx.fillStyle=chartColors[k];ctx.font='11px Inter,"Noto Sans SC",sans-serif';ctx.fillText(['FIRE','GRASS','WATER'][k],L+3,yy+4);});
 chartData.trades.forEach(tr=>{const i=indexFor(tr.t),k=definitions.findIndex(a=>a.id===tr.agent);if(i<0||k<0)return;const xx=x(i),yy=T+ph+24+k*laneH,up=['Open long','Close short'].includes(tr.action);ctx.fillStyle=chartColors[k];ctx.beginPath();ctx.moveTo(xx,yy+(up?-6:6));ctx.lineTo(xx-4,yy+(up?4:-4));ctx.lineTo(xx+4,yy+(up?4:-4));ctx.closePath();ctx.fill();if(tr.price>=lo&&tr.price<=hi){ctx.strokeStyle=chartColors[k];ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(xx,y(tr.price),3,0,Math.PI*2);ctx.stroke();}});
 ctx.font='11px Inter,sans-serif';ctx.fillStyle='#91a7b9';ctx.textAlign='center';for(let j=0;j<5;j++){const i=Math.round((n-1)*j/4);ctx.fillText(new Date(bars[i][0]*1000).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:false}),Math.max(27,Math.min(w-R-15,x(i))),h-8);}ctx.textAlign='left';
 if(hoverX!==null){const i=Math.max(0,Math.min(n-1,Math.floor((hoverX-L)/step))),b=bars[i],xx=x(i);ctx.strokeStyle='#b4cbdc77';ctx.setLineDash([3,4]);ctx.beginPath();ctx.moveTo(xx,T);ctx.lineTo(xx,h-25);ctx.stroke();ctx.setLineDash([]);
 const events=chartData.trades.filter(t=>Math.floor(t.t/60)===Math.floor(b[0]/60));
 tip.hidden=false;tip.style.left=Math.max(0,Math.min(xx+14,w-254))+'px';tip.style.top='12px';
 tip.innerHTML='<b>'+time(b[0])+(i===n-1?' · Current minute':'')+'</b>'+[['Open',b[3]],['High',b[2]],['Low',b[1]],['Close',b[4]]].map(([key,v])=>'<div><span>'+key+'</span><strong>'+fmt(v)+'</strong></div>').join('')+events.map(t=>{const d=definitions.find(a=>a.id===t.agent);return '<div class="tip-trade"><span style="color:'+d.color+'">'+d.name+' '+t.action+'</span><strong>'+fmt(t.price)+'</strong></div><small>'+ (t.amount/t.price).toFixed(6)+' '+market.split('-')[0]+(t.catchup?' · Backfilled':'')+'</small>';}).join('')+(events.length?'':'<small>No simulated trades this minute</small>');
 }
}

let stateBusy=false,backendGeneration=0;
async function refresh(){
 if(stateBusy)return;stateBusy=true;const g=backendGeneration;$('#restart').disabled=true;
 try{const r=await arenaRequest('/api/arena?market='+market,{signal:AbortSignal.timeout(20000),cache:'no-store'});if(!r.ok)throw Error('Arena connection failed');const s=await r.json();if(g!==backendGeneration)return;if(!s.bots||!Array.isArray(s.history))throw Error('Service not ready');
 briefState=s;bots=s.bots;history=s.history;logs=s.logs;totalTrades=s.totalTrades;lastPrice=s.lastPrice;lastTime=s.lastT+60;phase=s.finished?'ended':s.error||!s.lastPrice?'loading':'live';render();
 $('#status').textContent=s.error?'Feed interrupted · Records saved':s.finished?'Season settled':s.lagSeconds>120?'Backfilling historical session':'Simulation active · Minute settlement';
 $('#source').textContent=(s.source||'Public market data')+' spot reference · '+market+' · simulated perps';
 $('#season-state').textContent=s.finished?'Ended':s.error?'Awaiting prices':s.lagSeconds>120?'Backfilling':'Day '+Math.min(30,Math.max(1,Math.floor((s.serverTime-s.startedAt)/86400)+1))+' / 30 days';
 $('#season-period').textContent=time(s.startedAt)+' — '+time(s.endsAt);
 $('#engine-ready').textContent=s.error?'Feed unavailable. Ledger saved.':s.execution;
 $('#error').hidden=!s.error;$('#error').textContent=s.error?'Market data is unavailable. Balances are unchanged. Retrying automatically. '+s.error:'';
 $('#chart').setAttribute('aria-label',market+' 1-minute candles and simulated trades; '+bots.map(b=>b.name+' position '+b.qty.toFixed(6)).join('; '));
 }catch(e){if(g===backendGeneration){$('#status').textContent='Service unavailable';$('#engine-ready').textContent='Awaiting service connection';$('#error').hidden=false;$('#error').textContent='Unable to load the season. Please refresh later. No substitute prices or fabricated returns have been generated.';}}finally{stateBusy=false;$('#restart').disabled=false;if(g!==backendGeneration)refresh();}
}
function changeMarket(){market=$('#market').value;backendGeneration++;briefState=null;bots=definitions.map(d=>({...d,equity:1000,drawdown:0,qty:0,trades:0,dead:false,reason:'Loading market ledger…'}));history=[];logs=[];lastPrice=0;lastTime=0;totalTrades=0;phase='loading';hoverX=null;chartData=null;render();$('#chart-title').textContent=market.replace('-',' / ');refreshChart();$('#export').href='#journal';refresh();}
$('#restart').onclick=refresh;$('#market').onchange=changeMarket;
$('#code').onclick=async()=>{$('#dialog').showModal();$('#code-text').textContent='Loading server strategy…';try{const r=await arenaRequest('/api/strategy',{signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error();const data=await r.json();$('#code-text').textContent=data.code+'\n\n'+JSON.stringify(data.rules,null,2);}catch{$('#code-text').textContent='Strategy service unavailable. Please try again.';}};$('#close').onclick=()=>$('#dialog').close();
window.addEventListener('resize',draw);$('#chart').addEventListener('pointermove',e=>{hoverX=e.clientX-e.currentTarget.getBoundingClientRect().left;cancelAnimationFrame(chartFrame);chartFrame=requestAnimationFrame(draw);});$('#chart').addEventListener('pointerleave',()=>{hoverX=null;draw();});$('#chart').addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Escape'].includes(e.key))return;e.preventDefault();hoverX=e.key==='Escape'?null:Math.max(12,Math.min(e.currentTarget.clientWidth-78,(hoverX??12)+(e.key==='ArrowRight'?20:-20)));draw();});
cards();initSupport();changeMarket();setInterval(refresh,15000);setInterval(refreshChart,10000);
if(document.modelContext?.registerTool)Promise.resolve(document.modelContext.registerTool({name:'read_trimon_state',description:'Read market timestamps and recorded account results from the TRIMON simulation.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute(input){if(!input||typeof input!=='object'||Object.keys(input).length)throw Error('No arguments accepted');return {market,phase,marketTime:lastTime,price:lastPrice,bots:bots.map(({name,equity,drawdown,trades,dead})=>({name,equity,drawdown,trades,dead}))};}})).catch(()=>{});


function initSupport(){
 let saved;try{saved=JSON.parse(localStorage.getItem('trimon-support-v1')||'{}');}catch{saved={};}
 let team=definitions.some(d=>d.id===saved.team)?saved.team:null,days=Array.isArray(saved.days)?[...new Set(saved.days.filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(x)))]:[];
 const today=()=>new Date().toLocaleDateString('sv-SE'),save=()=>{try{localStorage.setItem('trimon-support-v1',JSON.stringify({team,days}));return true;}catch{$('#support-message').textContent='Browser storage is unavailable. Your selection lasts for this page session only.';return false;}};
 function paint(){const d=definitions.find(d=>d.id===team),score=days.length*10;$('#my-team').textContent=d?d.name+' team':'No team selected';$('#my-score').textContent=score;$('#my-badge').textContent=score>=70?'Core supporter':score>=30?'Team member':d?'Early supporter':'Not joined';$('#cheer').disabled=!team||days.includes(today());$('#cheer').textContent=days.includes(today())?'Cheered today':'Daily cheer +10';document.querySelectorAll('[data-team]').forEach(b=>{const selected=b.dataset.team===team;b.setAttribute('aria-pressed',selected);b.textContent=selected?'Supporting · '+definitions.find(d=>d.id===team).name:'Support '+definitions.find(d=>d.id===b.dataset.team).name;});}
 document.querySelectorAll('[data-team]').forEach(b=>b.onclick=()=>{team=b.dataset.team;const ok=save();paint();if(ok)$('#support-message').textContent='Selected '+definitions.find(d=>d.id===team).name+' team. You can switch anytime.';});
 $('#cheer').onclick=()=>{if(!team||days.includes(today()))return;days.push(today());const ok=save();paint();if(ok)$('#support-message').textContent='Cheer recorded: +10 points. Come back tomorrow!';};paint();
}

function positionMore(b){
 const p=briefState?.positions?.find(p=>p.agent===b.id);if(!p)return '';
 const minutes=p.openedAt?Math.max(0,Math.floor((briefState.lastT+60-p.openedAt)/60)):0;
 const row=(k,v)=>`<div><dt>${k}</dt><dd>${v}</dd></div>`;
 return `<dl class="position-extra">${row('Opened at',p.openedAt?time(p.openedAt):'—')}${row('Holding time (ledger)',p.openedAt?minutes+' min':'—')}${row('Drawdown stop reference',b.qty&&p.stop>0?fmt(p.stop):'—')}${row('Realized P&L before costs',fmt(b.realized||0))}${row('Fees / simulated slippage',fmt(p.fee)+' / '+fmt(p.slippage))}${row('Funding (+ paid / − received)',fmt(b.funding||0))}</dl><p>Stops use candle highs and lows, not exchange liquidation prices. Fees and gaps may increase losses.</p>`;
}
function renderBrief(){
 const s=briefState,signal=s?.signal;
 $('#signal-time').textContent=signal?'Signal time '+time(signal.t)+(s.lagSeconds>120?' · Backfilling':''):'Awaiting next minute signal';
 const exit={fire:'Close when the short MA and momentum disagree. Reverse when both change direction.',grass:'Close when the MA spread returns within ±0.04%. Reverse when the trend changes direction.',water:'Close longs at or above the short MA; close shorts at or below it.'};
 $('#signal-cards').innerHTML=definitions.map(d=>{const b=bots.find(b=>b.id===d.id);const condition=d.id==='fire'?'Go long when the 5-minute MA exceeds the 20-minute MA and 3-minute momentum is positive. Go short when both are negative.':d.id==='grass'?'Go long when the 5/20-minute MA spread exceeds +0.04%; go short below −0.04%.':'When flat, go long 0.07% below the 5-minute MA or short 0.07% above it.';return `<article class="signal-card" style="--c:${d.color}"><h3>${d.name}</h3><span class="signal-state">${b?.dead?'Eliminated':s?.finished?'Season ended':b?.qty?'Managing position':'Watching signals'}</span><p>${b?.reason||'Awaiting ledger'}</p>${signal?`<dl><div><dt>5 / 20-minute MA</dt><dd>${fmt(signal.fast)} / ${fmt(signal.slow)}</dd></div><div><dt>${d.id==='fire'?'3-minute momentum':d.id==='grass'?'MA spread':'Deviation from short MA'}</dt><dd>${pct(d.id==='fire'?signal.momentum:d.id==='grass'?signal.spread:signal.deviation)}</dd></div></dl>`:'<p>Signal metrics will appear after the next completed minute settles.</p>'}<p class="condition"><b>Entry conditions</b><br>${condition}</p><p><b>Exit conditions</b><br>${exit[d.id]} All agents are also subject to the drawdown stop.</p></article>`;}).join('');
 renderReport();
}
function renderReport(){
 $('#day-today').setAttribute('aria-pressed',reportDay===0);$('#day-yesterday').setAttribute('aria-pressed',reportDay===1);
 const r=briefState?.reports?.[reportDay];if(!r?.available){$('#report-summary').textContent=r?(r.label+' · '+r.reason):'Loading daily ledger…';$('#report-cards').innerHTML='';return;}
 const best=Math.max(...r.rows.map(x=>x.pnl)),leaders=r.rows.filter(x=>Math.abs(x.pnl-best)<.000001).map(x=>definitions.find(d=>d.id===x.agent).name).join(', ');
 $('#report-summary').textContent=r.label+' · '+(r.complete?'Settled':'In progress')+' · As of '+time(r.asOf)+' (UTC+8) · '+(r.rows.every(x=>Math.abs(x.pnl)<.000001)?'No equity change across the three teams':leaders+' '+(r.complete?'led the day':'currently leads'));
 $('#report-cards').innerHTML=r.rows.map(x=>{const d=definitions.find(d=>d.id===x.agent);return `<article class="signal-card" style="--c:${d.color}"><h3>${d.name}</h3><span class="insight-note">Daily equity change / USDT</span><strong class="report-pnl ${x.pnl>=0?'positive':'negative'}">${x.pnl>=0?'+':''}${fmt(x.pnl)}</strong><dl><div><dt>Daily return</dt><dd>${pct(x.returnPct)}</dd></div><div><dt>Simulated trades</dt><dd>${x.trades} trades</dd></div><div><dt>Opening → closing equity</dt><dd>${fmt(x.start)} → ${fmt(x.end)}</dd></div><div><dt>Fees and simulated slippage</dt><dd>${fmt(x.cost)} USDT</dd></div></dl><p>${x.catchup?x.catchup+' backfilled trades':'No backfilled trades on this day'}</p></article>`;}).join('');
}
$('#day-today').onclick=()=>{reportDay=0;renderReport();};$('#day-yesterday').onclick=()=>{reportDay=1;renderReport();};

$('#export').onclick=e=>{e.preventDefault();downloadTrades(market);};
document.addEventListener('visibilitychange',()=>{if(!document.hidden){refresh();refreshChart();}});
