'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createCanvas, registerFont } = require('canvas');
const { cleanText } = require('./security');

class AuroraRenderer {
  constructor() {
    this.width=1920;this.height=1080;
    try {
      const fontPath=path.resolve('./fonts/Cairo-Bold.ttf');
      if(fs.existsSync(fontPath))registerFont(fontPath,{family:'Cairo'});
    } catch (_) {}
  }
  render(snapshot,missions,stats) {
    const canvas=createCanvas(this.width,this.height);const ctx=canvas.getContext('2d');
    const w=this.width;const h=this.height;
    const background=ctx.createLinearGradient(0,0,w,h);
    background.addColorStop(0,'#090713');background.addColorStop(0.55,'#17102b');background.addColorStop(1,'#07171d');
    ctx.fillStyle=background;ctx.fillRect(0,0,w,h);
    ctx.globalAlpha=0.16;ctx.fillStyle='#8B5CF6';ctx.beginPath();ctx.arc(300,220,340,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#53DDE0';ctx.beginPath();ctx.arc(1640,820,400,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
    this.panel(ctx,60,45,1800,100,'#8B5CF6');
    ctx.fillStyle='#F5F3FF';ctx.font='bold 42px Cairo, Arial';ctx.textAlign='left';ctx.fillText('INFINITY GEN ULTRA',100,108);
    ctx.fillStyle='#53DDE0';ctx.font='24px Arial';ctx.textAlign='right';ctx.fillText('POWERED BY GAMMA AURORA',1815,105);
    this.panel(ctx,80,190,1160,760,'#8B5CF6');
    this.panel(ctx,1280,190,560,450,'#53DDE0');
    this.panel(ctx,1280,680,560,270,'#C084FC');
    if(snapshot.phase==='idle'){
      ctx.fillStyle='#F5F3FF';ctx.font='bold 64px Cairo, Arial';ctx.textAlign='center';ctx.fillText('PLAY TOGETHER',660,390);
      ctx.fillStyle='#A78BFA';ctx.font='34px Arial';ctx.fillText('Build a world with the community',660,455);
      ctx.fillStyle='#53DDE0';ctx.font='26px Arial';ctx.fillText('16 COMMUNITY GAMES  •  SHARED MISSIONS  •  ULTRA STORE',660,570);
      ctx.fillStyle='#B8B2CC';ctx.font='24px Arial';ctx.fillText('Join the live chat and type !join when a lobby opens.',660,650);
    } else {
      const game=snapshot.game||{};
      ctx.fillStyle='#A78BFA';ctx.font='26px Arial';ctx.textAlign='left';ctx.fillText(snapshot.phase.toUpperCase(),125,250);
      ctx.fillStyle='#F5F3FF';ctx.font='bold 52px Cairo, Arial';ctx.fillText(cleanText(game.name||'Community Game',60),125,330);
      ctx.fillStyle='#53DDE0';ctx.font='34px Cairo, Arial';ctx.fillText(cleanText(game.nameAr||'',50),125,385);
      this.renderState(ctx,snapshot.state||{},125,475,1060);
      ctx.fillStyle='#A78BFA';ctx.font='26px Arial';ctx.fillText('PARTICIPANTS  '+String(snapshot.playerCount||0),125,890);
      if(snapshot.phase==='lobby'){ctx.fillStyle='#F5F3FF';ctx.fillText('Type !join to join the community lobby.',125,935);}
    }
    ctx.fillStyle='#F5F3FF';ctx.font='bold 30px Arial';ctx.textAlign='left';ctx.fillText('COMMUNITY MISSIONS',1320,250);
    const shown=(missions||[]).filter((m)=>m.status==='active').slice(0,3);
    shown.forEach((m,i)=>{
      const y=320+i*95;const pct=Math.min(100,Math.round((m.progress/m.target)*100));
      ctx.fillStyle='#E9E4F8';ctx.font='23px Arial';ctx.fillText(cleanText(m.title,42),1320,y);
      ctx.fillStyle='#36294f';ctx.fillRect(1320,y+18,460,13);ctx.fillStyle='#53DDE0';ctx.fillRect(1320,y+18,460*pct/100,13);
      ctx.fillStyle='#AFA7C7';ctx.font='18px Arial';ctx.fillText(m.progress+'/'+m.target,1320,y+58);
    });
    ctx.fillStyle='#F5F3FF';ctx.font='bold 28px Arial';ctx.fillText('COMMUNITY',1320,745);
    const worldMission=(missions||[]).find((m)=>m.scope==='world');
    const communityLevel=1+Math.floor(Number(worldMission?worldMission.progress:0)/100);
    ctx.fillStyle='#53DDE0';ctx.font='bold 52px Arial';ctx.fillText('LEVEL '+String(communityLevel),1320,820);
    ctx.fillStyle='#B8B2CC';ctx.font='22px Arial';ctx.fillText('Every verified action moves us forward.',1320,875);
    const channelStats=stats&&stats.channel||{};const videoStats=stats&&stats.video||{};
    const count=(value)=>value===null||value===undefined?'—':Number(value).toLocaleString('en-US');
    const subscribers=channelStats.subscriberCountHidden?'Hidden':count(channelStats.subscriberCount);
    ctx.fillStyle='#F5F3FF';ctx.font='bold 19px Arial';ctx.fillText('YOUTUBE LIVE STATS',1320,900);
    ctx.fillStyle='#AFA7C7';ctx.font='17px Arial';
    ctx.fillText('SUBS '+subscribers+'  •  CHANNEL VIEWS '+count(channelStats.viewCount)+'  •  VIDEOS '+count(channelStats.videoCount),1320,923,470);
    ctx.fillText('LIVE '+count(videoStats.concurrentViewers)+'  •  VIDEO '+count(videoStats.viewCount)+' VIEWS  •  LIKES '+count(videoStats.likeCount),1320,944,470);
    this.panel(ctx,60,985,1800,55,'#8B5CF6');
    ctx.fillStyle='#BDB6D0';ctx.font='20px Arial';ctx.textAlign='center';ctx.fillText('GAMMA AURORA  •  NO PAY-TO-WIN  •  NO PAID RANDOM REWARDS  •  COMMUNITY FIRST',960,1021);
    return canvas.toBuffer('image/png');
  }
  panel(ctx,x,y,w,h,accent) {
    ctx.fillStyle='rgba(18,13,34,0.88)';ctx.fillRect(x,y,w,h);
    ctx.strokeStyle=accent;ctx.lineWidth=3;ctx.strokeRect(x,y,w,h);
  }
  renderState(ctx,state,x,y,maxWidth) {
    const entries=[];
    for(const [key,value] of Object.entries(state)){
      if(Array.isArray(value))entries.push(key.toUpperCase()+': '+value.map((v)=>typeof v==='object'?JSON.stringify(v):String(v)).join('  ').slice(0,100));
      else if(value!==null&&typeof value==='object')entries.push(key.toUpperCase()+': '+Object.entries(value).map(([k,v])=>k+' '+v).join('  '));
      else entries.push(key.toUpperCase()+': '+String(value));
    }
    ctx.textAlign='left';let lineY=y;
    for(const entry of entries.slice(0,9)){
      ctx.fillStyle='#EDE9FE';ctx.font='28px Arial';
      const line=cleanText(entry,105);
      ctx.fillText(line,x,lineY,maxWidth);lineY+=62;
    }
  }
}
module.exports={AuroraRenderer};
