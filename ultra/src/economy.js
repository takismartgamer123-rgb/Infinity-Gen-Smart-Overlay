'use strict';
const crypto = require('node:crypto');
class Economy {
  constructor(db) { this.db = db; }
  apply(user, amount, kind, reference, idempotencyKey, xpAmount) {
    const delta = Math.trunc(Number(amount)); const xp = Math.max(0, Math.trunc(Number(xpAmount || 0)));
    if (!Number.isFinite(delta) || (delta === 0 && xp === 0) || Math.abs(delta) > 1000000) throw new Error('Transaction amount is invalid.');
    if (!idempotencyKey || String(idempotencyKey).length > 200) throw new Error('A valid idempotency key is required.');
    return this.db.transaction(() => {
      const profile = this.db.ensureUser(user);
      const prior = this.db.get('SELECT id,balance_after FROM transactions WHERE idempotency_key=?', [idempotencyKey]);
      if (prior) return { applied: false, balance: prior.balance_after, transactionId: prior.id };
      const balance = Number(this.db.get('SELECT balance FROM wallets WHERE user_id=?', [profile.id]).balance);
      const nextBalance = balance + delta;
      if (nextBalance < 0) throw new Error('Insufficient Infinity Coins.');
      const transactionId = crypto.randomUUID(); const nextXp = Number(profile.xp) + xp; const nextLevel = 1 + Math.floor(nextXp / 100);
      this.db.run('UPDATE wallets SET balance=? WHERE user_id=?', [nextBalance, profile.id]);
      this.db.run('UPDATE users SET xp=?,level=? WHERE id=?', [nextXp, nextLevel, profile.id]);
      this.db.run('INSERT INTO transactions(id,idempotency_key,user_id,kind,amount,balance_after,reference,created_at) VALUES(?,?,?,?,?,?,?,?)',
        [transactionId, String(idempotencyKey), profile.id, String(kind).slice(0,40), delta, nextBalance, String(reference || '').slice(0,180), Date.now()]);
      return { applied: true, balance: nextBalance, xp: nextXp, level: nextLevel, transactionId: transactionId };
    });
  }
  grant(user, coins, xp, reference, key) {
    const safeCoins = Math.max(0, Math.trunc(Number(coins || 0))); const safeXp = Math.max(0, Math.trunc(Number(xp || 0)));
    return this.apply(user, safeCoins, safeCoins ? 'reward' : 'xp-reward', reference, key || ('reward:' + crypto.randomUUID()), safeXp);
  }
  spend(user, coins, reference, key) {
    return this.apply(user, -Math.max(1, Math.trunc(Number(coins))), 'store-purchase', reference, key || ('spend:' + crypto.randomUUID()), 0);
  }
  profile(userId) {
    return this.db.get('SELECT u.id,u.display_name,u.xp,u.level,w.balance FROM users u JOIN wallets w ON w.user_id=u.id WHERE u.id=?', [userId]) || null;
  }
  history(userId, limit) {
    return this.db.all('SELECT kind,amount,balance_after,reference,created_at FROM transactions WHERE user_id=? ORDER BY created_at DESC LIMIT ?',
      [userId, Math.max(1, Math.min(50, Number(limit || 20)))]);
  }
}
module.exports = { Economy };
