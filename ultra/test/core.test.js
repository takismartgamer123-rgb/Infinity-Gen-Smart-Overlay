'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {GAMES,GAME_MAP}=require('../src/games');
const {Persistence}=require('../src/persistence');
const {Economy}=require('../src/economy');
const {MissionEngine}=require('../src/missions');
const {UltraStore}=require('../src/store');
const {MessageGuard,normalizeAnswer,cleanText}=require('../src/security');
const {EventEmitter}=require('node:events');

test('the Ultra catalog contains sixteen safe community games with unique ids',()=>{
  assert.equal(GAMES.length,16);assert.equal(new Set(GAMES.map((game)=>game.id)).size,16);
  for(const game of GAMES)assert.ok(game.name&&game.description&&game.create&&game.handle&&game.view);
});
test('game state views do not expose hidden puzzle answers',()=>{
  for(const id of ['code-breaker','memory-pulse','number-matrix','pixel-reveal','portal-expedition']){
    const game=GAME_MAP.get(id);const view=game.view(game.create());
    if(id==='code-breaker')assert.equal(Object.hasOwn(view,'secret'),false);
    if(id==='number-matrix')assert.equal(Object.hasOwn(view,'answer'),false);
    if(id==='pixel-reveal')assert.equal(Object.hasOwn(view,'answer'),false);
  }
});
test('collaborative rocket countdown accepts only the next number',()=>{
  const game=GAME_MAP.get('rocket-launch');const state=game.create();
  assert.equal(game.handle(state,'10',{id:'viewer-1',name:'Viewer'}).success,true);assert.equal(state.next,9);
  assert.equal(game.handle(state,'7',{id:'viewer-1',name:'Viewer'}).success,false);assert.equal(state.next,9);
  for(let value=9;value>=1;value--)game.handle(state,String(value),{id:'viewer-'+value,name:'Viewer'});
  assert.equal(state.launched,true);
});
test('city building validates resource names and completes as a shared target',()=>{
  const state=GAME_MAP.get('build-our-city').create();const game=GAME_MAP.get('build-our-city');
  assert.equal(game.handle(state,'!build exploit',{id:'x',name:'X'}).success,false);
  for(let i=0;i<8;i++)game.handle(state,'!build timber',{id:'wood-'+i,name:'Builder'});
  for(let i=0;i<6;i++)game.handle(state,'!build stone',{id:'stone-'+i,name:'Builder'});
  for(let i=0;i<4;i++)game.handle(state,'!build power',{id:'power-'+i,name:'Builder'});
  assert.equal(state.finished,true);
});
test('word forge only accepts unique safe vocabulary words',()=>{
  const game=GAME_MAP.get('word-forge');const state=game.create();
  assert.equal(game.handle(state,'!word <script>',{id:'x',name:'X'}).success,false);
  assert.equal(game.handle(state,'!word gamma',{id:'x',name:'X'}).success,true);
  assert.equal(game.handle(state,'!word gamma',{id:'y',name:'Y'}).success,false);
});
test('normalization and message guard sanitize text and reject duplicate messages',()=>{
  assert.equal(normalizeAnswer('أَلْجَزَائِر'),normalizeAnswer('الجزائر'));
  assert.equal(cleanText('<b>hello</b>',40),'bhello/b');
  const guard=new MessageGuard({cooldownMs:1});
  assert.equal(guard.accept('viewer','!join','message-1').ok,true);
  assert.equal(guard.accept('viewer','!join','message-1').reason,'duplicate');
});
test('economy uses idempotent transactions and refuses negative balances',()=>{
  const db=new Persistence(':memory:');const economy=new Economy(db);const user={id:'channel-1',name:'Builder'};
  const first=economy.grant(user,20,30,'test-reward','reward-1');const duplicate=economy.grant(user,20,30,'test-reward','reward-1');
  assert.equal(first.balance,20);assert.equal(duplicate.applied,false);assert.equal(economy.profile(user.id).balance,20);
  assert.throws(()=>economy.spend(user,21,'too much','spend-1'),/Insufficient/);
  economy.grant(user,0,10,'xp only','xp-only');assert.equal(economy.profile(user.id).balance,20);
  db.close();
});
test('missions reward eligible contributors once when a shared target completes',()=>{
  const db=new Persistence(':memory:');const events=new EventEmitter();const economy=new Economy(db);const missions=new MissionEngine(db,economy,events);
  const custom=missions.create({scope:'live',title:'One step',description:'A one-step test.',target:1,rewardCoins:25,rewardXp:10,durationHours:1});
  const user={id:'contributor-1',name:'Contributor'};const done=missions.contribute(user,{id:'trusted-event-1',trusted:true});
  assert.ok(done.includes(custom.id));assert.equal(db.get('SELECT status FROM missions WHERE id=?',[custom.id]).status,'completed');
  assert.equal(economy.profile(user.id).balance,25);
  missions.contribute(user,{id:'trusted-event-1',trusted:true});assert.equal(economy.profile(user.id).balance,25);db.close();
});
test('untrusted raw messages cannot advance community missions',()=>{
  const db=new Persistence(':memory:');const events=new EventEmitter();const economy=new Economy(db);const missions=new MissionEngine(db,economy,events);
  const before=missions.list().find((m)=>m.scope==='daily').progress;
  missions.contribute({id:'viewer-2',name:'Viewer'},{id:'raw-chat',trusted:false});
  assert.equal(missions.list().find((m)=>m.scope==='daily').progress,before);db.close();
});
test('Ultra Store crafting is deterministic and requires owned materials',()=>{
  const db=new Persistence(':memory:');const store=new UltraStore(db);const user={id:'crafter-1',name:'Crafter'};db.ensureUser(user);
  assert.throws(()=>store.craft(user.id,'craft-aurora-frame'),/Missing crafting materials/);
  db.run('INSERT INTO inventory(user_id,item_id,quantity,equipped,acquired_at) VALUES(?,?,3,0,?)',[user.id,'timber',Date.now()]);
  db.run('INSERT INTO inventory(user_id,item_id,quantity,equipped,acquired_at) VALUES(?,?,2,0,?)',[user.id,'spark',Date.now()]);
  assert.equal(store.craft(user.id,'craft-aurora-frame').output,'aurora-frame');
  assert.equal(db.get('SELECT quantity FROM inventory WHERE user_id=? AND item_id=?',[user.id,'aurora-frame']).quantity,1);db.close();
});
