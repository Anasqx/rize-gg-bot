import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { GAMES, READY_MS, REQUEST_MS, COOLDOWN_MS, PING_MS, validateGameRank } from './games.js';

export class Store {
  constructor(path, clock = Date.now) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.now = clock;
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS availability(user TEXT,game TEXT,rank TEXT,start INTEGER,end INTEGER,last_ping INTEGER DEFAULT 0,PRIMARY KEY(user,game));
      CREATE TABLE IF NOT EXISTS requests(id TEXT PRIMARY KEY,owner TEXT,game TEXT,rank TEXT,needed INTEGER,created INTEGER,expires INTEGER,status TEXT,message TEXT);
      CREATE TABLE IF NOT EXISTS joins(request TEXT REFERENCES requests(id) ON DELETE CASCADE,user TEXT,PRIMARY KEY(request,user));
      CREATE TABLE IF NOT EXISTS declines(request TEXT REFERENCES requests(id) ON DELETE CASCADE,user TEXT,PRIMARY KEY(request,user));
      CREATE TABLE IF NOT EXISTS pings(user TEXT,game TEXT,time INTEGER,PRIMARY KEY(user,game));
      CREATE INDEX IF NOT EXISTS active_games ON availability(game,start,end);
    `);
  }
  get(key) { return this.db.prepare('SELECT value FROM meta WHERE key=?').get(key)?.value; }
  set(key, value) { this.db.prepare('INSERT OR REPLACE INTO meta VALUES (?,?)').run(key, value); }
  register(user, game, rank, delay) {
    if (!validateGameRank(game, rank) || ![0, 30, 60, 120].includes(delay)) throw Error('اختيار غير صالح. ارجع للوحة وجرّب من جديد.');
    const start = this.now() + delay * 60_000;
    this.db.prepare(`INSERT INTO availability(user,game,rank,start,end) VALUES(?,?,?,?,?)
      ON CONFLICT(user,game) DO UPDATE SET rank=excluded.rank,start=excluded.start,end=excluded.end`).run(user, game, rank, start, start + READY_MS);
    return { start, end: start + READY_MS };
  }
  mine(user) { return this.db.prepare('SELECT * FROM availability WHERE user=? AND end>? ORDER BY start').all(user, this.now()); }
  active(game) { return this.db.prepare('SELECT * FROM availability WHERE start<=? AND end>? AND (? IS NULL OR game=?)').all(this.now(), this.now(), game ?? null, game ?? null); }
  remove(user, game) { this.db.prepare('DELETE FROM availability WHERE user=? AND game=?').run(user, game); }
  extend(user, game) {
    const row = this.mine(user).find(a => a.game === game);
    if (!row) throw Error('انتهى تسجيلك. سجّل جاهزيتك من جديد.');
    const end = Math.max(this.now(), row.start) + READY_MS;
    this.db.prepare('UPDATE availability SET end=? WHERE user=? AND game=?').run(end, user, game);
    return end;
  }
  request(id) {
    const row = this.db.prepare('SELECT * FROM requests WHERE id=?').get(id);
    if (row) row.players = this.db.prepare('SELECT user FROM joins WHERE request=?').all(id).map(p => p.user);
    return row;
  }
  openFor(user) { return this.db.prepare("SELECT id FROM requests WHERE owner=? AND status IN ('pending','open') AND expires>?").get(user, this.now()); }
  create(user, game, rank, needed) {
    if (!validateGameRank(game, rank, true) || !Number.isInteger(needed) || needed < 1 || needed > GAMES[game].max) throw Error('اختيار غير صالح. ارجع للوحة وجرّب من جديد.');
    if (this.openFor(user)) throw Error('عندك طلب مفتوح. أقفله أول من زر «طلباتي».');
    const latest = this.db.prepare('SELECT created FROM requests WHERE owner=? ORDER BY created DESC LIMIT 1').get(user);
    if (latest && this.now() - latest.created < COOLDOWN_MS) throw Error('انتظر خمس دقايق بين كل طلب وطلب، عشان ما نزعج اللاعبين.');
    const id = randomUUID();
    this.db.prepare('INSERT INTO requests VALUES(?,?,?,?,?,?,?,?,?)').run(id, user, game, rank, needed, this.now(), this.now()+REQUEST_MS, 'pending', null);
    return this.request(id);
  }
  publish(id, message) { this.db.prepare("UPDATE requests SET message=?,status='open' WHERE id=? AND status='pending'").run(message, id); }
  close(id, status = 'closed') { this.db.prepare('UPDATE requests SET status=? WHERE id=?').run(status, id); }
  candidates(req) {
    return this.active(req.game).map(a=>({...a,last_ping:this.db.prepare('SELECT time FROM pings WHERE user=? AND game=?').get(a.user,a.game)?.time ?? 0})).filter(a => a.user !== req.owner && (req.rank === 'any' || req.rank === a.rank) && this.now() - a.last_ping >= PING_MS)
      .sort((a,b) => a.last_ping-b.last_ping).slice(0,10);
  }
  pinged(game, users) { for (const user of users) this.db.prepare('INSERT OR REPLACE INTO pings VALUES(?,?,?)').run(user,game,this.now()); }
  join(id, user) {
    const r = this.request(id);
    if (!r || r.status !== 'open' || r.expires <= this.now()) throw Error('هذا الطلب تقفّل أو انتهى وقته. تقدر تفتح طلب جديد من اللوحة.');
    if (r.owner === user) throw Error('أنت صاحب الطلب، مكانك محسوب من البداية.');
    if (r.players.includes(user)) throw Error('أنت منضم لهالطلب من قبل.');
    if (r.players.length >= r.needed) throw Error('اكتمل الفريق.');
    const a = this.active(r.game).find(a => a.user === user);
    if (!a) throw Error('سجّل جاهزيتك «الحين» لهاللعبة من اللوحة، وبعدها ارجع انضم.');
    if (r.rank !== 'any' && a.rank !== r.rank) throw Error('رتبتك المسجّلة ما تطابق رتبة هالطلب.');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('INSERT INTO joins VALUES(?,?)').run(id,user);
      this.remove(user, r.game);
      if (r.players.length+1 >= r.needed) this.close(id,'full');
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    return this.request(id);
  }
  decline(id, user) {
    const r = this.request(id);
    if (!r || r.status !== 'open' || r.expires <= this.now()) throw Error('هذا الطلب انتهى.');
    if (r.owner === user || r.players.includes(user)) throw Error('أنت ضمن الفريق بالفعل.');
    this.db.prepare('INSERT OR IGNORE INTO declines VALUES(?,?)').run(id,user);
  }
  leave(id, user) {
    const r = this.request(id);
    if (!r || !['open','full'].includes(r.status) || r.expires <= this.now()) throw Error('هذا الطلب انتهى.');
    if (!r.players.includes(user)) throw Error('أنت مو منضم لهالطلب.');
    this.db.prepare('DELETE FROM joins WHERE request=? AND user=?').run(id,user);
    this.close(id,'open');
    return this.request(id);
  }
  requestsFor(user) {
    return this.db.prepare(`SELECT DISTINCT r.id FROM requests r LEFT JOIN joins j ON r.id=j.request
      WHERE (r.owner=? OR j.user=?) AND r.status IN ('open','full') AND r.expires>?`).all(user,user,this.now()).map(r => this.request(r.id));
  }
  removeMember(user) {
    this.db.prepare('DELETE FROM availability WHERE user=?').run(user);
    for (const r of this.requestsFor(user)) {
      if (r.owner === user) this.close(r.id);
      else this.leave(r.id,user);
    }
  }
  sweep() {
    this.db.prepare('DELETE FROM availability WHERE end<=?').run(this.now());
    this.db.prepare("UPDATE requests SET status='expired' WHERE status IN ('open','full','pending') AND expires<=?").run(this.now());
    this.db.prepare('DELETE FROM requests WHERE expires<?').run(this.now()-86_400_000);
    this.db.prepare('DELETE FROM pings WHERE time<?').run(this.now()-86_400_000);
  }
  recent() { return this.db.prepare('SELECT id FROM requests WHERE message IS NOT NULL').all().map(r => this.request(r.id)); }
}
