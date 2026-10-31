'use strict';
const { spawn } = require('node:child_process');

class FFmpegPublisher {
  constructor(config,events) {
    this.config=config;this.events=events;this.process=null;this.enabled=Boolean(config.enablePublisher&&config.publishUrl);
    this.retryTimer=null;this.attempt=0;this.stopping=false;this.stderrTail='';
  }
  start() {
    if(!this.enabled){this.events.emit('publisher:state',{enabled:false,running:false});return false;}
    if(this.process)return true;
    this.stopping=false;
    const args=[
      '-hide_banner','-loglevel','warning',
      '-thread_queue_size','512','-f','image2pipe','-framerate','1','-vcodec','png','-i','pipe:0',
      '-f','lavfi','-i','anullsrc=channel_layout=stereo:sample_rate=44100',
      '-map','0:v:0','-map','1:a:0','-c:v','libx264','-preset','ultrafast','-tune','zerolatency',
      '-pix_fmt','yuv420p','-g','60','-b:v',this.config.ffmpegBitrate,'-maxrate',this.config.ffmpegBitrate,
      '-bufsize','3600k','-c:a','aac','-b:a','96k','-ar','44100','-f','flv',this.config.publishUrl
    ];
    try {
      const child=spawn(this.config.ffmpegPath,args,{stdio:['pipe','ignore','pipe']});
      this.process=child;
      child.stdin.on('error',(error)=>this.events.emit('system:warning',{message:'FFmpeg input pipe error.',detail:error.message}));
      child.stderr.on('data',(chunk)=>{this.stderrTail=(this.stderrTail+chunk.toString()).slice(-4000);});
      child.once('spawn',()=>{this.attempt=0;this.events.emit('publisher:state',{enabled:true,running:true});});
      child.once('error',(error)=>{this.events.emit('system:warning',{message:'FFmpeg could not start.',detail:error.message});});
      child.once('close',(code,signal)=>{
        if(this.process===child)this.process=null;
        this.events.emit('publisher:state',{enabled:true,running:false,code:code,signal:signal,detail:this.stderrTail.slice(-1200)});
        if(!this.stopping)this.scheduleRetry();
      });
      return true;
    } catch(error) {
      this.events.emit('system:warning',{message:'Publisher startup failed.',detail:error.message});
      this.scheduleRetry();return false;
    }
  }
  write(frame) {
    const child=this.process;
    if(!child||!child.stdin||child.stdin.destroyed||child.stdin.writableLength>8*1024*1024)return false;
    try{return child.stdin.write(frame);}catch(_){return false;}
  }
  scheduleRetry() {
    if(this.retryTimer||this.stopping||!this.enabled)return;
    this.attempt++;
    const delay=Math.min(60000,2000*Math.pow(2,Math.min(5,this.attempt-1)));
    this.retryTimer=setTimeout(()=>{this.retryTimer=null;this.start();},delay);
    this.retryTimer.unref?.();
  }
  stop() {
    this.stopping=true;
    if(this.retryTimer)clearTimeout(this.retryTimer);
    this.retryTimer=null;
    if(this.process){const child=this.process;this.process=null;try{child.stdin.end();}catch(_){};setTimeout(()=>{if(!child.killed)child.kill('SIGTERM');},1500).unref?.();}
    this.events.emit('publisher:state',{enabled:this.enabled,running:false,stopping:true});
  }
  status(){return {enabled:this.enabled,running:Boolean(this.process),retrying:Boolean(this.retryTimer),attempt:this.attempt};}
}
module.exports={FFmpegPublisher};
