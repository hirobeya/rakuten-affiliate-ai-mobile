'use strict';require('node:fs').writeFileSync(require('node:path').join(__dirname,'../public/room-evaluation-version.json'),JSON.stringify({version:require('../lib/room-semantic-engine').VERSION}));
