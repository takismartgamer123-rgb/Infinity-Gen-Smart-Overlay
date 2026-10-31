'use strict';
const crypto = require('node:crypto');
const { GAME_MAP, GAMES } = require('./games');
const { MessageGuard, cleanText, safeId } = require('./security');
class GameEngine {
  constructor(db,events,config){
    this.db=db;this.events=events;this.config=config;this.guard=new MessageGuard();this.session=null;this.lobbyTimer=null;this.finishTimer=null;
    this.db.run('UPDATE game_sessions SET phase="interrupted",updated_at=? WHERE phase IN ("lobby","running")',[Date.now()]);
  }
  start(gameId,host){
    if(this.session)throw new Error('A game session is already active.');
    const definition=GAME_MAP.get(gameId);if(!definition)throw new Error('Unknown game id.');
    const user={id:safeId(host.id),name:cleanText(host.name,48)||'Studio Operator'};this.db.ensureUser(user);
    const now=Date.now();
    this.session={id:crypto.randomUUID(),gameId:gameId,phase:'lobby',host:user,players:[user],state:definition.create(),createdAt:now,startedAt:0,outcome:null,contributionCounts:{}};
    this.persist();this.events.emit('game:state',this.snapshot());
    this.lobbyTimer=setTimeout(()=>this.begin(),this.config.lobbySeconds*1000);this.lobbyTimer.unref?.();
    return this.snapshot();
  }
  join(user){
    if(!this.session||this.session.phase!=='lobby')return{ok:false,notice:'There is no open lobby.'};
    const id=safeId(user.id);const name=cleanText(user.name,48)||'Viewer';
    if(this.session.players.some((p)=>p.id===id))return{ok:true,notice:'You are already in the lobby.'};
    const definition=GAME_MAP.get(this.session.gameId);
    if(this.session.players.length>=definition.maxPlayers)return{ok:false,notice:'The lobby is full.'};
    const player={id:id,name:name};this.db.ensureUser(player);this.session.players.push(player);
    this.persist();this.events.emit('game:state',this.snapshot());return{ok:true,notice:'You joined the lobby.'};
  }
  begin(){
    if(!this.session||this.session.phase!=='lobby')return false;
    const definition=GAME_MAP.get(this.session.gameId);
    if(this.session.players.length<definition.minPlayers)return this.stop('Not enough players joined.');
    if(this.lobbyTimer)clearTimeout(this.lobbyTimer);this.lobbyTimer=null;
    this.session.phase='running';this.session.startedAt=Date.now();this.persist();this.events.emit('game:state',this.snapshot());return true;
  }
  handleChat(user,rawText,messageId){
    const guard=this.guard.accept(user.id,rawText,messageId);if(!guard.ok)return{ok:false,reason:guard.reason};
    const text=guard.text;this.db.ensureUser(user);
    if(text==='ادخل'||text==='!join'||text==='.join')return this.join(user);
    if(!this.session||this.session.phase!=='running')return{ok:false,notice:'No running game.'};
    const definition=GAME_MAP.get(this.session.gameId);const id=safeId(user.id);
    const existing=this.session.players.some((p)=>p.id===id);
    if(!existing&&this.session.players.length>=definition.maxPlayers)return{ok:false,notice:'The participant limit has been reached.'};
    const player={id:id,name:cleanText(user.name,48)||'Viewer'};
    const response=definition.handle(this.session.state,text,player);
    if(response&&response.state)this.session.state=response.state;
    if(response&&response.success){
      if(!existing)this.session.players.push(player);
      const rewarded=Number(this.session.contributionCounts[id]||0);
      if(rewarded<3){
        this.session.contributionCounts[id]=rewarded+1;
        const event={id:crypto.randomUUID(),trusted:true,user:player,gameId:this.session.gameId,kind:'verified-action'};
        this.events.emit('game:contribution',event);
      } else {
        this.events.emit('game:notice',{text:'Your game contribution reward limit for this round has been reached. You can keep helping the community!'});
      }
    }
    if(response&&response.notice)this.events.emit('game:notice',{text:response.notice});
    if(response&&response.complete)this.finish('completed');
    else{this.persist();this.events.emit('game:state',this.snapshot());}
    return{ok:true,success:Boolean(response&&response.success),notice:response&&response.notice||''};
  }
  tick(){
    if(!this.session)return;
    if(this.session.phase==='running'){
      const definition=GAME_MAP.get(this.session.gameId);if(definition.tick)definition.tick(this.session.state);
      const elapsed=(Date.now()-this.session.startedAt)/1000;const limit=definition.seconds||this.config.gameMaxSeconds;
      if(elapsed>=Math.min(limit,this.config.gameMaxSeconds))this.finish('time-limit');
      else if(definition.isComplete?definition.isComplete(this.session.state):this.defaultComplete(this.session.state))this.finish('completed');
      else this.persist();
    }
    this.events.emit('game:state',this.snapshot());
  }
  defaultComplete(state){return Boolean(state&&(state.finished||state.solved||state.found||state.launched||state.winner));}
  finish(outcome){
    if(!this.session||this.session.phase!=='running')return;
    this.session.phase='finished';this.session.outcome=outcome;this.persist();
    this.events.emit('game:completed',{id:this.session.id,gameId:this.session.gameId,players:this.session.players.slice(),outcome:outcome});
    this.events.emit('game:state',this.snapshot());this.finishTimer=setTimeout(()=>this.clear(),8000);this.finishTimer.unref?.();
  }
  stop(reason){
    if(!this.session)return false;
    if(this.lobbyTimer)clearTimeout(this.lobbyTimer);if(this.finishTimer)clearTimeout(this.finishTimer);
    this.lobbyTimer=null;this.finishTimer=null;this.session.phase='stopped';this.session.outcome=cleanText(reason||'Stopped',100);this.persist();this.events.emit('game:state',this.snapshot());this.clear();return true;
  }
  clear(){
    if(this.lobbyTimer)clearTimeout(this.lobbyTimer);if(this.finishTimer)clearTimeout(this.finishTimer);
    if(this.session)this.db.run('UPDATE game_sessions SET phase="closed",updated_at=? WHERE id=?',[Date.now(),this.session.id]);
    this.session=null;this.lobbyTimer=null;this.finishTimer=null;this.events.emit('game:state',this.snapshot());
  }
  persist(){if(this.session)this.db.saveSession(this.session);}
  snapshot(){
    if(!this.session)return{phase:'idle',game:null,players:[],playerCount:0,state:null,host:null};
    const definition=GAME_MAP.get(this.session.gameId);
    return{phase:this.session.phase,game:{id:definition.id,name:definition.name,nameAr:definition.nameAr,emoji:definition.emoji,description:definition.description,howTo:definition.howTo},
      host:this.session.host.name,players:this.session.players.map((p)=>p.name),playerCount:this.session.players.length,
      startedAt:this.session.startedAt||null,state:definition.view(this.session.state),outcome:this.session.outcome};
  }
  catalog(){return GAMES.map((game)=>({id:game.id,name:game.name,nameAr:game.nameAr,emoji:game.emoji,minPlayers:game.minPlayers,maxPlayers:game.maxPlayers,seconds:game.seconds||this.config.gameMaxSeconds,description:game.description,howTo:game.howTo}));}
}
module.exports={GameEngine};
