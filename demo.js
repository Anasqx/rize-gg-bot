import { fileURLToPath } from 'node:url';
import { randomInt } from 'node:crypto';
import { ButtonStyle } from 'discord.js';
import { embed, row, button, privateView } from './ui.js';
import { ar } from './games.js';

const DEMO_MARKER = 'Rize.gg • تجربة المكافآت';
export function progress(xp) {
  let level=0, remaining=xp;
  while(remaining >= 100+50*level) {remaining-=100+50*level;level++;}
  return {level,remaining,needed:100+50*level};
}
export class DemoRewards {
  constructor(store,draw=()=>randomInt(100)) {this.store=store;this.draw=draw;}
  profile(user) {return JSON.parse(this.store.get(`demo:${user}`) || '{"activity":0,"bonus":0,"tickets":3,"milestones":0,"wins":[],"lastSpin":null}');}
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
    if(p.tickets<1) throw Error('خلصت تذاكرك التجريبية. اضغط «إعادة التجربة» أو زوّد الخبرة.');
    const n=this.draw();
    const win=n<50?{key:'xp100',label:'١٠٠ خبرة إضافية',xp:100}:n<80?{key:'xp250',label:'٢٥٠ خبرة إضافية',xp:250}:n<95?{key:'role',label:'رتبة مميزة لمدة ٧ أيام — معاينة فقط',xp:0}:{key:'cash',label:'١٠ دولارات — معاينة فقط، مو جائزة نقدية فعلية',xp:0};
    p.tickets--;p.bonus+=win.xp;p.wins.unshift(win);p.wins=p.wins.slice(0,10);p.lastSpin=nonce;p.spins[nonce]=win;
    this.save(user,p);return win;
  }
}
const asset=name=>({attachment:fileURLToPath(new URL(`./${name}`,import.meta.url)),name});
const controls=()=>[row(button('demo:wheel','🎡 لف العجلة',ButtonStyle.Success),button('demo:profile','رصيدي'))];
const privateControls=()=>[...controls(),row(button('demo:xp','جرّب رفع المستوى'),button('demo:reset','إعادة التجربة'))];
export function demoPanel() {
  return {embeds:[embed('🎡 عجلة Rize.gg','٣ تذاكر للتجربة · اللفة بتذكرة\n**تجربة فقط — ما فيها جوائز نقدية أو رتب فعلية.**').setImage('attachment://wheel.png')
    .setFooter({text:DEMO_MARKER})],components:controls(),allowedMentions:{parse:[]}};
}
export async function ensureDemoPanel(channel,client,store) {
  const key=`demo_panel:${channel.id}`;const id=store.get(key);let message;
  if(id) {try {message=await channel.messages.fetch(id);}catch(error){if(error.code!==10008) throw error;}}
  if(!message) {
    const history=await channel.messages.fetch({limit:100});
    message=history.find(m=>m.author.id===client.user.id && m.embeds.some(e=>e.footer?.text===DEMO_MARKER));
  }
  const payload={...demoPanel(),attachments:[],files:[asset('wheel.png')]};
  if(message) await message.edit(payload);else message=await channel.send(payload);
  store.set(key,message.id);
  console.log('Rize.gg: تم إرسال لوحة تجربة المكافآت.');
}
export async function handleDemo(i,demo) {
  const action=i.customId.split(':')[1];const user=i.user.id;
  const reply=(text,components=privateControls())=>i.editReply({...privateView(text,components),attachments:[]});
  if(action==='reset') return reply('إعادة التجربة تمسح تقدمك وجوائزك **التجريبية** وترجع لك ٣ تذاكر.',[row(button('demo:reset_yes','ابدأ التجربة من جديد',ButtonStyle.Danger),button('demo:profile','رجوع'))]);
  if(action==='reset_yes') demo.save(user,{activity:0,bonus:0,tickets:3,milestones:0,wins:[],lastSpin:null});
  if(action==='xp') demo.add(user);
  if(action==='wheel' || action==='spin') {
    const nonce=action==='wheel' ? i.id : i.customId.split(':')[2];if(!nonce) throw Error('افتح العجلة من جديد.');
    const win=demo.spin(user,nonce);
    const key=win.key || (win.xp===100?'xp100':win.xp===250?'xp250':win.label.includes('رتبة')?'role':'cash');
    return i.editReply({content:`🎉 **${win.label}**\nباقي ${ar(demo.profile(user).tickets)} تذاكر · تجربة فقط`,embeds:[embed('نتيجة اللفة','المؤشر يوضح نتيجتك.').setImage(`attachment://wheel-${key}.png`)],attachments:[],files:[asset(`wheel-${key}.png`)],components:controls(),allowedMentions:{parse:[]}});

  }
  const p=demo.profile(user);
  if(action==='wins') return reply('🎁 **جوائزك التجريبية**\n'+(p.wins.map(w=>`• ${w.label}`).join('\n')||'ما جرّبت العجلة للحين!')+'\n\nما فيه مطالبات نقدية أو رتب فعلية في التجربة.');
  const level=progress(p.activity+p.bonus);
  return reply(`⭐ المستوى **${ar(level.level)}** · 🎟️ **${ar(p.tickets)}** تذاكر\n${ar(level.remaining)} / ${ar(level.needed)} خبرة للمستوى الجاي.\nكل ٥ مستويات نشاط = تذكرة. زر التجربة يحاكي النشاط.\nآخر نتيجة: ${p.wins[0]?.label || 'ما لفّيت للحين'}\n🧪 الشات والفويس الحقيقي مو محسوبين في التجربة.`);
}
