'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

class Persistence {
  constructor(filename) {
    if (!DatabaseSync) throw new Error('This Node.js build does not provide node:sqlite.');
    if (filename !== ':memory:') fs.mkdirSync(path.dirname(filename), { recursive: true });
    this.connection = new DatabaseSync(filename);
    this.connection.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    this.migrate();
  }
  migrate() {
    const schema = [
      'CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, display_name TEXT NOT NULL, xp INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0), level INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1), created_at INTEGER NOT NULL, last_seen INTEGER NOT NULL)',
      'CREATE TABLE IF NOT EXISTS wallets (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0))',
      'CREATE TABLE IF NOT EXISTS transactions (id TEXT PRIMARY KEY, idempotency_key TEXT NOT NULL UNIQUE, user_id TEXT NOT NULL REFERENCES users(id), kind TEXT NOT NULL, amount INTEGER NOT NULL, balance_after INTEGER NOT NULL, reference TEXT NOT NULL, created_at INTEGER NOT NULL)',
      'CREATE INDEX IF NOT EXISTS transactions_user_idx ON transactions(user_id, created_at DESC)',
      'CREATE TABLE IF NOT EXISTS inventory (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, item_id TEXT NOT NULL, quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 0), equipped INTEGER NOT NULL DEFAULT 0 CHECK (equipped IN (0,1)), acquired_at INTEGER NOT NULL, PRIMARY KEY(user_id, item_id))',
      'CREATE TABLE IF NOT EXISTS missions (id TEXT PRIMARY KEY, scope TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL, target INTEGER NOT NULL CHECK (target > 0), progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0), reward_coins INTEGER NOT NULL DEFAULT 0 CHECK (reward_coins >= 0), reward_xp INTEGER NOT NULL DEFAULT 0 CHECK (reward_xp >= 0), starts_at INTEGER NOT NULL, ends_at INTEGER NOT NULL, status TEXT NOT NULL DEFAULT "active")',
      'CREATE INDEX IF NOT EXISTS missions_status_idx ON missions(status, ends_at)',
      'CREATE TABLE IF NOT EXISTS mission_contributions (mission_id TEXT NOT NULL REFERENCES missions(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id), event_id TEXT NOT NULL, amount INTEGER NOT NULL CHECK (amount > 0), created_at INTEGER NOT NULL, PRIMARY KEY(mission_id, event_id))',
      'CREATE INDEX IF NOT EXISTS mission_contributors_idx ON mission_contributions(mission_id, user_id)',
      'CREATE TABLE IF NOT EXISTS achievements (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, achievement_id TEXT NOT NULL, unlocked_at INTEGER NOT NULL, PRIMARY KEY(user_id, achievement_id))',
      'CREATE TABLE IF NOT EXISTS user_stats (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, contributions INTEGER NOT NULL DEFAULT 0, games_completed INTEGER NOT NULL DEFAULT 0, missions_completed INTEGER NOT NULL DEFAULT 0)',
      'CREATE TABLE IF NOT EXISTS game_sessions (id TEXT PRIMARY KEY, game_id TEXT NOT NULL, phase TEXT NOT NULL, host_id TEXT NOT NULL, host_name TEXT NOT NULL, players_json TEXT NOT NULL, state_json TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, outcome TEXT)',
      'CREATE INDEX IF NOT EXISTS sessions_phase_idx ON game_sessions(phase, updated_at DESC)',
      'CREATE TABLE IF NOT EXISTS event_log (id TEXT PRIMARY KEY, event_type TEXT NOT NULL, created_at INTEGER NOT NULL, payload TEXT NOT NULL)'
    ];
    this.connection.exec(schema.join(';\n') + ';');
  }
  run(sql, params) { const statement = this.connection.prepare(sql); return statement.run.apply(statement, params || []); }
  get(sql, params) { const statement = this.connection.prepare(sql); return statement.get.apply(statement, params || []); }
  all(sql, params) { const statement = this.connection.prepare(sql); return statement.all.apply(statement, params || []); }
  transaction(callback) {
    this.connection.exec('BEGIN IMMEDIATE');
    try { const result = callback(); this.connection.exec('COMMIT'); return result; }
    catch (error) { try { this.connection.exec('ROLLBACK'); } catch (_) {} throw error; }
  }
  ensureUser(user) {
    const now = Date.now();
    const id = String(user.id || '').slice(0, 180);
    const name = String(user.name || 'Viewer').slice(0, 48);
    if (!id) throw new Error('A stable user id is required.');
    this.run('INSERT OR IGNORE INTO users(id, display_name, created_at, last_seen) VALUES(?,?,?,?)', [id, name, now, now]);
    this.run('UPDATE users SET display_name = ?, last_seen = ? WHERE id = ?', [name, now, id]);
    this.run('INSERT OR IGNORE INTO wallets(user_id, balance) VALUES(?,0)', [id]);
    this.run('INSERT OR IGNORE INTO user_stats(user_id) VALUES(?)', [id]);
    return this.get('SELECT id, display_name, xp, level FROM users WHERE id = ?', [id]);
  }
  saveSession(session) {
    this.run(
      'INSERT INTO game_sessions(id,game_id,phase,host_id,host_name,players_json,state_json,created_at,updated_at,outcome) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET phase=excluded.phase, players_json=excluded.players_json, state_json=excluded.state_json, updated_at=excluded.updated_at, outcome=excluded.outcome',
      [session.id, session.gameId, session.phase, session.host.id, session.host.name, JSON.stringify(session.players), JSON.stringify(session.state), session.createdAt, Date.now(), session.outcome || null]
    );
  }
  close() { this.connection.close(); }
}
module.exports = { Persistence };
