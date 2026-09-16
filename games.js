export const GAMES = {
  rocket: { name: 'روكيت ليق', emoji: '🚗', max: 2, ranks: ['بدون تصنيف', 'برونز', 'سيلفر', 'قولد', 'بلاتينيوم', 'دايموند', 'تشامبيون', 'قراند تشامبيون', 'سوبرسونيك ليجند'] },
  valorant: { name: 'فالورانت', emoji: '🎯', max: 4, ranks: ['بدون تصنيف', 'آيرون', 'برونز', 'سيلفر', 'قولد', 'بلاتينيوم', 'دايموند', 'أسيندنت', 'إيمورتال', 'راديانت'] },
  chess: { name: 'شطرنج', emoji: '♟️', max: 1, ranks: ['بدون تصنيف', 'أقل من ٨٠٠', '٨٠٠–١١٩٩', '١٢٠٠–١٥٩٩', '١٦٠٠–١٩٩٩', '٢٠٠٠ فأعلى'] },
  fortnite: { name: 'فورتنايت', emoji: '🏝️', max: 3, ranks: ['بدون تصنيف', 'برونز', 'سيلفر', 'قولد', 'بلاتينيوم', 'دايموند', 'إيليت', 'تشامبيون', 'أنريل'] },
};
export const HOUR = 3_600_000;
export const READY_MS = 2 * HOUR;
export const REQUEST_MS = HOUR / 2;
export const COOLDOWN_MS = 5 * 60_000;
export const PING_MS = 10 * 60_000;
export const ar = n => Number(n).toLocaleString('ar-SA');
export function validateGameRank(game, rank, allowAny = false) {
  return !!GAMES[game] && ((allowAny && rank === 'any') || /^\d+$/.test(String(rank)) && !!GAMES[game].ranks[Number(rank)]);
}
export const rankName = (game, rank) => rank === 'any' ? 'أي رتبة' : GAMES[game]?.ranks[Number(rank)] ?? 'غير محدد';
