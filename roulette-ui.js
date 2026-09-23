import {ActionRowBuilder,ButtonBuilder,ButtonStyle,EmbedBuilder,RoleSelectMenuBuilder,UserSelectMenuBuilder,PermissionFlagsBits} from 'discord.js';
import {fileURLToPath} from 'node:url';
import {PRIZES,level} from './rewards.js';
import {rankProgress} from './rank-tiers.js';
import {rankStatus,syncRanks} from './rank-sync.js';
import {MEMBER_ADMIN_ACTIONS,memberAdmin} from './member-admin.js';
import {syncTag} from './tag-rewards.js';
const row=(...c)=>new ActionRowBuilder().addComponents(...c);
const btn=(id,label,style=ButtonStyle.Secondary)=>new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);
const card=(title,text)=>new EmbedBuilder().setColor(0x99f9ea).setTitle(title).setDescription(text).setFooter({text:'Rize.gg • عجلة المكافآت'});
const file=name=>({attachment:fileURLToPath(new URL(`./${name}`,import.meta.url)),name});
const controls=()=>[row(btn('reward:spin','🎡 لف العجلة',ButtonStyle.Success),btn('reward:balance','🎟️ رصيدي'))];
const home=()=>row(btn('reward:home','رجوع للعجلة'));
export const isAdmin=i=>i.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
export function panel(rewards){const role=rewards.store.get('rewards:role');return {content:'',embeds:[card('عجلة Rize.gg',`سولف، العب، وارفع لفلك — كل ٥ لفلات تعطيك تذكرة.\n**اللفة بتذكرة واحدة.**\n${role?`المشاركة لأصحاب رتبة <@&${role}>.`:'العجلة مقفلة حتى تحدد الإدارة رتبة المشاركة.'}\nالميزات دائمة، وتسليم الجوائز عن طريق الإدارة.`).setImage('attachment://roulette.png')],files:[file('roulette.png')],attachments:[],components:[...controls(),row(btn('reward:admin','إعدادات الإدارة'))],allowedMentions:{parse:[]}};}
export async function handleRewards(i,rewards){const [prefix,action,arg]=i.customId.split(':');const user=i.user.id;
 const reply=(title,text,components=[home()])=>i.editReply({content:'',embeds:[card(title,text)],attachments:[],components,allowedMentions:{parse:[]}});
 if(prefix!=='reward')return reply('تم تحديث البوت','البوت صار مخصص لعجلة المكافآت. استخدم اللوحة الجديدة.');
 const adminActions=[...MEMBER_ADMIN_ACTIONS,'admin','role','grantuser','grant','claims','deliver','stats','rankstatus'];
 if(adminActions.includes(action)&&!isAdmin(i))return reply('للإدارة فقط','هذا الخيار يحتاج صلاحية إدارة السيرفر.');
 if(MEMBER_ADMIN_ACTIONS.includes(action))return memberAdmin(i,rewards,reply);
 if(action==='home')return i.editReply(panel(rewards));
 if(action==='admin')return reply('إعدادات العجلة','حدد رتبة المشاركة من القائمة.\nنظام الشات والفويس مفعّل، والجوائز الدائمة تُسلّم عن طريق الإدارة.\nالجوائز النقدية متاحة بدون سقف شهري، وتسليمها يدوي من الإدارة.',[new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('reward:role').setPlaceholder('اختر رتبة المشاركة')),row(btn('reward:grantuser:1','منح تذكرة'),btn('reward:grantuser:5','منح ٥ تذاكر'),btn('reward:grantuser:10','منح ١٠ تذاكر')),row(btn('reward:rankstatus','حالة رتب اللفلات'),btn('reward:stats','ملخص المكافآت'),btn('reward:claims','الجوائز المعلّقة')),row(btn('reward:members','بحث باللفل'),btn('reward:tagsettings','رتبة التاق')),home()]);
 if(action==='rankstatus')return reply('حالة رتب اللفلات',await rankStatus(i.guild),[row(btn('reward:admin','رجوع للإدارة'))]);
 if(action==='stats'){const a=rewards.db.prepare('SELECT COUNT(*) AS users,COALESCE(SUM(tickets),0) AS tickets FROM reward_accounts').get();const c=rewards.db.prepare("SELECT COUNT(*) AS total,COALESCE(SUM(cash),0) AS cash,COUNT(CASE WHEN status='pending' THEN 1 END) AS pending FROM reward_claims").get();return reply('ملخص المكافآت',`الأعضاء: **${a.users}**\nالتذاكر المتاحة: **${a.tickets}**\nالجوائز المسجلة: **${c.total}**\nبانتظار التسليم: **${c.pending}**\nإجمالي النقد المسجل: **${c.cash} دولار**`,[row(btn('reward:admin','رجوع للإدارة'))]);}
 if(action==='role'){const id=i.values[0];if(id===i.guildId)return reply('اختر رتبة محددة','ما تقدر تختار رتبة الجميع.');rewards.store.set('rewards:role',id);return reply('تم حفظ الرتبة',`العجلة متاحة لأصحاب رتبة <@&${id}>.`);}
 if(action==='grantuser')return reply('منح تذاكر',`اختر العضو لمنحه ${[1,5,10].includes(Number(arg))?Number(arg):1} تذكرة. تُسجّل العملية باسمك.`,[row(new UserSelectMenuBuilder().setCustomId(`reward:grant:${[1,5,10].includes(Number(arg))?Number(arg):1}`).setPlaceholder('اختر العضو')),home()]);
 if(action==='grant'){const p=rewards.grant(i.values[0],user,i.id,[1,5,10].includes(Number(arg))?Number(arg):1);return reply('تم منح تذكرة',`<@${i.values[0]}> عنده الآن **${p.tickets}** تذكرة.`);}
 if(action==='claims'){const items=rewards.pending();return reply('جوائز بانتظار التسليم',items.length?items.map((c,n)=>`${n+1}. <@${c.user}> — **${PRIZES.find(p=>p.key===c.prize).label}**\nرقم المطالبة: \`${c.id}\``).join('\n\n'):'كل الجوائز تم تسليمها.',[...items.map((c,n)=>row(btn(`reward:deliver:${c.id}`,`تأكيد تسليم الجائزة ${n+1}`))),...(items.length<5?[home()]:[])]);}
 if(action==='deliver'){rewards.fulfill(arg,user);return reply('تم تسجيل التسليم','تم تحديث سجل الجائزة. هذا الزر يسجّل التسليم فقط، ولا يحوّل مبالغ أو يعطي صلاحيات.');}
 if(action==='balance'){await syncTag(i.guild,rewards,user).catch(()=>{});await syncRanks(i.guild,rewards,user);const p=rewards.account(user),l=level(p.xp),rank=rankProgress(p);return reply('رصيدك',`🎟️ التذاكر: **${p.tickets}**\n✍️ اللفل الكتابي: **${rank.chat}**\n🎙️ اللفل الصوتي: **${rank.voice}**\n🏅 الرتبة المستحقة: **${rank.current?.name||'لم تصل إلى Rookie بعد'}**\n${rank.next?`الهدف القادم: **${rank.next.name}** — كتابي ${rank.next.chat} وصوتي ${rank.next.voice}`:'وصلت إلى Legend!'}\n🎟️ مستوى التذاكر المشترك: **${l.level}** (${l.xp} / ${l.next} خبرة)\n\nكل ٥ لفلات جديدة = تذكرة. تاق السيرفر مع رتبة التاق = ضعف الخبرة الكتابية والصوتية. الحد اليومي المشترك ٦٠٠ خبرة.\nالفويس يحتاج عضوين فعليين على الأقل، بدون ميوت أو ديفن، وخارج روم AFK.`,[row(btn('reward:spin','لف العجلة',ButtonStyle.Success),btn('reward:history','جوائزي')),home()]);}
 if(action==='prizes')return reply('الجوائز',PRIZES.map(p=>`• **${p.label}**`).join('\n')+'\n\nالجوائز النقدية متاحة بدون سقف شهري، وفرص الفوز تختلف بين الجوائز.\nكل الميزات دائمة وتُستلم من الإدارة. لا توجد مدفوعات تلقائية.');
 if(action==='history'){const claims=rewards.claims(user);return reply('جوائزك',claims.length?claims.map(c=>`**${PRIZES.find(p=>p.key===c.prize).label}** — ${c.status==='delivered'?'تم التسليم':'بانتظار الإدارة'}\nرقم الجائزة: \`${c.id}\``).join('\n\n'):'ما عندك جوائز لحد الآن.');}
 if(action==='spin'){const member=await i.guild.members.fetch({user,force:true});const win=rewards.spin(user,i.id,[...member.roles.cache.keys()]);const prize=PRIZES.find(p=>p.key===win.prize);return i.editReply({content:'',embeds:[card('مبروك! 🎉',`<@${user}> فزت بـ **${prize.label}**\n${prize.cash?'تواصل مع الإدارة لاستلام المبلغ.':'ميزة دائمة — تواصل مع الإدارة لتفعيلها.'}\nرقم الجائزة: \`${win.id}\`\nباقي لك ${rewards.account(user).tickets} تذكرة.`).setImage(`attachment://roulette-v2-${prize.key}.gif`)],files:[file(`roulette-v2-${prize.key}.gif`)],attachments:[],components:[...controls()],allowedMentions:{parse:[]}});}
 return reply('الخيار غير متاح','ارجع للعجلة وجرب من جديد.');
}
