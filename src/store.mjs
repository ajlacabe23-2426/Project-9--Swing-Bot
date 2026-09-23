import {readFile,mkdir,writeFile,rename} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {initialState,VERSION,START_CURSOR} from './engine.mjs';
// One local process; not a remotely accessible multi-user account database.
export class PaperStore {
  constructor(file=resolve('.data/paper.json')){this.file=resolve(file);this.state=null;this.queue=Promise.resolve();}
  async init(){
    try{const state=JSON.parse(await readFile(this.file,'utf8'));if(!isValid(state))throw new Error('Invalid state: refuse to overwrite');this.state=state;}
    catch(error){if(error.code!=='ENOENT')throw error;this.state=initialState();await this.save(this.state);}
    return this.state;
  }
  async save(state){
    if(!isValid(state))throw new Error('Refusing invalid paper state');
    await mkdir(dirname(this.file),{recursive:true,mode:0o700});
    const temporary=this.file+'.'+process.pid+'.tmp';
    await writeFile(temporary,JSON.stringify(state,null,2)+'\n',{encoding:'utf8',mode:0o600});
    await rename(temporary,this.file);
  }
  async mutate(updater){
    const operation=this.queue.then(async()=>{
      const next=updater(structuredClone(this.state));
      await this.save(next);this.state=next;return next;
    });
    this.queue=operation.catch(()=>{});
    return operation;
  }
}
export function isValid(s){
  return !!s&&typeof s==='object'&&s.version===VERSION&&
    Number.isSafeInteger(s.seed)&&s.seed>=1&&s.seed<=1_000_000&&
    Number.isSafeInteger(s.cursor)&&s.cursor>=START_CURSOR&&s.cursor<190&&
    Number.isFinite(s.cash)&&s.cash>=0&&Number.isFinite(s.quantity)&&s.quantity>=0&&
    (s.pending===null||(['ENTER','EXIT'].includes(s.pending?.side)&&typeof s.pending.signalDate==='string'))&&
    Array.isArray(s.trades)&&s.trades.length<=190&&Array.isArray(s.events)&&s.events.length<=380&&
    Array.isArray(s.equity)&&s.equity.length===s.cursor-START_CURSOR+1;
}
