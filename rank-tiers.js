import {level} from './rewards.js';
export const RANK_TIERS=[
 {name:'Rookie',chat:10,voice:0},
 {name:'Skilled',chat:20,voice:5},
 {name:'Elite',chat:30,voice:10},
 {name:'Veteran',chat:40,voice:15},
 {name:'Prime',chat:50,voice:20},
 {name:'Prestige',chat:60,voice:25},
 {name:'Apex',chat:70,voice:30},
 {name:'Champion',chat:80,voice:35},
 {name:'Master',chat:90,voice:40},
 {name:'Legend',chat:100,voice:50}
];
export function rankProgress(account){
 const chat=level(account.chat_xp).level,voice=level(account.voice_xp).level;
 const earned=RANK_TIERS.filter(t=>chat>=t.chat&&voice>=t.voice);
 return {chat,voice,earned,current:earned.at(-1),next:RANK_TIERS[earned.length]};
}
