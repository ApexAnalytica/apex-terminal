// Ensure the website's Next dev server runs under the parent Node binary
// (which is Node 20 from nvm) regardless of system PATH.
const path = require('path');
const nodeDir = path.dirname(process.execPath);
process.env.PATH = nodeDir + ':' + (process.env.PATH || '');
process.chdir(__dirname);
process.argv.splice(2, 0, 'dev', '-p', '3100');
require(path.join(__dirname, 'node_modules/next/dist/bin/next'));
