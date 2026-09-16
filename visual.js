import sharp from 'sharp';
import {readFileSync} from 'node:fs';
import {EmbedBuilder,ButtonBuilder,ButtonStyle,ActionRowBuilder} from 'discord.js';
const background=readFileSync(new URL('./panel-background.jpg',import.meta.url)).toString('base64');
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export async function renderCard(title,body) {
 const lines=[];
 for(const paragraph of body.split('\n')) {
  let line='';for(const word of paragraph.split(/\s+/)){if((line+' '+word).length>65){lines.push(line);line='';}line+=(line?' ':'')+word;}lines.push(line);
 }
 const height=Math.max(300,180+lines.length*32);
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="${height}"><image width="960" height="${height}" preserveAspectRatio="xMidYMid slice" href="data:image/jpeg;base64,${background}"/><rect x="24" y="24" width="912" height="${height-48}" fill="#070e17" fill-opacity=".83" stroke="#53757c"/><text x="56" y="67" fill="#99f9ea" font-family="Arial" font-size="20">Rize.gg</text><text x="56" y="112" fill="#ffffff" font-family="Arial" font-weight="bold" font-size="30">${escape(title)}</text>${lines.map((l,n)=>`<text x="56" y="${158+n*32}" fill="#d6e7eb" font-family="Arial" font-size="23">${escape(l)}</text>`).join('')}</svg>`;
 return sharp(Buffer.from(svg)).png().toBuffer();
}
export async function visualPayload(payload,guild) {
 const embeds=(payload.embeds||[]).map(e=>e.toJSON?e.toJSON():e);
 let text=[payload.content,...embeds.flatMap(e=>[e.title,e.description,...(e.fields||[]).map(f=>`${f.name}: ${f.value}`)])].filter(Boolean).join('\n');
 const links=[];
 text=text.replace(/\[([^\]]+)\]\((https:\/\/[^)]+)\)/g,(_,label,url)=>{links.push({label,url});return '';});
 text=text.replace(/https:\/\/discord\.com\/channels\/\S+/g,url=>{links.push({label:'Open team',url});return '';});
 text=text.replace(/<@!?(\d+)>/g,(_,id)=>guild?.members.cache.get(id)?.displayName||'Player').replace(/<#(\d+)>/g,(_,id)=>'#'+(guild?.channels.cache.get(id)?.name||'team-chat')).replace(/<t:(\d+):\w>/g,(_,t)=>new Date(Number(t)*1000).toLocaleString('en-GB',{timeZone:'UTC',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})+' UTC').replace(/[*_`]/g,'').replace(/\p{Extended_Pictographic}|\uFE0F|\u200D/gu,'').trim();
 const components=(payload.components||[]).map(r=>new ActionRowBuilder(r.toJSON?r.toJSON():r));
 const existing=new Set(components.flatMap(r=>(r.toJSON?r.toJSON():r).components).map(c=>c.url));
 const unique=links.filter(l=>!existing.has(l.url)&&existing.add(l.url));
 for(const link of unique){
  let target=components.find(r=>r.components.length<5 && r.components.every(c=>c.toJSON().type===2));
  if(!target && components.length<5){target=new ActionRowBuilder();components.push(target);}
  if(!target)break;
  target.addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(link.label.slice(0,80)).setURL(link.url));
 }
 const pictures=embeds.filter(e=>e.image).map(e=>new EmbedBuilder().setImage(e.image.url));
 const result={...payload,content:'',embeds:pictures,components,attachments:[],files:[...(payload.files||[])],allowedMentions:payload.allowedMentions||{parse:[]}};
 if(text){const parts=text.split('\n');const title=parts[0].length<=55?parts.shift():'Your next step';result.files.push({attachment:await renderCard(title,parts.join('\n')),name:'reply-panel.png'});result.embeds.unshift(new EmbedBuilder().setImage('attachment://reply-panel.png'));}
 // Keep only the explicitly authorized player pings on public requests.
 if(payload.allowedMentions?.users?.length)result.content=payload.allowedMentions.users.map(id=>`<@${id}>`).join(' ');
 return result;
}
export async function liveImage(store,games) {
 const counts=Object.entries(games).map(([key,g])=>({name:g.name,count:store.active(key).length}));
 const banner=await sharp(new URL('./lfg-banner.png',import.meta.url).pathname).resize(960,280).toBuffer();
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="170"><rect width="960" height="170" fill="#080f18"/>${counts.map((g,i)=>`<rect x="${20+i*235}" y="12" width="220" height="112" rx="8" fill="#14242d" stroke="#42666c"/><text x="${130+i*235}" y="45" text-anchor="middle" fill="#cde8e8" font-family="Arial" font-size="20">${escape(g.name)}</text><text x="${130+i*235}" y="85" text-anchor="middle" fill="#99f9ea" font-family="Arial" font-size="32" font-weight="bold">${g.count}</text><text x="${130+i*235}" y="111" text-anchor="middle" fill="#a6bdc7" font-family="Arial" font-size="15">READY NOW</text>`).join('')}<text x="480" y="153" text-anchor="middle" fill="#a6bdc7" font-family="Arial" font-size="17">${new Set(store.active().map(a=>a.user)).size} players ready across all games</text></svg>`;
 return sharp({create:{width:960,height:450,channels:4,background:'#080f18'}}).composite([{input:banner,top:0,left:0},{input:Buffer.from(svg),top:280,left:0}]).png().toBuffer();
}

export function textPayload(payload) {
 const embeds=(payload.embeds||[]).map(e=>EmbedBuilder.from(e));
 if(payload.content) embeds.unshift(new EmbedBuilder().setColor(0x99f9ea).setDescription(payload.content));
 return {...payload,content:'',embeds,attachments:[],files:payload.files||[],allowedMentions:payload.allowedMentions||{parse:[]}};
}
export async function replyPayload(action,payload,guild) {
 if(['home','games','pick','game','register','find'].includes(action.split(':')[0])) return visualPayload(payload,guild);
 return textPayload(payload);
}
