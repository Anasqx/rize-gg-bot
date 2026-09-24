import {level} from './rewards.js';
export const RANK_TIERS=[
 {name:'Rookie',id:'1541533396889510060',chat:10,voice:0},
 {name:'Skilled',id:'1541533395392270388',chat:20,voice:5},
 {name:'Elite',id:'1541533393458831400',chat:30,voice:10},
 {name:'Veteran',id:'1541533391231385673',chat:40,voice:15},
 {name:'Prime',id:'1541533390266966057',chat:50,voice:20},
 {name:'Prestige',id:'1541533388391845958',chat:60,voice:25},
 {name:'Apex',id:'1541533386697474081',chat:70,voice:30},
 {name:'Champion',id:'1541533381903257628',chat:80,voice:35},
 {name:'Master',id:'1541533379558908076',chat:90,voice:40},
 {name:'Legend',id:'1541533377687986219',chat:100,voice:50}
];
export function rankProgress(account){
 const chat=level(account.chat_xp).level,voice=level(account.voice_xp).level;
 const earned=RANK_TIERS.filter(t=>chat>=t.chat&&voice>=t.voice);
 return {chat,voice,earned,current:earned.at(-1),next:RANK_TIERS[earned.length]};
}
export function displayedRankProgress(account,memberRoles){
 const progress=rankProgress(account);
 const highestRoleIndex=RANK_TIERS.reduce((highest,tier,index)=>
  memberRoles.some(role=>role.id===tier.id)?index:highest,-1);
 const highestLevelIndex=progress.earned.length-1;
 const index=Math.max(highestLevelIndex,highestRoleIndex);
 return {...progress,current:index>=0?RANK_TIERS[index]:undefined,next:RANK_TIERS[index+1]};
}
