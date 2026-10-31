'use strict';
const crypto = require('node:crypto');
const { cleanText, safeId } = require('./security');
class MissionEngine {
  constructor(db, economy, events) { this.db = db; this.economy = economy; this.events = events; this.seed(); }
  seed() {
    const now = Date.now();
    this.db.run('UPDATE missions SET status="expired" WHERE status="active" AND ends_at<=?', [now]);
    const dayStart=Date.UTC(new Date(now).getUTCFullYear(),new Date(now).getUTCMonth(),new Date(now).getUTCDate());
    const dayKey=new Date(dayStart).toISOString().slice(0,10);
    const dayEnd=dayStart+86400000;
    const date=new Date(dayStart);const weekday=(date.getUTCDay()+6)%7;const weekStart=dayStart-weekday*86400000;
    const weekKey=new Date(weekStart).toISOString().slice(0,10);const weekEnd=weekStart+7*86400000;
    const liveId='live-'+Math.floor(now/1000);
    const defaults=[
      [liveId,'live','Live Community Pulse','Complete 25 verified game actions during this live session.',25,35,40,now,now+8*3600000],
      ['daily-'+dayKey,'daily','Daily Community Pulse','Complete 80 verified game actions together today.',80,90,100,dayStart,dayEnd],
      ['weekly-'+weekKey,'weekly','Weekly Discovery','Complete 350 verified game actions together this week.',350,300,350,weekStart,weekEnd],
      ['world-portal','world','Open the World Portal','Complete 1500 verified game actions to power the shared portal.',1500,1200,1200,now,now+10*365*86400000]
    ];
    for (const item of defaults) this.db.run(
      'INSERT OR IGNORE INTO missions(id,scope,title,description,target,reward_coins,reward_xp,starts_at,ends_at,status) VALUES(?,?,?,?,?,?,?,?,?,?)',
      [item[0],item[1],item[2],item[3],item[4],item[5],item[6],item[7],item[8],'active']
    );
  }
  list() {
    return this.db.all('SELECT id,scope,title,description,target,progress,reward_coins,reward_xp,starts_at,ends_at,status FROM missions WHERE status!="expired" ORDER BY CASE scope WHEN \'live\' THEN 1 WHEN \'daily\' THEN 2 WHEN \'weekly\' THEN 3 ELSE 4 END', []);
  }
  contribute(user, event) {
    if (!event || event.trusted !== true || !event.id) return [];
    const userId = safeId(user.id); if (!userId) return [];
    const now = Date.now(); const completed = [];
    const active = this.db.all('SELECT * FROM missions WHERE status="active" AND starts_at<=? AND ends_at>? ORDER BY scope', [now,now]);
    for (const mission of active) {
      const result = this.db.transaction(() => {
        this.db.ensureUser(user);
        const inserted = this.db.run('INSERT OR IGNORE INTO mission_contributions(mission_id,user_id,event_id,amount,created_at) VALUES(?,?,?,?,?)',
          [mission.id,userId,String(event.id),1,now]);
        if (!inserted.changes) return null;
        this.db.run('UPDATE missions SET progress=MIN(target,progress+1) WHERE id=? AND status="active"', [mission.id]);
        const updated = this.db.get('SELECT * FROM missions WHERE id=?', [mission.id]);
        if (updated.progress >= updated.target && updated.status === 'active') {
          this.db.run('UPDATE missions SET status="completed" WHERE id=? AND status="active"', [mission.id]);
          return updated;
        }
        return null;
      });
      if (result) completed.push(result);
    }
    for (const mission of completed) this.distribute(mission);
    if (active.length) this.events.emit('missions:updated', this.list());
    return completed.map((mission) => mission.id);
  }
  distribute(mission) {
    const people = this.db.all('SELECT DISTINCT mc.user_id,u.display_name FROM mission_contributions mc JOIN users u ON u.id=mc.user_id WHERE mc.mission_id=?', [mission.id]);
    for (const person of people) {
      try { this.economy.grant({id:person.user_id,name:person.display_name},mission.reward_coins,mission.reward_xp,'mission:'+mission.id,'mission:'+mission.id+':'+person.user_id); }
      catch (error) { this.events.emit('system:warning',{message:'A mission reward could not be delivered.',detail:error.message}); }
    }
    this.events.emit('mission:completed',{id:mission.id,title:mission.title,contributors:people.length});
  }
  create(input) {
    const scope = ['live','daily','weekly','world'].includes(input.scope) ? input.scope : 'live';
    const title = cleanText(input.title,80); const description = cleanText(input.description,220);
    const target = Math.trunc(Number(input.target)); const coins = Math.max(0,Math.min(10000,Math.trunc(Number(input.rewardCoins||0))));
    const xp = Math.max(0,Math.min(10000,Math.trunc(Number(input.rewardXp||0))));
    const hours = Math.max(1,Math.min(2160,Math.trunc(Number(input.durationHours||24))));
    if (!title || !description || !Number.isInteger(target) || target<1 || target>1000000) throw new Error('Mission title, description and a target between 1 and 1,000,000 are required.');
    const id = 'custom-' + crypto.randomUUID(); const now = Date.now();
    this.db.run('INSERT INTO missions(id,scope,title,description,target,progress,reward_coins,reward_xp,starts_at,ends_at,status) VALUES(?,?,?,?,?,0,?,?,?,?,?)',
      [id,scope,title,description,target,coins,xp,now,now+hours*3600000,'active']);
    this.events.emit('missions:updated',this.list());
    return this.db.get('SELECT * FROM missions WHERE id=?',[id]);
  }
}
module.exports = { MissionEngine };
