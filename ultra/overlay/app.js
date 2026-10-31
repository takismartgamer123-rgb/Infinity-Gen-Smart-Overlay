'use strict';
const $=(selector)=>document.querySelector(selector);
function node(tag,className,text){const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=String(text);return el;}
function renderState(state){
  const grid=$('#game-state');grid.replaceChildren();
  Object.entries(state||{}).slice(0,8).forEach(([key,value])=>{
    const card=node('div','state-item');card.append(node('small','',key.replace(/([A-Z])/g,' $1')));
    let shown=Array.isArray(value)?value.join(' '):(typeof value==='object'&&value!==null?JSON.stringify(value):value);
    if(typeof shown==='boolean')shown=shown?'YES':'NO';
    card.append(node('strong','',shown===undefined?'—':shown));grid.append(card);
  });
}
function renderMissions(missions){
  const list=$('#mission-list');list.replaceChildren();
  (missions||[]).filter((mission)=>mission.status==='active').slice(0,4).forEach((mission)=>{
    const wrap=node('div','mission');wrap.append(node('strong','',mission.title));wrap.append(node('p','',mission.description));
    const track=node('div','track');const fill=node('div','fill');fill.style.width=Math.min(100,Math.round(mission.progress/mission.target*100))+'%';track.append(fill);wrap.append(track);
    wrap.append(node('div','pct',''+mission.progress+' / '+mission.target));list.append(wrap);
  });
}
function socketConnect(){
  const protocol=location.protocol==='https:'?'wss://':'ws://';const socket=new WebSocket(protocol+location.host+'/ws');
  socket.addEventListener('open',()=>{$('#live-state').textContent='LIVE CONNECTION';});
  socket.addEventListener('close',()=>{$('#live-state').textContent='RECONNECTING';setTimeout(socketConnect,2500);});
  socket.addEventListener('message',(event)=>{
    try{
      const message=JSON.parse(event.data);
      if(message.type==='state'){
        const data=message.payload;const game=data.game||{};
        $('#phase').textContent=(data.phase||'idle').toUpperCase()+' / COMMUNITY PLAY';
        $('#game-emoji').textContent=game.emoji||'♾️';$('#game-name').textContent=game.name||'Play Together';
        $('#game-arabic').textContent=game.nameAr||'ابنوا العالم معًا';
        $('#description').textContent=game.description||'Sixteen clean community games. One shared adventure.';
        $('#players').textContent=data.playerCount?('PARTICIPANTS  '+data.players.join(' · ')):'Waiting for the next lobby';
        renderState(data.state);
      }
      if(message.type==='missions')renderMissions(message.payload);
      if(message.type==='notice')$('#description').textContent=message.payload.text||'Community update';
      if(message.type==='mission-completed')$('#description').textContent='Mission completed: '+message.payload.title;
    }catch(_){}
  });
}
async function loadInitial(){
  try{
    const response=await fetch('/api/state');const data=await response.json();
    renderMissions(data.missions);$('#level').textContent=String(data.community.level).padStart(2,'0');
    $('#community-progress').textContent=data.community.worldProgress+' / '+data.community.worldTarget+' world actions completed.';
  }catch(_){}
}
socketConnect();loadInitial();
