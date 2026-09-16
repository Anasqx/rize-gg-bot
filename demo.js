import { userError } from './errors.js';
import { fileURLToPath } from 'node:url';
import { randomInt } from 'node:crypto';
import { ButtonStyle } from 'discord.js';
import { embed, row, button, privateView } from './ui.js';
import { ar } from './games.js';

const DEMO_MARKER = 'Rize.gg • Rewards demo';
export function progress(xp) {
  let level=0, remaining=xp;
  while(remaining >= 100+50*level) {remaining-=100+50*level;level++;}
  return {level,remaining,needed:100+50*level};
}
export class DemoRewards {
  constructor(store,draw=()=>randomInt(100)) {this.store=store;this.draw=draw;}
  profile(user) {
    const p=JSON.parse(this.store.get(`demo:${user}`) || '{"activity":0,"bonus":0,"tickets":3,"milestones":0,"wins":[],"lastSpin":null}');
    const translate=w=>{const key=w.key || (w.xp===100?'xp100':w.xp===250?'xp250':/رتبة|role/i.test(w.label)?'role':'cash');return {...w,key,label:{xp100:'100 bonus XP',xp250:'250 bonus XP',role:'Special role for 7 days — preview only',cash:'$10 — preview only, no real cash prize'}[key]};};
    p.wins=p.wins.map(translate);if(p.spins) p.spins=Object.fromEntries(Object.entries(p.spins).map(([id,w])=>[id,translate(w)]));return p;
  }
  save(user,p) {this.store.set(`demo:${user}`,JSON.stringify(p));return p;}
  add(user) {
    const p=this.profile(user);p.activity+=250;
    const milestones=Math.floor(progress(p.activity).level/5);
    p.tickets+=milestones-p.milestones;p.milestones=milestones;
    return this.save(user,p);
  }
  spin(user,nonce) {
    const p=this.profile(user);
    p.spins ??= {};
    if(p.spins[nonce]) return p.spins[nonce];
    if(p.tickets<1) throw userError('No demo tickets left. Reset the demo or try adding XP.');
    const n=this.draw();
    const win=n<50?{key:'xp100',label:'100 bonus XP',xp:100}:n<80?{key:'xp250',label:'250 bonus XP',xp:250}:n<95?{key:'role',label:'Special role for 7 days — preview only',xp:0}:{key:'cash',label:'$10 — preview only, no real cash prize',xp:0};
    p.tickets--;p.bonus+=win.xp;p.wins.unshift(win);p.wins=p.wins.slice(0,10);p.lastSpin=nonce;p.spins[nonce]=win;
    this.save(user,p);return win;
  }
}
const asset=name=>({attachment:fileURLToPath(new URL(`./${name}`,import.meta.url)),name});
const controls=()=>[row(button('demo:wheel','🎡 Spin the wheel',ButtonStyle.Success),button('demo:profile','My balance'))];
const privateControls=()=>[...controls(),row(button('demo:xp','Try adding XP'),button('demo:reset','Reset demo'))];
export function demoPanel() {
  return {embeds:[embed('🎡 Rize.gg Prize Wheel','3 demo tickets to start · 1 ticket per spin\n**Demo only — no real money or roles awarded.**').setImage('attachment://wheel.png')
    .setFooter({text:DEMO_MARKER})],components:controls(),allowedMentions:{parse:[]}};
}
export async function ensureDemoPanel(channel,client,store) {
  const key=`demo_panel:${channel.id}`;const id=store.get(key);let message;
  if(id) {try {message=await channel.messages.fetch(id);}catch(error){if(error.code!==10008) throw error;}}
  if(!message) {
    const history=await channel.messages.fetch({limit:100});
    message=history.find(m=>m.author.id===client.user.id && m.embeds.some(e=>[DEMO_MARKER,'Rize.gg • تجربة المكافآت'].includes(e.footer?.text)));
  }
  const payload={...demoPanel(),attachments:[],files:[asset('wheel.png')]};
  if(message) await message.edit(payload);else message=await channel.send(payload);
  store.set(key,message.id);
  console.log('Rize.gg: Rewards demo panel sent.');
}
export async function handleDemo(i,demo) {
  const action=i.customId.split(':')[1];const user=i.user.id;
  const reply=(text,components=privateControls())=>i.editReply({...privateView(text,components),attachments:[]});
  if(action==='reset') return reply('Reset your demo progress and prizes, and start again with 3 tickets?',[row(button('demo:reset_yes','Reset demo',ButtonStyle.Danger),button('demo:profile','Back'))]);
  if(action==='reset_yes') demo.save(user,{activity:0,bonus:0,tickets:3,milestones:0,wins:[],lastSpin:null});
  if(action==='xp') demo.add(user);
  if(action==='wheel' || action==='spin') {
    const nonce=action==='wheel' ? i.id : i.customId.split(':')[2];if(!nonce) throw userError('Open the wheel again.');
    const win=demo.spin(user,nonce);
    const key=win.key || (win.xp===100?'xp100':win.xp===250?'xp250':/role/i.test(win.label)?'role':'cash');
    return i.editReply({content:`🎉 **${win.label}**\nRemaining: ${ar(demo.profile(user).tickets)} tickets · Demo only`,embeds:[embed('Spin result','Watch the wheel spin and stop on your prize.').setImage(`attachment://wheel-${key}.gif`)],attachments:[],files:[asset(`wheel-${key}.gif`)],components:controls(),allowedMentions:{parse:[]}});

  }
  const p=demo.profile(user);
  if(action==='wins') return reply('🎁 **Your demo prizes**\n'+(p.wins.map(w=>`• ${w.label}`).join('\n')||'No spins yet!')+'\n\nNo real cash claims or role awards in this demo.');
  const level=progress(p.activity+p.bonus);
  return reply(`⭐ Level **${ar(level.level)}** · 🎟️ **${ar(p.tickets)}** tickets\n${ar(level.remaining)} / ${ar(level.needed)} XP to the next level.\nEvery 5 activity levels earns a ticket. The test button simulates activity.\nLast result: ${p.wins[0]?.label || 'No spins yet'}\n🧪 Real chat and voice activity is not tracked in this demo.`);
}
