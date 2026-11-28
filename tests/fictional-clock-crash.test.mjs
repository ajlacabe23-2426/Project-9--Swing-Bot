import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readdir,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {saveClockEvidence} from '../src/fictional-clock-replay.mjs';

const moduleUrl=new URL('../src/fictional-clock-replay.mjs',import.meta.url).href;
// Intercept only the publication boundary in an isolated child. This executes
// the real classroom writer, not a simulated copy of its persistence logic.
function interruptedWrite(dir,stage){
  const code=`
    import fs from 'node:fs/promises';
    import {syncBuiltinESMExports} from 'node:module';
    const original=fs.link;
    fs.link=async(...args)=>{
      if(process.argv[2]==='before')process.kill(process.pid,'SIGKILL');
      await original(...args);
      process.kill(process.pid,'SIGKILL');
    };
    syncBuiltinESMExports();
    const {saveClockEvidence}=await import(${JSON.stringify(moduleUrl)});
    await saveClockEvidence(process.argv[1],'gap');
  `;
  return new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,['--input-type=module','-e',code,dir,stage],
      {stdio:'ignore'});
    const timeout=setTimeout(()=>{child.kill('SIGKILL');reject(new Error('Child timeout'));},8000);
    child.once('error',error=>{clearTimeout(timeout);reject(error);});
    child.once('exit',(code,signal)=>{clearTimeout(timeout);resolve({code,signal});});
  });
}
for(const stage of ['before','after']){
  test('fictional evidence process interruption '+stage+' publication',
    {skip:process.platform==='win32'},async()=>{
      const dir=await mkdtemp(join(tmpdir(),'clock-crash-'));
      try{
        const result=await interruptedWrite(dir,stage);
        assert.equal(result.signal,'SIGKILL');
        const files=await readdir(dir);
        assert.equal(files.filter(x=>x.startsWith('.pending-')).length,1);
        assert.equal(files.filter(x=>x.endsWith('.json')).length,stage==='after'?1:0);
        const recovered=await saveClockEvidence(dir,'gap');
        const after=await readdir(dir);
        assert.equal(after.filter(x=>x.endsWith('.json')).length,1);
        assert.equal(after.filter(x=>x.startsWith('.pending-')).length,1);
        assert.deepEqual(JSON.parse(await readFile(recovered.file,'utf8')),recovered.report);
      }finally{await rm(dir,{recursive:true,force:true});}
    });
}
