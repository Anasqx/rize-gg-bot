import {PermissionFlagsBits} from 'discord.js';
import {RANK_TIERS} from './rank-tiers.js';
export function hasServerTag(user,guildId){const tag=user.primaryGuild;return tag?.identityEnabled===true&&tag.identityGuildId===guildId;}
export function validateTagRole(role,guild,rewards){
 if(!role||role.id===guild.id||role.managed||!role.editable)throw Error('اختر رتبة عادية تحت رتبة البوت.');
 if(RANK_TIERS.some(t=>t.name===role.name)||role.id===rewards.store.get('rewards:role'))throw Error('استخدم رتبة مستقلة للتاق، غير رتب اللفلات أو دخول العجلة.');
 const dangerous=['Administrator','ManageGuild','ManageRoles','ManageChannels','KickMembers','BanMembers','ModerateMembers','ManageWebhooks','MentionEveryone','MuteMembers','DeafenMembers','MoveMembers'];
 if(dangerous.some(p=>role.permissions.has(PermissionFlagsBits[p])))throw Error('اختر رتبة تاق بدون صلاحيات إدارية أو تحكم بالأعضاء.');
}
export async function syncTag(guild,rewards,userId){
 const id=rewards.store.get('tag:role');if(!id)return 'لم تُحدد رتبة التاق بعد.';
 await guild.members.fetchMe();const role=await guild.roles.fetch(id);validateTagRole(role,guild,rewards);
 const member=await guild.members.fetch({user:userId,force:true});if(member.user.bot)return 'البوتات غير مشمولة.';
 const user=await guild.client.users.fetch(userId,{force:true});
 const owned=`tag:granted:${id}:${userId}`;
 if(hasServerTag(user,guild.id)){
  if(!member.roles.cache.has(id)){await member.roles.add(id,'Rize.gg: عرض تاق السيرفر');rewards.store.set(owned,'yes');}
  return 'التاق مفعّل ورتبته موجودة.';
 }
 if(rewards.store.get(owned)==='yes'){
  if(member.roles.cache.has(id))await member.roles.remove(id,'Rize.gg: إزالة تاق السيرفر');rewards.store.set(owned,'no');
 }
 return 'تاق هذا السيرفر غير ظاهر عند العضو.';
}
