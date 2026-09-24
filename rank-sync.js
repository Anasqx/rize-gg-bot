import {RANK_TIERS,rankProgress} from './rank-tiers.js';
export function tierRoles(roles){
 return RANK_TIERS.map(tier=>{const role=roles.get(tier.id);return {...tier,role:role||null,issue:role?null:'الرتبة غير موجودة'};});
}
export async function syncRanks(guild,rewards,user){
 const progress=rankProgress(rewards.account(user));if(!progress.earned.length)return;
 const roles=tierRoles(await guild.roles.fetch());
 const eligible=roles.filter(t=>progress.chat>=t.chat&&progress.voice>=t.voice);
 const member=await guild.members.fetch({user,force:true});
 await guild.members.fetchMe();
 for(const t of eligible){if(!t.role||t.role.managed||!t.role.editable)continue;if(!member.roles.cache.has(t.role.id))await member.roles.add(t.role.id,'Rize.gg: استيفاء شروط اللفل الكتابي والصوتي');}
}
export async function rankStatus(guild){await guild.members.fetchMe();return tierRoles(await guild.roles.fetch()).map(t=>`<@&${t.id}>: ${t.issue||(t.role.managed||!t.role.editable?'يحتاج صلاحية إدارة الرتب ورتبة البوت أعلى منه':'جاهزة')} — كتابي ${t.chat} / صوتي ${t.voice}`).join('\n');}
