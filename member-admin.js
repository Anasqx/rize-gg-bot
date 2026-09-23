import {ActionRowBuilder,ButtonBuilder,ButtonStyle,StringSelectMenuBuilder,RoleSelectMenuBuilder,UserSelectMenuBuilder} from 'discord.js';
import {level} from './rewards.js';
import {syncTag,validateTagRole} from './tag-rewards.js';
export const MEMBER_ADMIN_ACTIONS=['members','levelsource','levelmin','levelpage','tagsettings','tagrole','tagcheck','tagmember'];
const row=(...c)=>new ActionRowBuilder().addComponents(...c);
const button=(id,label)=>new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(ButtonStyle.Secondary);
const back=()=>row(button('reward:admin','رجوع للإدارة'));
export function levelMembers(rewards,source,min,page=0){
 if(!['chat','voice'].includes(source)||!Number.isInteger(min)||min<0||min>100||!Number.isInteger(page)||page<0)throw Error('Invalid filter');
 const field=source==='chat'?'chat_xp':'voice_xp',xp=100*min+25*min*(min-1);
 const total=rewards.db.prepare(`SELECT COUNT(*) AS n FROM reward_accounts WHERE ${field}>=?`).get(xp).n;
 const rows=rewards.db.prepare(`SELECT user,chat_xp,voice_xp FROM reward_accounts WHERE ${field}>=? ORDER BY ${field} DESC,user LIMIT 10 OFFSET ?`).all(xp,page*10);
 return {total,rows};
}
export async function memberAdmin(i,rewards,reply){
 const [,action,arg,minimum='0',pageText='0']=i.customId.split(':');
 if(action==='members')return reply('الأعضاء حسب اللفل','اختر نوع اللفل. النتائج من بيانات Rize.gg المسجلة، وقد تشمل أعضاء غادروا السيرفر.',[row(new StringSelectMenuBuilder().setCustomId('reward:levelsource').setPlaceholder('نوع اللفل').addOptions({label:'كتابي',value:'chat'},{label:'صوتي',value:'voice'})),back()]);
 if(action==='levelsource'){const source=i.values[0];if(!['chat','voice'].includes(source))throw Error('Invalid source');return reply('حدد اللفل','نعرض من وصل لهذا اللفل أو أعلى.',[row(new StringSelectMenuBuilder().setCustomId(`reward:levelmin:${source}`).setPlaceholder('اللفل المطلوب').addOptions([0,5,10,15,20,25,30,35,40,45,50,60,70,80,90,100].map(n=>({label:`لفل ${n} أو أعلى`,value:String(n)})))),back()]);}
 if(action==='levelmin'||action==='levelpage'){
 const min=Number(action==='levelmin'?i.values[0]:minimum),page=action==='levelmin'?0:Number(pageText),result=levelMembers(rewards,arg,min,page);
 const nav=[];if(page>0)nav.push(button(`reward:levelpage:${arg}:${min}:${page-1}`,'السابق'));if((page+1)*10<result.total)nav.push(button(`reward:levelpage:${arg}:${min}:${page+1}`,'التالي'));
 return reply(`الأعضاء — ${arg==='chat'?'كتابي':'صوتي'} ${min}+`,`العدد: **${result.total}**\n\n`+(result.rows.map(a=>`<@${a.user}> — كتابي **${level(a.chat_xp).level}** / صوتي **${level(a.voice_xp).level}**`).join('\n')||'لا توجد نتائج.'),[...(nav.length?[row(...nav)]:[]),row(button('reward:members','بحث جديد')),back()]);
 }
 if(action==='tagsettings')return reply('رتبة تاق السيرفر',`الرتبة: ${rewards.store.get('tag:role')?`<@&${rewards.store.get('tag:role')}>`:'غير محددة'}\nأنشئ رتبة للتاق فقط ثم اخترها. نتحقق من تاق هذا السيرفر نفسه.\nالفحص عند تحديث التاق، مع مراجعة دورية. إزالة التاق تسحب رتبة التاق حتى لو مُنحت يدويًا. أصحاب التاق يحصلون على ضعف الخبرة الكتابية والصوتية ضمن الحد اليومي.`,[row(new RoleSelectMenuBuilder().setCustomId('reward:tagrole').setPlaceholder('اختر رتبة التاق')),row(button('reward:tagcheck','فحص عضو')),back()]);
 if(action==='tagrole'){
 const previous=rewards.store.get('tag:role');if(previous&&previous!==i.values[0])return reply('الرتبة مرتبطة مسبقًا','لمنع ترك رتب قديمة عند الأعضاء، استخدم الرتبة الحالية أو اطلب نقل الربط.',[back()]);
 await i.guild.members.fetchMe();const role=await i.guild.roles.fetch(i.values[0]);try{validateTagRole(role,i.guild,rewards);}catch(e){return reply('تعذر ربط الرتبة',e.message,[back()]);}
 rewards.store.set('tag:role',role.id);return reply('تم ربط رتبة التاق',`<@&${role.id}> جاهزة. التحقق يبدأ مع نشاط الأعضاء، أو استخدم «فحص عضو».`,[back()]);
 }
 if(action==='tagcheck')return reply('فحص تاق عضو','اختر العضو للتحقق من التاق وتحديث الرتبة.',[row(new UserSelectMenuBuilder().setCustomId('reward:tagmember').setPlaceholder('اختر العضو')),back()]);
 if(action==='tagmember'){rewards.account(i.values[0]);return reply('نتيجة فحص التاق',await syncTag(i.guild,rewards,i.values[0]),[back()]);}
}
