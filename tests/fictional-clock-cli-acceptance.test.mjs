import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function cli(cwd,name,...args){
  const path=fileURLToPath(new URL('../scripts/'+name+'.mjs',import.meta.url));
  const result=spawnSync(process.execPath,[path,...args],{
    cwd,encoding:'utf8',timeout:10000,maxBuffer:1024*1024
  });
  if(result.error)throw result.error;
  assert.equal(result.signal,null);
  return {status:result.status,stdout:result.stdout,stderr:result.stderr};
}
function successful(cwd,name,...args){
  const r=cli(cwd,name,...args);
  assert.equal(r.status,0,r.stderr);
  return r.stdout;
}

test('separate classroom CLI sessions reproduce identical evidence and standalone reports',
  {timeout:60000},async()=>{
    const root=await mkdtemp(join(tmpdir(),'clock-cli-'));
    const other=await mkdtemp(join(tmpdir(),'clock-cli-'));
    try{
      const expected={complete:[72,0,0,0],gap:[70,2,0,0],duplicate:[73,0,1,0],reversed:[72,0,0,1]};
      const ids=[];
      for(const scenario of Object.keys(expected)){
        const first=JSON.parse(successful(root,'replay-fictional-clock',scenario));
        const second=JSON.parse(successful(other,'replay-fictional-clock',scenario));
        const repeated=JSON.parse(successful(root,'replay-fictional-clock',scenario));
        assert.equal(first.id,second.id);
        assert.equal(first.id,repeated.id);
        assert.deepEqual([first.report.received,first.report.missing,first.report.duplicates,first.report.reversed],expected[scenario]);
        assert.equal(first.report.marketDataUsed,false);
        assert.equal(first.report.transactionsEnabled,false);
        const bytes=await readFile(first.file);
        assert.equal(hash(bytes),first.id);
        assert.deepEqual(bytes,await readFile(second.file));
        ids.push(first.id+'.json');
      }
      const directory=join(root,'.data','fictional-clock-replay');
      assert.deepEqual((await readdir(directory)).sort(),ids.sort());
      const audit=JSON.parse(successful(root,'audit-fictional-clock'));
      assert.equal(audit.verified,4);
      assert.equal(audit.reviewRequired,false);
      const html=successful(root,'report-fictional-clock');
      assert.equal(html,successful(other,'report-fictional-clock'));
      assert.match(html,/4 of 4 built-in fixtures/);
      assert.match(html,/70 of 72 unique readings/);
      await writeFile(join(directory,'.pending-fixture'),'partial');
      const interrupted=cli(root,'audit-fictional-clock');
      assert.equal(interrupted.status,2);
      assert.equal(JSON.parse(interrupted.stdout).reviewRequired,true);
      assert.match(successful(root,'report-fictional-clock'),/Interrupted or active write/);
      assert.equal(await readFile(join(directory,'.pending-fixture'),'utf8'),'partial');
      const original=await readFile(join(directory,ids[0]));
      await writeFile(join(directory,ids[0]),'corrupt');
      const damaged=cli(root,'audit-fictional-clock');
      assert.equal(damaged.status,2);
      assert.equal(JSON.parse(damaged.stdout).verified,3);
      assert.match(successful(root,'report-fictional-clock'),/Invalid evidence/);
      assert.notDeepEqual(await readFile(join(directory,ids[0])),original);
      assert.equal(cli(root,'replay-fictional-clock','--live').status,1);
    }finally{
      await rm(root,{recursive:true,force:true});
      await rm(other,{recursive:true,force:true});
    }
  });
