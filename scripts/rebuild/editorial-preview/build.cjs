'use strict';
// Pure build: no credentials, HTTP, Blob, claim or database operations.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../../..');
const report=JSON.parse(fs.readFileSync(path.join(root,'docs/rebuild-20261028/p3-local-first-20261108/evaluation.json'),'utf8'));
const out=path.join(__dirname,'public');fs.mkdirSync(out,{recursive:true});
for(const file of ['index.html','style.css','app.js'])fs.copyFileSync(path.join(__dirname,file),path.join(out,file));
fs.writeFileSync(path.join(out,'evaluation.json'),JSON.stringify(report));
