import { Client, Events, GatewayIntentBits, MessageFlags, PermissionFlagsBits, ChannelType } from 'discord.js';
import { fileURLToPath } from 'node:url';
import { Store } from './store.js';
import { panel, MARKER, requestView } from './ui.js';
import { handle } from './handler.js';
import { DemoRewards, ensureDemoPanel, handleDemo } from './demo.js';

const env = process.env;
for (const key of ['DISCORD_TOKEN','GUILD_ID','PANEL_CHANNEL_ID','MATCH_CHANNEL_ID']) {
  if (!env[key] || (key !== 'DISCORD_TOKEN' && !/^\d{17,20}$/.test(env[key]))) throw Error(`Missing or invalid setting: ${key}`);
}
if (env.PANEL_CHANNEL_ID === env.MATCH_CHANNEL_ID) throw Error('Use different channels for the panel and matchmaking chat.');
const presence = env.ENABLE_PRESENCE === 'true';
const client = new Client({intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMembers,...(presence?[GatewayIntentBits.GuildPresences]:[])]});
const store = new Store(env.DATABASE_PATH || './data/rize.sqlite');
if (store.get('guild') && store.get('guild') !== env.GUILD_ID) throw Error('This database belongs to another server. Use a different database path.');
store.set('guild',env.GUILD_ID);
const demo = new DemoRewards(store);
const logo = fileURLToPath(new URL('./lfg-banner.png',import.meta.url));
let guild, showcase, match, panelMessage, lastPanel, timer, initialized = false;
const synced = new Map();
let queue = Promise.resolve();
const enqueue = work => { const job=queue.then(work); queue=job.catch(()=>{}); return job; };
const log = error => console.error('Discord operation failed. Error code:',error.code ?? error.name ?? 'unknown');

async function syncRequest(r) {
  if (!r.message) return;
  const payload = requestView(r);
  const signature = JSON.stringify(payload);
  if (synced.get(r.id) === signature) return;
  try { await match.messages.edit(r.message,payload); synced.set(r.id,signature); }
  catch(error) {
    if (error.code===10008) {
      store.close(r.id);
      store.db.prepare('UPDATE requests SET message=NULL WHERE id=?').run(r.id);
    } else log(error);
  }
}
async function refreshPanel() {
  let online;
  if (presence) online = new Set(store.active().filter(a=>['online','idle','dnd'].includes(guild.presences.cache.get(a.user)?.status)).map(a=>a.user)).size;
  const payload = panel(store,online);
  const signature = JSON.stringify(payload);
  if (lastPanel===signature && panelMessage) return;
  try {
    if (panelMessage) await panelMessage.edit({...payload,...(!lastPanel || !panelMessage.attachments.some(a=>a.name==='lfg-banner.png') ? {attachments:[],files:[{attachment:logo,name:'lfg-banner.png'}]} : {})});
    else {
      panelMessage=await showcase.send({...payload,files:[{attachment:logo,name:'lfg-banner.png'}]});
      store.set('panel',panelMessage.id); store.set('panel_channel',showcase.id);
    }
    lastPanel=signature;
  } catch(error) {
    if(error.code===10008) {panelMessage=null;lastPanel=null;await refreshPanel();}
    else throw error;
  }
}
async function tick() {
  store.sweep();
  for(const r of store.recent()) await syncRequest(r);
  await refreshPanel();
}
async function initialize() {
  guild=await client.guilds.fetch(env.GUILD_ID);
  showcase=await guild.channels.fetch(env.PANEL_CHANNEL_ID);
  match=await guild.channels.fetch(env.MATCH_CHANNEL_ID);
  const me=await guild.members.fetchMe();
  for(const channel of [showcase,match]) {
    if(channel?.type!==ChannelType.GuildText) throw Error('Both channels must be regular server text channels.');
    if(!channel.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.EmbedLinks,PermissionFlagsBits.AttachFiles,PermissionFlagsBits.ReadMessageHistory])) throw Error('The bot lacks required channel permissions. Check the setup guide.');
  }
  // Reconcile saved registrations for members who left while the bot was offline.
  for(const {user} of store.db.prepare("SELECT user FROM availability UNION SELECT owner AS user FROM requests WHERE status IN ('open','full') UNION SELECT user FROM joins").all()) {
    try {await guild.members.fetch({user,force:true});}
    catch(error) {if(error.code===10007) store.removeMember(user);else throw error;}
  }
  // Recover a send that succeeded just before the process stopped.
  const pending=store.db.prepare("SELECT id FROM requests WHERE status='pending'").all();
  if(pending.length) {
    const history=await match.messages.fetch({limit:100});
    for(const r of pending) {
      const sent=history.find(m=>m.author.id===client.user.id && m.components.some(row=>row.components.some(c=>c.customId===`join:${r.id}`)));
      if(sent) store.publish(r.id,sent.id);else store.close(r.id);
    }
  }
  const id=env.PANEL_MESSAGE_ID || (store.get('panel_channel')===showcase.id ? store.get('panel') : null);
  if(id) {
    try {panelMessage=await showcase.messages.fetch(id);}
    catch(error) {if(error.code!==10008) throw error;}
    if(panelMessage && panelMessage.author.id!==client.user.id) throw Error('The panel message must belong to this bot.');
  }
  if(!panelMessage) {
    const history=await showcase.messages.fetch({limit:100});
    panelMessage=history.find(m=>m.author.id===client.user.id && m.embeds.some(e=>[MARKER,'Rize.gg • لقّط تيمك'].includes(e.footer?.text))) ?? null;
    if(panelMessage) {store.set('panel',panelMessage.id);store.set('panel_channel',showcase.id);}
  }
  await tick();
  await ensureDemoPanel(showcase,client,store);
  initialized=true;
  timer=setInterval(()=>enqueue(tick).catch(log),30_000);
  console.log('Rize.gg ready. Panels and buttons initialized.');
}
client.once(Events.ClientReady,()=>enqueue(initialize).catch(error=>{
  console.error('Startup failed. Check settings and permissions.');log(error);client.destroy();process.exitCode=1;
}));
client.on(Events.InteractionCreate,async i=>{
  if(!i.isButton() && !i.isStringSelectMenu()) return;
  if(i.guildId!==env.GUILD_ID || i.user.bot) return;
  try {
    if(!initialized) {await i.reply({content:'Starting up. Try again in a moment.',flags:MessageFlags.Ephemeral});return;}
    if(i.message.flags.has(MessageFlags.Ephemeral)) await i.deferUpdate();
    else await i.deferReply({flags:MessageFlags.Ephemeral});
    await enqueue(async()=>{
      try {if(i.customId.startsWith('demo:')) await handleDemo(i,demo); else await handle(i,{store,match,syncRequest});}
      catch(error) {
        const expected=error.userFacing === true;
        if(!expected) log(error);
        await i.editReply({content:expected?error.message:'Something went wrong. Try again, or contact a moderator if it continues.',embeds:[],components:[],allowedMentions:{parse:[]}});
      }
    });
  } catch(error) {log(error);}
});
client.on(Events.GuildMemberRemove,member=>{
  if(member.guild.id===env.GUILD_ID) enqueue(async()=>{store.removeMember(member.id);await tick();}).catch(log);
});
client.on(Events.Error,log);
async function stop() {clearInterval(timer);client.destroy();await queue;store.db.close();}
process.once('SIGTERM',()=>stop().then(()=>process.exit(0)));
process.once('SIGINT',()=>stop().then(()=>process.exit(0)));
client.login(env.DISCORD_TOKEN).catch(error=>{log(error);client.destroy();process.exitCode=1;});
