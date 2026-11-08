'use strict';
// Pure build: no credentials, HTTP, Blob, claim or database operations.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../../..');
const report=JSON.parse(fs.readFileSync(path.join(root,'docs/rebuild-20261028/p3-local-first-20261108/evaluation.json'),'utf8'));
fs.writeFileSync(path.join(__dirname,'evaluation.json'),JSON.stringify(report));
