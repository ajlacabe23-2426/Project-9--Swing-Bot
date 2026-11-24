import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';

const command=promisify(execFile);
const projectRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');

test('unsupported Node is rejected by imported createApp and StarNet Phase 3 before state or report writes',async()=>{
  // Separate process: mock only the runtime version identifier, not system Node
  // or network capabilities. The main test process remains on its patched Node.
  const child=String.raw`
    import assert from 'node:assert/strict';
    import {mkdtemp,readdir,rm} from 'node:fs/promises';
    import {tmpdir} from 'node:os';
    import {join} from 'node:path';
    import {createApp} from './server.mjs';
    import {runStarNetPhase3} from './scripts/starnet-phase3-verify.mjs';

    const directory=await mkdtemp(join(tmpdir(),'p9-old-node-stop-'));
    let stateInitializations=0;
    let acceptanceInvocations=0;
    let commitReads=0;
    try{
      for(const unsupported of ['22.23.4','24.22.2','26.13.0']){
        Object.defineProperty(process.versions,'node',{value:unsupported,configurable:true});
        await assert.rejects(
          ()=>createApp({port:4179,store:{
            file:join(directory,'must-not-create.json'),
            init:async()=>{stateInitializations++;}
          }}),
          /security-patched Node.js runtime/
        );
        await assert.rejects(
          ()=>runStarNetPhase3({
            reportDir:join(directory,'should-not-be-written'),
            commitReader:async()=>{commitReads++;return 'a'.repeat(40);},
            acceptanceRunner:async()=>{acceptanceInvocations++;throw new Error('SHOULD_NOT_RUN');}
          }),
          /security-patched Node.js runtime/
        );
      }
      assert.equal(stateInitializations,0);
      assert.equal(acceptanceInvocations,0);
      assert.equal(commitReads,0);
      assert.deepEqual(await readdir(directory),[]);
      process.stdout.write('RUNTIME_GUARDS_BLOCKED_BEFORE_SIDE_EFFECTS\\n');
    }finally{
      await rm(directory,{recursive:true,force:true});
    }
  `;
  const {stdout}=await command(process.execPath,['--input-type=module','--eval',child],
    {cwd:projectRoot,timeout:15000,maxBuffer:250000});
  assert.match(stdout,/RUNTIME_GUARDS_BLOCKED_BEFORE_SIDE_EFFECTS/);
});
