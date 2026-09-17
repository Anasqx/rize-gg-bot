import { userError } from './errors.js';
import { ButtonStyle, PermissionFlagsBits } from 'discord.js';
import { GAMES, ar, rankName, validateGameRank } from './games.js';
import { privateView as view, row, button, home, gameMenu, ranks, timing, size, stamp, requestView, gameButtons, linkButton } from './ui.js';

export async function handle(i, ctx) {
  const {store, match, syncRequest} = ctx;
  const [action,a,b,c] = i.customId.split(':');
  const user = i.user.id;
  const reply = (text, components = [home()]) => i.editReply(view(text,components));
  const teamUrl = r => `https://discord.com/channels/${i.guildId}/${match.id}/${r.message}`;
  const value = i.values?.[0];
  if (['home','games','register','find'].includes(action)) return reply('Pick your game 👇',[gameButtons(store),row(button('mine','My status'))]);
  if (['pick','ready','quickfind','options'].includes(action)) {
    if(!GAMES[a]) throw userError('Choose a game from the panel.');
    if(action==='ready') {
      const rank=store.mine(user).find(r=>r.game===a)?.rank || store.get(`rank:${user}:${a}`) || '0';
      store.register(user,a,rank,0);
      return reply(`✅ You are ready for **${GAMES[a].name}**.\nWe’ll mention you in <#${match.id}> when someone needs a teammate. Your ready status lasts 2 hours.`,[row(button(`remove:${a}`,'Stop looking'),button('home','Back to games'))]);
    }
    if(action==='quickfind') {
      const existing=store.openFor(user);
      const current=existing && store.request(existing.id);
      if(current) return reply(`You already have an invite open.\n[View your invite](https://discord.com/channels/${i.guildId}/${match.id}/${current.message})`,[row(linkButton('View my invite',teamUrl(current)),button(`cancelReq:${current.id}`,'Close invite')),home()]);
      const availability=store.active(a).find(x=>x.user===user);
      const team=store.recent().filter(r=>r.game===a && r.status==='open' && r.expires>store.now() && r.owner!==user && !r.players.includes(user) && (r.rank==='any'||r.rank===availability?.rank))
        .sort((x,y)=>(x.needed-x.players.length)-(y.needed-y.players.length)||x.created-y.created)[0];
      if(team) return i.editReply(view('**A spot is waiting for you.** Join this team now, or start your own.',[row(button(`quickjoin:${team.id}`,'Join team',ButtonStyle.Success),button(`publish:${a}:any:1`,'Start my own team')),row(button(`pick:${a}`,'Back'))],requestView(team).embeds));
      return handle({...i,customId:`publish:${a}:any:1`,editReply:i.editReply.bind(i)},ctx);
    }
    if(action==='options') return reply('Rank and time are optional. Choose your rank to update your availability.',[ranks('register',a),row(button(`gamefind:${a}`,'Choose rank and team size'),button(`pick:${a}`,'Back'))]);
    const ready=store.active(a).some(x=>x.user===user);
    const own=store.requestsFor(user).find(r=>r.game===a && r.owner===user);
    const choices=[ready?button(`remove:${a}`,'Stop looking'):button(`ready:${a}`,'Notify me',ButtonStyle.Success),own?linkButton('View my invite',teamUrl(own)):button(`quickfind:${a}`,'Find a teammate',ButtonStyle.Primary)];
    return reply(`**${GAMES[a].name}** · ${ar(store.active(a).length)} ready\n${ready?'You’re on the list. We’ll mention you when a team needs you.':'Notify me — be available for invites for 2 hours.'}\n${own?'Your invite is live. Open it to see your team.':'Find a teammate — join a team or start your own.'}`,[row(...choices),row(button('home','Change game'))]);
  }
  if(action==='quickjoin') {
    const r=store.request(a);
    if(!r?.message) throw userError('This invite is no longer available. Choose your game again.');
    const updated=store.join(a,user);await syncRequest(updated);
    return reply(`✅ You joined <@${r.owner}> for **${GAMES[r.game].name}**.\n[Open team chat](https://discord.com/channels/${i.guildId}/${match.id}/${r.message})`,[row(linkButton('Open team chat',teamUrl(r)),button(`leaveReq:${a}`,'Leave team')),home()]);
  }
  if(action==='gamefind') {if(!GAMES[a]) throw userError('Invalid selection.');return reply('Choose a rank for your request.',[ranks('find',a),home()]);}
  if(action==='cancelReq' || action==='leaveReq') {
    const r=store.request(a);if(!r) throw userError('This request has ended.');
    if(action==='cancelReq') {if(r.owner!==user && !i.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) throw userError('Only the request owner or a moderator can close it.');store.close(a);}
    else store.leave(a,user);
    await syncRequest(store.request(a));return reply(action==='cancelReq'?'Your invite is closed. Ready for another game?':'You’ve left the team. Find another game whenever you’re ready.',[row(button('home','Choose a game'))]);
  }
  if (['games','register','find'].includes(action)) {
    const mode = action === 'find' ? 'find' : 'register';
    return reply(action==='games' ? '🎮 Pick a game to join the available players!' : mode==='find' ? '🔎 Which game do you need players for?' : '🙋 Choose a game and rank to be available for 2 hours.',[gameMenu(mode,store),home()]);
  }
  if (action==='help') return reply('Pick a game, then tap Notify me or Find a teammate. That’s it!');
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
      return reply(`**Your invite is live!**\n<@${user}>, we’re looking for your **${GAMES[a].name}** teammate in <#${match.id}>.\nYour invite closes ${stamp(r.expires)}.`,[row(linkButton('View my invite',message.url),button(`cancelReq:${r.id}`,'Close invite')),home()]);
    } catch(error) { store.close(r.id); throw error; }
  }
  if (action==='mine') {
    const items = store.mine(user);
    const teams = store.requestsFor(user);
    const links = teams.length ? '\n\n**Your teams and requests**\n'+teams.slice(0,10).map(r=>`• [${GAMES[r.game].name}](https://discord.com/channels/${i.guildId}/${match.id}/${r.message})`).join('\n') : '';
    if (!items.length) return reply((teams.length?'**Your teams**':'**Let’s find your next game.**\nChoose a game to find a teammate or get notified.')+links,[row(button('home','Choose a game'))]);
    return reply('**Your availability 🎮**\n'+items.map(a=>`${GAMES[a.game].emoji} **${GAMES[a.game].name}** · ${rankName(a.game,a.rank)}\nStarts ${stamp(a.start)} and ends ${stamp(a.end)}`).join('\n\n')+links,[
      ...items.map(a=>row(button(`extend:${a.game}`,`Extend ${GAMES[a.game].name}`),button(`remove:${a.game}`,'Cancel',ButtonStyle.Danger))),
      row(button('home','Back to games'))
    ]);
  }
  if (action==='extend') return reply(`✅ Availability extended until ${stamp(store.extend(user,a))}.`,[row(button('mine','👤 My status'))]);
  if (action==='remove') { store.remove(user,a); return reply('**You’re off the list.**\nNo more invites for this game until you choose Notify me again.',[row(button('home','Choose a game'))]); }
  if (action==='requests') {
    const requests = store.requestsFor(user);
    return reply(requests.length ? '**Your teams and requests 👥**\n'+requests.slice(0,10).map(r=>`• ${GAMES[r.game].name}: https://discord.com/channels/${i.guildId}/${match.id}/${r.message}`).join('\n') : 'No active teams or requests.');
  }
  if (['join','decline','close','leave','manage'].includes(action)) {
    const r = store.request(a);
    if (!r || i.message.id !== r.message || i.channelId !== match.id) throw userError('This request is unavailable.');
    if(action==='manage') {
      if(r.owner===user || i.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) return reply('**Your team, your call.**\nClose this invite when you’re done finding players.',[row(button(`cancelReq:${a}`,'Close invite',ButtonStyle.Danger))]);
      if(r.players.includes(user)) return reply('You are in this team.',[row(button(`leaveReq:${a}`,'Leave team'))]);
      return reply('Use the Join button on the request.');
    }
    if (action==='join') {
      const updated = store.join(a,user);
      await syncRequest(updated);
      return reply(`**You’re in!**\nYou joined <@${r.owner}> for **${GAMES[r.game].name}**. Say hello in <#${match.id}>.`,[row(linkButton('Open team chat',teamUrl(r)),button(`leaveReq:${a}`,'Leave team'))]);
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
