'use strict';
const deny=()=>{throw new Error('P3A_EXTERNAL_COMMUNICATION_DISABLED');};
global.fetch=async()=>deny();global.WebSocket=class {constructor(){deny();}};
for(const n of ['node:http','node:https']){const m=require(n);m.request=m.get=deny;}
const net=require('node:net');net.connect=net.createConnection=net.Socket.prototype.connect=deny;
require('node:tls').connect=deny;
const dgram=require('node:dgram');dgram.createSocket=deny;
const dns=require('node:dns');for(const k of ['lookup','resolve','resolve4','resolve6']){dns[k]=deny;dns.promises[k]=async()=>deny();}
const http2=require('node:http2');http2.connect=deny;
