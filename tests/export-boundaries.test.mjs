import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalize,privatePackage,buildViews,themeCards,explorationProject,updateProject,publicProject} from '../web/core.mjs';
import {readZip,makeZip} from '../web/zip.mjs';

const project=()=>normalize({books:[{id:'a',title:'Synthetic',tags:['Topic']}]});
test('public export preserves selected raw book tags without retaining private material',()=>{
  const p=project();p.books[0].evidence=[{id:'a:e0',text:'PRIVATE',kind:'note'}];
  const out=publicProject(p,['a']).project;
  assert.equal(buildViews(out).graph.nodes.find(n=>n.group==='theme').label,'Topic');
  assert(!JSON.stringify(out).includes('PRIVATE'));
});
test('ordinary prototype-shaped names remain literal themes across save and update',()=>{
  for(const name of ['toString','valueOf','hasOwnProperty','__defineGetter__']){
    let p=normalize({books:[{id:name,title:'Synthetic',tags:[name]}]});
    for(const convert of [v=>v,privatePackage,v=>privatePackage(explorationProject(v)),v=>updateProject(v,v)]){
      p=convert(p);const theme=buildViews(p).graph.nodes.find(n=>n.group==='theme');
      assert.equal(theme.label,name);assert.equal(theme.mentions,1);assert.equal(typeof theme.card,'string');
      assert.match(themeCards(p)[name],/^# /);
    }
  }
});
test('explicit aliases and cards with ordinary prototype names still work',()=>{
  const p=project();p.settings.aliases.Topic='toString';p.edits.cards.toString='Kept';
  assert.equal(buildViews(privatePackage(p)).graph.nodes.find(n=>n.group==='theme').card,'Kept');
});
test('oversize theme cards reject saves and restores without mutating the source',()=>{
  for(const section of ['cards','edits']){
    const p=project(),target=section==='cards'?p.cards:p.edits.cards;
    target.Topic='x'.repeat(20000);assert.equal((section==='cards'?privatePackage(p).cards:privatePackage(p).edits.cards).Topic.length,20000);
    target.Topic+='x';for(const convert of [privatePackage,explorationProject])assert.throws(()=>convert(p),/主题卡/);
    assert.equal(target.Topic.length,20001);
  }
});
test('ZIP count mismatch cannot silently omit a second material file',async()=>{
  const b=await makeZip({'books.json':'{}','notes/a.md':'KEEP'}).arrayBuffer(),v=new DataView(b),end=b.byteLength-22;
  v.setUint16(end+8,1,true);v.setUint16(end+10,1,true);
  await assert.rejects(readZip(b),/目录/);
});
test('ZIP local filename and central filename must agree',async()=>{
  const b=await makeZip({'books.json':'{}'}).arrayBuffer();new Uint8Array(b).set(new TextEncoder().encode('other.json'),30);
  await assert.rejects(readZip(b),/条目/);
});
test('ZIP directory size, disk count, local flags and payload sizes are checked',async()=>{
  for(const change of [(v,e)=>v.setUint32(e+12,1,true),(v,e)=>v.setUint16(e+8,0,true),v=>v.setUint16(6,0,true),v=>v.setUint32(18,1,true)]){
    const b=await makeZip({'books.json':'{}'}).arrayBuffer();change(new DataView(b),b.byteLength-22);await assert.rejects(readZip(b));
  }
});
test('normal, empty and commented ZIP archives round-trip',async()=>{
  for(const files of [{},{'books.json':'{}','notes/甲.md':'完整材料'}])assert.deepEqual(await readZip(await makeZip(files).arrayBuffer()),files);
  const b=new Uint8Array(await makeZip({'books.json':'{}'}).arrayBuffer()),comment=new Uint8Array(30),out=new Uint8Array(b.length+comment.length);
  new DataView(comment.buffer).setUint32(0,0x06054b50,true);out.set(b);out.set(comment,b.length);new DataView(out.buffer).setUint16(b.length-2,comment.length,true);
  assert.deepEqual(await readZip(out.buffer),{'books.json':'{}'});
});
