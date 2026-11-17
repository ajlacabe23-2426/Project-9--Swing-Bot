import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {performance} from 'node:perf_hooks';

// Test infrastructure only. Never reuse a personal browser profile.
export async function launchChromium({binary,args,profile,timeoutMs=15000,pollMs=120}){
  const started=performance.now();
  const state={binary,pid:null,spawned:false,exit:null,closed:false,cleanup:null,launchError:null,
    portFile:'not-read',stderrTail:'',elapsedMs:0};
  const ownedGroup=process.platform!=='win32';
  const child=spawn(binary,args,{stdio:['ignore','ignore','pipe'],detached:ownedGroup});
  state.pid=child.pid??null;
  child.once('spawn',()=>{state.spawned=true;});
  child.once('error',error=>{state.launchError={code:error.code,message:error.message};});
  child.once('exit',(code,signal)=>{state.exit={code,signal};});
  const closed=new Promise(resolve=>child.once('close',()=>{state.closed=true;resolve();}));
  child.stderr.on('data',chunk=>{
    state.stderrTail=(state.stderrTail+chunk.toString()).slice(-8192);
  });
  const snapshot=()=>({...state,elapsedMs:Math.round(performance.now()-started)});
  const stop=async()=>{
    if(state.cleanup?.complete)return;
    state.cleanup={signals:[],complete:false};
    const signal=name=>{
      if(!child.pid)return;
      try{
        const sent=ownedGroup?(process.kill(-child.pid,name),true):child.kill(name);
        state.cleanup.signals.push({name,sent});
      }catch(error){
        state.cleanup.signals.push({name,error:error.code});
        if(error.code!=='ESRCH')throw error;
      }
    };
    const waitClose=async()=>{
      if(state.closed)return;
      let timer;
      await Promise.race([closed,new Promise(resolve=>{timer=setTimeout(resolve,1000);})]);
      clearTimeout(timer);
    };
    signal('SIGTERM');
    await waitClose();
    // Kill only our detached group, including wrappers' surviving descendants.
    if(ownedGroup||!state.closed)signal('SIGKILL');
    await waitClose();
    state.cleanup.complete=state.closed;
    if(!state.closed)throw new Error('Chromium cleanup did not observe child/stdio closure');
  };
  try{
    while(performance.now()-started<timeoutMs){
      if(state.launchError)throw new Error('Chromium spawn failed');
      if(state.exit)throw new Error('Chromium exited before debugging port became ready');
      try{
        const text=await readFile(join(profile,'DevToolsActivePort'),'utf8');
        const [portLine,path]=text.trim().split('\n');
        const port=Number(portLine);
        if(/^\d+$/.test(portLine)&&Number.isInteger(port)&&port>0&&port<=65535&&path?.startsWith('/devtools/browser/')){
          if(state.exit)throw new Error('Chromium exited while reading debugging port');
          state.portFile='valid';
          return {child,port,diagnostics:snapshot,stop};
        }
        state.portFile='invalid:'+text.slice(0,200);
      }catch(error){
        if(state.exit)throw new Error('Chromium exited before debugging port became ready',{cause:error});
        state.portFile=error.code||error.message;
      }
      await new Promise(resolve=>setTimeout(resolve,Math.min(pollMs,Math.max(1,timeoutMs-(performance.now()-started)))));
    }
    throw new Error('Timed out waiting for Chromium debugging port');
  }catch(error){
    const evidence=snapshot();
    let cleanupError;
    try{await stop();}catch(failure){cleanupError=failure.message;}
    throw new Error(error.message+'; startup='+JSON.stringify(evidence)+'; final='+JSON.stringify({...snapshot(),cleanupError}),{cause:error});
  }
}
