'use strict';
const crypto = require('node:crypto');
const { safeId } = require('./security');
const ITEMS = [
  {id:'timber',name:'Aurora Timber',category:'crafting',type:'material',price:12,description:'A known crafting material.'},
  {id:'stone',name:'Moonstone',category:'crafting',type:'material',price:15,description:'A known crafting material.'},
  {id:'spark',name:'Lumen Spark',category:'crafting',type:'material',price:20,description:'A known crafting material.'},
  {id:'violet-title',name:'Violet Pioneer',category:'identity',type:'title',slot:'title',price:80,description:'A profile title.'},
  {id:'aurora-frame',name:'Aurora Frame',category:'identity',type:'frame',slot:'frame',price:180,description:'A cosmetic profile frame.'},
  {id:'cyan-name',name:'Cyan Nameplate',category:'identity',type:'nameplate',slot:'nameplate',price:120,description:'A cosmetic nameplate.'},
  {id:'portal-trail',name:'Portal Trail',category:'effects',type:'effect',slot:'effect',price:260,description:'A visual overlay effect.'},
  {id:'rocket-badge',name:'Rocket Badge',category:'collectibles',type:'collectible',price:100,description:'A permanent collection item.'},
  {id:'pixel-crown',name:'Pixel Crown',category:'collectibles',type:'collectible',price:320,unlockLevel:2,description:'A community progression collectible.'},
  {id:'memory-hint',name:'Memory Hint',category:'equipment',type:'utility',price:65,description:'One optional hint token; never guarantees a win.'},
  {id:'pattern-hint',name:'Pattern Hint',category:'equipment',type:'utility',price:65,description:'One optional hint token; never guarantees a win.'},
  {id:'season-aurora',name:'Aurora Season Mark',category:'seasonal',type:'collectible',price:450,unlockLevel:3,description:'A season collection mark.'}
];
const RECIPES = [
  {id:'craft-aurora-frame',output:'aurora-frame',ingredients:{timber:3,spark:2}},
  {id:'craft-portal-trail',output:'portal-trail',ingredients:{stone:2,spark:3}},
  {id:'craft-rocket-badge',output:'rocket-badge',ingredients:{timber:2,stone:2}}
];
class UltraStore {
  constructor(db){this.db=db;}
  catalog(communityLevel){const level=Number(communityLevel||1);return ITEMS.filter((item)=>!item.unlockLevel||item.unlockLevel<=level);}
  inventory(userId){return this.db.all('SELECT item_id,quantity,equipped,acquired_at FROM inventory WHERE user_id=? AND quantity>0 ORDER BY acquired_at DESC',[safeId(userId)]);}
  purchase(user,itemId,communityLevel,idempotencyKey){
    const item=ITEMS.find((entry)=>entry.id===itemId);if(!item)throw new Error('Unknown store item.');
    if(item.unlockLevel&&item.unlockLevel>Number(communityLevel||1))throw new Error('This item is locked by community progression.');
    return this.db.transaction(()=>{
      const profile=this.db.ensureUser(user);const idempotency=String(idempotencyKey||('store-buy:'+crypto.randomUUID()));
      const prior=this.db.get('SELECT id,user_id,reference,balance_after FROM transactions WHERE idempotency_key=?',[idempotency]);
      if(prior){if(prior.user_id!==profile.id||prior.reference!==item.id)throw new Error('Idempotency key conflict.');return{item:item,balance:Number(prior.balance_after),applied:false};}
      const balance=Number(this.db.get('SELECT balance FROM wallets WHERE user_id=?',[profile.id]).balance);
      if(balance<item.price)throw new Error('Not enough Infinity Coins.');
      const next=balance-item.price;
      this.db.run('UPDATE wallets SET balance=? WHERE user_id=?',[next,profile.id]);
      this.db.run('INSERT INTO transactions(id,idempotency_key,user_id,kind,amount,balance_after,reference,created_at) VALUES(?,?,?,?,?,?,?,?)',
        [crypto.randomUUID(),idempotency,profile.id,'store-purchase',-item.price,next,item.id,Date.now()]);
      this.db.run('INSERT INTO inventory(user_id,item_id,quantity,equipped,acquired_at) VALUES(?,?,1,0,?) ON CONFLICT(user_id,item_id) DO UPDATE SET quantity=inventory.quantity+1',
        [profile.id,item.id,Date.now()]);
      return {item:item,balance:next,applied:true};
    });
  }
  equip(userId,itemId){
    const item=ITEMS.find((entry)=>entry.id===itemId&&entry.slot);if(!item)throw new Error('This item cannot be equipped.');
    return this.db.transaction(()=>{
      const owned=this.db.get('SELECT quantity FROM inventory WHERE user_id=? AND item_id=?',[safeId(userId),itemId]);
      if(!owned||owned.quantity<1)throw new Error('You do not own this item.');
      for(const entry of ITEMS.filter((candidate)=>candidate.slot===item.slot))this.db.run('UPDATE inventory SET equipped=0 WHERE user_id=? AND item_id=?',[userId,entry.id]);
      this.db.run('UPDATE inventory SET equipped=1 WHERE user_id=? AND item_id=?',[userId,itemId]);
      return {equipped:itemId,slot:item.slot};
    });
  }
  craft(userId,recipeId,idempotencyKey){
    const recipe=RECIPES.find((entry)=>entry.id===recipeId);if(!recipe)throw new Error('Unknown crafting recipe.');
    return this.db.transaction(()=>{
      const operationKey=idempotencyKey?String(idempotencyKey):null;
      if(operationKey&&this.db.get('SELECT id FROM event_log WHERE id=?',[operationKey]))return{recipe:recipe.id,output:recipe.output,applied:false};
      for(const itemId of Object.keys(recipe.ingredients)){
        const row=this.db.get('SELECT quantity FROM inventory WHERE user_id=? AND item_id=?',[safeId(userId),itemId]);
        if(!row||row.quantity<recipe.ingredients[itemId])throw new Error('Missing crafting materials.');
      }
      if(operationKey)this.db.run('INSERT INTO event_log(id,event_type,created_at,payload) VALUES(?,?,?,?)',[operationKey,'store:craft',Date.now(),JSON.stringify({userId:userId,recipeId:recipe.id})]);
      for(const itemId of Object.keys(recipe.ingredients))this.db.run('UPDATE inventory SET quantity=quantity-? WHERE user_id=? AND item_id=?',[recipe.ingredients[itemId],userId,itemId]);
      this.db.run('INSERT INTO inventory(user_id,item_id,quantity,equipped,acquired_at) VALUES(?,?,1,0,?) ON CONFLICT(user_id,item_id) DO UPDATE SET quantity=inventory.quantity+1',
        [safeId(userId),recipe.output,Date.now()]);
      return {recipe:recipe.id,output:recipe.output,applied:true};
    });
  }
  recipes(){return RECIPES.map((recipe)=>({id:recipe.id,output:recipe.output,ingredients:recipe.ingredients}));}
  item(itemId){return ITEMS.find((entry)=>entry.id===itemId)||null;}
}
module.exports={UltraStore,ITEMS,RECIPES};
