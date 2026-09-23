import {ActionRowBuilder,ButtonBuilder,ButtonStyle,EmbedBuilder,RoleSelectMenuBuilder,UserSelectMenuBuilder,PermissionFlagsBits} from 'discord.js';
import {fileURLToPath} from 'node:url';
import {PRIZES,level} from './rewards.js';
const row=(...c)=>new ActionRowBuilder().addComponents(...c);
const btn=(id,label,style=ButtonStyle.Secondary)=>new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);
const card=(title,text)=>new EmbedBuilder().setColor(0x99f9ea).setTitle(title).setDescription(text).setFooter({text:'Rize.gg • عجلة المكافآت'});
const file=name=>({attachment:fileURLToPath(new URL(`./${name}`,import.meta.url)),name});
const controls=()=>[row(btn('reward:spin','🎡 لف العجلة',ButtonStyle.Success),btn('reward:balance','🎟️ رصيدي'),btn('reward:prizes','🎁 الجوائز'))];
const home=()=>row(btn('reward:home','رجوع للعجلة'));
export const isAdmin=i=>i.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
export function panel(rewards){const role=rewards.store.get('rewards:role');return {content:'',embeds:[card('عجلة Rize.gg',`سولف، العب، وارفع لفلك — كل ٥ لفلات تعطيك تذكرة.\n**اللفة بتذكرة واحدة.**\n${role?`المشاركة لأصحاب رتبة <@&${role}>.`:'العجلة مقفلة حتى تحدد الإدارة رتبة المشاركة.'}\nالميزات دائمة، وتسليم الجوائز عن طريق الإدارة.`).setImage('attachment://roulette.png')],files:[file('roulette.png')],attachments:[],components:[...controls(),row(btn('reward:admin','إعدادات الإدارة'))],allowedMentions:{parse:[]}};}
export async function handleRewards(i,rewards){const [prefix,action,arg]=i.customId.split(':');const user=i.user.id;
 const reply=(title,text,components=[home()])=>i.editReply({content:'',embeds:[card(title,text)],attachments:[],components,allowedMentions:{parse:[]}});
 if(prefix!=='reward')return reply('تم تحديث البوت','البوت صار مخصص لعجلة المكافآت. استخدم اللوحة الجديدة.');
 const adminActions=['admin','role','grantuser','grant','claims','deliver'];
 if(adminActions.includes(action)&&!isAdmin(i))return reply('للإدارة فقط','هذا الخيار يحتاج صلاحية إدارة السيرفر.');
 if(action==='home')return i.editReply(panel(rewards));
 if(action==='admin')return reply('إعدادات العجلة','حدد رتبة المشاركة من القائمة.\nنظام الشات والفويس مفعّل، والجوائز الدائمة تُسلّم عن طريق الإدارة.\nالميزانية النقدية: ١٥٠ دولار بالشهر، وتُحجز قيمة الجائزة عند الفوز.',[new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('reward:role').setPlaceholder('اختر رتبة المشاركة')),row(btn('reward:grantuser','منح تذكرة'),btn('reward:claims','الجوائز المعلّقة')),home()]);
 if(action==='role'){const id=i.values[0];if(id===i.guildId)return reply('اختر رتبة محددة','ما تقدر تختار رتبة الجميع.');rewards.store.set('rewards:role',id);return reply('تم حفظ الرتبة',`العجلة متاحة لأصحاب رتبة <@&${id}>.`);}
 if(action==='grantuser')return reply('منح تذكرة','اختر العضو. تُسجّل عملية المنح باسمك.',[row(new UserSelectMenuBuilder().setCustomId('reward:grant').setPlaceholder('اختر العضو')),home()]);
 if(action==='grant'){const p=rewards.grant(i.values[0],user,i.id);return reply('تم منح تذكرة',`<@${i.values[0]}> عنده الآن **${p.tickets}** تذكرة.`);}
 if(action==='claims'){const items=rewards.pending();return reply('جوائز بانتظار التسليم',items.length?items.map((c,n)=>`${n+1}. <@${c.user}> — **${PRIZES.find(p=>p.key===c.prize).label}**\nرقم المطالبة: \`${c.id}\``).join('\n\n'):'كل الجوائز تم تسليمها.',[...items.map((c,n)=>row(btn(`reward:deliver:${c.id}`,`تأكيد تسليم الجائزة ${n+1}`))),...(items.length<5?[home()]:[])]);}
 if(action==='deliver'){rewards.fulfill(arg,user);return reply('تم تسجيل التسليم','تم تحديث سجل الجائزة. هذا الزر يسجّل التسليم فقط، ولا يحوّل مبالغ أو يعطي صلاحيات.');}
 if(action==='balance'){const p=rewards.account(user),l=level(p.xp);return reply('رصيدك',`🎟️ التذاكر: **${p.tickets}**\n⭐ اللفل: **${l.level}**\nالخبرة: ${l.xp} / ${l.next} للّفل القادم\n\nكل ٥ لفلات جديدة = تذكرة. الشات والفويس يحتسبان بحد يومي ٦٠٠ خبرة.\nالفويس يحتاج عضوين فعليين على الأقل، بدون ميوت أو ديفن، وخارج روم AFK.`,[row(btn('reward:spin','لف العجلة',ButtonStyle.Success),btn('reward:history','جوائزي')),home()]);}
 if(action==='prizes')return reply('الجوائز ونسب الفوز',PRIZES.map(p=>`• **${p.label}** — ${(p.weight/100).toLocaleString('ar-SA',{maximumFractionDigits:2})}٪`).join('\n')+'\n\nإجمالي احتمال النقد: ٠٫١٪ لكل لفة، وليس ضمان فوز بعد عدد معين.\nسقف النقد ١٥٠ دولار للشهر بتوقيت السعودية؛ إذا ما تكفي الميزانية للجائزة النقدية، تتحول إلى ميزة تغيير اللون.\nكل الميزات دائمة وتُستلم من الإدارة. لا توجد مدفوعات تلقائية.');
 if(action==='history'){const claims=rewards.claims(user);return reply('جوائزك',claims.length?claims.map(c=>`**${PRIZES.find(p=>p.key===c.prize).label}** — ${c.status==='delivered'?'تم التسليم':'بانتظار الإدارة'}\nرقم الجائزة: \`${c.id}\``).join('\n\n'):'ما عندك جوائز لحد الآن.');}
 if(action==='spin'){const member=await i.guild.members.fetch({user,force:true});const win=rewards.spin(user,i.id,[...member.roles.cache.keys()]);const prize=PRIZES.find(p=>p.key===win.prize);return i.editReply({content:'',embeds:[card('مبروك! 🎉',`<@${user}> فزت بـ **${prize.label}**\n${prize.cash?'تواصل مع الإدارة لاستلام المبلغ.':'ميزة دائمة — تواصل مع الإدارة لتفعيلها.'}\nرقم الجائزة: \`${win.id}\`\nباقي لك ${rewards.account(user).tickets} تذكرة.`).setImage(`attachment://roulette-${prize.key}.gif`)],files:[file(`roulette-${prize.key}.gif`)],attachments:[],components:[...controls()],allowedMentions:{parse:[]}});}
 return reply('الخيار غير متاح','ارجع للعجلة وجرب من جديد.');
}
