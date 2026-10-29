'use strict';
global.fetch=async()=>{throw new Error('External network disabled for baseline audit');};
for(const name of ['node:http','node:https']){const m=require(name);m.request=m.get=()=>{throw new Error('External network disabled for baseline audit');};}
for(const name of ['node:net','node:tls']){const m=require(name);m.connect=m.createConnection=()=>{throw new Error('External network disabled for baseline audit');};}
