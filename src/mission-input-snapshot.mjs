import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {basename,resolve} from 'node:path';

const MAX_BYTES=2_000_000;
const digest=(bytes)=>createHash('sha256').update(bytes).digest('hex');
const deepFreeze=(value)=>{
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    Object.freeze(value);
    for(const child of Object.values(value))deepFreeze(child);
  }
  return value;
};

export async function createMissionInputSnapshot(paths,{maxBytes=MAX_BYTES,validate}={}){
  if(!Array.isArray(paths)||paths.length<1)throw new Error('Mission input paths are required');
  const entries=[];
  for(const path of paths){
    const absolute=resolve(path),bytes=await readFile(absolute);
    if(bytes.byteLength>maxBytes)throw new Error('Mission dataset exceeds snapshot size limit: '+basename(path));
    const text=bytes.toString('utf8');
    const data=JSON.parse(text);
    if(validate)await validate(data,absolute);
    entries.push(Object.freeze({path:absolute,filename:basename(path),sha256:digest(bytes),bytes:text,data:deepFreeze(data)}));
  }
  return Object.freeze(entries);
}

export async function assertMissionInputSnapshot(snapshot){
  if(!Array.isArray(snapshot)||snapshot.length<1)throw new Error('Mission input snapshot is required');
  for(const entry of snapshot){
    const bytes=await readFile(entry.path),actual=digest(bytes);
    if(actual!==entry.sha256)throw new Error('Mission input changed during run: '+entry.filename);
  }
  return true;
}

export function snapshotEntries(snapshot){
  return Object.freeze(snapshot.map(({filename,sha256,data})=>Object.freeze({filename,sha256,data})));
}
