const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
const root=process.argv[2]||'.';
const source=fs.readFileSync(root+'/workers/meta-collector/entry.js','utf8').replace(/^import authWorker[^\n]*\n/,'').replace('export default {','const worker = {');
function context(){const calls=[];const c=vm.createContext({console,Response,Request,Headers,URL,URLSearchParams,crypto:webcrypto,Date,authWorker:{fetch:async()=>new Response('ok')},fetch:async(u,o)=>{calls.push([u,o]);return new Response(JSON.stringify(u.includes('meta_claim')?true:[]));},_calls:calls});vm.runInContext(source,c);return c;}
(async()=>{
  for(const [kind,code,text,expected] of [['401',401,'','expired'],['html',200,'<!DOCTYPE html><title>Sorry! Access denied</title>','expired'],['server',503,'unavailable','error'],['ok',200,'','active']]){
    const c=context();Object.assign(c,{_code:code,_text:text,_kind:kind,_saves:[]});
    vm.runInContext(`sessionState=async()=>({status:'active',cookie_bundle:'mock=test',updated_at:'2026-10-08T00:00:00Z'});purgeStaleRealtimeRows=async()=>0;ensureBatches=async()=>{};dueBatches=async()=>[{id:'batch',camp_name:'test',wave:'WAVE2'}];processBatch=async()=>{if(_kind!=='ok')throw metaRequestError({status:_code,text:_text});return{workers:1}};saveSession=async(...args)=>_saves.push(args);`,c);
    const r=await vm.runInContext('runCollector({SUPABASE_SERVICE_ROLE_KEY:"test"})',c);
    assert.equal(r.ok,kind==='ok');assert.equal(c._saves.length,1);assert.equal(c._saves[0][2],expected);console.log('PASS no false success',kind);
  }
  for(const state of [{status:'expired',cookie_bundle:'mock=test'},{collector_paused:true,cookie_bundle:'mock=test'}]){
    const c=context();c._state=state;vm.runInContext('sessionState=async()=>_state;',c);await vm.runInContext('runCollector({SUPABASE_SERVICE_ROLE_KEY:"test"})',c);assert.equal(c._calls.length,0);console.log('PASS no repeated requests',state.status||'paused');
  }
  const c=context();await vm.runInContext('saveSession({SUPABASE_SERVICE_ROLE_KEY:"test"},new Map([["mock","test"]]),"expired",401,"error","2026-10-08T00:00:00Z")',c);const [url,options]=c._calls[0];const body=JSON.parse(options.body);assert(url.includes('updated_at=eq.'));assert(!url.includes('mock'));assert(!('cookie_bundle'in body));assert(!('last_success_at'in body));assert(body.updated_at.endsWith('Z'));console.log('PASS compare-and-set / no cookie overwrite / UTC state time');
  for(const name of ['home','realtime']){const html=fs.readFileSync(root+'/public/'+name,'utf8');assert(html.includes('/meta-connection.js?v=20261008-recovery1'));for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)){new vm.Script(m[1]);}console.log('PASS frontend syntax and recovery hook',name);}
})().catch(e=>{console.error(e);process.exit(1)});
