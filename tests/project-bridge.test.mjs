import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalize,privatePackage,explorationProject,publicProject,buildViews,updateProject,fingerprint} from '../web/core.mjs';
import {atlasFixture} from './fixtures/atlas-project.mjs';

test('formal to exploration to formal preserves known metadata, stable evidence and all journeys',()=>{
  const initial=normalize(atlasFixture());let p=initial;
  for(let i=0;i<4;i++)p=privatePackage(explorationProject(p));
  assert.deepEqual(p,initial);
  assert.equal(p.books[0].evidence[0].id,'stable-door');assert.equal(p.books[0].evidence[0].sourceLocator.bookmarkId,'bookmark-door');
  assert.equal(p.analysis.own.fingerprint,'UNCHANGED_HASH');assert.equal(p.links[0].reason,'PRIVATE_LINK_REASON');assert.equal(p.linkCache['other|own'],'HASH_PAIR');
  assert.equal(p.edits.cards.远行,'PRIVATE_EDIT_CARD');assert.deepEqual(p.settings.aliases,{出发:'远行'});assert.equal(p.books[0].finishTime,'2026-01-02');assert.equal(p.books[0].rating,'4');assert.equal(p.journey.sessions[0].notes.length,2);
});
test('saved rich exploration material does not shrink to raw-import samples or 20000 characters',()=>{
  const p=explorationProject(atlasFixture());p.books[0].evidence.push({id:'long-full',text:'完整材料'.repeat(9000),kind:'review',included:true});
  for(let i=0;i<180;i++)p.books[0].evidence.push({id:'custom-'+i,text:'另一条完整材料',kind:'highlight',included:true});
  const restored=privatePackage(p);assert.equal(restored.books[0].evidence.length,184);assert.equal(restored.books[0].evidence.find(e=>e.id==='long-full').text.length,36000);
  assert.equal(privatePackage(restored).books[0].evidence.at(-1).id,'custom-179');
});
test('unknown and credential fields never survive either project format',()=>{
  const p=atlasFixture();p.books[0].evidence[0].key='SECRET_TOKEN';p.exploration.themes[0].key='SECRET_TOKEN';p.journey.sessions[0].token='SECRET_TOKEN';
  for(const out of [normalize(p),explorationProject(p),privatePackage(explorationProject(p))])assert(!JSON.stringify(out).includes('SECRET_TOKEN'));
});
test('cross-entry saving does not change analysis hashes, including valid long book identifiers',async()=>{
  const p=normalize(atlasFixture()),restored=privatePackage(explorationProject(p));
  assert.equal(await fingerprint(p.books[0],p.settings,'same-model'),await fingerprint(restored.books[0],restored.settings,'same-model'));
  const id='b'.repeat(200),long=normalize({books:[{id,title:'长标识的书',highlights:['真实材料']}]});
  assert.equal(privatePackage(explorationProject(long)).books[0].evidence[0].id,id+':e0');
});
test('bad evidence, forged quotes and invalid saved routes reject the whole import',()=>{
  for(const mutate of [p=>p.books[0].evidence[1].id='stable-door',p=>p.exploration.themes[0].nodes[0].quote.excerpt='伪造原文',p=>p.journey.sessions[0].at=99,p=>p.books[0].evidence[0].included=false]){
    const p=atlasFixture();mutate(p);assert.throws(()=>normalize(p));assert.throws(()=>explorationProject(p));
  }
});
test('incremental updates retain compatible exploration and reject changing its cited evidence',()=>{
  const p=normalize(atlasFixture()),next=updateProject(p,privatePackage(p));assert.deepEqual(next.journey,p.journey);assert.deepEqual(next.exploration,p.exploration);
  const incoming=privatePackage(p);delete incoming.exploration;delete incoming.journey;incoming.books[0].evidence[0].text='已经变化的材料';
  assert.throws(()=>updateProject(p,incoming),/当前项目保留/);assert.equal(p.books[0].evidence[0].text,'今天出发，门口停了一会儿。');
});
test('excluded books stay out of views and all exploration/private prose stays out of public output',()=>{
  const p=normalize(atlasFixture());assert.equal(buildViews(p).graph.stats.books,2);
  const {project:out}=publicProject(p,['own','other','excluded'],{metrics:false,relations:true});
  const serialized=JSON.stringify({project:out,views:buildViews(out)});
  for(const token of ['PRIVATE_','EXCLUDED_BOOK_TITLE','stable-door','门口停了一会儿','own-theme','2026-01-02','SECRET_TOKEN'])assert(!serialized.includes(token),token);
  assert.equal(out.books.length,2);assert.equal(out.links.length,1);assert.equal(out.books[0].readingTime,0);
});
