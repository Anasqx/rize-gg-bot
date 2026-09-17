import { userError } from './errors.js';
import { ButtonStyle, PermissionFlagsBits } from 'discord.js';
import { GAMES, ar, rankName, validateGameRank } from './games.js';
import { privateView as view, row, button, home, gameMenu, ranks, timing, size, stamp, requestView, gameButtons } from './ui.js';

export async function handle(i, ctx) {
  const {store, match, syncRequest} = ctx;
  const [action,a,b,c] = i.customId.split(':');
  const user = i.user.id;
  const reply = (text, components = [home()]) => i.editReply(view(text,components));
  const value = i.values?.[0];
  if (['home','games','register','find'].includes(action)) return reply('Pick your game 👇',[gameButtons(store),row(button('mine','My status'))]);
  if (['pick','ready','quickfind','options'].includes(action)) {
    if(!GAMES[a]) throw userError('Choose a game from the panel.');
    if(action==='ready') {
      const rank=store.mine(user).find(r=>r.game===a)?.rank || store.get(`rank:${user}:${a}`) || '0';
      store.register(user,a,rank,0);
      return reply(`✅ You are ready for ${GAMES[a].name} for 2 hours. We will mention you in <#${match.id}> when someone needs a player.`,[row(button(`remove:${a}`,'Stop looking'),button('home','Back to games'))]);
    }
    if(action==='quickfind') return handle({...i,customId:`publish:${a}:any:1`,editReply:i.editReply.bind(i)},ctx);
    if(action==='options') return reply('Rank and time are optional. Choose your rank to update your availability.',[ranks('register',a),row(button(`gamefind:${a}`,'Choose rank and team size'),button(`pick:${a}`,'Back'))]);
    return reply(`**${GAMES[a].name}** · ${ar(store.active(a).length)} ready\nReady to play — we’ll notify you for the next 2 hours.\nFind a teammate — post an invite for 1 player, any rank.`,[row(button(`ready:${a}`,'Ready to play',ButtonStyle.Success),button(`quickfind:${a}`,'Find a teammate',ButtonStyle.Primary)),row(button('home','Back to games'))]);
  }
  if(action==='gamefind') {if(!GAMES[a]) throw userError('Invalid selection.');return reply('Choose a rank for your request.',[ranks('find',a),home()]);}
  if(action==='cancelReq' || action==='leaveReq') {
    const r=store.request(a);if(!r) throw userError('This request has ended.');
    if(action==='cancelReq') {if(r.owner!==user && !i.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) throw userError('Only the request owner or a moderator can close it.');store.close(a);}
    else store.leave(a,user);
    await syncRequest(store.request(a));return reply('Done ✅');
  }
  if (['games','register','find'].includes(action)) {
    const mode = action === 'find' ? 'find' : 'register';
    return reply(action==='games' ? '🎮 Pick a game to join the available players!' : mode==='find' ? '🔎 Which game do you need players for?' : '🙋 Choose a game and rank to be available for 2 hours.',[gameMenu(mode,store),home()]);
  }
  if (action==='help') return reply('Pick a game, then tap Ready to play or Find a teammate. That’s it!');
  if (action==='game') {
    if (!GAMES[value] || !['register','find'].includes(a)) throw userError('Invalid selection.');
    return reply(`${GAMES[value].emoji} **${GAMES[value].name}**\n${a==='find'?'Choose the rank you want to play with.':'Choose your rank. You can change it later.'}`,[ranks(a,value),home()]);
  }
  if (action==='rank') {
    if (!['register','find'].includes(a) || !validateGameRank(b,value,a==='find')) throw userError('Invalid selection.');
    if (a==='find') return reply('How many more players do you need? Do not count yourself.',[size(b,value),home()]);
    store.set(`rank:${user}:${b}`,value);
    const {end} = store.register(user,b,value,0);
    return reply(`✅ You are ready for **${GAMES[b].name}** · ${rankName(b,value)}\nAvailable until ${stamp(end)}. We will mention you in <#${match.id}> for a matching request.`,[row(button('mine','👤 My status'),button(`schedule:${b}:${value}`,'🕒 Play later')),home()]);

  }
  if (action==='schedule') {
    if (!validateGameRank(a,b)) throw userError('Invalid selection.');
    return reply('When will you play? Your current availability stays until you choose a new time.',[timing(a,b),home()]);
  }
  if (action==='time') {
    const {start,end} = store.register(user,a,b,Number(value));
    return reply(`✅ You are ready for **${GAMES[a].name}** · **${rankName(a,b)}**\nStarts ${stamp(start)} and ends ${stamp(end)}.\nWe will mention you in <#${match.id}> for a matching request.`,[row(button('mine','👤 My status'),button('find','🔎 Find players'))]);
  }
  if (action==='size') {
    const n = Number(value);
    if (!validateGameRank(a,b,true) || !Number.isInteger(n) || n<1 || n>GAMES[a].max) throw userError('Invalid selection.');
    return reply(`**Review your request 👀**\nGame: ${GAMES[a].name}\nRank: ${rankName(a,b)}\nPlayers needed: ${ar(n)} player(s)\n\nWe will post in <#${match.id}> and mention up to 10 matching players. Expires in 30 minutes.`,[row(button(`publish:${a}:${b}:${n}`,'📣 Post request',ButtonStyle.Success)),home()]);
  }
  if (action==='publish') {
    const r = store.create(user,a,b,Number(c));
    const candidates = store.candidates(r);
    try {
      const payload = requestView({...r,status:'open'});
      payload.content += candidates.length ? `\nReady to join? ${candidates.map(a=>`<@${a.user}>`).join(' ')}` : '';
      payload.allowedMentions = {parse:[],users:candidates.map(a=>a.user)};
      const message = await match.send(payload);
      store.publish(r.id,message.id);
      store.pinged(a,candidates.map(a=>a.user));
      store.remove(user,a);
      return reply(`✅ <@${user}>, your **${GAMES[a].name}** invite is live in <#${match.id}>.\n[View your invite](${message.url})` );
    } catch(error) { store.close(r.id); throw error; }
  }
  if (action==='mine') {
    const items = store.mine(user);
    const teams = store.requestsFor(user);
    const links = teams.length ? '\n\n**Your teams and requests**\n'+teams.slice(0,10).map(r=>`• [${GAMES[r.game].name}](https://discord.com/channels/${i.guildId}/${match.id}/${r.message})`).join('\n') : '';
    if (!items.length) return reply('You are not listed as available.'+links,[row(button('home','Choose a game'))]);
    return reply('**Your availability 🎮**\n'+items.map(a=>`${GAMES[a.game].emoji} **${GAMES[a.game].name}** · ${rankName(a.game,a.rank)}\nStarts ${stamp(a.start)} and ends ${stamp(a.end)}`).join('\n\n')+links,[
      ...items.map(a=>row(button(`extend:${a.game}`,`Extend ${GAMES[a.game].name}`),button(`remove:${a.game}`,'Cancel',ButtonStyle.Danger))),
      row(button('home','Back to games'))
    ]);
  }
  if (action==='extend') return reply(`✅ Availability extended until ${stamp(store.extend(user,a))}.`,[row(button('mine','👤 My status'))]);
  if (action==='remove') { store.remove(user,a); return reply('Availability removed. You will not be mentioned for new requests unless you register again.',[row(button('mine','👤 My status'))]); }
  if (action==='requests') {
    const requests = store.requestsFor(user);
    return reply(requests.length ? '**Your teams and requests 👥**\n'+requests.slice(0,10).map(r=>`• ${GAMES[r.game].name}: https://discord.com/channels/${i.guildId}/${match.id}/${r.message}`).join('\n') : 'No active teams or requests.');
  }
  if (['join','decline','close','leave','manage'].includes(action)) {
    const r = store.request(a);
    if (!r || i.message.id !== r.message || i.channelId !== match.id) throw userError('This request is unavailable.');
    if(action==='manage') {
      if(r.owner===user || i.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) return reply('Request options',[row(button(`cancelReq:${a}`,'Close request',ButtonStyle.Danger))]);
      if(r.players.includes(user)) return reply('You are in this team.',[row(button(`leaveReq:${a}`,'Leave team'))]);
      return reply('Use the Join button on the request.');
    }
    if (action==='join') {
      const updated = store.join(a,user);
      await syncRequest(updated);
      return reply(`✅ You joined! Coordinate in <#${match.id}>. Your availability for this game was removed to avoid further mentions.`);
    }
    if (action==='decline') { store.decline(a,user); return reply('Declined 👍 Your availability for other requests is unchanged.'); }
    if (action==='leave') {
      const updated = store.leave(a,user); await syncRequest(updated);
      return reply('You left the team. Register again if you want more invites.');
    }
    if (r.owner !== user && !i.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) throw userError('Only the request owner or a moderator can close it.');
    store.close(a); await syncRequest(store.request(a)); return reply('🔒 Request closed.');
  }
  throw userError('This button is outdated. Open the main panel and try again.');
}
