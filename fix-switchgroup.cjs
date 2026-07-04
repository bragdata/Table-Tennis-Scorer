const fs = require('fs');
let c = fs.readFileSync('src/App.jsx', 'utf8');
c = c.replace(
  `<Button variant="ghost" onClick={() => setScreen('history')} style={{ padding: '8px 14px', fontSize: 13 }}>
            History
          </Button>
        </div>`,
  `<div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
            <Button variant="ghost" onClick={handleLogout} style={{ padding: '8px 14px', fontSize: 13 }}>Log out</Button>
            <Button variant="ghost" onClick={() => setScreen('groups')} style={{ padding: '8px 14px', fontSize: 13 }}>Switch group</Button>
            <Button variant="ghost" onClick={() => setScreen('history')} style={{ padding: '8px 14px', fontSize: 13 }}>History</Button>
          </div>
        </div>`
);
fs.writeFileSync('src/App.jsx', c);
console.log('Switch group:', c.includes('Switch group') ? 'YES' : 'NO');