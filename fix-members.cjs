const fs = require('fs');
let c = fs.readFileSync('src/App.jsx', 'utf8');

// Replace hardcoded roster with dynamic member loading
c = c.replace(
  `const [roster, setRoster] = useState(ROSTER_SEED);`,
  `const [roster, setRoster] = useState([]);
  const [rosterLoading, setRosterLoading] = useState(false);`
);

c = c.replace(
  `const [selectedPlayers, setSelectedPlayers] = useState(['Mick', 'Lee', 'Alan', 'Bruno']);`,
  `const [selectedPlayers, setSelectedPlayers] = useState([]);

  useEffect(() => {
    if (!activeOrg) return;
    setRosterLoading(true);
    callEdgeFunction('get-members', { organizationId: activeOrg.id })
      .then((members) => {
        const names = members.map(m => m.name);
        setRoster(names);
        setSelectedPlayers(names);
      })
      .catch(() => setRoster([]))
      .finally(() => setRosterLoading(false));
  }, [activeOrg?.id]);`
);

fs.writeFileSync('src/App.jsx', c);
console.log('rosterLoading:', c.includes('rosterLoading') ? 'YES' : 'NO');
console.log('get-members:', c.includes("'get-members'") ? 'YES' : 'NO');