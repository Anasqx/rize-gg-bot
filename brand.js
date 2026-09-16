import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
const svg = await readFile(new URL('./rize-mark.svg',import.meta.url));
const mark = await sharp(svg).resize({height:340}).png().toBuffer();
await sharp({create:{width:512,height:512,channels:4,background:'#111b21'}}).composite([{input:mark,gravity:'centre'}]).png().toFile(new URL('./rize-icon.png',import.meta.url).pathname);
