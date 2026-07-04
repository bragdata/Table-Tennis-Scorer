const fs = require('fs');
const https = require('https');

// Download the latest App.jsx from Claude's output
const options = {
  hostname: 'byvllkzpvwtjdwjlubol.supabase.co',
};

// Just copy the file content directly
const content = fs.readFileSync('src/App.jsx', 'utf8');
console.log('File size:', content.length);
console.log('Has InviteCodeSection:', content.includes('InviteCodeSection') ? 'YES' : 'NO');
console.log('Has Switch group:', content.includes('Switch group') ? 'YES' : 'NO');
console.log('Has invite-code function:', content.includes("'invite-code'") ? 'YES' : 'NO');