import {renderFictionalLabDashboard} from '../src/educational-lab-dashboard.mjs';

const args=process.argv.slice(2);
if(!(args.length===1||(args.length===4&&args[1]==='--compare'))){
  console.error('Usage: node scripts/render-educational-lab.mjs <trusted-local-fictional-registry-directory> [--compare <fingerprint-A> <fingerprint-B>]');
  process.exitCode=2;
}else{
  try{process.stdout.write(renderFictionalLabDashboard(args[0],args.slice(2)));}
  catch{console.error('Fictional laboratory report unavailable. Check the local registry.');process.exitCode=1;}
}
