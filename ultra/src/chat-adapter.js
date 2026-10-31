'use strict';
const { Masterchat, stringify } = require('masterchat');
const { cleanText, safeId } = require('./security');

class YouTubeChatAdapter {
  constructor(config, gameEngine, events) {
    this.config=config;this.gameEngine=gameEngine;this.events=events;this.client=null;this.connected=false;
  }
  isAdmin(authorId,name) {
    if(!this.config.adminChannelIds.length) return false;
    return this.config.adminChannelIds.includes(String(authorId||'')) || this.config.adminChannelIds.includes(String(name||''));
  }
  async start() {
    if(!this.config.youtubeVideoId) {
      this.events.emit('system:warning',{message:'YouTube chat is disabled: YOUTUBE_VIDEO_ID is not configured.'});
      return false;
    }
    const mc=await Masterchat.init(this.config.youtubeVideoId);
    this.client=mc;
    mc.on('chat',(chat)=>{
      try {
        const name=cleanText(chat.authorName||'Viewer',48)||'Viewer';
        const rawId=chat.authorChannelId||chat.authorId||'';
        const id=safeId(rawId)||('name:'+name.toLocaleLowerCase().replace(/\s+/g,'-'));
        const user={id:id,name:name};
        const message=cleanText(stringify(chat.message).trim(),160);
        if(!message)return;
        const admin=this.isAdmin(rawId,name);
        if(admin&&message.startsWith('.start ')){
          const gameId=message.slice(7).trim();
          try {
            this.gameEngine.start(gameId,user);
            this.events.emit('chat:notice',{text:'A new lobby was opened.'});
          } catch(error) { this.events.emit('system:warning',{message:error.message}); }
          return;
        }
        if(admin&&message==='.stop'){this.gameEngine.stop('Stopped by the channel operator.');return;}
        this.gameEngine.handleChat(user,message,chat.id||chat.messageId);
      } catch(error) { this.events.emit('system:warning',{message:'Chat event rejected.',detail:error.message}); }
    });
    mc.on('error',(error)=>{this.connected=false;this.events.emit('chat:connected',{connected:false});this.events.emit('system:warning',{message:'YouTube chat connection error.',detail:error.message||String(error)});});
    mc.listen();
    this.connected=true;
    this.events.emit('chat:connected',{connected:true});
    return true;
  }
  stop() {
    this.connected=false;
    if(this.client&&typeof this.client.close==='function')this.client.close();
    this.client=null;
    this.events.emit('chat:connected',{connected:false});
  }
}
module.exports={YouTubeChatAdapter};
