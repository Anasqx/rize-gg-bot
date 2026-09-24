import {EmbedBuilder} from 'discord.js';
import {PRIZES} from './rewards.js';
export const STAFF_CHANNEL='1552453006853931188';
export async function sendPrizeAlerts(guild,rewards){
 const pending=rewards.db.prepare('SELECT c.* FROM reward_alerts a JOIN reward_claims c ON c.id=a.claim WHERE a.message IS NULL ORDER BY c.created LIMIT 10').all();
 if(!pending.length)return;
 const channel=await guild.channels.fetch(STAFF_CHANNEL);
 if(!channel?.isTextBased()||typeof channel.send!=='function')throw Error('Staff alert channel unavailable');
 for(const claim of pending){
  const prize=PRIZES.find(p=>p.key===claim.prize);
  const message=await channel.send({content:`🎉 <@${claim.user}> فاز بجائزة!`,embeds:[new EmbedBuilder().setColor(0x99f9ea).setTitle('Rize.gg • فوز جديد').addFields({name:'الجائزة',value:prize.label},{name:'رقم الجائزة',value:claim.id},{name:'الحالة',value:claim.status==='delivered'?'تم التسليم':'بانتظار تسليم الإدارة'}).setTimestamp(claim.created)],allowedMentions:{parse:[],users:[claim.user]},nonce:claim.id.replaceAll('-','').slice(0,25),enforceNonce:true});
  rewards.db.prepare('UPDATE reward_alerts SET message=? WHERE claim=?').run(message.id,claim.id);
 }
}
