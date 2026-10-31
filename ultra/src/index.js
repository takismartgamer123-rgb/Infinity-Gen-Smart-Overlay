'use strict';
const { EventEmitter } = require('node:events');
const { loadConfig } = require('./config');
const { Persistence } = require('./persistence');
const { Economy } = require('./economy');
const { MissionEngine } = require('./missions');
const { Progression } = require('./progression');
const { UltraStore } = require('./store');
const { GameEngine } = require('./game-engine');
const { YouTubeChatAdapter } = require('./chat-adapter');
const { AuroraRenderer } = require('./renderer');
const { FFmpegPublisher } = require('./publisher');
const { createHttpServer } = require('./server');
const { CommunityCommands } = require('./community-commands');

async function main() {
  const config=loadConfig();const events=new EventEmitter();const db=new Persistence(config.databasePath);
  const economy=new Economy(db);const missions=new MissionEngine(db,economy,events);
  const progression=new Progression(db,economy,events);const store=new UltraStore(db);
  const games=new GameEngine(db,events,config);const communityCommands=new CommunityCommands({db,economy,store,missions,progression,events});
  const chat=new YouTubeChatAdapter(config,games,events,communityCommands);
  const renderer=new AuroraRenderer();const publisher=new FFmpegPublisher(config,events);
  const services={db,economy,missions,progression,store,games,chat,publisher,events,latestFrame:null};
  events.on('game:contribution',(event)=>{
    try{economy.grant(event.user,2,4,'game-action:'+event.gameId,'game-action:'+event.id);}
    catch(error){events.emit('system:warning',{message:'Game reward could not be recorded.',detail:error.message});}
    try{missions.contribute(event.user,event);}
    catch(error){events.emit('system:warning',{message:'Mission contribution could not be recorded.',detail:error.message});}
  });
  const http=createHttpServer(config,services);const address=await http.listen();
  console.log('Infinity Gen Ultra listening on '+config.host+':'+address.port);
  console.log('Studio: http://localhost:'+address.port+'/studio/');
  console.log('Overlay: http://localhost:'+address.port+'/overlay/');
  if(config.generatedToken)console.log('Temporary admin token (set ADMIN_TOKEN before exposing this service): '+config.adminToken);
  events.on('system:warning',(warning)=>console.warn('[warning]',warning.message,warning.detail||''));
  if(config.enableChat&&config.youtubeVideoId)chat.start().catch((error)=>events.emit('system:warning',{message:'YouTube chat startup failed.',detail:error.message}));
  if(config.enablePublisher&&config.publishUrl)setTimeout(()=>publisher.start(),1500).unref?.();
  const renderTimer=setInterval(()=>{
    try{services.latestFrame=renderer.render(games.snapshot(),missions.list());if(config.enablePublisher)publisher.write(services.latestFrame);}
    catch(error){events.emit('system:warning',{message:'Overlay rendering failed.',detail:error.message});}
  },1000);
  renderTimer.unref?.();games.tick();const tickTimer=setInterval(()=>games.tick(),1000);tickTimer.unref?.();
  const shutdown=async()=>{clearInterval(renderTimer);clearInterval(tickTimer);chat.stop();publisher.stop();await http.close();db.close();process.exit(0);};
  process.once('SIGINT',shutdown);process.once('SIGTERM',shutdown);
}
main().catch((error)=>{console.error('Infinity Gen Ultra failed to start:',error);process.exitCode=1;});
