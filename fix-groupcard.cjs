const fs = require('fs');
let c = fs.readFileSync('src/App.jsx', 'utf8');

// Check what the group card currently looks like
const idx = c.indexOf('organizations.map');
console.log('Current map section:', c.substring(idx, idx + 400));