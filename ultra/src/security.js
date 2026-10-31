'use strict';
const crypto = require('node:crypto');
function cleanText(value, maxLength) {
  return String(value || '').normalize('NFKC').replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, maxLength || 160);
}
function normalizeAnswer(value) {
  return cleanText(value, 120).toLocaleLowerCase().replace(/[ًٌٍَُِّْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();
}
function safeId(value) { return String(value || '').replace(/[^a-zA-Z0-9:_-]/g, '').slice(0, 180); }
function sameSecret(a, b) {
  const left = Buffer.from(String(a || '')); const right = Buffer.from(String(b || ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
class MessageGuard {
  constructor(options) {
    options = options || {}; this.cooldownMs = options.cooldownMs || 650; this.windowMs = options.windowMs || 60000; this.maxPerWindow = options.maxPerWindow || 12;
    this.records = new Map(); this.seen = new Map();
  }
  accept(userId, rawText, messageId) {
    const now = Date.now(); const id = safeId(userId); const text = cleanText(rawText, 160);
    if (!id || !text) return { ok: false, reason: 'empty-or-long' };
    if (messageId && this.seen.has(String(messageId))) return { ok: false, reason: 'duplicate' };
    if (messageId) this.seen.set(String(messageId), now);
    const previous = this.records.get(id) || { last: 0, hits: [] };
    previous.hits = previous.hits.filter(function (time) { return now - time < 60000; });
    if (now - previous.last < this.cooldownMs) { this.records.set(id, previous); return { ok: false, reason: 'cooldown' }; }
    if (previous.hits.length >= this.maxPerWindow) { this.records.set(id, previous); return { ok: false, reason: 'rate-limit' }; }
    previous.last = now; previous.hits.push(now); this.records.set(id, previous);
    for (const [key, stamp] of this.seen) if (now - stamp > 120000) this.seen.delete(key);
    if (this.records.size > 5000) for (const [key, record] of this.records) if (now - record.last > this.windowMs) this.records.delete(key);
    return { ok: true, text: text };
  }
}
module.exports = { cleanText, normalizeAnswer, safeId, sameSecret, MessageGuard };
