import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
export function localDB(filename,migrations){
 fs.mkdirSync(path.dirname(filename),{recursive:true});const raw=new DatabaseSync(filename);raw.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY)');
 for(const file of fs.readdirSync(migrations).filter(x=>x.endsWith('.sql')).sort())if(!raw.prepare('SELECT name FROM _migrations WHERE name=?').get(file)){raw.exec('BEGIN');try{raw.exec(fs.readFileSync(path.join(migrations,file),'utf8'));raw.prepare('INSERT INTO _migrations VALUES (?)').run(file);raw.exec('COMMIT');}catch(e){raw.exec('ROLLBACK');throw e;}}
 const prepare=(sql,args=[])=>({bind:(...values)=>prepare(sql,values),run:async()=>{const r=raw.prepare(sql).run(...args);return {meta:{changes:r.changes}};},first:async()=>raw.prepare(sql).get(...args)||null,all:async()=>({results:raw.prepare(sql).all(...args)}),_sql:sql,_args:args});
 return {prepare,async batch(statements){raw.exec('BEGIN IMMEDIATE');try{const results=statements.map(s=>({meta:{changes:raw.prepare(s._sql).run(...s._args).changes}}));raw.exec('COMMIT');return results;}catch(e){raw.exec('ROLLBACK');throw e;}},close:()=>raw.close()};
}
