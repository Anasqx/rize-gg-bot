import { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, EmbedBuilder } from 'discord.js';
import { GAMES, ar, rankName } from './games.js';

export const MARKER = 'Rize.gg • لقّط تيمك';
export const row = (...components) => new ActionRowBuilder().addComponents(...components);
export const button = (id, label, style = ButtonStyle.Secondary) => new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);
export const stamp = ms => `<t:${Math.floor(ms/1000)}:R>`;
export const embed = (title, description) => new EmbedBuilder().setColor(0x99F9EA).setTitle(title).setDescription(description).setFooter({ text: MARKER });
export const privateView = (content, components = [], embeds = []) => ({ content, components, embeds, allowedMentions: { parse: [] } });
export const home = () => row(button('home','↩️ رجوع'));
export function gameMenu(action, store) {
  return row(new StringSelectMenuBuilder().setCustomId(`game:${action}`).setPlaceholder('وش ودّك تلعب؟').addOptions(
    Object.entries(GAMES).map(([value,g]) => ({ label:g.name, value, emoji:g.emoji, description:`${ar(store.active(value).length)} لاعب جاهز الحين` }))));
}
export function ranks(action, game) {
  const options = GAMES[game].ranks.map((label,i) => ({ label, value:String(i) }));
  if (action === 'find') options.unshift({ label:'أي رتبة — لعب ووناسة', value:'any' });
  return row(new StringSelectMenuBuilder().setCustomId(`rank:${action}:${game}`).setPlaceholder(action === 'find' ? 'وش الرتبة اللي تبيها؟' : 'وش رتبتك؟').addOptions(options));
}
export function timing(game, rank) {
  return row(new StringSelectMenuBuilder().setCustomId(`time:${game}:${rank}`).setPlaceholder('متى بتكون جاهز؟').addOptions(
    [{label:'الحين',value:'0'},{label:'بعد نص ساعة',value:'30'},{label:'بعد ساعة',value:'60'},{label:'بعد ساعتين',value:'120'}]));
}
export function size(game, rank) {
  return row(new StringSelectMenuBuilder().setCustomId(`size:${game}:${rank}`).setPlaceholder('كم لاعب ناقصكم؟').addOptions(
    Array.from({length:GAMES[game].max},(_,i) => ({label:`${ar(i+1)} لاعب`,value:String(i+1)}))));
}
export const gameButtons = store => row(...Object.entries(GAMES).map(([key,g])=>button(`pick:${key}`,`${g.emoji} ${g.name} · ${ar(store.active(key).length)}`)));
export function panel(store) {
  const total = new Set(store.active().map(a=>a.user)).size;
  return {embeds:[embed('🎮 اختر لعبة وبس','جاهز؟ بنناديك. ناقصك لاعب؟ انشر طلب.').setImage('attachment://lfg-banner.png')],
    components:[gameButtons(store),row(button('games',`الألعاب · ${ar(total)} جاهز`),button('mine','حالتي'))],allowedMentions:{parse:[]}};
}
export function requestView(r) {
  const g = GAMES[r.game];
  const status = {pending:'جاري النشر',open:'ننتظركم',full:'اكتمل الفريق 🎉',closed:'تقفّل الطلب',expired:'انتهى وقت الطلب'}[r.status];
  const e = embed(`${g.emoji} ${g.name} | ${status}`,
    `<@${r.owner}> يحتاج **${ar(Math.max(0,r.needed-r.players.length))}** لاعب · ${rankName(r.game,r.rank)}\n`+
    `المنضمّين: ${r.players.map(u=>`<@${u}>`).join('، ') || 'للحين ما انضم أحد'}\nينتهي ${stamp(r.expires)}\n\nودّك تلعب؟ اضغط «انضمام».`);
  return { content:'', embeds:[e], components:r.status==='open' ? [row(
    button(`join:${r.id}`,'✅ انضمام',ButtonStyle.Success),button(`manage:${r.id}`,'خيارات')
  )] : r.status==='full' ? [row(button(`manage:${r.id}`,'خيارات'))] : [], allowedMentions:{parse:[]} };
}
