const fs = require('fs');
let c = fs.readFileSync('src/App.jsx', 'utf8');

c = c.replace(
  `callRest(
      \`memberships?select=role,organizations(id,name)&account_id=eq.\${account.accountId}\`,
      { accessToken: account.accessToken },
    ).then((rows) => {
      setOrganizations(rows.map((r) => ({ id: r.organizations.id, name: r.organizations.name, role: r.role })));
    }).catch(() => setOrganizations([]));`,
  `callEdgeFunction('get-groups', { userId: account.accountId })
      .then((groups) => setOrganizations(groups))
      .catch(() => setOrganizations([]));`
);

c = c.replace(
  `const [org] = await callRest('organizations', {
      method: 'POST', accessToken: account.accessToken,
      body: { name, created_by: account.accountId },
    });
    setOrganizations((prev) => [...prev, { id: org.id, name: org.name, role: 'owner' }]);
    setActiveOrg({ id: org.id, name: org.name, role: 'owner' });`,
  `const org = await callEdgeFunction('create-org', { name, userId: account.accountId });
    setOrganizations((prev) => [...prev, { id: org.id, name: org.name, role: org.role }]);
    setActiveOrg({ id: org.id, name: org.name, role: org.role });`
);

fs.writeFileSync('src/App.jsx', c);
console.log('done - lines changed: ' + (c.includes('create-org') ? 'YES' : 'NO'));