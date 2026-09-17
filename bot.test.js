import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from './store.js';
import { GAMES, READY_MS, REQUEST_MS, PING_MS } from './games.js';
import { panel, ranks, gameMenu, requestView } from './ui.js';
import { handle } from './handler.js';

function fixture(t) {
  let now=1_800_000_000_000;
  const store=new Store(':memory:',()=>now);
  t.after(()=>store.db.close());
  return {store,advance:ms=>{now+=ms;}};
}
test('availability starts at selected time, expires at exact boundary, and renewal is bounded',t=>{
  const {store:s,advance}=fixture(t);
  s.register('u','rocket','2',30);
  assert.equal(s.active().length,0);
  advance(30*60_000);assert.equal(s.active().length,1);
  advance(READY_MS);assert.equal(s.active().length,0);
  assert.throws(()=>s.extend('u','rocket'));
  s.register('u','rocket','3',0);const end=s.extend('u','rocket');
  assert.equal(s.extend('u','rocket'),end);
  s.sweep();assert.equal(s.mine('u').length,1);
});
test('matching filters game/rank/time/self, limits pings, and cooldown survives re-registration',t=>{
  const {store:s,advance}=fixture(t);
  for(let n=0;n<15;n++) s.register(`u${n}`,'valorant','2',0);
  s.register('host','valorant','2',0);s.register('wrong','valorant','3',0);
  s.register('later','valorant','2',60);s.register('other','rocket','2',0);
  const r=s.create('host','valorant','2',4);
  const candidates=s.candidates(r);assert.equal(candidates.length,10);
  assert.ok(candidates.every(a=>a.user.startsWith('u')));
  s.pinged('valorant',candidates.map(a=>a.user));
  s.remove('u0','valorant');s.register('u0','valorant','2',0);
  assert.equal(s.candidates(r).length,5);
  advance(PING_MS);assert.equal(s.candidates(r).length,10);
});
test('joining consumes availability, rejects duplicates and overfill, leaving reopens',t=>{
  const {store:s}=fixture(t);
  const r=s.create('host','chess','any',1);s.publish(r.id,'message');
  s.register('a','chess','1',0);s.register('b','chess','2',0);
  assert.throws(()=>s.join(r.id,'host'));
  assert.equal(s.join(r.id,'a').status,'full');
  assert.equal(s.mine('a').length,0);
  assert.throws(()=>s.join(r.id,'a'));assert.throws(()=>s.join(r.id,'b'));
  assert.equal(s.leave(r.id,'a').status,'open');
  assert.equal(s.join(r.id,'b').players.length,1);
});
test('wrong rank, future availability, expiry, owner cooldown and invalid inputs are rejected',t=>{
  const {store:s,advance}=fixture(t);
  const r=s.create('host','rocket','3',2);s.publish(r.id,'m');
  s.register('a','rocket','2',0);s.register('b','rocket','3',30);
  assert.throws(()=>s.join(r.id,'a'));assert.throws(()=>s.join(r.id,'b'));
  assert.throws(()=>s.create('host','chess','any',1));s.close(r.id);
  assert.throws(()=>s.create('host','chess','any',1));advance(300_000);
  const r2=s.create('host','chess','any',1);s.publish(r2.id,'m2');
  advance(REQUEST_MS);assert.throws(()=>s.join(r2.id,'a'));
  s.sweep();assert.equal(s.request(r2.id).status,'expired');
  assert.throws(()=>s.register('u','fake','1',0));
  assert.throws(()=>s.register('u','rocket','999',0));
  assert.throws(()=>s.register('u','rocket','1',-30));
  assert.throws(()=>s.create('x','chess','any',2));
});
test('member departures remove availability and reopen or close their teams',t=>{
  const {store:s}=fixture(t);const r=s.create('host','chess','any',1);s.publish(r.id,'m');
  s.register('u','chess','1',0);s.join(r.id,'u');s.removeMember('u');
  assert.equal(s.request(r.id).status,'open');s.removeMember('host');
  assert.equal(s.request(r.id).status,'closed');
});
test('database survives restart with registrations and usable request IDs',()=>{
  const dir=mkdtempSync(join(tmpdir(),'rize-test-'));const path=join(dir,'test.sqlite');
  try {
    let s=new Store(path);s.register('u','chess','1',0);
    const r=s.create('host','chess','any',1);s.publish(r.id,'m');s.db.close();
    s=new Store(path);assert.equal(s.active().length,1);assert.equal(s.join(r.id,'u').status,'full');s.db.close();
  } finally {rmSync(dir,{recursive:true,force:true});}
});
test('English Discord payloads serialize within component limits and count unique people',t=>{
  const {store:s}=fixture(t);s.register('u','chess','1',0);s.register('u','rocket','1',0);
  const p=panel(s);assert.match(p.components[1].toJSON().components[0].label,/1 ready/);
  assert.ok(p.embeds[0].toJSON().description.length<4096);
  for(const game of Object.keys(GAMES)) for(const mode of ['register','find']) {
    assert.ok(ranks(mode,game).toJSON().components[0].options.length<=25);
  }
  assert.equal(gameMenu('register',s).toJSON().components[0].options.length,4);
  const r=s.create('host','chess','any',1);
  assert.equal(requestView({...r,status:'open'}).components[0].toJSON().components.length,2);
});
test('button workflow registers, publishes with controlled mentions, joins, and protects closure',async t=>{
  const {store:s}=fixture(t);let sent;let output;
  const match={id:'chat',send:async p=>{sent=p;return{id:'message',url:'https://discord.com/channels/g/chat/message'};}};
  const ctx={store:s,match,syncRequest:async()=>{}};
  const i=(user,customId,values)=>({user:{id:user},customId,values,guildId:'g',channelId:'chat',message:{id:'message'},memberPermissions:{has:()=>false},editReply:async p=>{output=p;}});
  await handle(i('u','game:register',['chess']),ctx);assert.equal(output.components.length,2);
  await handle(i('u','rank:register:chess',['1']),ctx);
  assert.equal(s.active('chess').length,1);
  await handle(i('u','mine'),ctx);assert.match(output.content,/Your availability/);
  await handle(i('u','time:chess:1',['0']),ctx);assert.equal(s.active('chess').length,1);
  await handle(i('host','size:chess:any',['1']),ctx);assert.match(output.content,/Review your request/);
  await handle(i('host','publish:chess:any:1'),ctx);
  assert.deepEqual(sent.allowedMentions,{parse:[],users:['u']});
  const r=s.recent()[0];
  await assert.rejects(()=>handle(i('stranger',`close:${r.id}`),ctx));
  await handle(i('u',`decline:${r.id}`),ctx);assert.equal(s.active('chess').length,1);
  await handle(i('u',`join:${r.id}`),ctx);assert.equal(s.request(r.id).status,'full');
  await handle(i('host',`close:${r.id}`),ctx);assert.equal(s.request(r.id).status,'closed');
});
test('failed Discord publish leaves no open request or consumed availability',async t=>{
  const {store:s}=fixture(t);s.register('host','chess','1',0);
  await assert.rejects(()=>handle({user:{id:'host'},customId:'publish:chess:any:1',editReply:async()=>{}},{store:s,match:{send:async()=>{throw Error('network');}}}));
  assert.equal(s.openFor('host'),undefined);assert.equal(s.active().length,1);
});


test('demo level milestones award once and bonus XP cannot mint tickets',async t=>{
  const {DemoRewards,progress}=await import('./demo.js');
  const {store}=fixture(t);const d=new DemoRewards(store,()=>0);
  assert.equal(progress(1000).level,5);
  for(let k=0;k<4;k++) d.add('u');
  assert.equal(d.profile('u').tickets,4);
  d.add('u');assert.equal(d.profile('u').tickets,4);
  d.spin('u','a');assert.equal(d.profile('u').tickets,3);
  assert.equal(d.profile('u').activity,1250);
});
test('demo spins persist and repeated confirmations do not spend tickets twice',async t=>{
  const {DemoRewards}=await import('./demo.js');const {store}=fixture(t);
  const d=new DemoRewards(store,()=>99);
  const first=d.spin('u','a');assert.match(first.label,/preview/);
  d.spin('u','b');assert.deepEqual(d.spin('u','a'),first);
  assert.equal(d.profile('u').tickets,1);
  const reopened=new DemoRewards(store,()=>0);reopened.spin('u','c');
  assert.equal(reopened.profile('u').tickets,0);assert.throws(()=>reopened.spin('u','d'));
});
test('demo panel is explicitly labelled and serializes valid components',async()=>{
  const {demoPanel}=await import('./demo.js');const p=demoPanel();
  assert.match(p.embeds[0].toJSON().description,/no real money/);
  assert.equal(p.components[0].toJSON().components.length,2);
});


test('quick LFG accepts unregistered casual joins and keeps ranked checks',async t=>{
  const {store:s}=fixture(t);const r=s.create('host','chess','any',1);s.publish(r.id,'m');
  assert.equal(s.join(r.id,'newbie').status,'full');
});
test('direct game buttons register quickly and retain optional ranks',async t=>{
  const {store:s}=fixture(t);let out;
  const i={user:{id:'u'},customId:'ready:rocket',editReply:async p=>{out=p;}};
  await handle(i,{store:s,match:{id:'chat'}});assert.equal(s.active('rocket')[0].rank,'0');
  assert.match(out.content,/You are ready/);
});

test('quick search publishes a one-player casual request',async t=>{
 const {store}=fixture(t);let posted;
 const i={user:{id:'u'},guildId:'g',customId:'quickfind:chess',editReply:async()=>{}};
 await handle(i,{store,match:{id:'chat',send:async p=>{posted=p;return{id:'m',url:'https://discord.com/channels/g/chat/m'};}}});
 assert.equal(store.recent()[0].rank,'any');assert.equal(store.recent()[0].needed,1);assert.ok(posted.embeds.length);
});
test('one-click wheel returns the image matching the stored outcome',async t=>{
 const {DemoRewards,handleDemo}=await import('./demo.js');const {store}=fixture(t);let out;
 await handleDemo({id:'spin-test',user:{id:'u'},customId:'demo:wheel',editReply:async p=>{out=p;}},new DemoRewards(store,()=>99));
 assert.equal(out.files[0].name,'wheel-cash.gif');assert.match(out.content,/preview/);
 assert.equal(new DemoRewards(store).profile('u').tickets,2);
});

test('English prize history keeps existing balances and outcomes',async t=>{
 const {DemoRewards}=await import('./demo.js');const {store}=fixture(t);
 store.set('demo:u',JSON.stringify({activity:250,bonus:100,tickets:2,milestones:0,wins:[{label:'رتبة',xp:0}],spins:{old:{label:'رتبة',xp:0}}}));
 const d=new DemoRewards(store);const p=d.profile('u');
 assert.equal(p.tickets,2);assert.equal(p.activity,250);assert.equal(p.bonus,100);
 assert.match(p.wins[0].label,/Special role/);assert.equal(d.spin('u','old').key,'role');assert.equal(d.profile('u').tickets,2);
});

test('visual replies contain images and buttons with functional links, no prose',async()=>{
 const {visualPayload}=await import('./visual.js');
 const payload=await visualPayload({content:'Choose a game\n[Open team](https://discord.com/channels/1/2/3)',components:[]});
 assert.equal(payload.content,'');assert.equal(payload.embeds[0].toJSON().description,undefined);
 assert.equal(payload.components[0].toJSON().components[0].url,'https://discord.com/channels/1/2/3');
 assert.ok(Buffer.isBuffer(payload.files[0].attachment));
});
test('live count image changes on registration and returns after removal',async t=>{
 const {liveImage}=await import('./visual.js');const {GAMES}=await import('./games.js');const {store}=fixture(t);
 const empty=await liveImage(store,GAMES);store.register('u','rocket','0',0);
 const ready=await liveImage(store,GAMES);assert.notDeepEqual(ready,empty);
 store.remove('u','rocket');assert.deepEqual(await liveImage(store,GAMES),empty);
});

test('balanced replies use images only for navigation and preserve mention text',async()=>{
 const {replyPayload}=await import('./visual.js');
 for(const action of ['ready:rocket','quickfind:chess','mine','join:1','demo:profile']) {
 const p=await replyPayload(action,{content:'Ready <@123> — talk in <#456>',components:[]});
 assert.equal(p.files.length,0);assert.match(p.embeds[0].toJSON().description,/<@123>.*<#456>/);
 assert.deepEqual(p.allowedMentions,{parse:[]});
 }
 const menu=await replyPayload('pick:rocket',{content:'Choose an action',components:[]});assert.equal(menu.files.length,1);
});

test('find recommends existing casual team and joins without a duplicate invite',async t=>{
 const {store}=fixture(t);const r=store.create('host','chess','any',1);store.publish(r.id,'message');let out,synced;
 const ctx={store,match:{id:'chat',send:async()=>{throw Error('Must not publish');}},syncRequest:async r=>{synced=r;}};
 const i={user:{id:'guest'},guildId:'guild',customId:'quickfind:chess',editReply:async p=>{out=p;}};
 await handle(i,ctx);assert.equal(out.components[0].toJSON().components[0].custom_id,`quickjoin:${r.id}`);
 await handle({...i,customId:`quickjoin:${r.id}`},ctx);assert.equal(synced.status,'full');assert.equal(store.recent().length,1);
 await assert.rejects(()=>handle({...i,user:{id:'late'},customId:`quickjoin:${r.id}`},ctx));
});
test('find returns owner to existing invite',async t=>{
 const {store}=fixture(t);const r=store.create('host','chess','any',1);store.publish(r.id,'message');let out;
 await handle({user:{id:'host'},guildId:'guild',customId:'quickfind:chess',editReply:async p=>{out=p;}},{store,match:{id:'chat'}});
 assert.match(out.content,/guild\/chat\/message/);assert.equal(store.recent().length,1);
});

test('game choices adapt to ready status and owned invites',async t=>{
 const {store}=fixture(t);let out;const i={user:{id:'u'},guildId:'g',customId:'pick:chess',editReply:async p=>{out=p;}};const ctx={store,match:{id:'c'}};
 await handle(i,ctx);assert.equal(out.components[0].toJSON().components[0].label,'Notify me');
 store.register('u','chess','0',0);await handle(i,ctx);assert.equal(out.components[0].toJSON().components[0].custom_id,'remove:chess');
 const r=store.create('u','chess','any',1);store.publish(r.id,'m');await handle(i,ctx);
 assert.equal(out.components[0].toJSON().components[1].url,'https://discord.com/channels/g/c/m');
});
