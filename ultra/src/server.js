'use strict';
const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const http = require('node:http');
const WebSocket = require('ws');
const { sameSecret, safeId } = require('./security');

function createHttpServer(config,services) {
  const app=express();const server=http.createServer(app);const wss=new WebSocket.Server({server,path:'/ws'});
  const clients=new Set();
  app.disable('x-powered-by');
  app.use(express.json({limit:'24kb'}));
  app.use('/studio',express.static(path.resolve(__dirname,'../studio')));
  app.use('/overlay',express.static(path.resolve(__dirname,'../overlay')));
  app.get('/',(req,res)=>res.redirect('/studio/'));
  app.get('/health',(req,res)=>res.json({ok:true,service:'Infinity Gen Ultra',time:Date.now()}));
  app.get('/api/status',(req,res)=>res.json({
    ok:true,service:'Infinity Gen Ultra',chatConnected:Boolean(services.chat.connected),
    publisher:services.publisher.status(),game:services.games.snapshot(),uptime:Math.floor(process.uptime())
  }));
  app.get('/api/games',(req,res)=>res.json(services.games.catalog()));
  app.get('/api/state',(req,res)=>res.json({
    game:services.games.snapshot(),missions:services.missions.list(),
    community:communitySnapshot(services.db,services.missions)
  }));
  app.get('/api/missions',(req,res)=>res.json(services.missions.list()));
  app.get('/api/store/catalog',(req,res)=>res.json({level:communitySnapshot(services.db,services.missions).level,items:services.store.catalog(communitySnapshot(services.db,services.missions).level),recipes:services.store.recipes()}));
  app.get('/api/profile/:id',(req,res)=>{
    const id=safeId(req.params.id);const profile=services.economy.profile(id);
    if(!profile)return res.status(404).json({error:'Profile not found.'});
    res.json({profile:profile,inventory:services.store.inventory(id),achievements:services.progression.forUser(id),transactions:services.economy.history(id,10)});
  });
  app.get('/overlay.png',(req,res)=>{
    if(!services.latestFrame)return res.status(503).send('Overlay frame is not ready.');
    res.type('png').set('Cache-Control','no-store').send(services.latestFrame);
  });

  function requireAdmin(req,res,next) {
    const header=String(req.headers.authorization||'');
    const token=header.startsWith('Bearer ')?header.slice(7):req.headers['x-admin-token'];
    if(!sameSecret(token,config.adminToken))return res.status(401).json({error:'Admin authentication required.'});
    return next();
  }
  app.post('/api/admin/games/start',requireAdmin,(req,res)=>{
    try {
      const host={id:safeId(req.body.hostId||'studio-operator'),name:String(req.body.hostName||'Studio Operator').slice(0,48)};
      const snapshot=services.games.start(String(req.body.gameId||''),host);
      if(req.body.startImmediately===true)services.games.begin();
      publish({type:'state',payload:services.games.snapshot()});
      res.status(201).json({ok:true,state:services.games.snapshot()});
    } catch(error){res.status(400).json({error:error.message});}
  });
  app.post('/api/admin/games/stop',requireAdmin,(req,res)=>{
    services.games.stop('Stopped by Studio operator.');
    publish({type:'state',payload:services.games.snapshot()});res.json({ok:true});
  });
  app.post('/api/admin/missions',requireAdmin,(req,res)=>{
    try{res.status(201).json({ok:true,mission:services.missions.create(req.body||{})});}
    catch(error){res.status(400).json({error:error.message});}
  });
  app.post('/api/admin/store/purchase',requireAdmin,(req,res)=>{
    try{
      const user={id:safeId(req.body.userId),name:String(req.body.userName||'Viewer').slice(0,48)};
      const community=communitySnapshot(services.db,services.missions);
      const purchase=services.store.purchase(user,String(req.body.itemId||''),community.level,String(req.headers['idempotency-key']||req.body.requestId||('admin-buy:'+require('node:crypto').randomUUID())));
      res.json({ok:true,purchase,profile:services.economy.profile(user.id)});
    }catch(error){res.status(400).json({error:error.message});}
  });
  app.post('/api/admin/store/equip',requireAdmin,(req,res)=>{
    try{res.json({ok:true,result:services.store.equip(safeId(req.body.userId),String(req.body.itemId||''))});}
    catch(error){res.status(400).json({error:error.message});}
  });
  app.post('/api/admin/store/craft',requireAdmin,(req,res)=>{
    try{res.json({ok:true,result:services.store.craft(safeId(req.body.userId),String(req.body.recipeId||''))});}
    catch(error){res.status(400).json({error:error.message});}
  });
  app.use((error,req,res,next)=>{
    if(res.headersSent)return next(error);
    res.status(400).json({error:'Invalid request.'});
  });
  wss.on('connection',(socket)=>{
    clients.add(socket);
    socket.send(JSON.stringify({type:'state',payload:services.games.snapshot()}));
    socket.on('close',()=>clients.delete(socket));
    socket.on('error',()=>clients.delete(socket));
  });
  function publish(message) {
    const encoded=JSON.stringify(message);
    for(const socket of clients)if(socket.readyState===WebSocket.OPEN)socket.send(encoded);
  }
  services.events.on('game:state',(state)=>publish({type:'state',payload:state}));
  services.events.on('missions:updated',(missions)=>publish({type:'missions',payload:missions}));
  services.events.on('game:notice',(notice)=>publish({type:'notice',payload:notice}));
  services.events.on('chat:notice',(notice)=>publish({type:'notice',payload:notice}));
  services.events.on('mission:completed',(mission)=>publish({type:'mission-completed',payload:mission}));
  services.events.on('achievement:unlocked',(achievement)=>publish({type:'achievement',payload:achievement}));
  services.events.on('publisher:state',(state)=>publish({type:'publisher',payload:state}));
  services.events.on('chat:connected',(state)=>publish({type:'chat',payload:state}));
  const studioPath=path.resolve(__dirname,'../studio/index.html');
  const overlayPath=path.resolve(__dirname,'../overlay/index.html');
  if(!fs.existsSync(studioPath)||!fs.existsSync(overlayPath))throw new Error('Studio or overlay assets are missing.');
  return {app:app,server:server,wss:wss,publish:publish,listen:()=>new Promise((resolve,reject)=>{
    server.once('error',reject);server.listen(config.port,config.host,()=>resolve(server.address()));
  }),close:()=>new Promise((resolve)=>{for(const socket of clients)socket.close();wss.close(()=>server.close(()=>resolve()));})};
}

function communitySnapshot(db,missions) {
  const list=missions.list();const world=list.find((mission)=>mission.scope==='world');
  const total=Number(world?world.progress:0);
  return {level:1+Math.floor(total/100),worldProgress:total,worldTarget:world?world.target:1500,completedMissions:list.filter((mission)=>mission.status==='completed').length};
}
module.exports={createHttpServer,communitySnapshot};
