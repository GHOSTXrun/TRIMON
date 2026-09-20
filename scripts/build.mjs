import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd(),dist=path.join(root,'dist');
const assets={};for(const file of ['index.html','style.css','app.js','characters.png','trimon-logo.jpg','launch.md'])assets['/'+file]={body:fs.readFileSync(path.join(dist,file)).toString('base64'),type:({'html':'text/html; charset=utf-8','css':'text/css','js':'text/javascript','png':'image/png','jpg':'image/jpeg','md':'text/markdown; charset=utf-8'})[file.split('.').pop()]};
const engine=fs.readFileSync('src/engine.mjs','utf8').replaceAll('export ','');
const service=fs.readFileSync('src/service.mjs','utf8').replace(/^import .*;\r?\n/gm,'').replaceAll('export ','');
const localization=fs.readFileSync('src/english.mjs','utf8').replaceAll('export ','');
const code=localization+'\n'+engine+'\n'+service+'\nconst ASSET_DATA='+JSON.stringify(assets)+`;\nexport default {
async fetch(request,env,ctx){
 const response=await api(request,env);if(response)return response;
 if(request.method!=='GET'&&request.method!=='HEAD')return new Response('Method not allowed',{status:405});
 const url=new URL(request.url),name=url.pathname==='/'?'/index.html':url.pathname,a=ASSET_DATA[name];
 if(!a)return new Response('Not found',{status:404});
 const bytes=Uint8Array.from(atob(a.body),c=>c.charCodeAt(0));
 return new Response(request.method==='HEAD'?null:bytes,{headers:{'Content-Type':a.type,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'}});
},async scheduled(event,env,ctx){ctx.waitUntil(Promise.all(MARKETS.map(m=>update(env.DB,m))));}
};`;
fs.mkdirSync('dist/server',{recursive:true});fs.writeFileSync('dist/server/index.js',code);fs.mkdirSync('dist/.openai',{recursive:true});fs.copyFileSync('.openai/hosting.json','dist/.openai/hosting.json');fs.cpSync('drizzle','dist/.openai/drizzle',{recursive:true});console.log('Built TRIMON Worker, embedded public assets and migrations.');
