'use strict';
const crypto=require('node:crypto');
const {cleanText,safeId}=require('./security');

class CommunityCommands {
  constructor(services){this.services=services;}
  notify(text){this.services.events.emit('chat:notice',{text:cleanText(text,280)});}
  communityLevel(){
    const world=this.services.missions.list().find((mission)=>mission.scope==='world');
    return 1+Math.floor(Number(world?world.progress:0)/100);
  }
  handle(user,message,messageId){
    const text=String(message||'').trim();
    const parts=text.split(/\s+/);
    const command=(parts[0]||'').toLowerCase();
    const arg=(parts[1]||'').trim();
    if(!['!profile','!store','!buy','!inventory','!equip','!craft','!missions','!achievements'].includes(command))return false;
    try{
      const id=safeId(user.id);const player={id:id,name:cleanText(user.name,48)||'Viewer'};
      this.services.db.ensureUser(player);
      if(command==='!profile'){
        const profile=this.services.economy.profile(id);
        this.notify(player.name+'  •  Level '+profile.level+'  •  '+profile.xp+' XP  •  '+profile.balance+' IC');
      }
      if(command==='!store'){
        const products=this.services.store.catalog(this.communityLevel()).slice(0,10);
        this.notify('ULTRA STORE: '+products.map((item)=>item.id+' ('+item.price+' IC)').join('  |  '));
      }
      if(command==='!buy'){
        if(!arg)throw new Error('Usage: !buy item-id');
        const result=this.services.store.purchase(player,arg,this.communityLevel(),'chat-buy:'+(messageId||crypto.randomUUID()));
        this.notify(result.applied===false?'This purchase message was already processed.':'Purchased '+result.item.name+' for '+result.item.price+' IC. Balance: '+result.balance+' IC.');
      }
      if(command==='!inventory'){
        const inventory=this.services.store.inventory(id);
        const lines=inventory.map((entry)=>{const item=this.services.store.item(entry.item_id);return item?item.name+' ×'+entry.quantity+(entry.equipped?' [EQUIPPED]':''):entry.item_id+' ×'+entry.quantity;});
        this.notify(lines.length?'INVENTORY: '+lines.join('  |  '):'Your inventory is empty. Earn IC and visit !store.');
      }
      if(command==='!equip'){
        if(!arg)throw new Error('Usage: !equip item-id');
        const result=this.services.store.equip(id,arg);
        const item=this.services.store.item(arg);
        this.notify('Equipped '+(item?item.name:arg)+' in the '+result.slot+' slot.');
      }
      if(command==='!craft'){
        if(!arg)throw new Error('Usage: !craft recipe-id');
        const result=this.services.store.craft(id,arg,'chat-craft:'+(messageId||crypto.randomUUID()));
        this.notify(result.applied===false?'This crafting message was already processed.':'Crafted '+result.output+'. Check !inventory.');
      }
      if(command==='!missions'){
        const active=this.services.missions.list().filter((mission)=>mission.status==='active').slice(0,4);
        this.notify(active.length?'MISSIONS: '+active.map((mission)=>mission.title+' '+mission.progress+'/'+mission.target).join('  |  '):'No active community missions right now.');
      }
      if(command==='!achievements'){
        const unlocked=this.services.progression.forUser(id);
        this.notify(unlocked.length?'UNLOCKED ACHIEVEMENTS: '+unlocked.map((entry)=>entry.achievement_id).join(', '):'No achievements unlocked yet. Keep contributing!');
      }
    }catch(error){this.notify(error.message);}
    return true;
  }
}
module.exports={CommunityCommands};
