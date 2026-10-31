const test = require('node:test');
const assert = require('node:assert/strict');
const { GAMES } = require('../games');

test('RPS against the bot always resolves a result', () => {
  const data = GAMES.rps.init(['Alice']);
  GAMES.rps.input('حجر', data, 'Alice');
  assert.ok(['Alice فاز!', 'بوت فاز!', 'تعادل'].includes(data.result));
});

test('RPS attributes the two-player winner correctly', () => {
  const data = GAMES.rps.init(['Alice', 'Bob']);
  GAMES.rps.input('حجر', data, 'Alice');
  GAMES.rps.input('مقص', data, 'Bob');
  assert.equal(data.result, 'Alice فاز!');
});

test('Guessing accepts numeric input only', () => {
  const data = GAMES.تخمين.init([]);
  GAMES.تخمين.input('12abc', data, 'Alice');
  assert.deepEqual(data.attempts, {});
});

test('A repeated wrong letter is counted once', () => {
  const data = GAMES.كلمة.init([]);
  GAMES.كلمة.input('ذ', data, 'Alice');
  GAMES.كلمة.input('ذ', data, 'Bob');
  assert.equal(data.wrong, 1);
});

test('The word game detects a solved word', () => {
  const data = GAMES.كلمة.init([]);
  for (const letter of new Set(data.word.split(''))) {
    GAMES.كلمة.input(letter, data, 'Alice');
  }
  assert.equal(data.winner, 'الجميع');
});

test('Typing race requires two distinct finishers', () => {
  const data = GAMES.كتابة.init(["Alice", "Bob"]);
  GAMES.كتابة.input(data.text, data, 'Alice');
  GAMES.كتابة.input(data.text, data, 'Alice');
  assert.equal(Object.keys(data.times).length, 1);
  GAMES.كتابة.input(data.text, data, 'Bob');
  assert.equal(data.finished, true);
});

test('Unrelated chat does not mutate the stock game', () => {
  const data = GAMES.بورصة.init(['owner']);
  const before = structuredClone(data);
  GAMES.بورصة.input('hello chat', data, 'owner');
  assert.deepEqual(data, before);
});

test('Only the stock-game owner can trade', () => {
  const data = GAMES.بورصة.init(['owner']);
  const before = structuredClone(data);
  GAMES.بورصة.input('شراء', data, 'visitor');
  assert.deepEqual(data, before);
});

test('Jail game ends when one prisoner remains', () => {
  const data = GAMES.سجن.init(['warden', 'p1', 'p2']);
  GAMES.سجن.input('.اعدام p1', data, 'warden');
  assert.equal(data.finished, true);
  assert.equal(data.winner, 'p2');
});

test('Speed game ends after every lobby player responds', () => {
  const data = GAMES.سرعة.init(['Alice', 'Bob']);
  GAMES.سرعة.input(data.emoji, data, 'Alice');
  GAMES.سرعة.input(data.emoji, data, 'Bob');
  assert.equal(data.finished, true);
});

test('Killer game resolves after every player votes', () => {
  const data = GAMES.قاتل.init(['Alice', 'Bob', 'Carol']);
  data.victim = 'victim';
  for (const player of data.players) {
    GAMES.قاتل.input('.اتهم ' + data.killer, data, player);
  }
  assert.equal(data.finished, true);
  assert.equal(data.solved, true);
});

test('Mafia doctor can protect the selected target', () => {
  const data = GAMES.mafia.init(['A', 'B', 'C', 'D', 'E']);
  const mafia = data.alive.find(player => data.roles[player] === 'mafia');
  const doctor = data.alive.find(player => data.roles[player] === 'doctor');
  const target = data.alive.find(player => player !== mafia && player !== doctor);
  GAMES.mafia.input('.kill ' + target, data, mafia);
  GAMES.mafia.input('.save ' + target, data, doctor);
  GAMES.mafia.input('.nightend', data, mafia);
  assert.equal(data.phase, 'day');
  assert.ok(data.alive.includes(target));
});

test('Mafia wins when its numbers reach parity', () => {
  const players = ['A', 'B', 'C', 'D'];
  const data = GAMES.mafia.init(players);
  const mafia = data.alive.find(player => data.roles[player] === 'mafia');
  const citizen = data.alive.find(player => data.roles[player] !== 'mafia');
  data.alive = [mafia, citizen];
  GAMES.mafia.input('.kill ' + citizen, data, mafia);
  GAMES.mafia.input('.nightend', data, mafia);
  assert.equal(data.finished, true);
  assert.equal(data.winner, 'المافيا');
});

test('Kingdom rebellion can overthrow the king', () => {
  const data = GAMES.مملكة.init(['A', 'B', 'C', 'D', 'E']);
  GAMES.مملكة.input('ولاء', data, 'A');
  GAMES.مملكة.input('انقلاب', data, 'B');
  GAMES.مملكة.input('انقلاب', data, 'C');
  assert.equal(data.finished, true);
  assert.equal(data.winner, 'المتمردون');
});

test('Wheel renderer does not mutate game state', () => {
  const data = GAMES.عجلة.init([]);
  data.spinning = true;
  const before = data.angle;
  const ctx = new Proxy({}, { get: () => () => {} });
  GAMES.عجلة.renderer(ctx, 1920, 1080, data);
  assert.equal(data.angle, before);
});

test('Speed renderer does not reorder the stored click list', () => {
  const data = GAMES.سرعة.init(['Alice', 'Bob']);
  data.clicked = [{ name: 'Bob', time: 200 }, { name: 'Alice', time: 100 }];
  const before = structuredClone(data.clicked);
  const ctx = new Proxy({}, { get: () => () => {} });
  GAMES.سرعة.renderer(ctx, 1920, 1080, data);
  assert.deepEqual(data.clicked, before);
});

test('Wheel is controlled by the lobby owner', () => {
  const data = GAMES.عجلة.init(['owner']);
  GAMES.عجلة.input('لف', data, 'visitor');
  assert.equal(data.spinning, false);
  assert.equal(data.result, null);
});

test('Million quiz ignores answers from other viewers', () => {
  const data = GAMES.مليون.init(['owner']);
  GAMES.مليون.input('2', data, 'visitor');
  assert.equal(data.q, 0);
  GAMES.مليون.input('2', data, 'owner');
  assert.equal(data.q, 1);
});

test('Treasure hunt is controlled by the lobby owner', () => {
  const data = GAMES.كنز.init(['owner']);
  GAMES.كنز.input('يمين', data, 'visitor');
  assert.equal(data.pos, 0);
  GAMES.كنز.input('يمين', data, 'owner');
  assert.equal(data.pos, 1);
});

test('Only registered kingdom players can rebel', () => {
  const data = GAMES.مملكة.init(['A', 'B', 'C', 'D', 'E']);
  GAMES.مملكة.input('انقلاب', data, 'visitor');
  assert.deepEqual(data.rebels, []);
});
