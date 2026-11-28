// Local acceptance of non-financial classroom components only.
import {spawnSync} from 'node:child_process';
import {platform,arch,release} from 'node:os';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {assessClassroomTestResult} from '../src/classroom-test-result.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const args=process.argv.slice(2);
if(args.length!==0&&!(args.length===1&&args[0]==='--browser')){
  console.error('Usage: node scripts/accept-fictional-clock-local.mjs [--browser]');
  process.exitCode=1;
}else{
  const run=(binary,argv,env=process.env)=>spawnSync(binary,argv,{
    cwd:root,env,encoding:'utf8',timeout:120000,maxBuffer:4*1024*1024
  });
  const revision=run('git',['rev-parse','HEAD']);
  const status=run('git',['status','--porcelain']);
  const report={scope:'FICTIONAL_CLASSROOM_COMPONENTS_ONLY',platform:platform(),architecture:arch(),
    osRelease:release(),node:process.version,revision:revision.status===0?revision.stdout.trim():null,
    cleanCheckout:status.status===0&&status.stdout.trim()==='',checks:[],
    physicalDeviceIdentityVerified:false,independentReviewerVerified:false,
    marketDataUsed:false,transactionsEnabled:false};
  const tests=['replay','crash','evidence-audit','statistics','audit-report','cli-acceptance','result-parser']
    .map(s=>resolve(root,'tests','fictional-clock-'+s+'.test.mjs'));
  function check(name,argv,env){
    const cleanEnv={...process.env,...env};
    delete cleanEnv.NODE_OPTIONS;
    const r=run(process.execPath,['--test-reporter=tap',...argv],cleanEnv);
    const assessment=assessClassroomTestResult(r);
    report.checks.push({name,...assessment,exitCode:r.status,
      error:assessment.result==='PASS'?null:String(r.error?.message||r.stderr||r.stdout||assessment.reason).slice(-2000)});
  }
  check('offline components',['--test',...tests]);
  if(args.includes('--browser')){
    const binary=process.env.CHROME_BIN||(platform()==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':'google-chrome');
    check('sandboxed browser',['--test',resolve(root,'tests/browser-fictional-clock-report.test.mjs')],
      {...process.env,RUN_CLOCK_BROWSER:'1',CHROME_BIN:binary});
  }else report.checks.push({name:'sandboxed browser',result:'NOT_RUN'});
  report.result=report.checks.some(x=>x.result==='FAIL')?'FAIL':
    report.cleanCheckout&&report.revision&&report.checks.every(x=>x.result==='PASS')?'PASS_COMPONENTS_ONLY':'INCOMPLETE';
  console.log(JSON.stringify(report,null,2));
  if(report.result!=='PASS_COMPONENTS_ONLY')process.exitCode=report.result==='FAIL'?1:2;
}
