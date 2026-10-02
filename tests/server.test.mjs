import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server.mjs';
import {PaperStore} from '../src/store.mjs';
test('local HTTP API restricts origin, host and inputs and has no broker endpoint',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'project9-')),port=49000+Math.floor(Math.random()*1000);
  const app=await createApp({port,store:new PaperStore(join(dir,'state.json'))});
  await new Promise((resolve,reject)=>app.once('error',reject).listen(port,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+port;
  try{
    const home=await fetch(base+'/');assert.equal(home.status,200);assert.match(await home.text(),/EDUCATIONAL SIMULATION/);
    const state=await (await fetch(base+'/api/state')).json();assert.equal(state.cursor,29);assert.equal(state.mode,'SYNTHETIC_ONLY');
    assert.equal((await fetch(base+'/api/broker/orders')).status,404);
    const researchPage=await fetch(base+'/research.html');
    assert.equal(researchPage.status,200);
    assert.match(await researchPage.text(),/UNVERIFIED DATA/);
    assert.equal((await fetch(base+'/research-core.mjs')).status,200);
    assert.equal((await fetch(base+'/research.js')).status,200);
    assert.equal((await fetch(base+'/api/upload')).status,404);
    const badOrigin=await fetch(base+'/api/step',{method:'POST',headers:{'Content-Type':'application/json','Origin':'https://evil.example'},body:'{}'});assert.equal(badOrigin.status,403);
    const missingOrigin=await fetch(base+'/api/step',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(missingOrigin.status,403);
    const invalid=await fetch(base+'/api/run',{method:'POST',headers:{'Content-Type':'application/json','Origin':base},body:JSON.stringify({count:100})});assert.equal(invalid.status,400);
    const extra=await fetch(base+'/api/step',{method:'POST',headers:{'Content-Type':'application/json','Origin':base},body:JSON.stringify({broker:'live'})});assert.equal(extra.status,400);
    const resetBad=await fetch(base+'/api/reset',{method:'POST',headers:{'Content-Type':'application/json','Origin':base},body:JSON.stringify({seed:0})});assert.equal(resetBad.status,400);
    const advance=await fetch(base+'/api/step',{method:'POST',headers:{'Content-Type':'application/json','Origin':base},body:'{}'});assert.equal(advance.status,200);assert.equal((await advance.json()).cursor,30);
    const reset=await fetch(base+'/api/reset',{method:'POST',headers:{'Content-Type':'application/json','Origin':base},body:JSON.stringify({seed:92})});assert.equal(reset.status,200);assert.equal((await reset.json()).seed,92);
    assert.equal((await fetch(base+'/../.data/state.json')).status,404);
    assert.match(home.headers.get('content-security-policy'),/default-src 'none'/);
  }finally{await new Promise(resolve=>app.close(resolve));await rm(dir,{recursive:true,force:true});}
});
