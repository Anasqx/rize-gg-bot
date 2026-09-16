export const GAMES = {
  rocket: { name: 'Rocket League', emoji: '🚗', max: 2, ranks: ['Unranked', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Champion', 'Grand Champion', 'Supersonic Legend'] },
  valorant: { name: 'Valorant', emoji: '🎯', max: 4, ranks: ['Unranked', 'Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Ascendant', 'Immortal', 'Radiant'] },
  chess: { name: 'Chess', emoji: '♟️', max: 1, ranks: ['Unranked', 'Under 800', '800–1199', '1200–1599', '1600–1999', '2000+'] },
  fortnite: { name: 'Fortnite', emoji: '🏝️', max: 3, ranks: ['Unranked', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Elite', 'Champion', 'Unreal'] },
};
export const HOUR = 3_600_000;
export const READY_MS = 2 * HOUR;
export const REQUEST_MS = HOUR / 2;
export const COOLDOWN_MS = 5 * 60_000;
export const PING_MS = 10 * 60_000;
export const ar = n => Number(n).toLocaleString('en-US');
export function validateGameRank(game, rank, allowAny = false) {
  return !!GAMES[game] && ((allowAny && rank === 'any') || /^\d+$/.test(String(rank)) && !!GAMES[game].ranks[Number(rank)]);
}
export const rankName = (game, rank) => rank === 'any' ? 'Any rank' : GAMES[game]?.ranks[Number(rank)] ?? 'Not set';
