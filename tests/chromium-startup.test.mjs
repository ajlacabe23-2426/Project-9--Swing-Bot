import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {launchChromium} from './chromium-startup.mjs';

async function fixture(t){
  const dir=await mkdtemp(join(tmpdir(),'p9-startup-'));
  const profile=join(dir,'profile');
  await mkdir(profile);
  t.after(()=>rm(dir,{recursive:true,force:true}));
  return profile;
}
function fake(profile,code,options={}){
  return launchChromium({binary:process.execPath,args:['--input-type=module','-e',code,profile],profile,timeoutMs:500,pollMs:10,...options});
}
const writePort="import {writeFileSync} from 'node:fs';import {join} from 'node:path';const file=join(process.argv[1],'DevToolsActivePort');";

test('startup reports missing executable immediately instead of retrying until timeout',async t=>{
  const profile=await fixture(t);
  await assert.rejects(launchChromium({binary:join(profile,'missing'),args:[],profile,timeoutMs:5000,pollMs:10}),error=>{
    assert.match(error.message,/spawn failed/);
    const d=JSON.parse(error.message.split('; startup=')[1]);
    assert.equal(d.launchError.code,'ENOENT');
    assert.equal(d.spawned,false);
    assert.ok(d.elapsedMs<4000);
    return true;
  });
});

test('early child exit includes exit status and bounded stderr',async t=>{
  const profile=await fixture(t);
  await assert.rejects(fake(profile,"process.stderr.write('x'.repeat(20000)+'CI_STARTUP_FAILURE');process.exitCode=23;",{timeoutMs:5000}),error=>{
    assert.match(error.message,/exited before/);
    const d=JSON.parse(error.message.split('; startup=')[1]);
    assert.equal(d.exit.code,23);
    assert.ok(d.stderrTail.length<=8192);
    assert.match(d.stderrTail,/CI_STARTUP_FAILURE$/);
    return true;
  });
});

test('live child without port file times out and is stopped',async t=>{
  const profile=await fixture(t);
  let pid;
  await assert.rejects(fake(profile,"setInterval(()=>{},1000)"),error=>{
    assert.match(error.message,/Timed out waiting/);
    const d=JSON.parse(error.message.split('; startup=')[1]);
    assert.equal(d.portFile,'ENOENT');
    assert.equal(d.exit,null);
    assert.equal(d.spawned,true);
    pid=d.pid;
    return true;
  });
  assert.throws(()=>process.kill(pid,0),{code:'ESRCH'});
});

for(const contents of ['0\n/devtools/browser/id\n','65536\n/devtools/browser/id\n','123x\n/devtools/browser/id\n','12345\n','12345\n/not-devtools\n']){
  test('invalid port record fails closed: '+JSON.stringify(contents),async t=>{
    const profile=await fixture(t);
    await assert.rejects(fake(profile,writePort+`writeFileSync(file,${JSON.stringify(contents)});setInterval(()=>{},1000);`),error=>{
      assert.match(error.message,/Timed out waiting/);
      const d=JSON.parse(error.message.split('; startup=')[1]);
      assert.match(d.portFile,/^invalid:/);
      return true;
    });
  });
}

test('partial port file is retried until complete and accepts only valid dynamic port',async t=>{
  const profile=await fixture(t);
  const launch=await fake(profile,writePort+"writeFileSync(file,'43123\\n');setTimeout(()=>writeFileSync(file,'43123\\n/devtools/browser/test\\n'),60);setInterval(()=>{},1000);",{timeoutMs:5000});
  try{
    assert.equal(launch.port,43123);
    assert.equal(launch.diagnostics().portFile,'valid');
    assert.equal(launch.diagnostics().spawned,true);
  }finally{await launch.stop();}
  assert.throws(()=>process.kill(launch.child.pid,0),{code:'ESRCH'});
});

test('unreadable port path reports filesystem failure, never acceptance',async t=>{
  const profile=await fixture(t);
  await mkdir(join(profile,'DevToolsActivePort'));
  await assert.rejects(fake(profile,'setInterval(()=>{},1000)'),error=>{
    assert.match(error.message,/Timed out waiting/);
    assert.equal(JSON.parse(error.message.split('; startup=')[1]).portFile,'EISDIR');
    return true;
  });
});
