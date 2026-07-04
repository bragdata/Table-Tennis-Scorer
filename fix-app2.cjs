const fs = require('fs');
let c = fs.readFileSync('src/App.jsx', 'utf8');
c = c.replace(
  `const [result] = await callRpc('join_organization', { accessToken: account.accessToken, args: { invite_code: code } });
    const org = { id: result.organization_id, name: result.organization_name, role: 'member' };`,
  `const org = await callEdgeFunction('join-org', { code, userId: account.accountId });`
);
fs.writeFileSync('src/App.jsx', c);
console.log('join-org:', c.includes('join-org') ? 'YES' : 'NO');