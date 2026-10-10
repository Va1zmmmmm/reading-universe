import test from 'node:test';
import assert from 'node:assert/strict';
import {atlasFixture} from './fixtures/atlas-project.mjs';
import {publicExploration} from '../web/core.mjs';
import {validatePublicAtlas} from '../web/public-atlas-contract.mjs';
const permission=(nodes=[{id:'door',interpretation:true},{id:'train',interpretation:true}])=>[{id:'own-theme',introduction:true,nodes}];
const publish=(p=atlasFixture(),perm=permission(),ids=['own'])=>publicExploration(p,ids,perm);

test('public exploration requires explicit introduction and every selected interpretation',()=>{
  assert.throws(()=>publish(undefined,[]),/主题/);
  const absent=permission();absent[0].introduction=false;assert.throws(()=>publish(undefined,absent),/开场/);
  const withheld=permission();withheld[0].nodes[1].interpretation=false;assert.throws(()=>publish(undefined,withheld),/解读/);
  assert.throws(()=>publish(undefined,permission([{id:'train',interpretation:true}])),/开场/);
});
test('approved prose has provenance and independent quote permission; private state and full originals never exported',()=>{
  const result=publish(),body=JSON.stringify(result);
  assert.equal(result.themes[0].basis,'ai-draft');assert.equal(result.themes[0].nodes[0].materialKind,'note');
  assert.equal(result.themes[0].nodes[0].quote,undefined);
  for(const token of ['PRIVATE_','SECRET_TOKEN','stable-door','bookmark-door','own-theme','今天出发','门口停了一会儿。','2026-01-02','sourceLocator','journey','evidence'])assert.ok(!body.includes(token),token);
  const withQuote=permission();withQuote[0].nodes[0].quote=true;
  const selected=publish(undefined,withQuote);assert.deepEqual(selected.themes[0].nodes[0].quote,{excerpt:'门口停了一会儿。'});
  assert.equal(selected.themes[0].nodes[1].quote,undefined);
  assert.ok(!JSON.stringify(selected).includes('今天出发'));
});
test('selected connected branch prunes other choices and refuses unreachable selected fragments',()=>{
  const p=atlasFixture(),t=p.exploration.themes[0];
  t.nodes.push({...structuredClone(t.nodes[1]),id:'side',title:'另一种看法'});
  t.nodes[0].choices.push({target:'side',label:'换条路',hint:'去另一处',bridge:'比较一下这两个位置。'});
  const result=publish(p,permission([{id:'door',interpretation:true},{id:'side',interpretation:true}]));
  assert.equal(result.themes[0].nodes.length,2);assert.deepEqual(result.themes[0].nodes[0].choices.map(c=>c.target),['n-2']);
  t.nodes[0].choices.pop();t.nodes[1].choices.push({target:'side',label:'换条路',hint:'去另一处',bridge:'比较一下这两个位置。'});
  assert.throws(()=>publish(p,permission([{id:'door',interpretation:true},{id:'side',interpretation:true}])),/不可达/);
});
test('hidden book references and invalid evidence cannot enter approved public prose',()=>{
  const p=atlasFixture();p.exploration.themes[0].opening+='另一段旅程';assert.throws(()=>publish(p),/未公开的书/);
  assert.equal(publish(p,permission(),['own','other']).books.length,2);
  const fake=atlasFixture();fake.exploration.themes[0].nodes[0].quote.excerpt='伪造的引文';assert.throws(()=>publish(fake),/引文|材料|原文/);
  assert.throws(()=>publish(undefined,permission(),['other']),/书目/);
});
test('public reader accepts only a connected whitelist and delimiter-safe routes',()=>{
  const p=publish();p.key='SECRET_TOKEN';p.journey={notes:'PRIVATE_NOTE'};p.books[0].evidence=[{text:'PRIVATE_SOURCE'}];p.themes[0].nodes[0].sourceLocator={bookmarkId:'PRIVATE_ID'};
  const out=validatePublicAtlas(p);assert.ok(!JSON.stringify(out).includes('PRIVATE_'));assert.ok(!JSON.stringify(out).includes('SECRET_TOKEN'));
  const broken=structuredClone(p);broken.themes[0].nodes[0].choices[0].target='missing';assert.throws(()=>validatePublicAtlas(broken),/断路/);
  const noProse=structuredClone(p);noProse.themes[0].nodes[0].observation='';assert.throws(()=>validatePublicAtlas(noProse),/缺少文字/);
  const delimiter=structuredClone(p);delimiter.themes[0].id='theme~bad';assert.throws(()=>validatePublicAtlas(delimiter),/分隔符/);
});
