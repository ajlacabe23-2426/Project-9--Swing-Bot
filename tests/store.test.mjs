import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PaperStore} from '../src/store.mjs';
import {step} from '../src/engine.mjs';
test('single-process disk persistence survives restart and serializes mutations',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'project9-'));
  try{
    const file=join(dir,'paper.json'),store=new PaperStore(file);await store.init();
    await Promise.all(Array.from({length:4},()=>store.mutate(s=>step(s).state)));
    assert.equal(store.state.cursor,33);
    const restarted=new PaperStore(file);await restarted.init();
    assert.deepEqual(restarted.state,store.state);
    assert.equal(JSON.parse(await readFile(file,'utf8')).cursor,33);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('corrupt paper state is rejected instead of silently reset',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'project9-'));
  try{const file=join(dir,'paper.json');await writeFile(file,'{"version":9000}');await assert.rejects(()=>new PaperStore(file).init(),/Invalid state/);}
  finally{await rm(dir,{recursive:true,force:true});}
});
