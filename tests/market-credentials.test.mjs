import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,lstat,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadMarketDataKey,saveMarketDataKey,validateMassiveKey} from '../src/market-credentials.mjs';

test('private provider key is persisted with no public metadata or logs',async()=>{
  const root=await mkdtemp(join(tmpdir(),'project9-provider-'));
  const secret='test-provider-example-key-123';
  try{
    const result=await saveMarketDataKey(secret,{dataDir:root});
    assert.deepEqual(result,{provider:'Massive Stocks',configured:true,storage:'LOCAL_PRIVATE_FILE'});
    const credentialPath=join(root,'massive-api-key');
    const file=await lstat(credentialPath);
    assert.ok(file.isFile());
    if(process.platform!=='win32')assert.equal(file.mode&0o777,0o600);
    assert.equal((await readFile(credentialPath,'utf8')).trim(),secret);
    assert.equal(await loadMarketDataKey({dataDir:root,environment:{}}),secret);
    assert.equal(await loadMarketDataKey({dataDir:root,environment:{MASSIVE_API_KEY:'env-overrides-file'}}),'env-overrides-file');
  }finally{
    await rm(root,{recursive:true,force:true});
  }
});

test('missing key returns null; invalid keys are rejected and not stored',async()=>{
  const root=await mkdtemp(join(tmpdir(),'project9-provider-missing-'));
  try{
    assert.equal(await loadMarketDataKey({dataDir:root,environment:{}}),null);
    for(const invalid of ['', 'short','fake key with spaces','bad\nnewline','x'.repeat(513)]){
      assert.throws(()=>validateMassiveKey(invalid),/format is invalid/);
      await assert.rejects(()=>saveMarketDataKey(invalid,{dataDir:root}),/format is invalid/);
    }
    assert.equal(await loadMarketDataKey({dataDir:root,environment:{}}),null);
    await writeFile(join(root,'massive-api-key'),'short\n');
    await assert.rejects(()=>loadMarketDataKey({dataDir:root,environment:{}}),/format is invalid/);
  }finally{
    await rm(root,{recursive:true,force:true});
  }
});
