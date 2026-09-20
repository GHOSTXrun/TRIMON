const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
(async()=>{
const {api,update}=await import('./src/service.mjs');const {MARKETS}=await import('./src/engine.mjs');const {localDB}=await import('./src/local-db.mjs');
const root=path.join(__dirname,'dist'),DB=localDB(path.join(__dirname,'.runtime','trimon.sqlite'),path.join(__dirname,'drizzle'));
const server=http.createServer(async(req,res)=>{try{
 const host=req.headers.host||'127.0.0.1:4173';if(!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)){res.writeHead(403);return res.end('Local access only');}
 const request=new Request('http://'+host+req.url,{method:req.method});
 const response=await api(request,{DB},'本机每 15 秒轮询；关闭网页后服务仍运行');
 if(response){res.writeHead(response.status,Object.fromEntries(response.headers));return res.end(Buffer.from(await response.arrayBuffer()));}
 if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);return res.end();}
 const route=decodeURIComponent(new URL(request.url).pathname);const name=route==='/'?'index.html':route.slice(1);
 if(!['index.html','style.css','app.js','characters.png','trimon-logo.jpg','launch.md'].includes(name)){res.writeHead(404);return res.end('Not found');}
 const data=fs.readFileSync(path.join(root,name));res.writeHead(200,{'Content-Type':({'html':'text/html; charset=utf-8','css':'text/css','js':'text/javascript','png':'image/png','jpg':'image/jpeg','md':'text/markdown; charset=utf-8'})[name.split('.').pop()],'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:data);
 }catch(e){console.error(e.message);res.writeHead(500);res.end('TRIMON service error');}});
server.listen(4173,'127.0.0.1',()=>console.log('TRIMON Local: http://127.0.0.1:4173'));
let busy=false;async function loop(){if(busy)return;busy=true;try{for(const market of MARKETS)await update(DB,market);}finally{busy=false;}}
const timer=setInterval(loop,15000);loop();
const stop=()=>{clearInterval(timer);server.close(()=>{DB.close();process.exit(0);});};process.on('SIGINT',stop);process.on('SIGTERM',stop);
})();
