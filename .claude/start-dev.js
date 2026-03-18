// Bootstrap script to ensure correct Node version in PATH and module resolution
const path = require('path');
const nodeDir = path.dirname(process.execPath);
process.env.PATH = nodeDir + ':' + (process.env.PATH || '');
process.env.NODE_PATH = '/Users/Junaid/Documents/apex-terminal/node_modules';

// Now start next dev
require('/Users/Junaid/Documents/apex-terminal/node_modules/next/dist/bin/next');
