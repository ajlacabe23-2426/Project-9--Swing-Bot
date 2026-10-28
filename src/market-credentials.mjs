import {randomUUID} from 'node:crypto';
import {chmod,lstat,mkdir,readFile,rename,rm,writeFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const projectRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export const DEFAULT_LOCAL_DATA_DIR=resolve(projectRoot,'.data');
const KEY_PATTERN=/^[A-Za-z0-9._-]{8,512}$/;

export function validateMassiveKey(value){
  if(typeof value!=='string'||!KEY_PATTERN.test(value.trim()))
    throw new Error('Massive API key format is invalid');
  return value.trim();
}

/** Read a private local credential without returning it to any HTTP route. */
export async function loadMarketDataKey({dataDir=DEFAULT_LOCAL_DATA_DIR,environment=process.env}={}){
  if(environment.MASSIVE_API_KEY)return validateMassiveKey(environment.MASSIVE_API_KEY);
  const file=join(resolve(dataDir),'massive-api-key');
  let details;
  try{details=await lstat(file);}catch(error){
    if(error?.code==='ENOENT')return null;
    throw error;
  }
  if(!details.isFile()||details.size>513)throw new Error('Local Massive API key file is invalid');
  const value=(await readFile(file,'utf8')).trim();
  return validateMassiveKey(value);
}

/** Store a one-line key in the git-ignored .data directory with owner-only permissions. */
export async function saveMarketDataKey(value,{dataDir=DEFAULT_LOCAL_DATA_DIR}={}){
  const key=validateMassiveKey(value);
  const directory=resolve(dataDir);
  const file=join(directory,'massive-api-key');
  const temp=join(directory,'.massive-api-key-'+randomUUID()+'.tmp');
  await mkdir(directory,{recursive:true,mode:0o700});
  try{
    await writeFile(temp,key+'\n',{encoding:'utf8',mode:0o600,flag:'wx'});
    await chmod(temp,0o600);
    await rename(temp,file);
    await chmod(file,0o600);
  }finally{await rm(temp,{force:true});}
  return {provider:'Massive Stocks',configured:true,storage:'LOCAL_PRIVATE_FILE'};
}
