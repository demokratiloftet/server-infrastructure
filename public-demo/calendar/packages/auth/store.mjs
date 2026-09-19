import { DatabaseSync } from 'node:sqlite';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
export const hash = value => createHash('sha256').update(value).digest('hex');
export const random = () => randomBytes(32).toString('hex');
export class AuthStore {
  constructor(directory, secret) {
    mkdirSync(directory,{recursive:true,mode:0o700});
    const keyfile=join(directory,'encryption.key');
    if (secret && !/^[a-f0-9]{64}$/i.test(secret)) throw new Error('AUTH_ENCRYPTION_KEY must be 32 bytes encoded as hex');
    if (secret) this.key=Buffer.from(secret,'hex');
    else {
      try { this.key=readFileSync(keyfile); }
      catch(e) { if(e.code!=='ENOENT')throw e; this.key=randomBytes(32);writeFileSync(keyfile,this.key,{mode:0o600,flag:'wx'}); }
    }
    if (this.key.length!==32) throw new Error('Invalid auth encryption key');
    this.db=new DatabaseSync(join(directory,'auth.sqlite'));
    chmodSync(join(directory,'auth.sqlite'),0o600);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS kv (namespace TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, expires INTEGER NOT NULL, PRIMARY KEY(namespace,key));
      CREATE TABLE IF NOT EXISTS accounts (did TEXT PRIMARY KEY, created INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS links (did TEXT NOT NULL, provider TEXT NOT NULL, identity_hash TEXT UNIQUE NOT NULL, value TEXT NOT NULL, PRIMARY KEY(did,provider));
      CREATE TABLE IF NOT EXISTS identity_logins (identity_hash TEXT PRIMARY KEY, did TEXT UNIQUE NOT NULL);
      CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY, did TEXT NOT NULL, provider TEXT, action TEXT NOT NULL, at INTEGER NOT NULL);`);
    this.db.prepare('DELETE FROM kv WHERE expires < ?').run(Date.now());
    const check=this.get('meta','key-check');
    if (!check) this.set('meta','key-check',{ok:true});
  }
  encrypt(value,context) {
    const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',this.key,iv);cipher.setAAD(Buffer.from(context));
    const ciphertext=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
    return Buffer.concat([iv,cipher.getAuthTag(),ciphertext]).toString('base64');
  }
  decrypt(value,context) {
    const data=Buffer.from(value,'base64'),decipher=createDecipheriv('aes-256-gcm',this.key,data.subarray(0,12));
    decipher.setAAD(Buffer.from(context));decipher.setAuthTag(data.subarray(12,28));
    return JSON.parse(Buffer.concat([decipher.update(data.subarray(28)),decipher.final()]).toString('utf8'));
  }
  set(ns,key,value,ttl=3650*86400000) {
    this.db.prepare('INSERT INTO kv VALUES(?,?,?,?) ON CONFLICT(namespace,key) DO UPDATE SET value=excluded.value,expires=excluded.expires').run(ns,key,this.encrypt(value,`${ns}:${key}`),Date.now()+ttl);
  }
  get(ns,key) {
    const row=this.db.prepare('SELECT value,expires FROM kv WHERE namespace=? AND key=?').get(ns,key);
    if(!row)return undefined;if(row.expires<=Date.now()){this.del(ns,key);return undefined;}
    return this.decrypt(row.value,`${ns}:${key}`);
  }
  del(ns,key) {this.db.prepare('DELETE FROM kv WHERE namespace=? AND key=?').run(ns,key);}
  take(ns,key,predicate=()=>true) {
    // Synchronous SQLite operations are atomic within this single-process adapter.
    const value=this.get(ns,key);if(!value||!predicate(value))return undefined;
    this.del(ns,key);return value;
  }
  adapter(ns,ttl) {return {get:async key=>this.get(ns,key),set:async(key,value)=>this.set(ns,key,value,ttl),del:async key=>this.del(ns,key)};}
  addAccount(did) {this.db.prepare('INSERT OR IGNORE INTO accounts VALUES(?,?)').run(did,Date.now());}
  accounts() {return this.db.prepare('SELECT did FROM accounts').all().map(r=>r.did);}
  listLinks(did) {return this.db.prepare('SELECT provider,value FROM links WHERE did=?').all(did).map(r=>({provider:r.provider,...this.decrypt(r.value,`link:${did}:${r.provider}`)}));}
  identityKey(identity) {return createHmac('sha256',this.key).update(JSON.stringify([identity.issuer,identity.subject])).digest('hex');}
  loginIdentity(identity) {
    return this.db.prepare('SELECT l.did,l.provider FROM identity_logins i JOIN links l ON l.identity_hash=i.identity_hash AND l.did=i.did WHERE i.identity_hash=?').get(this.identityKey(identity));
  }
  link(did,provider,identity,{login=false}={}) {
    const digest=this.identityKey(identity);
    const existing=this.db.prepare('SELECT did,provider,identity_hash FROM links WHERE identity_hash=? OR (did=? AND provider=?)').all(digest,did,provider);
    if(existing.length && !(login && existing.length===1 && existing[0].did===did && existing[0].provider===provider && existing[0].identity_hash===digest)) throw Object.assign(new Error('Identiteten er allerede koblet. Fjern en eksisterende kobling først; kontoer slås aldri sammen automatisk.'),{status:409});
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if(!existing.length)this.db.prepare('INSERT INTO links VALUES(?,?,?,?)').run(did,provider,digest,this.encrypt(identity,`link:${did}:${provider}`));
      if(login)this.db.prepare('INSERT INTO identity_logins VALUES(?,?) ON CONFLICT(identity_hash) DO NOTHING').run(digest,did);
      this.audit(did,provider,login?'login-linked':'linked');this.db.exec('COMMIT');
    } catch(e) {this.db.exec('ROLLBACK');throw e;}
  }
  unlink(did,provider) {
    this.db.prepare('DELETE FROM identity_logins WHERE did=? AND identity_hash IN (SELECT identity_hash FROM links WHERE did=? AND provider=?)').run(did,did,provider);
    this.db.prepare('DELETE FROM links WHERE did=? AND provider=?').run(did,provider);this.audit(did,provider,'unlinked');}
  audit(did,provider,action) {this.db.prepare('INSERT INTO audit(did,provider,action,at) VALUES(?,?,?,?)').run(did,provider,action,Date.now());}
  close(){this.db.close();}
}
