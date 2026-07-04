const fs = require('fs');
let c = fs.readFileSync('src/App.jsx', 'utf8');

// Add InviteCodeSection component before GroupsScreen
const inviteComponent = `
function InviteCodeSection({ org, userId }) {
  const [code, setCode] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const generate = async () => {
    setLoading(true);
    try {
      const result = await callEdgeFunction('invite-code', { organizationId: org.id, userId });
      setCode(result.code);
    } catch (e) { setCode('Error - try again'); }
    setLoading(false);
  };
  return (
    React.createElement('div', { style: { background: '#1D3027', borderRadius: '0 0 14px 14px', padding: '12px 16px', border: '1px solid #2C4439', borderTop: 'none' } },
      code
        ? React.createElement(React.Fragment, null,
            React.createElement('div', { style: { fontFamily: "Fraunces, serif", fontSize: 32, letterSpacing: 8, color: '#D9F23D', textAlign: 'center', padding: '8px 0' } }, code),
            React.createElement('p', { style: { color: '#9FB3A8', fontSize: 11, textAlign: 'center', margin: '0 0 10px' } }, 'Share this code — anyone with it can join ' + org.name + '. Expires when you generate a new one.'),
            React.createElement('button', { onClick: generate, style: { width: '100%', padding: '8px 0', fontSize: 13, background: 'transparent', border: '1px solid #2C4439', borderRadius: 10, color: '#9FB3A8', cursor: 'pointer' } }, 'Generate new code')
          )
        : React.createElement('button', { onClick: generate, disabled: loading, style: { width: '100%', padding: '8px 0', fontSize: 13, background: '#1D3027', border: '1px solid #2C4439', borderRadius: 10, color: '#F2F7F0', cursor: 'pointer' } },
            loading ? 'Generating...' : '+ Invite someone to ' + org.name
          )
    )
  );
}
`;

// Insert before GroupsScreen
c = c.replace('function GroupsScreen({', inviteComponent + 'function GroupsScreen({');

// Add InviteCodeSection under each group card in GroupsScreen
c = c.replace(
  `          <div style={{ color: COLORS.accent, fontSize: 24, fontWeight: 700 }}>→</div>
        </div>
      ))}`,
  `          <div style={{ color: COLORS.accent, fontSize: 24, fontWeight: 700 }}>→</div>
        </div>
        {(org.role === 'owner' || org.role === 'admin') && (
          React.createElement(InviteCodeSection, { org, userId: account.accountId })
        )}
      </div>
      ))}`,
);

fs.writeFileSync('src/App.jsx', c);
console.log('InviteCodeSection:', c.includes('InviteCodeSection') ? 'YES' : 'NO');