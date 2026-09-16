import { ButtonStyle, PermissionFlagsBits } from 'discord.js';
import { GAMES, ar, rankName, validateGameRank } from './games.js';
import { privateView as view, row, button, home, gameMenu, ranks, timing, size, stamp, requestView } from './ui.js';

export async function handle(i, ctx) {
  const {store, match, syncRequest} = ctx;
  const [action,a,b,c] = i.customId.split(':');
  const user = i.user.id;
  const reply = (text, components = [home()]) => i.editReply(view(text,components));
  const value = i.values?.[0];
  if (['home','games','register','find'].includes(action)) {
    const mode = action === 'find' ? 'find' : 'register';
    return reply(action==='games' ? '🎮 هذي الألعاب وعدد الجاهزين الحين. اختر لعبة وسجّل معهم!' : mode==='find' ? '🔎 وش اللعبة اللي ناقصكم فيها لاعبين؟' : '🙋 حيّاك! اختر لعبتك، وبعدها رتبتك ووقتك.',[gameMenu(mode,store),home()]);
  }
  if (action==='help') return reply('**حيّاك في Rize.gg 👋**\n\n• من «سجّل جاهزيتك» اختر لعبتك ورتبتك ومتى بتلعب. اسمك هو اسمك في ديسكورد.\n• بنمنشنك في شات اللعب إذا أحد طلب لاعب يناسب رتبتك وأنت جاهز.\n• من «ابحث عن لاعبين» اختر اللعبة والرتبة وعدد الناقصين، ثم أكّد النشر.\n• تقدر تنضم للطلبات حتى لو ما جاك منشن، إذا جاهزيتك ورتبتك مناسبة.\n• وقتك ساعتين. من «جاهزيتي» تقدر تجدّد أو تلغي أو تغيّر بياناتك.\n• من «طلباتي» تقدر تقفل طلبك أو تنسحب من فريق.\n• إذا انضمّيت، نشيل جاهزيتك لهاللعبة عشان ما يجيك منشن وأنت مشغول.\n• الاعتذار يخص هالطلب فقط؛ إلغاء الجاهزية يوقف المنشنات الجديدة.\n• الرتب هنا للتنسيق، وما تعني بالضرورة إن اللعبة تسمح لكم تلعبون رانكد سوا.');
  if (action==='game') {
    if (!GAMES[value] || !['register','find'].includes(a)) throw Error('اختيار غير صالح.');
    return reply(`${GAMES[value].emoji} **${GAMES[value].name}**\n${a==='find'?'اختر رتبة اللاعبين اللي تبيهم.':'اختر رتبتك. تقدر تعدّلها بأي وقت.'}`,[ranks(a,value),home()]);
  }
  if (action==='rank') {
    if (!['register','find'].includes(a) || !validateGameRank(b,value,a==='find')) throw Error('اختيار غير صالح.');
    return reply(a==='find'?'كم لاعب ناقصكم؟ العدد ما يشملك أنت.':'متى بتكون جاهز؟ تسجيلك يستمر ساعتين من الوقت اللي تختاره.',[a==='find'?size(b,value):timing(b,value),home()]);
  }
  if (action==='time') {
    const {start,end} = store.register(user,a,b,Number(value));
    return reply(`✅ تم! سجّلناك في **${GAMES[a].name}** · **${rankName(a,b)}**\nتبدأ ${stamp(start)} وتنتهي ${stamp(end)}.\nبنناديك في <#${match.id}> إذا فيه طلب مناسب.`,[row(button('mine','⚙️ جاهزيتي'),button('find','🔎 ابحث عن لاعبين'))]);
  }
  if (action==='size') {
    const n = Number(value);
    if (!validateGameRank(a,b,true) || !Number.isInteger(n) || n<1 || n>GAMES[a].max) throw Error('اختيار غير صالح.');
    return reply(`**راجع طلبك قبل ننشره 👀**\nاللعبة: ${GAMES[a].name}\nالرتبة: ${rankName(a,b)}\nناقصكم: ${ar(n)} لاعب\n\nبننشره في <#${match.id}> وننادي حتى ١٠ لاعبين مناسبين. ينتهي بعد نص ساعة.`,[row(button(`publish:${a}:${b}:${n}`,'📣 انشر الطلب',ButtonStyle.Success)),home()]);
  }
  if (action==='publish') {
    const r = store.create(user,a,b,Number(c));
    const candidates = store.candidates(r);
    try {
      const payload = requestView({...r,status:'open'});
      payload.content = candidates.length ? `${candidates.map(a=>`<@${a.user}>`).join(' ')}\nفيه طلب يناسبكم 👋` : '🎮 فيه طلب جديد، مين جاهز؟';
      payload.allowedMentions = {parse:[],users:candidates.map(a=>a.user)};
      const message = await match.send(payload);
      store.publish(r.id,message.id);
      store.pinged(a,candidates.map(a=>a.user));
      store.remove(user,a);
      return reply(`✅ نُشر طلبك! [افتح الطلب](${message.url})\nتقدر تقفله من «طلباتي». شلنا جاهزيتك لهاللعبة لأنك الحين تجمع فريق.`);
    } catch(error) { store.close(r.id); throw error; }
  }
  if (action==='mine') {
    const items = store.mine(user);
    if (!items.length) return reply('ما عندك جاهزية مسجّلة. سجّل من هنا 👇',[gameMenu('register',store),home()]);
    return reply('**جاهزيتك 🎮**\n'+items.map(a=>`${GAMES[a.game].emoji} **${GAMES[a.game].name}** · ${rankName(a.game,a.rank)}\nتبدأ ${stamp(a.start)} وتنتهي ${stamp(a.end)}`).join('\n\n'),[
      ...items.map(a=>row(button(`extend:${a.game}`,`جدّد ${GAMES[a.game].name}`),button(`remove:${a.game}`,'إلغاء',ButtonStyle.Danger))),
      row(button('register','✏️ سجّل أو عدّل'),button('home','↩️ رجوع'))
    ]);
  }
  if (action==='extend') return reply(`✅ تجدّدت جاهزيتك إلى ${stamp(store.extend(user,a))}.`,[row(button('mine','⚙️ جاهزيتي'))]);
  if (action==='remove') { store.remove(user,a); return reply('تم إلغاء جاهزيتك لهاللعبة. ما راح نمنشنك لطلبات جديدة إلا إذا سجّلت مرة ثانية.',[row(button('mine','⚙️ جاهزيتي'))]); }
  if (action==='requests') {
    const requests = store.requestsFor(user);
    return reply(requests.length ? '**طلباتك وفرقك 👥**\n'+requests.slice(0,10).map(r=>`• ${GAMES[r.game].name}: https://discord.com/channels/${i.guildId}/${match.id}/${r.message}`).join('\n') : 'ما عندك طلب أو فريق مفتوح الحين.');
  }
  if (['join','decline','close','leave'].includes(action)) {
    const r = store.request(a);
    if (!r || i.message.id !== r.message || i.channelId !== match.id) throw Error('هذا الطلب مو متاح.');
    if (action==='join') {
      const updated = store.join(a,user);
      await syncRequest(updated);
      return reply(`✅ انضمّيت! نسّقوا هنا في <#${match.id}>. شلنا جاهزيتك لهاللعبة عشان ما نزعجك بطلبات ثانية.`);
    }
    if (action==='decline') { store.decline(a,user); return reply('تم اعتذارك عن هالطلب 👍 جاهزيتك لباقي الطلبات ما تغيّرت.'); }
    if (action==='leave') {
      const updated = store.leave(a,user); await syncRequest(updated);
      return reply('تم انسحابك ورجع مكانك متاح. إذا ودّك بطلبات ثانية، سجّل جاهزيتك من جديد.');
    }
    if (r.owner !== user && !i.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) throw Error('صاحب الطلب أو المشرف بس يقدر يقفله.');
    store.close(a); await syncRequest(store.request(a)); return reply('🔒 تم إقفال الطلب.');
  }
  throw Error('هذا الزر قديم. ارجع للوحة الرئيسية وجرّب من جديد.');
}
