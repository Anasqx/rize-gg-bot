import { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, EmbedBuilder } from 'discord.js';
import { GAMES, ar, rankName } from './games.js';

export const MARKER = 'Rize.gg • Find your team';
export const row = (...components) => new ActionRowBuilder().addComponents(...components);
export const button = (id, label, style = ButtonStyle.Secondary) => new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);
export const stamp = ms => `<t:${Math.floor(ms/1000)}:R>`;
export const embed = (title, description) => new EmbedBuilder().setColor(0x99F9EA).setTitle(title).setDescription(description).setFooter({ text: MARKER });
export const privateView = (content, components = [], embeds = []) => ({ content, components, embeds, allowedMentions: { parse: [] } });
export const home = () => row(button('home','↩️ Back'));
export function gameMenu(action, store) {
  return row(new StringSelectMenuBuilder().setCustomId(`game:${action}`).setPlaceholder('What are we playing?').addOptions(
    Object.entries(GAMES).map(([value,g]) => ({ label:g.name, value, emoji:g.emoji, description:`${ar(store.active(value).length)} ready now` }))));
}
export function ranks(action, game) {
  const options = GAMES[game].ranks.map((label,i) => ({ label, value:String(i) }));
  if (action === 'find') options.unshift({ label:'Any rank — casual', value:'any' });
  return row(new StringSelectMenuBuilder().setCustomId(`rank:${action}:${game}`).setPlaceholder(action === 'find' ? 'Choose a rank to match' : 'Choose your rank').addOptions(options));
}
export function timing(game, rank) {
  return row(new StringSelectMenuBuilder().setCustomId(`time:${game}:${rank}`).setPlaceholder('When will you be ready?').addOptions(
    [{label:'Now',value:'0'},{label:'In 30 minutes',value:'30'},{label:'In 1 hour',value:'60'},{label:'In 2 hours',value:'120'}]));
}
export function size(game, rank) {
  return row(new StringSelectMenuBuilder().setCustomId(`size:${game}:${rank}`).setPlaceholder('How many players do you need?').addOptions(
    Array.from({length:GAMES[game].max},(_,i) => ({label:`${ar(i+1)} player(s)`,value:String(i+1)}))));
}
export const gameButtons = store => row(...Object.entries(GAMES).map(([key,g])=>button(`pick:${key}`,`${g.emoji} ${g.name} · ${ar(store.active(key).length)}`)));
export function panel(store) {
  const total = new Set(store.active().map(a=>a.user)).size;
  return {embeds:[embed('Find your team','Choose a game below, then get notified or find a player.\nThe number beside each game shows players ready now.').setImage('attachment://lfg-banner.png')],
    components:[gameButtons(store),row(button('games',`Games · ${ar(total)} ready`),button('mine','My status'))],allowedMentions:{parse:[]}};
}
export function requestView(r) {
  const g = GAMES[r.game];
  const status = {pending:'Posting',open:'Looking for players',full:'Team full 🎉',closed:'Request closed',expired:'Request expired'}[r.status];
  const remaining=Math.max(0,r.needed-r.players.length);
  const open=r.status==='open';
  const e=embed(`${g.emoji} ${g.name} • ${status}`,
    open ? `<@${r.owner}> is looking for a teammate.\n**Want in? Tap Join team below.**` : r.status==='full' ? `Team complete! <@${r.owner}>, you’re ready to play.` : `<@${r.owner}>’s invite has ended.`)
    .setColor(open?0x99F9EA:r.status==='full'?0xA697EB:0x73818C)
    .addFields(
      {name:'🎮 Mode',value:r.rank==='any'?'Casual · any rank':rankName(r.game,r.rank),inline:true},
      {name:'👥 Team',value:`${r.players.length+1} / ${r.needed+1} players`,inline:true}
    ).setFooter({text:'Rize.gg • Play together. Rise together.'});
  if(open)e.addFields({name:'⏳ Invite closes',value:stamp(r.expires),inline:true});
  if(r.players.length)e.addFields({name:'Your team',value:[r.owner,...r.players].map(u=>`<@${u}>`).join(' · ')});
  return {content:open?`<@${r.owner}> is looking for ${remaining===1?'a teammate':`${remaining} players`}!`:'',embeds:[e],components:open?[row(
    button(`join:${r.id}`,'Join team',ButtonStyle.Success),button(`manage:${r.id}`,'Manage team')
  )]:r.status==='full'?[row(button(`manage:${r.id}`,'Manage team'))]:[],allowedMentions:{parse:[]}};
}
