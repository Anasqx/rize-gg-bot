import { randomInt, randomUUID } from 'node:crypto';
import { userError } from './errors.js';
export const PRIZES=[
 {key:'cash25',label:'٢٥ دولار',weight:1,cash:25},
 {key:'cash15',label:'١٥ دولار',weight:2,cash:15},
 {key:'cash10',label:'١٠ دولارات',weight:3,cash:10},
 {key:'cash5',label:'٥ دولارات',weight:4,cash:5},
 {key:'mute',label:'ميزة الميوت الصوتي',weight:2497,cash:0},
 {key:'disconnect',label:'ميزة الدسكونيكت',weight:2497,cash:0},
 {key:'color',label:'ميزة تغيير اللون',weight:2498,cash:0},
 {key:'move',label:'ميزة السحب الصوتي',weight:2498,cash:0}
];
export function pickPrize(n){if(!Number.isInteger(n)||n<0||n>=10000)throw Error('Invalid draw');let sum=0;return PRIZES.find(p=>(sum+=p.weight)>n);}
export function level(xp){let n=0;while(xp>=100+50*n){xp-=100+50*n;n++;}return {level:n,xp,next:100+50*n};}
export class Rewards {
 constructor(store,{draw=()=>randomInt(10000),now=Date.now}={}){this.store=store;this.db=store.db;this.draw=draw;this.now=now;
 this.db.exec(`CREATE TABLE IF NOT EXISTS reward_accounts(user TEXT PRIMARY KEY,tickets INTEGER NOT NULL DEFAULT 0 CHECK(tickets>=0),xp INTEGER NOT NULL DEFAULT 0,milestones INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS reward_claims(id TEXT PRIMARY KEY,nonce TEXT UNIQUE,user TEXT,prize TEXT,cash INTEGER,month TEXT,status TEXT DEFAULT 'pending',created INTEGER,admin TEXT);
 CREATE TABLE IF NOT EXISTS reward_grants(nonce TEXT PRIMARY KEY,user TEXT,admin TEXT,amount INTEGER,created INTEGER);
 CREATE TABLE IF NOT EXISTS reward_activity(user TEXT,day TEXT,total INTEGER DEFAULT 0,last_chat INTEGER DEFAULT 0,last_voice INTEGER DEFAULT 0,PRIMARY KEY(user,day));`);
 const columns=new Set(this.db.prepare('PRAGMA table_info(reward_accounts)').all().map(c=>c.name));
 for(const name of ['chat_xp','voice_xp'])if(!columns.has(name))this.db.exec(`ALTER TABLE reward_accounts ADD COLUMN ${name} INTEGER NOT NULL DEFAULT 0`);
 }
 account(user){this.db.prepare('INSERT OR IGNORE INTO reward_accounts(user) VALUES(?)').run(user);return this.db.prepare('SELECT * FROM reward_accounts WHERE user=?').get(user);}
 month(){return new Date(this.now()+3*3600000).toISOString().slice(0,7);}
 spent(){return this.db.prepare('SELECT COALESCE(SUM(cash),0) AS n FROM reward_claims WHERE month=?').get(this.month()).n;}
 grant(user,admin,nonce,amount=1){if(!Number.isInteger(amount)||amount<1||amount>10)throw userError('عدد التذاكر غير صحيح.');this.db.exec('BEGIN IMMEDIATE');try{this.account(user);const done=this.db.prepare('INSERT OR IGNORE INTO reward_grants VALUES(?,?,?,?,?)').run(nonce,user,admin,amount,this.now());if(done.changes)this.db.prepare('UPDATE reward_accounts SET tickets=tickets+? WHERE user=?').run(amount,user);this.db.exec('COMMIT');return this.account(user);}catch(e){this.db.exec('ROLLBACK');throw e;}}
 spin(user,nonce,roles){const required=this.store.get('rewards:role');if(!required)throw userError('العجلة مقفلة مؤقتًا لين تحدد الإدارة الرتبة المطلوبة.');if(!roles.includes(required))throw userError(`العجلة مخصصة لأصحاب رتبة <@&${required}>.`);
 this.db.exec('BEGIN IMMEDIATE');try{const old=this.db.prepare('SELECT * FROM reward_claims WHERE nonce=?').get(nonce);if(old){if(old.user!==user)throw Error('Nonce mismatch');this.db.exec('COMMIT');return old;}
 if(this.account(user).tickets<1)throw userError('ما عندك تذاكر حاليًا. افتح «رصيدي» لمعرفة طريقة الحصول عليها.');
 const prize=pickPrize(this.draw());
 const claim={id:randomUUID(),nonce,user,prize:prize.key,cash:prize.cash,month:this.month(),status:'pending',created:this.now()};
 this.db.prepare('INSERT INTO reward_claims(id,nonce,user,prize,cash,month,status,created) VALUES(?,?,?,?,?,?,?,?)').run(...Object.values(claim));
 this.db.prepare('UPDATE reward_accounts SET tickets=tickets-1 WHERE user=?').run(user);this.db.exec('COMMIT');return claim;
 }catch(e){this.db.exec('ROLLBACK');throw e;}}
 claims(user){return this.db.prepare('SELECT * FROM reward_claims WHERE user=? ORDER BY created DESC LIMIT 10').all(user);}
 pending(){return this.db.prepare("SELECT * FROM reward_claims WHERE status='pending' ORDER BY created LIMIT 5").all();}
 fulfill(id,admin){return this.db.prepare("UPDATE reward_claims SET status='delivered',admin=? WHERE id=? AND status='pending'").run(admin,id);}
 activity(user,kind){if(this.store.get('rewards:leveling')!=='internal')return;if(!['chat','voice'].includes(kind))throw Error('Invalid XP source');const now=this.now(),day=new Date(now+3*3600000).toISOString().slice(0,10);const field=kind==='chat'?'last_chat':'last_voice';this.db.exec('BEGIN IMMEDIATE');try{
 this.db.prepare('INSERT OR IGNORE INTO reward_activity(user,day) VALUES(?,?)').run(user,day);const a=this.db.prepare('SELECT * FROM reward_activity WHERE user=? AND day=?').get(user,day);
 if(now-a[field]<60000||a.total>=600){this.db.exec('COMMIT');return;}
 const amount=Math.min(kind==='chat'?15:10,600-a.total),p=this.account(user),milestones=Math.floor(level(p.xp+amount).level/5);
 this.db.prepare(`UPDATE reward_activity SET total=total+?,${field}=? WHERE user=? AND day=?`).run(amount,now,user,day);
 const xpField=kind==='chat'?'chat_xp':'voice_xp';
 this.db.prepare(`UPDATE reward_accounts SET xp=xp+?,${xpField}=${xpField}+?,tickets=tickets+?,milestones=? WHERE user=?`).run(amount,amount,Math.max(0,milestones-p.milestones),milestones,user);
 this.db.exec('COMMIT');}catch(e){this.db.exec('ROLLBACK');throw e;}}
}
