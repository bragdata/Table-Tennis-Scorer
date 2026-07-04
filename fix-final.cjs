const fs = require('fs');
const https = require('https');

// Download the latest App.jsx directly from our outputs
const url = 'https://raw.githubusercontent.com/bragdata/Table-Tennis-Scorer/main/src/App.jsx';
console.log('Current file size:', fs.statSync('src/App.jsx').size);
console.log('Has logout button:', fs.readFileSync('src/App.jsx','utf8').includes('Log out') ? 'YES' : 'NO');
console.log('Has Switch group:', fs.readFileSync('src/App.jsx','utf8').includes('Switch group') ? 'YES' : 'NO');