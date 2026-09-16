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
    const win=n<50?{label:'١٠٠ خبرة إضافية',xp:100}:n<80?{label:'٢٥٠ خبرة إضافية',xp:250}:n<95?{label:'رتبة مميزة لمدة ٧ أيام — معاينة فقط',xp:0}:{label:'١٠ دولارات — معاينة فقط، مو جائزة نقدية فعلية',xp:0};
    p.tickets--;p.bonus+=win.xp;p.wins.unshift(win);p.wins=p.wins.slice(0,10);p.lastSpin=nonce;p.spins[nonce]=win;
    this.save(user,p);return win;
  }
}
const controls=()=>[
  row(button('demo:profile','⭐ مستواي'),button('demo:wheel','🎡 لف العجلة',ButtonStyle.Success),button('demo:wins','🎁 جوائزي')),
  row(button('demo:xp','🧪 أضف ٢٥٠ خبرة'),button('demo:reset','↻ إعادة التجربة'))
];
export function demoPanel() {
  return {embeds:[embed('🎡 Rize.gg | تجربة المستويات والمكافآت',
    '**نسخة تجريبية — ما فيها جوائز نقدية أو رتب فعلية.**\n\nابدأ بـ **٣ تذاكر مجانية للتجربة** وجرّب العجلة!\n⭐ كل ٥ مستويات من خبرة النشاط تعطيك تذكرة.\n🧪 زر الخبرة يحاكي نشاط الشات والفويس؛ ما نحسب نشاطك الحقيقي في هالتجربة.\n\n**نتائج العجلة التجريبية:**\n٥٠٪ · ١٠٠ خبرة\n٣٠٪ · ٢٥٠ خبرة\n١٥٪ · معاينة رتبة مميزة\n٥٪ · معاينة جائزة ١٠ دولارات\n\nخبرة الجوائز ما تطلع لك تذاكر إضافية. بياناتك التجريبية منفصلة عن البحث عن فريق.')
    .setFooter({text:DEMO_MARKER})],components:controls(),allowedMentions:{parse:[]}};
}
export async function ensureDemoPanel(channel,client,store) {
  const key=`demo_panel:${channel.id}`;const id=store.get(key);let message;
  if(id) {try {message=await channel.messages.fetch(id);}catch(error){if(error.code!==10008) throw error;}}
  if(!message) {
    const history=await channel.messages.fetch({limit:100});
    message=history.find(m=>m.author.id===client.user.id && m.embeds.some(e=>e.footer?.text===DEMO_MARKER));
  }
  if(message) await message.edit(demoPanel());else message=await channel.send(demoPanel());
  store.set(key,message.id);
  console.log('Rize.gg: تم إرسال لوحة تجربة المكافآت.');
}
export async function handleDemo(i,demo) {
  const action=i.customId.split(':')[1];const user=i.user.id;
  const reply=(text,components=controls())=>i.editReply(privateView(text,components));
  if(action==='reset') return reply('إعادة التجربة تمسح تقدمك وجوائزك **التجريبية** وترجع لك ٣ تذاكر.',[row(button('demo:reset_yes','ابدأ التجربة من جديد',ButtonStyle.Danger),button('demo:profile','رجوع'))]);
  if(action==='reset_yes') demo.save(user,{activity:0,bonus:0,tickets:3,milestones:0,wins:[],lastSpin:null});
  if(action==='xp') demo.add(user);
  if(action==='wheel') return reply('🎡 **عجلة تجريبية فقط**\nلفة واحدة = تذكرة تجريبية.\n٥٠٪: ١٠٠ خبرة · ٣٠٪: ٢٥٠ خبرة · ١٥٪: معاينة رتبة · ٥٪: معاينة ١٠ دولارات.\n**ما راح تستلم فلوس أو رتبة حقيقية.**',[row(button(`demo:spin:${i.id}`,'🎟️ استخدم تذكرة ولف',ButtonStyle.Success),button('demo:profile','رجوع'))]);
  if(action==='spin') {
    const nonce=i.customId.split(':')[2];if(!nonce) throw Error('ارجع وافتح العجلة من جديد.');
    const win=demo.spin(user,nonce);
    return reply(`🎉 طلعت لك: **${win.label}**\n🧪 نتيجة تجريبية فقط.\n🎟️ باقي عندك ${ar(demo.profile(user).tickets)} تذاكر.`);
  }
  const p=demo.profile(user);
  if(action==='wins') return reply('🎁 **جوائزك التجريبية**\n'+(p.wins.map(w=>`• ${w.label}`).join('\n')||'ما جرّبت العجلة للحين!')+'\n\nما فيه مطالبات نقدية أو رتب فعلية في التجربة.');
  const level=progress(p.activity+p.bonus);const activity=progress(p.activity);
  return reply(`⭐ **مستواك التجريبي: ${ar(level.level)}**\n${ar(level.remaining)} / ${ar(level.needed)} خبرة للمستوى الجاي\n🎟️ تذاكرك: **${ar(p.tickets)}**\nخبرة النشاط: ${ar(p.activity)} · خبرة الجوائز: ${ar(p.bonus)}\nالتذكرة الجاية عند مستوى نشاط ${ar((p.milestones+1)*5)} (أنت ${ar(activity.level)}).\n\nاضغط «أضف ٢٥٠ خبرة» لتجربة التقدم. الشات والفويس الحقيقي مو محسوبين هنا.`);
}
