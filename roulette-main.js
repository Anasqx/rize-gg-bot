import {Client,GatewayIntentBits,Events,MessageFlags,EmbedBuilder,ActionRowBuilder,ButtonBuilder,ButtonStyle} from 'discord.js';
import {Store} from './store.js';
import {Rewards} from './rewards.js';
import {syncRanks,rankStatus} from './rank-sync.js';
import {syncTag} from './tag-rewards.js';
import {panel,handleRewards} from './roulette-ui.js';
const env=process.env;
for(const k of ['DISCORD_TOKEN','GUILD_ID','PANEL_CHANNEL_ID'])if(!env[k])throw Error(`Missing ${k}`);
const client=new Client({intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMembers,GatewayIntentBits.GuildMessages,GatewayIntentBits.GuildVoiceStates]});
const store=new Store(env.DATABASE_PATH||'./data/rize.sqlite');
if(store.get('guild')&&store.get('guild')!==env.GUILD_ID)throw Error('Guild mismatch');store.set('guild',env.GUILD_ID);
store.set('rewards:leveling','internal');
if(env.REWARDS_ROLE_ID&&!store.get('rewards:role'))store.set('rewards:role',env.REWARDS_ROLE_ID);
let tagCursor='';
const voiceSince=new Map();
const lastRankCheck=new Map();
async function awardActivity(guild,user,kind){
 if(!rewards.canEarn(user,kind))return;
 await syncTag(guild,rewards,user).catch(log);
 rewards.activity(user,kind);
 const now=Date.now();if(now-(lastRankCheck.get(user)||0)<60000)return;
 lastRankCheck.set(user,now);await syncRanks(guild,rewards,user);
}

const rewards=new Rewards(store);let ready=false,channel,timer;let queue=Promise.resolve();
const enqueue=work=>{const job=queue.then(work);queue=job.catch(()=>{});return job;};
const log=e=>console.error('تعذرت العملية:',e.code||e.name||'خطأ');
async function refresh(){let m;const id=store.get('roulette:panel');if(id){try{m=await channel.messages.fetch(id);}catch(e){if(e.code!==10008)throw e;}}
 if(!m){const old=store.get(`demo_panel:${channel.id}`);if(old){try{m=await channel.messages.fetch(old);}catch(e){if(e.code!==10008)throw e;}}}
 if(m&&m.author.id!==client.user.id)throw Error('Panel owner mismatch');
 if(m)await m.edit(panel(rewards));else m=await channel.send(panel(rewards));store.set('roulette:panel',m.id);
}
client.once(Events.ClientReady,()=>enqueue(async()=>{
 const guild=await client.guilds.fetch(env.GUILD_ID);await guild.channels.fetch();channel=await guild.channels.fetch(env.PANEL_CHANNEL_ID);
 const old=store.get('panel');if(old){try{const m=await channel.messages.fetch(old);if(m.author.id===client.user.id)await m.edit({content:'',embeds:[new EmbedBuilder().setColor(0x99f9ea).setTitle('Rize.gg • المكافآت').setDescription('تم إيقاف البحث عن فريق. تقدر تستخدم عجلة المكافآت في هذا الروم.')],components:[],attachments:[]});}catch(e){if(e.code!==10008)throw e;}}
 await refresh();ready=true;
 console.log('حالة رتب المستويات:\n'+await rankStatus(guild));
 timer=setInterval(()=>enqueue(async()=>{
 const eligible=new Set();
 for(const c of guild.channels.cache.values())if(c.isVoiceBased()&&c.id!==guild.afkChannelId){const members=[...c.members.values()].filter(m=>!m.user.bot&&!m.voice.selfMute&&!m.voice.serverMute&&!m.voice.selfDeaf&&!m.voice.serverDeaf);if(members.length>=2)for(const m of members){eligible.add(m.id);if(!voiceSince.has(m.id))voiceSince.set(m.id,Date.now());else if(Date.now()-voiceSince.get(m.id)>=60000)await awardActivity(guild,m.id,'voice');}}
 for(const id of voiceSince.keys())if(!eligible.has(id))voiceSince.delete(id);
 if(store.get('tag:role')){
  const batch=rewards.db.prepare('SELECT user FROM reward_accounts WHERE user>? ORDER BY user LIMIT 10').all(tagCursor);
  for(const item of batch){await syncTag(guild,rewards,item.user).catch(log);tagCursor=item.user;}
  if(batch.length<10)tagCursor='';
 }
 }).catch(log),60000);
 console.log('Rize.gg: عجلة المكافآت العربية جاهزة.');
 console.log('RELEASE_READY: launch-v5; persistent highest rewarded level; no repeat level tickets');
 console.log('TAG_LIVE_READY: GuildMembers enabled; tag role grants/removals active; XP uses normal rates');
}).catch(e=>{log(e);client.destroy();process.exitCode=1;}));
// Listen to raw member events so uncached members also receive tag updates.
const tagJobs=new Map();
function scheduleTag(user){
 if(!ready||!store.get('tag:role'))return;
 const previous=tagJobs.get(user)||Promise.resolve();
 const job=previous.catch(()=>{}).then(()=>syncTag(client.guilds.cache.get(env.GUILD_ID),rewards,user)).catch(log);
 tagJobs.set(user,job);job.finally(()=>{if(tagJobs.get(user)===job)tagJobs.delete(user);});
}
client.on(Events.Raw,packet=>{
 if(packet.d?.guild_id!==env.GUILD_ID)return;
 if(packet.t==='GUILD_MEMBER_ADD'||(packet.t==='GUILD_MEMBER_UPDATE'&&Object.hasOwn(packet.d.user||{},'primary_guild')))scheduleTag(packet.d.user.id);
});
client.on(Events.UserUpdate,(oldUser,newUser)=>{if(JSON.stringify(oldUser.primaryGuild)!==JSON.stringify(newUser.primaryGuild))scheduleTag(newUser.id);});
client.on(Events.VoiceStateUpdate,(oldState,newState)=>{if(newState.guild.id===env.GUILD_ID)voiceSince.delete(newState.id);});
client.on(Events.MessageCreate,m=>{if(ready&&m.guildId===env.GUILD_ID&&!m.author.bot&&!m.webhookId)enqueue(()=>awardActivity(m.guild,m.author.id,'chat')).catch(log);});
client.on(Events.InteractionCreate,async i=>{if(i.guildId!==env.GUILD_ID||(!i.isButton()&&!i.isAnySelectMenu()))return;
 try{if(i.message.flags.has(MessageFlags.Ephemeral))await i.deferUpdate();else await i.deferReply({flags:MessageFlags.Ephemeral});
 await enqueue(async()=>{try{if(!ready)throw Object.assign(Error('البوت يبدأ الآن، جرّب بعد لحظات.'),{userFacing:true});await handleRewards(i,rewards);if(i.customId==='reward:role')await refresh();}catch(e){if(!e.userFacing)log(e);await i.editReply({content:e.userFacing?e.message:'صار خطأ. جرّب مرة ثانية أو تواصل مع الإدارة.',embeds:[],components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('reward:balance').setLabel('رصيدي وجوائزي').setStyle(ButtonStyle.Secondary),new ButtonBuilder().setCustomId('reward:home').setLabel('رجوع للعجلة').setStyle(ButtonStyle.Secondary))],attachments:[],allowedMentions:{parse:[]}});}});
 }catch(e){log(e);}});
client.on(Events.Error,log);
async function stop(){clearInterval(timer);client.destroy();await queue;await Promise.allSettled([...tagJobs.values()]);store.db.close();process.exit(0);}process.once('SIGTERM',stop);process.once('SIGINT',stop);
client.login(env.DISCORD_TOKEN).catch(e=>{log(e);process.exitCode=1;});
