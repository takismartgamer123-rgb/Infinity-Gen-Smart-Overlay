'use strict';
const ACHIEVEMENTS = [
  {id:'first-signal',title:'First Signal',description:'Make your first verified contribution.',stat:'contributions',target:1,xp:20},
  {id:'community-10',title:'Community Builder',description:'Make 10 verified contributions.',stat:'contributions',target:10,xp:50},
  {id:'community-100',title:'Infinity Supporter',description:'Make 100 verified contributions.',stat:'contributions',target:100,xp:200},
  {id:'game-finished',title:'Round Finisher',description:'Complete a game session.',stat:'games_completed',target:1,xp:35},
  {id:'mission-helper',title:'Mission Helper',description:'Help complete a community mission.',stat:'missions_completed',target:1,xp:75}
];
class Progression {
  constructor(db,economy,events) {
    this.db=db;this.economy=economy;this.events=events;
    events.on('game:contribution',(event)=>this.increment(event.user,'contributions',1,'contribution:'+event.id));
    events.on('game:completed',(event)=>{for(const user of event.players||[])this.increment(user,'games_completed',1,'game-completed:'+event.id+':'+user.id);});
    events.on('mission:completed',(event)=>{
      const people=db.all('SELECT DISTINCT u.id,u.display_name FROM mission_contributions mc JOIN users u ON u.id=mc.user_id WHERE mc.mission_id=?',[event.id]);
      for(const person of people)this.increment({id:person.id,name:person.display_name},'missions_completed',1,'mission-completed:'+event.id+':'+person.id);
    });
  }
  increment(user,stat,amount,sourceKey) {
    if(!user||!user.id||!['contributions','games_completed','missions_completed'].includes(stat))return;
    this.db.ensureUser(user);
    const accepted=this.db.run('INSERT OR IGNORE INTO event_log(id,event_type,created_at,payload) VALUES(?,?,?,?)',
      [String(sourceKey), 'progress:'+stat, Date.now(), JSON.stringify({userId:user.id,amount:amount})]);
    if(!accepted.changes)return;
    this.db.run('UPDATE user_stats SET '+stat+'='+stat+'+? WHERE user_id=?',[amount,user.id]);
    const count=this.db.get('SELECT '+stat+' AS count FROM user_stats WHERE user_id=?',[user.id]).count;
    for(const achievement of ACHIEVEMENTS.filter((item)=>item.stat===stat&&count>=item.target)){
      const inserted=this.db.run('INSERT OR IGNORE INTO achievements(user_id,achievement_id,unlocked_at) VALUES(?,?,?)',[user.id,achievement.id,Date.now()]);
      if(inserted.changes){
        this.economy.grant(user,0,achievement.xp,'achievement:'+achievement.id,'achievement:'+achievement.id+':'+user.id);
        this.events.emit('achievement:unlocked',{userId:user.id,title:achievement.title,description:achievement.description});
      }
    }
  }
  catalog(){return ACHIEVEMENTS;}
  forUser(userId){return this.db.all('SELECT achievement_id,unlocked_at FROM achievements WHERE user_id=? ORDER BY unlocked_at DESC',[userId]);}
}
module.exports={Progression,ACHIEVEMENTS};
