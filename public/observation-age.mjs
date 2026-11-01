/** Calendar-day age of a completed historical bar, not exchange session age.
 * Never infer a valid or fresh observation from an invalid or future date. */
export function observationAgeDays(value, now=new Date()){
  if(typeof value!=='string'||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value))return null;
  const target=Date.parse(value+'T00:00:00.000Z');
  if(!Number.isFinite(target)||new Date(target).toISOString().slice(0,10)!==value)return null;
  const today=Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate());
  const age=Math.floor((today-target)/86400000);
  return age<0?null:age;
}
