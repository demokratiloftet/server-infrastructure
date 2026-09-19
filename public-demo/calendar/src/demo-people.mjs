import {randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync,renameSync} from 'node:fs';
export function demoPeople(file) {
  let people={};
  try {people=JSON.parse(readFileSync(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  return {
    all:()=>({...people}),
    create(name){
      if(typeof name!=='string'||!name.trim()||name.trim().length>60||/[\x00-\x1f\x7f]/.test(name))throw new Error('Use a fictional name of 1–60 characters');
      if(Object.keys(people).length>=200)throw new Error('Demo person limit reached');
      const id=randomUUID(),next={...people,[id]:name.trim()};
      writeFileSync(file+'.tmp',JSON.stringify(next),{mode:0o600});renameSync(file+'.tmp',file);people=next;
      return id;
    },
  };
}
export const html=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
