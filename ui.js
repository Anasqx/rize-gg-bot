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
export function panel(store, onlineCount) {
  const active = store.active();
  const total = new Set(active.map(a => a.user)).size;
  const lines = Object.entries(GAMES).map(([key,g]) => `${g.emoji} **${g.name}** · ${ar(active.filter(a=>a.game===key).length)} جاهز`);
  const e = embed('🎮 Rize.gg | لقّط تيمك',
    'ناقصك لاعب؟ أو ودّك تدخل مع تيم؟ حيّاك!\n\n**١ · سجّل جاهزيتك** واختر لعبتك ورتبتك ووقتك.\n**٢ · ابحث عن لاعبين** وخلّنا ننادي المناسبين لك.\n**٣ · انضم للفريق** من الطلب في شات اللعب.\n\n'+lines.join('\n')+
    '\n\n⏱️ جاهزيتك ساعتين من وقت البداية، وتقدر تجدّدها.\n🔔 تسجيلك يعني موافقتك على المنشن في شات اللعب.\nالأعداد للي مسجّلين وجاهزين الحين، حتى لو حالتهم مخفية.' +
    (onlineCount === undefined ? '' : `\n🟢 ظاهرين أونلاين من المسجّلين: ${ar(onlineCount)}`))
    .setThumbnail('attachment://rize-icon.png');
  return { embeds:[e], components:[
    row(button('games',`🎮 الألعاب · ${ar(total)} جاهز`,ButtonStyle.Primary),button('register','🙋 سجّل جاهزيتك',ButtonStyle.Success),button('find','🔎 ابحث عن لاعبين',ButtonStyle.Primary)),
    row(button('mine','⚙️ جاهزيتي'),button('requests','👥 طلباتي'),button('help','💡 كيف أبدأ؟'))
  ], allowedMentions:{parse:[]} };
}
export function requestView(r) {
  const g = GAMES[r.game];
  const status = {pending:'جاري النشر',open:'ننتظركم',full:'اكتمل الفريق 🎉',closed:'تقفّل الطلب',expired:'انتهى وقت الطلب'}[r.status];
  const e = embed(`${g.emoji} ${g.name} | ${status}`,
    `صاحب الطلب: <@${r.owner}>\nالرتبة: **${rankName(r.game,r.rank)}**\nناقصه: **${ar(Math.max(0,r.needed-r.players.length))}** لاعب\n`+
    `المنضمّين: ${r.players.map(u=>`<@${u}>`).join('، ') || 'للحين ما انضم أحد'}\nينتهي ${stamp(r.expires)}\n\nاضغط «انضمام» إذا أنت مسجّل وجاهز الحين. بعدها نسّقوا هنا في الشات.`);
  return { content:'', embeds:[e], components:r.status==='open' ? [row(
    button(`join:${r.id}`,'✅ انضمام',ButtonStyle.Success),button(`decline:${r.id}`,'❌ اعتذار'),button(`leave:${r.id}`,'↩️ انسحاب'),button(`close:${r.id}`,'🔒 إقفال الطلب',ButtonStyle.Danger)
  )] : r.status==='full' ? [row(button(`leave:${r.id}`,'↩️ انسحاب'),button(`close:${r.id}`,'🔒 إقفال الطلب',ButtonStyle.Danger))] : [], allowedMentions:{parse:[]} };
}
