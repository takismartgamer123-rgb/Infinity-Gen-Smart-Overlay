'use strict';
const $=(selector)=>document.querySelector(selector);
const tokenKey='infinity-gen-ultra-admin-token';
let adminToken=sessionStorage.getItem(tokenKey)||'';
let state=null;let missions=[];let games=[];let items=[];
const notice=(message,isError)=>{
  const el=$('#notice');el.textContent=message;el.classList.toggle('error',Boolean(isError));
};
async function api(url,options){
  const config=options||{};config.headers=Object.assign({'Content-Type':'application/json'},config.headers||{});
  if(adminToken)config.headers.Authorization='Bearer '+adminToken;
  const response=await fetch(url,config);const body=await response.json().catch(()=>({error:'Invalid server response.'}));
  if(!response.ok)throw new Error(body.error||('HTTP '+response.status));return body;
}
function element(tag,className,text){
  const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=String(text);return node;
}
function renderGames(){
  const grid=$('#game-grid');grid.replaceChildren();
  games.forEach((game)=>{
    const card=element('article','game-card');card.append(element('div','game-icon',game.emoji));
    card.append(element('h3','',game.name));card.append(element('div','arabic',game.nameAr||''));
    card.append(element('p','',game.description+(game.howTo?' How to play: '+game.howTo:'')));
    const button=element('button','button secondary','Open Lobby');button.type='button';
    button.addEventListener('click',async()=>{
      try{await api('/api/admin/games/start',{method:'POST',body:JSON.stringify({gameId:game.id})});notice('Lobby opened: '+game.name);await refresh();}
      catch(error){notice(error.message,true);}
    });
    card.append(button);grid.append(card);
  });
}
function renderMissions(){
  const grid=$('#mission-grid');grid.replaceChildren();
  missions.forEach((mission)=>{
    const card=element('article','mission-card');const top=element('div','mission-top');
    top.append(element('h3','',mission.title));top.append(element('span','scope',mission.scope));card.append(top);
    card.append(element('p','',mission.description));
    const track=element('div','progress-track');const fill=element('div','progress-fill');
    fill.style.width=Math.min(100,Math.round(mission.progress/mission.target*100))+'%';track.append(fill);card.append(track);
    const meta=element('div','progress-meta');meta.append(element('span','',mission.progress+' / '+mission.target));meta.append(element('span','',mission.reward_coins+' IC · '+mission.reward_xp+' XP'));card.append(meta);
    grid.append(card);
  });
}
function renderStore(){
  const grid=$('#store-grid');grid.replaceChildren();
  items.forEach((item)=>{
    const card=element('article','store-card');card.append(element('div','category',item.category));
    card.append(element('h3','',item.name));card.append(element('p','',item.description));
    card.append(element('div','price',item.price+' IC'));
    const type=element('div','muted',item.type==='utility'?'Optional utility':'Permanent collection / cosmetic');
    card.append(type);grid.append(card);
  });
}
function formatCount(value){
  if(value===null||value===undefined||value==='')return '—';
  return Number(value).toLocaleString();
}
function renderYouTubeStats(stats){
  const channel=stats&&stats.channel||{};const video=stats&&stats.video||{};
  $('#yt-subscribers').textContent=channel.subscriberCountHidden?'Hidden':formatCount(channel.subscriberCount);
  $('#yt-channel-views').textContent=formatCount(channel.viewCount);
  $('#yt-channel-videos').textContent=formatCount(channel.videoCount);
  $('#yt-video-views').textContent=formatCount(video.viewCount);
  $('#yt-video-likes').textContent=formatCount(video.likeCount);
  $('#yt-concurrent-viewers').textContent=formatCount(video.concurrentViewers);
  const enabled=Boolean(stats&&stats.enabled);
  const note=$('#yt-stats-note');
  if(note){
    note.textContent=!enabled
      ?'Set YOUTUBE_API_KEY plus YOUTUBE_CHANNEL_ID and/or YOUTUBE_VIDEO_ID on the server to enable public metrics.'
      :stats.updatedAt?'Last updated '+new Date(stats.updatedAt).toLocaleTimeString():'Waiting for the first YouTube API response.';
  }
}
function renderState(){
  if(!state)return;const game=state.game||{};
  $('#engine-status').textContent='ONLINE';$('#uptime').textContent='Uptime '+state.uptime+'s';
  $('#active-game').textContent=game.name||'Idle';$('#active-phase').textContent=state.phase||'Waiting';
  $('#participant-count').textContent=state.playerCount||0;$('#phase-pill').textContent=(state.phase||'idle').toUpperCase();
  $('#live-title').textContent=game.name?game.name+' '+(game.emoji||''):'Infinity Gen is ready';
  $('#live-description').textContent=game.description||'Choose a game to open a community lobby.';
  const online=state.chatConnected;$('#connection').classList.toggle('online',online);
  $('#connection').textContent=online?'● Chat connected':'● Chat not connected';
}
async function refresh(){
  try{
    const [status,stateBody,gameBody,missionBody,storeBody,statsBody]=await Promise.all([
      api('/api/status'),api('/api/state'),api('/api/games'),api('/api/missions'),api('/api/store/catalog'),api('/api/stats')
    ]);
    state=Object.assign({},status,stateBody.game);missions=missionBody;games=gameBody;items=storeBody.items;
    $('#community-level').textContent=storeBody.level;
    $('#world-progress').textContent='World mission: '+stateBody.community.worldProgress+'/'+stateBody.community.worldTarget;
    renderState();renderGames();renderMissions();renderStore();renderYouTubeStats(statsBody);
  }catch(error){$('#engine-status').textContent='OFFLINE';$('#uptime').textContent=error.message;notice(error.message,true);}
}
$('#token-toggle').addEventListener('click',()=>{ $('#admin-token').value=adminToken;$('#access-dialog').showModal(); });
$('#access-form').addEventListener('submit',(event)=>{
  if(event.submitter&&event.submitter.value==='save'){event.preventDefault();adminToken=$('#admin-token').value.trim();sessionStorage.setItem(tokenKey,adminToken);$('#access-dialog').close();notice('Admin token saved for this browser session.');}
});
$('#stop-game').addEventListener('click',async()=>{
  try{await api('/api/admin/games/stop',{method:'POST',body:'{}'});notice('Current session stopped.');await refresh();}
  catch(error){notice(error.message,true);}
});
$('#mission-form').addEventListener('submit',async(event)=>{
  event.preventDefault();const data=Object.fromEntries(new FormData(event.currentTarget).entries());
  data.target=Number(data.target);data.rewardCoins=Number(data.rewardCoins);data.rewardXp=Number(data.rewardXp);
  try{await api('/api/admin/missions',{method:'POST',body:JSON.stringify(data)});event.currentTarget.reset();notice('Community mission created.');await refresh();}
  catch(error){notice(error.message,true);}
});
const socketUrl=(location.protocol==='https:'?'wss://':'ws://')+location.host+'/ws';
let socket;
function connectSocket(){
  socket=new WebSocket(socketUrl);
  socket.addEventListener('message',(event)=>{
    try{const message=JSON.parse(event.data);if(message.type==='state'){$('#active-game').textContent=message.payload.game?message.payload.game.name:'Idle';$('#participant-count').textContent=message.payload.playerCount||0;$('#phase-pill').textContent=message.payload.phase.toUpperCase();}else if(message.type==='notice')notice(message.payload.text||'');else if(message.type==='mission-completed')notice('Mission completed: '+message.payload.title);else if(message.type==='youtube-stats')renderYouTubeStats(message.payload);}
    catch(_){}
  });
  socket.addEventListener('close',()=>setTimeout(connectSocket,3000));
}
connectSocket();refresh();setInterval(refresh,12000);
