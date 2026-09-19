import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {demoPeople,html} from '../src/demo-people.mjs';
test('new demo people have distinct persistent identities, including identical display names',t=>{
 const dir=mkdtempSync(join(tmpdir(),'demo-people-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const file=join(dir,'people.json'),people=demoPeople(file),a=people.create('Kari Demo'),b=people.create('Kari Demo');
 assert.notEqual(a,b);assert.equal(demoPeople(file).all()[a],'Kari Demo');
 assert.throws(()=>people.create(''));assert.throws(()=>people.create('a'.repeat(61)));assert.throws(()=>people.create('bad\nname'));
 assert.equal(html('<img onerror="bad">'),'&lt;img onerror=&quot;bad&quot;&gt;');
});
