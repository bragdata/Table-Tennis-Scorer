import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';

/* ---------------------------------------------------------------------- */
/* Rotation scheduling engine (mirrors lib/rotationScheduler.ts)          */
/* ---------------------------------------------------------------------- */

function freshTally() {
  return {
    gamesPlayed: 0, sitOuts: 0, leftCount: 0, rightCount: 0,
    partneredWith: new Map(), opposedTo: new Map(), satOutWith: new Map(),
  };
}
const getCount = (m, k) => m.get(k) ?? 0;
const bump = (m, k) => m.set(k, getCount(m, k) + 1);

function teamSplits(four) {
  const [a, b, c, d] = four;
  return [[[a, b], [c, d]], [[a, c], [b, d]], [[a, d], [b, c]]];
}
function chooseFour(pool) {
  const res = [];
  const n = pool.length;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++)
    for (let k = j + 1; k < n; k++) for (let l = k + 1; l < n; l++)
      res.push([pool[i], pool[j], pool[k], pool[l]]);
  return res;
}
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
function scoreCandidate(four, split, sittingOut, tallies) {
  let score = 0;
  const [teamA, teamB] = split;
  for (const p of sittingOut) {
    const t = tallies.get(p);
    score -= t.gamesPlayed * 2;
    score += t.sitOuts * 3;
  }
  for (let i = 0; i < sittingOut.length; i++)
    for (let j = i + 1; j < sittingOut.length; j++)
      score += getCount(tallies.get(sittingOut[i]).satOutWith, sittingOut[j]) ** 3 * 15;
  for (const p of four) score += tallies.get(p).gamesPlayed;
  const pairPenalty = (x, y) => getCount(tallies.get(x).partneredWith, y) ** 3 * 12;
  score += pairPenalty(teamA[0], teamA[1]) + pairPenalty(teamB[0], teamB[1]);
  const oppPenalty = (x, y) => getCount(tallies.get(x).opposedTo, y) ** 3 * 6;
  for (const x of teamA) for (const y of teamB) score += oppPenalty(x, y);
  return score;
}
function assignEnds(teamA, teamB, tallies) {
  const leftDeficit = (team) => team.reduce((sum, p) => {
    const t = tallies.get(p);
    return sum + (t.rightCount - t.leftCount);
  }, 0);
  return leftDeficit(teamA) >= leftDeficit(teamB)
    ? { endA: 'left', endB: 'right' } : { endA: 'right', endB: 'left' };
}
function applyResult(game, tallies) {
  const { teamA, teamB, endA, endB, sittingOut } = game;
  for (const p of sittingOut) tallies.get(p).sitOuts += 1;
  for (let i = 0; i < sittingOut.length; i++)
    for (let j = i + 1; j < sittingOut.length; j++) {
      bump(tallies.get(sittingOut[i]).satOutWith, sittingOut[j]);
      bump(tallies.get(sittingOut[j]).satOutWith, sittingOut[i]);
    }
  for (const p of [...teamA, ...teamB]) tallies.get(p).gamesPlayed += 1;
  bump(tallies.get(teamA[0]).partneredWith, teamA[1]);
  bump(tallies.get(teamA[1]).partneredWith, teamA[0]);
  bump(tallies.get(teamB[0]).partneredWith, teamB[1]);
  bump(tallies.get(teamB[1]).partneredWith, teamB[0]);
  for (const x of teamA) for (const y of teamB) { bump(tallies.get(x).opposedTo, y); bump(tallies.get(y).opposedTo, x); }
  if (endA === 'left') { tallies.get(teamA[0]).leftCount++; tallies.get(teamA[1]).leftCount++; }
  else { tallies.get(teamA[0]).rightCount++; tallies.get(teamA[1]).rightCount++; }
  if (endB === 'left') { tallies.get(teamB[0]).leftCount++; tallies.get(teamB[1]).leftCount++; }
  else { tallies.get(teamB[0]).rightCount++; tallies.get(teamB[1]).rightCount++; }
}
function generateNextGames(players, count, existingTallies, startingGameNumber = 1) {
  const tallies = existingTallies ?? new Map(players.map((p) => [p, freshTally()]));
  for (const p of players) if (!tallies.has(p)) tallies.set(p, freshTally());
  const games = [];
  for (let i = 0; i < count; i++) {
    const numSitOut = players.length % 4 === 0 ? 0 : players.length - 4 * Math.floor(players.length / 4);
    const sorted = [...players];
    sorted.sort((a, b) => {
      const ta = tallies.get(a), tb = tallies.get(b);
      return (tb.gamesPlayed - tb.sitOuts * 3) - (ta.gamesPlayed - ta.sitOuts * 3);
    });
    const t0 = tallies.get(sorted[0]);
    const need0 = t0.gamesPlayed - t0.sitOuts * 3;
    const topBand = sorted.filter((p) => {
      const t = tallies.get(p);
      return need0 - (t.gamesPlayed - t.sitOuts * 3) <= 1;
    });
    shuffle(topBand);
    const rest = sorted.filter((p) => !topBand.includes(p));
    const candidateOrder = [...topBand, ...rest];
    const sittingOut = candidateOrder.slice(0, numSitOut);
    const pool = players.filter((p) => !sittingOut.includes(p));
    const fours = pool.length === 4 ? [pool] : chooseFour(pool);
    const candidates = [];
    for (const four of fours) for (const split of teamSplits(four))
      candidates.push({ four, split, score: scoreCandidate(four, split, sittingOut, tallies) });
    candidates.sort((a, b) => a.score - b.score);
    const bestScore = candidates[0].score;
    const nearBest = candidates.filter((c) => c.score <= bestScore + 2);
    const best = nearBest[Math.floor(Math.random() * nearBest.length)];
    const [teamA, teamB] = best.split;
    const { endA, endB } = assignEnds(teamA, teamB, tallies);
    const game = { gameNumber: startingGameNumber + i, teamA, teamB, endA, endB, sittingOut, scoreA: 0, scoreB: 0, status: 'pending' };
    applyResult(game, tallies);
    games.push(game);
  }
  return { games, tallies };
}
function balancedCycleLength(n) { return ({ 4: 6, 5: 10, 6: 12 })[n] ?? null; }
function nextBalancedStop(numPlayers, currentGameNumber) {
  const cycleLength = balancedCycleLength(numPlayers);
  if (!cycleLength) return null;
  const completed = currentGameNumber - 1;
  const cyclesSoFar = Math.floor(completed / cycleLength);
  const nextStopGame = (cyclesSoFar + 1) * cycleLength;
  return { nextStopGame, gamesRemaining: nextStopGame - completed, cycleLength, exact: numPlayers <= 5 };
}

/**
 * Builds the service rotation pattern for a game, shown to players as
 * reference only — the app never tracks or enforces whose serve it
 * actually is in real time.
 *
 * Singles: each player serves 2 points, alternating, until 10-10, then
 * serve alternates every point.
 *
 * Doubles: fixed 4-step rotation — A1 serves to B1, then B1 serves to A2,
 * then A2 serves to B2, then B2 serves to A1, repeating. Same "every point"
 * rule applies past 10-10. The receiving order within a team never changes
 * across the whole game, per the standard rules.
 */
function buildServeSchedule(type, teamA, teamB) {
  if (type === 'singles') {
    return {
      kind: 'singles',
      steps: [
        { server: teamA[0], receiver: teamB[0] },
        { server: teamB[0], receiver: teamA[0] },
      ],
      note: '2 points per server, alternating. From 10–10, serve switches every point.',
    };
  }
  const [a1, a2] = teamA;
  const [b1, b2] = teamB;
  return {
    kind: 'doubles',
    steps: [
      { server: a1, receiver: b1 },
      { server: b1, receiver: a2 },
      { server: a2, receiver: b2 },
      { server: b2, receiver: a1 },
    ],
    note: '2 points per server, in this order, repeating. From 10–10, serve switches every single point but follows the same rotation order.',
  };
}

/* ---------------------------------------------------------------------- */
/* UI                                                                      */
/* ---------------------------------------------------------------------- */

const COLORS = {
  bg: '#0F1B17',
  surface: '#16261F',
  surfaceRaised: '#1D3027',
  line: '#2C4439',
  accent: '#D9F23D',
  accentDim: '#8FA63A',
  textPrimary: '#F2F7F0',
  textDim: '#9FB3A8',
  teamA: '#5FD0C0',
  teamB: '#E8946B',
};

function Button({ children, onClick, variant = 'primary', disabled, style }) {
  const base = {
    fontFamily: "'Space Grotesk', sans-serif",
    fontWeight: 600,
    fontSize: 15,
    padding: '14px 22px',
    borderRadius: 10,
    border: 'none',
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.4 : 1,
    transition: 'transform 0.08s ease',
  };
  const variants = {
    primary: { background: COLORS.accent, color: '#11200F' },
    secondary: { background: COLORS.surfaceRaised, color: COLORS.textPrimary, border: `1px solid ${COLORS.line}` },
    ghost: { background: 'transparent', color: COLORS.textDim, border: `1px solid ${COLORS.line}` },
  };
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.97)'; }}
      onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
      style={{ ...base, ...variants[variant], ...style }}
    >
      {children}
    </button>
  );
}

function Chip({ children, active, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: '8px 16px', borderRadius: 999, cursor: 'pointer',
        background: active ? COLORS.accent : COLORS.surfaceRaised,
        color: active ? '#11200F' : COLORS.textPrimary,
        border: `1px solid ${active ? COLORS.accent : COLORS.line}`,
        fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 14,
        userSelect: 'none',
      }}
    >
      {children}
    </div>
  );
}

const ROSTER_SEED = ['Mick', 'Lee', 'Alan', 'Bruno', 'Sam', 'Tom'];

/* ---------------------------------------------------------------------- */
/* Supabase wiring — plain fetch, no supabase-js (not available in this   */
/* artifact sandbox). Replace these two constants once your project is    */
/* live (Project Settings → API).                                        */
/* ---------------------------------------------------------------------- */
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

async function callEdgeFunction(name, body) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

async function callRest(path, { method = 'GET', accessToken, body } = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
      Prefer: method === 'POST' ? 'return=representation' : undefined,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || data.error || 'Request failed');
  return data;
}

async function callRpc(fnName, { accessToken, args }) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fnName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(args),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || data.error || 'Request failed');
  return data;
}

/* Persist the logged-in account locally (artifact storage, not localStorage)
 * so people don't have to log in again every time they reopen the app. */
async function saveAuthLocally(account) {
  try { localStorage.setItem('auth:account', JSON.stringify(account)); } catch (e) { /* ignore */ }
}
async function loadAuthLocally() {
  try {
    const raw = localStorage.getItem('auth:account');
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
async function clearAuthLocally() {
  try { localStorage.removeItem('auth:account'); } catch (e) { /* ignore */ }
}

/* ---------------------------------------------------------------------- */
/* Persistent session storage (per-user, not shared)                      */
/* ---------------------------------------------------------------------- */

async function saveSessionRecord(record) {
  try {
    localStorage.setItem(`session:${record.id}`, JSON.stringify(record));
  } catch (e) { console.error('Failed to save session', e); }
}

async function loadAllSessionRecords() {
  try {
    const records = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith('session:')) continue;
      try { records.push(JSON.parse(localStorage.getItem(key))); } catch (e) { /* skip */ }
    }
    return records.sort((a, b) => a.completedAt - b.completedAt);
  } catch (e) { return []; }
}
}

/** Per-player { avgPoints, winRate, gamesPlayed } for one stored session record. */
function computeSessionPlayerStats(record) {
  const stats = {};
  if (record.type === 'singles') {
    const [p1, p2] = record.players;
    const games = record.history || [];
    for (const p of [p1, p2]) stats[p] = { points: 0, wins: 0, played: 0 };
    for (const h of games) {
      stats[p1].points += h.pointsA; stats[p1].played += 1; if (h.winner === 'a') stats[p1].wins += 1;
      stats[p2].points += h.pointsB; stats[p2].played += 1; if (h.winner === 'b') stats[p2].wins += 1;
    }
  } else if (record.type === 'rotation_doubles') {
    for (const p of record.players) stats[p] = { points: 0, wins: 0, played: 0 };
    for (const g of record.games || []) {
      for (const p of g.teamA) { stats[p].points += g.scoreA; stats[p].played += 1; if (g.winner === 'a') stats[p].wins += 1; }
      for (const p of g.teamB) { stats[p].points += g.scoreB; stats[p].played += 1; if (g.winner === 'b') stats[p].wins += 1; }
    }
  }
  const result = {};
  for (const [p, s] of Object.entries(stats)) {
    if (s.played === 0) continue;
    result[p] = { avgPoints: s.points / s.played, winRate: s.wins / s.played, gamesPlayed: s.played };
  }
  return result;
}

const TREND_COLORS = [COLORS.teamA, COLORS.teamB, COLORS.accent, '#A78BFA', '#F472B6', '#60A5FA'];

/** Maps internal 'left'/'right' end values to a display label. Tapping the
 * net cycles through four label states: N/S, S/N, E/W, W/E — purely a
 * label preference, doesn't change which physical end anyone is on. */
const END_ORIENTATIONS = ['ns', 'sn', 'ew', 'we'];
function endLabel(side, orientation) {
  const pairs = { ns: ['N', 'S'], sn: ['S', 'N'], ew: ['E', 'W'], we: ['W', 'E'] };
  const [leftLabel, rightLabel] = pairs[orientation] ?? pairs.ns;
  return side === 'left' ? leftLabel : rightLabel;
}

export default function App() {
  const [screen, setScreen] = useState('loading'); // loading | login | groups | setup | live | summary | history
  const [account, setAccount] = useState(null); // { accountId, displayName, accessToken }
  const [organizations, setOrganizations] = useState([]); // groups the account belongs to
  const [activeOrg, setActiveOrg] = useState(null); // { id, name, role }
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  useEffect(() => {
    loadAuthLocally().then((saved) => {
      if (saved) { setAccount(saved); setScreen('groups'); }
      else setScreen('login');
    });
  }, []);

  useEffect(() => {
    if (!account) return;
    callRest(
      `memberships?select=role,organizations(id,name)&account_id=eq.${account.accountId}`,
      { accessToken: account.accessToken },
    ).then((rows) => {
      setOrganizations(rows.map((r) => ({ id: r.organizations.id, name: r.organizations.name, role: r.role })));
    }).catch(() => setOrganizations([]));
  }, [account]);

  const handleSignup = async (email, password, displayName) => {
    setAuthError(''); setAuthLoading(true);
    try {
      await callEdgeFunction('signup', { email, password, displayName });
      const result = await callEdgeFunction('login', { email, password });
      const acc = { accountId: result.accountId, displayName: result.displayName, accessToken: result.accessToken };
      setAccount(acc); saveAuthLocally(acc); setScreen('groups');
    } catch (e) { setAuthError(e.message); }
    setAuthLoading(false);
  };

  const handleLogin = async (email, password) => {
    setAuthError(''); setAuthLoading(true);
    try {
      const result = await callEdgeFunction('login', { email, password });
      const acc = { accountId: result.accountId, displayName: result.displayName, accessToken: result.accessToken };
      setAccount(acc); saveAuthLocally(acc); setScreen('groups');
    } catch (e) { setAuthError(e.message); }
    setAuthLoading(false);
  };

  const handleLogout = () => {
    clearAuthLocally();
    setAccount(null); setActiveOrg(null); setOrganizations([]);
    setScreen('login');
  };

  const createOrganization = async (name) => {
    const [org] = await callRest('organizations', {
      method: 'POST', accessToken: account.accessToken,
      body: { name, created_by: account.accountId },
    });
    setOrganizations((prev) => [...prev, { id: org.id, name: org.name, role: 'owner' }]);
    setActiveOrg({ id: org.id, name: org.name, role: 'owner' });
    setScreen('setup');
  };

  const joinOrganization = async (code) => {
    const [result] = await callRpc('join_organization', { accessToken: account.accessToken, args: { invite_code: code } });
    const org = { id: result.organization_id, name: result.organization_name, role: 'member' };
    setOrganizations((prev) => [...prev, org]);
    setActiveOrg(org);
    setScreen('setup');
  };
  const [historyRecords, setHistoryRecords] = useState([]);
  const [selectedTrendPlayers, setSelectedTrendPlayers] = useState([]);
  const savedThisSessionRef = useRef(false);

  useEffect(() => {
    loadAllSessionRecords().then(setHistoryRecords);
  }, []);
  const [roster, setRoster] = useState(ROSTER_SEED);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [matchType, setMatchType] = useState('rotation_doubles'); // singles | rotation_doubles
  const [selectedPlayers, setSelectedPlayers] = useState(['Mick', 'Lee', 'Alan', 'Bruno']);
  const [bestOf, setBestOf] = useState(3);
  const [lengthMode, setLengthMode] = useState('flowing'); // fixed | flowing
  const [fixedCount, setFixedCount] = useState(6);

  const [session, setSession] = useState(null); // { type, games: [], tallies, current }
  const [endOrientation, setEndOrientation] = useState('ns'); // cycles: ns -> sn -> ew -> we -> ns
  const toggleEndOrientation = () => setEndOrientation((o) => {
    const idx = END_ORIENTATIONS.indexOf(o);
    return END_ORIENTATIONS[(idx + 1) % END_ORIENTATIONS.length];
  });

  const togglePlayer = (p) => {
    setSelectedPlayers((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]);
  };
  const addPlayer = () => {
    const name = newPlayerName.trim();
    if (!name || roster.includes(name)) return;
    setRoster((r) => [...r, name]);
    setSelectedPlayers((s) => [...s, name]);
    setNewPlayerName('');
  };

  const canStart = matchType === 'singles' ? selectedPlayers.length === 2 : selectedPlayers.length >= 4;

  const startSession = () => {
    savedThisSessionRef.current = false;
    if (matchType === 'singles') {
      const [p1, p2] = selectedPlayers;
      setSession({
        type: 'singles', bestOf,
        teamA: [p1], teamB: [p2],
        gamesA: 0, gamesB: 0,
        pointsA: 0, pointsB: 0,
        history: [], // completed games for this match
        finished: false,
      });
    } else {
      const initialBatch = lengthMode === 'fixed' ? fixedCount : 6;
      const { games, tallies } = generateNextGames(selectedPlayers, initialBatch);
      setSession({
        type: 'rotation_doubles', players: selectedPlayers, lengthMode, fixedCount,
        games, tallies, currentIndex: 0,
      });
    }
    setScreen('live');
  };

  /* ---------------- Singles scoring (entered at end of game) ---------------- */
  const [draftWinnerS, setDraftWinnerS] = useState(null); // 'a' | 'b' | null
  const [draftWinnerScoreS, setDraftWinnerScoreS] = useState(11);
  const [draftLoserScoreS, setDraftLoserScoreS] = useState(0);
  const draftValid = draftWinnerS !== null;

  const declareWinnerS = (side) => {
    setDraftWinnerS(side);
    setDraftWinnerScoreS(11);
    setDraftLoserScoreS(0);
  };

  const submitSinglesGame = () => {
    if (!draftValid) return;
    const a = draftWinnerS === 'a' ? draftWinnerScoreS : draftLoserScoreS;
    const b = draftWinnerS === 'b' ? draftWinnerScoreS : draftLoserScoreS;
    setSession((s) => {
      const next = { ...s };
      next.history = [...next.history, { pointsA: a, pointsB: b, winner: draftWinnerS }];
      if (draftWinnerS === 'a') next.gamesA += 1; else next.gamesB += 1;
      const gamesToWin = Math.ceil(next.bestOf / 2);
      if (next.gamesA === gamesToWin || next.gamesB === gamesToWin) next.finished = true;
      return next;
    });
    setDraftWinnerS(null); setDraftWinnerScoreS(11); setDraftLoserScoreS(0);
  };

  /* ---------------- Rotation doubles scoring (entered at end of game) ---------------- */
  const [draftWinnerR, setDraftWinnerR] = useState(null); // 'a' | 'b' | null
  const [draftWinnerScoreR, setDraftWinnerScoreR] = useState(11);
  const [draftLoserScoreR, setDraftLoserScoreR] = useState(0);
  const draftRotValid = draftWinnerR !== null;

  const declareWinnerR = (side) => {
    setDraftWinnerR(side);
    setDraftWinnerScoreR(11);
    setDraftLoserScoreR(0);
  };

  const submitRotationGame = () => {
    if (!draftRotValid) return;
    const scoreA = draftWinnerR === 'a' ? draftWinnerScoreR : draftLoserScoreR;
    const scoreB = draftWinnerR === 'b' ? draftWinnerScoreR : draftLoserScoreR;
    setSession((s) => {
      const games = [...s.games];
      const g = { ...games[s.currentIndex] };
      g.scoreA = scoreA; g.scoreB = scoreB;
      g.status = 'completed';
      g.winner = draftWinnerR;
      games[s.currentIndex] = g;
      let { tallies, currentIndex, lengthMode: lm } = s;
      const nextIndex = currentIndex + 1;
      let allGames = games;
      if (nextIndex >= allGames.length && lm === 'flowing') {
        const { games: more } = generateNextGames(s.players, 6, tallies, allGames.length + 1);
        allGames = [...allGames, ...more];
      }
      return { ...s, games: allGames, currentIndex: nextIndex };
    });
    setDraftWinnerR(null); setDraftWinnerScoreR(11); setDraftLoserScoreR(0);
  };

  /* ---------------- Player point totals for rotation summary ---------------- */
  const rotationTotals = useMemo(() => {
    if (!session || session.type !== 'rotation_doubles') return null;
    const totals = new Map(session.players.map((p) => [p, { points: 0, wins: 0, played: 0 }]));
    for (const g of session.games) {
      if (g.status !== 'completed') continue;
      for (const p of g.teamA) {
        const t = totals.get(p); t.points += g.scoreA; t.played += 1; if (g.winner === 'a') t.wins += 1;
      }
      for (const p of g.teamB) {
        const t = totals.get(p); t.points += g.scoreB; t.played += 1; if (g.winner === 'b') t.wins += 1;
      }
    }
    return totals;
  }, [session]);

  useEffect(() => {
    if (screen !== 'summary' || !session || savedThisSessionRef.current) return;
    savedThisSessionRef.current = true;

    const record = {
      id: `${Date.now()}`,
      completedAt: Date.now(),
      type: session.type,
    };

    if (session.type === 'singles') {
      record.players = [session.teamA[0], session.teamB[0]];
      record.bestOf = session.bestOf;
      record.history = session.history; // [{ pointsA, pointsB, winner }]
      record.finalGames = { a: session.gamesA, b: session.gamesB };
      record.teamA = session.teamA;
      record.teamB = session.teamB;
    } else if (session.type === 'rotation_doubles') {
      record.players = session.players;
      record.games = session.games
        .filter((g) => g.status === 'completed')
        .map((g) => ({
          gameNumber: g.gameNumber, teamA: g.teamA, teamB: g.teamB,
          scoreA: g.scoreA, scoreB: g.scoreB, winner: g.winner,
        }));
    }

    saveSessionRecord(record).then(() => {
      loadAllSessionRecords().then(setHistoryRecords);
    });
  }, [screen, session]);

  /* ====================================================================== */
  /* SCREEN: SETUP                                                           */
  /* ====================================================================== */
  /* ====================================================================== */
  /* SCREEN: LOADING                                                         */
  /* ====================================================================== */
  if (screen === 'loading') {
    return <Shell><p style={{ color: COLORS.textDim, textAlign: 'center', marginTop: 60 }}>Loading…</p></Shell>;
  }

  /* ====================================================================== */
  /* SCREEN: LOGIN / SIGNUP                                                  */
  /* ====================================================================== */
  if (screen === 'login') {
    return (
      <LoginScreen
        onLogin={handleLogin}
        onSignup={handleSignup}
        error={authError}
        loading={authLoading}
      />
    );
  }

  /* ====================================================================== */
  /* SCREEN: GROUPS (pick / create / join)                                  */
  /* ====================================================================== */
  if (screen === 'groups') {
    return (
      <GroupsScreen
        account={account}
        organizations={organizations}
        onSelectOrg={(org) => { setActiveOrg(org); setScreen('setup'); }}
        onCreateOrg={createOrganization}
        onJoinOrg={joinOrganization}
        onLogout={handleLogout}
      />
    );
  }

  if (screen === 'setup') {
    return (
      <Shell>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 32, color: COLORS.textPrimary, margin: '0 0 4px' }}>
              New session
            </h1>
            <p style={{ color: COLORS.textDim, margin: '0 0 28px', fontSize: 15 }}>Set up who's playing and how.</p>
          </div>
          <Button variant="ghost" onClick={() => setScreen('history')} style={{ padding: '8px 14px', fontSize: 13 }}>
            History
          </Button>
        </div>

        <SectionLabel>Match type</SectionLabel>
        <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
          <Chip active={matchType === 'singles'} onClick={() => setMatchType('singles')}>Singles</Chip>
          <Chip active={matchType === 'rotation_doubles'} onClick={() => setMatchType('rotation_doubles')}>Rotation doubles</Chip>
        </div>

        <SectionLabel>{matchType === 'singles' ? 'Pick 2 players' : 'Pick 4 or more players'}</SectionLabel>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
          {roster.map((p) => (
            <Chip key={p} active={selectedPlayers.includes(p)} onClick={() => togglePlayer(p)}>{p}</Chip>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 28 }}>
          <input
            value={newPlayerName}
            onChange={(e) => setNewPlayerName(e.target.value)}
            placeholder="Add new player"
            style={{
              flex: 1, background: COLORS.surface, border: `1px solid ${COLORS.line}`,
              borderRadius: 8, padding: '10px 12px', color: COLORS.textPrimary, fontSize: 14,
              fontFamily: "'Space Grotesk', sans-serif",
            }}
            onKeyDown={(e) => e.key === 'Enter' && addPlayer()}
          />
          <Button variant="secondary" onClick={addPlayer}>Add</Button>
        </div>

        {matchType === 'singles' ? (
          <>
            <SectionLabel>Format</SectionLabel>
            <div style={{ display: 'flex', gap: 10, marginBottom: 28 }}>
              <Chip active={bestOf === 3} onClick={() => setBestOf(3)}>Best of 3</Chip>
              <Chip active={bestOf === 5} onClick={() => setBestOf(5)}>Best of 5</Chip>
            </div>
          </>
        ) : (
          <>
            <SectionLabel>Session length</SectionLabel>
            <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
              <Chip active={lengthMode === 'flowing'} onClick={() => setLengthMode('flowing')}>Flowing — end whenever</Chip>
              <Chip active={lengthMode === 'fixed'} onClick={() => setLengthMode('fixed')}>Fixed number of games</Chip>
            </div>
            {lengthMode === 'fixed' && (
              <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                {[6, 9, 12].map((n) => (
                  <Chip key={n} active={fixedCount === n} onClick={() => setFixedCount(n)}>{n} games</Chip>
                ))}
              </div>
            )}
            {selectedPlayers.length === 4 && (
              <p style={{ color: COLORS.textDim, fontSize: 13, marginBottom: 28 }}>
                With 4 players, the schedule fully balances every 6 games — we'll flag those points live.
              </p>
            )}
          </>
        )}

        <Button onClick={startSession} disabled={!canStart} style={{ width: '100%', fontSize: 17, padding: '16px 0' }}>
          Start session
        </Button>
      </Shell>
    );
  }

  /* ====================================================================== */
  /* SCREEN: LIVE — SINGLES                                                  */
  /* ====================================================================== */
  if (screen === 'live' && session?.type === 'singles') {
    const { teamA, teamB, gamesA, gamesB, finished } = session;
    const serveSchedule = buildServeSchedule('singles', teamA, teamB);
    const gamesPlayedSoFar = session.history.length;
    const singlesEndA = gamesPlayedSoFar % 2 === 0 ? 'left' : 'right'; // ends swap each game
    return (
      <Shell>
        <TopBar onSummary={() => setScreen('summary')} title={`Best of ${session.bestOf} · Singles`} />
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, margin: '4px 0 20px' }}>
          {Array.from({ length: session.history.length }).map((_, i) => (
            <Dot key={i} color={session.history[i].winner === 'a' ? COLORS.teamA : COLORS.teamB} />
          ))}
        </div>

        {!finished && (
          <>
            <TableDiagram
              leftSlots={singlesEndA === 'left' ? [teamA[0]] : [teamB[0]]}
              rightSlots={singlesEndA === 'left' ? [teamB[0]] : [teamA[0]]}
              leftColor={singlesEndA === 'left' ? COLORS.teamA : COLORS.teamB}
              rightColor={singlesEndA === 'left' ? COLORS.teamB : COLORS.teamA}
              server={serveSchedule.steps[0].server}
              endOrientation={endOrientation}
              onToggleOrientation={toggleEndOrientation}
            />
            <SectionLabel>Enter final score for this game</SectionLabel>
            <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
              <WinEntryPane
                name={teamA[0]} games={gamesA} color={COLORS.teamA}
                winnerChosen={draftWinnerS !== null} isWinner={draftWinnerS === 'a'}
                winnerScore={draftWinnerScoreS} onWinnerScoreChange={setDraftWinnerScoreS}
                loserScore={draftLoserScoreS} onLoserScoreChange={setDraftLoserScoreS}
                onDeclareWinner={() => declareWinnerS('a')}
              />
              <WinEntryPane
                name={teamB[0]} games={gamesB} color={COLORS.teamB}
                winnerChosen={draftWinnerS !== null} isWinner={draftWinnerS === 'b'}
                winnerScore={draftWinnerScoreS} onWinnerScoreChange={setDraftWinnerScoreS}
                loserScore={draftLoserScoreS} onLoserScoreChange={setDraftLoserScoreS}
                onDeclareWinner={() => declareWinnerS('b')}
              />
            </div>
            {draftWinnerS !== null && (
              <Button variant="ghost" onClick={() => { setDraftWinnerS(null); setDraftWinnerScoreS(11); setDraftLoserScoreS(0); }} style={{ width: '100%', marginBottom: 10 }}>
                Change winner
              </Button>
            )}
            <Button onClick={submitSinglesGame} disabled={!draftValid} style={{ width: '100%' }}>
              {draftValid ? 'Save game →' : 'Tap WON on the winning side'}
            </Button>
          </>
        )}

        {finished && (
          <div style={{ marginTop: 28, textAlign: 'center' }}>
            <p style={{ color: COLORS.accent, fontFamily: "'Fraunces', serif", fontSize: 22, margin: '0 0 14px' }}>
              {gamesA > gamesB ? teamA[0] : teamB[0]} wins the match {Math.max(gamesA, gamesB)}–{Math.min(gamesA, gamesB)}
            </p>
            <Button onClick={() => setScreen('summary')}>View summary</Button>
          </div>
        )}
      </Shell>
    );
  }

  /* ====================================================================== */
  /* SCREEN: LIVE — ROTATION DOUBLES                                        */
  /* ====================================================================== */
  if (screen === 'live' && session?.type === 'rotation_doubles') {
    const g = session.games[session.currentIndex];
    const sessionComplete = session.lengthMode === 'fixed' && session.currentIndex >= session.games.length;

    if (sessionComplete) {
      return (
        <Shell>
          <TopBar onSummary={() => setScreen('summary')} title="Session complete" />
          <div style={{ textAlign: 'center', marginTop: 60 }}>
            <p style={{ color: COLORS.accent, fontFamily: "'Fraunces', serif", fontSize: 24, marginBottom: 18 }}>
              All {session.games.length} games played
            </p>
            <Button onClick={() => setScreen('summary')}>View final standings</Button>
          </div>
        </Shell>
      );
    }

    const serveSchedule = buildServeSchedule('doubles', g.teamA, g.teamB);

    return (
      <Shell>
        <TopBar onSummary={() => setScreen('summary')} title={`Game ${g.gameNumber} of ${session.lengthMode === 'fixed' ? session.fixedCount : '∞'}`} />

        <BalancedGameStrip currentGame={g.gameNumber} numPlayers={session.players.length} />

        <TableDiagram
          leftSlots={g.endA === 'left' ? g.teamA : g.teamB}
          rightSlots={g.endA === 'left' ? [...g.teamB].reverse() : [...g.teamA].reverse()}
          leftColor={g.endA === 'left' ? COLORS.teamA : COLORS.teamB}
          rightColor={g.endA === 'left' ? COLORS.teamB : COLORS.teamA}
          sittingOut={g.sittingOut}
          server={serveSchedule.steps[0].server}
          endOrientation={endOrientation}
          onToggleOrientation={toggleEndOrientation}
        />

        <SectionLabel>Enter final score for this game</SectionLabel>
        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
          <WinEntryPane
            name={`${g.teamA[0]} + ${g.teamA[1]}`} sub={`${endLabel(g.endA, endOrientation)} end`} color={COLORS.teamA}
            winnerChosen={draftWinnerR !== null} isWinner={draftWinnerR === 'a'}
            winnerScore={draftWinnerScoreR} onWinnerScoreChange={setDraftWinnerScoreR}
            loserScore={draftLoserScoreR} onLoserScoreChange={setDraftLoserScoreR}
            onDeclareWinner={() => declareWinnerR('a')}
          />
          <WinEntryPane
            name={`${g.teamB[0]} + ${g.teamB[1]}`} sub={`${endLabel(g.endB, endOrientation)} end`} color={COLORS.teamB}
            winnerChosen={draftWinnerR !== null} isWinner={draftWinnerR === 'b'}
            winnerScore={draftWinnerScoreR} onWinnerScoreChange={setDraftWinnerScoreR}
            loserScore={draftLoserScoreR} onLoserScoreChange={setDraftLoserScoreR}
            onDeclareWinner={() => declareWinnerR('b')}
          />
        </div>
        {draftWinnerR !== null && (
          <Button variant="ghost" onClick={() => { setDraftWinnerR(null); setDraftWinnerScoreR(11); setDraftLoserScoreR(0); }} style={{ width: '100%', marginBottom: 10 }}>
            Change winner
          </Button>
        )}

        {g.sittingOut.length > 0 && (
          <p style={{ textAlign: 'center', color: COLORS.textDim, fontSize: 13, marginBottom: 14 }}>
            Sitting out: {g.sittingOut.join(', ')}
          </p>
        )}

        <Button onClick={submitRotationGame} disabled={!draftRotValid} style={{ width: '100%' }}>
          {draftRotValid ? 'Save game →' : 'Tap WON on the winning side'}
        </Button>

        <Schedule session={session} />
      </Shell>
    );
  }

  /* ====================================================================== */
  /* SCREEN: SUMMARY                                                         */
  /* ====================================================================== */
  if (screen === 'summary') {
    return (
      <Shell>
        <TopBar onSummary={null} title="Session summary" />
        {session?.type === 'singles' ? (
          <>
            <p style={{ color: COLORS.textPrimary, fontSize: 17, marginBottom: 18 }}>
              {session.teamA[0]} vs {session.teamB[0]} — {session.gamesA}–{session.gamesB}
            </p>
            {session.history.map((h, i) => (
              <div key={i} style={{ color: COLORS.textDim, fontSize: 14, marginBottom: 6 }}>
                Game {i + 1}: {h.pointsA}–{h.pointsB} ({h.winner === 'a' ? session.teamA[0] : session.teamB[0]})
              </div>
            ))}
          </>
        ) : session?.type === 'rotation_doubles' ? (
          <>
            <SectionLabel>Leaderboard</SectionLabel>
            {[...rotationTotals.entries()]
              .sort((a, b) => b[1].points - a[1].points)
              .map(([name, t], i) => (
                <div key={name} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '12px 4px', borderBottom: `1px solid ${COLORS.line}`,
                }}>
                  <span style={{ color: COLORS.textPrimary, fontWeight: 600 }}>{i + 1}. {name}</span>
                  <span style={{ color: COLORS.textDim, fontSize: 13 }}>{t.played} games · {t.wins} wins</span>
                  <span style={{ color: COLORS.accent, fontFamily: "'Fraunces', serif", fontSize: 20 }}>{t.points} pts</span>
                </div>
              ))}
          </>
        ) : (
          <p style={{ color: COLORS.textDim }}>No session yet.</p>
        )}
        <Button variant="secondary" style={{ marginTop: 24 }} onClick={() => { setSession(null); setScreen('setup'); }}>
          New session
        </Button>
      </Shell>
    );
  }

  /* ====================================================================== */
  /* SCREEN: HISTORY & TRENDS                                                */
  /* ====================================================================== */
  if (screen === 'history') {
    const sorted = [...historyRecords].sort((a, b) => a.completedAt - b.completedAt);
    const allPlayers = [...new Set(sorted.flatMap((r) => r.players))];
    const activeTrendPlayers = selectedTrendPlayers.length ? selectedTrendPlayers : allPlayers.slice(0, 4);

    const chartData = sorted.map((rec, i) => {
      const perPlayer = computeSessionPlayerStats(rec);
      const row = { session: `#${i + 1}`, dateLabel: new Date(rec.completedAt).toLocaleDateString() };
      for (const p of activeTrendPlayers) {
        row[p] = perPlayer[p] ? Math.round(perPlayer[p].avgPoints * 10) / 10 : null;
      }
      return row;
    });

    return (
      <Shell>
        <TopBar onSummary={null} title="History & trends" />
        <Button variant="ghost" onClick={() => setScreen('setup')} style={{ marginBottom: 18 }}>← Back to setup</Button>

        {sorted.length === 0 ? (
          <p style={{ color: COLORS.textDim }}>No completed sessions yet — finish a session to start building history.</p>
        ) : (
          <>
            <SectionLabel>Average points per game, by session</SectionLabel>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
              {allPlayers.map((p) => (
                <Chip
                  key={p}
                  active={activeTrendPlayers.includes(p)}
                  onClick={() => setSelectedTrendPlayers((prev) => {
                    const base = prev.length ? prev : allPlayers.slice(0, 4);
                    return base.includes(p) ? base.filter((x) => x !== p) : [...base, p];
                  })}
                >
                  {p}
                </Chip>
              ))}
            </div>

            <div style={{
              background: COLORS.surfaceRaised, border: `1px solid ${COLORS.line}`, borderRadius: 14,
              padding: '12px 8px', marginBottom: 26, height: 240,
            }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                  <CartesianGrid stroke={COLORS.line} strokeDasharray="3 3" />
                  <XAxis dataKey="session" stroke={COLORS.textDim} fontSize={11} />
                  <YAxis stroke={COLORS.textDim} fontSize={11} />
                  <Tooltip contentStyle={{ background: COLORS.surface, border: `1px solid ${COLORS.line}`, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {activeTrendPlayers.map((p, i) => (
                    <Line
                      key={p} type="monotone" dataKey={p} stroke={TREND_COLORS[i % TREND_COLORS.length]}
                      strokeWidth={2} dot={{ r: 3 }} connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>

            <SectionLabel>Past sessions</SectionLabel>
            {sorted.slice().reverse().map((rec) => (
              <div key={rec.id} style={{
                padding: '12px 4px', borderBottom: `1px solid ${COLORS.line}`,
                display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
              }}>
                <div>
                  <div style={{ color: COLORS.textPrimary, fontSize: 14, fontWeight: 600 }}>
                    {rec.type === 'singles' ? `${rec.players[0]} vs ${rec.players[1]}` : rec.players.join(', ')}
                  </div>
                  <div style={{ color: COLORS.textDim, fontSize: 12 }}>
                    {rec.type === 'singles' ? 'Singles' : 'Rotation doubles'} · {new Date(rec.completedAt).toLocaleDateString()}
                  </div>
                </div>
                <div style={{ color: COLORS.textDim, fontSize: 12 }}>
                  {rec.type === 'singles' ? `${rec.finalGames.a}–${rec.finalGames.b}` : `${rec.games.length} games`}
                </div>
              </div>
            ))}
          </>
        )}
      </Shell>
    );
  }

  return null;
}

/* ---------------------------------------------------------------------- */
/* Layout primitives                                                       */
/* ---------------------------------------------------------------------- */

function LoginScreen({ onLogin, onSignup, error, loading }) {
  const [mode, setMode] = useState('login'); // login | signup
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');

  const submit = () => {
    if (mode === 'login') onLogin(email, password);
    else onSignup(email, password, displayName);
  };

  return (
    <Shell>
      <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 32, color: COLORS.textPrimary, margin: '40px 0 4px' }}>
        {mode === 'login' ? 'Log in' : 'Create account'}
      </h1>
      <p style={{ color: COLORS.textDim, margin: '0 0 28px', fontSize: 15 }}>
        {mode === 'login' ? 'Email and password.' : 'Name, email and password.'}
      </p>

      {mode === 'signup' && (
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Your name"
          style={inputStyle}
        />
      )}
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email address"
        inputMode="email"
        type="email"
        style={inputStyle}
      />
      <input
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder={mode === 'signup' ? 'Password (min 6 characters)' : 'Password'}
        type="password"
        style={inputStyle}
      />

      {error && <p style={{ color: '#F87171', fontSize: 13, marginBottom: 12 }}>{error}</p>}

      <Button onClick={submit} disabled={loading} style={{ width: '100%', marginBottom: 14 }}>
        {loading ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}
      </Button>

      <Button variant="ghost" style={{ width: '100%' }} onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>
        {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Log in'}
      </Button>
    </Shell>
  );
}
const inputStyle = {
  width: '100%', boxSizing: 'border-box', background: COLORS.surface, border: `1px solid ${COLORS.line}`,
  borderRadius: 8, padding: '12px 14px', color: COLORS.textPrimary, fontSize: 15,
  fontFamily: "'Space Grotesk', sans-serif", marginBottom: 12,
};

function GroupsScreen({ account, organizations, onSelectOrg, onCreateOrg, onJoinOrg, onLogout }) {
  const [newGroupName, setNewGroupName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const create = async () => {
    if (!newGroupName.trim()) return;
    setBusy(true); setErr('');
    try { await onCreateOrg(newGroupName.trim()); } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  const join = async () => {
    if (!joinCode.trim()) return;
    setBusy(true); setErr('');
    try { await onJoinOrg(joinCode.trim()); } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <Shell>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 18 }}>
        <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 28, color: COLORS.textPrimary, margin: 0 }}>
          Hi, {account.displayName}
        </h1>
        <Button variant="ghost" onClick={onLogout} style={{ padding: '8px 14px', fontSize: 13 }}>Log out</Button>
      </div>

      <SectionLabel>Your groups</SectionLabel>
      {organizations.length === 0 && (
        <p style={{ color: COLORS.textDim, fontSize: 14, marginBottom: 18 }}>You're not in any groups yet.</p>
      )}
      {organizations.map((org) => (
        <div
          key={org.id}
          onClick={() => onSelectOrg(org)}
          style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            background: COLORS.surface, border: `1px solid ${COLORS.line}`, borderRadius: 10,
            padding: '14px 16px', marginBottom: 8, cursor: 'pointer',
          }}
        >
          <span style={{ color: COLORS.textPrimary, fontWeight: 600 }}>{org.name}</span>
          <span style={{ color: COLORS.textDim, fontSize: 12 }}>{org.role}</span>
        </div>
      ))}

      {err && <p style={{ color: '#F87171', fontSize: 13, margin: '12px 0' }}>{err}</p>}

      <SectionLabel>Create a new group</SectionLabel>
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <input value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} placeholder="e.g. The Coasters" style={{ ...inputStyle, marginBottom: 0 }} />
        <Button onClick={create} disabled={busy}>Create</Button>
      </div>

      <SectionLabel>Join a group with an invite code</SectionLabel>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={joinCode} onChange={(e) => setJoinCode(e.target.value)} placeholder="Invite code" style={{ ...inputStyle, marginBottom: 0 }} />
        <Button onClick={join} disabled={busy}>Join</Button>
      </div>
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <div style={{
      minHeight: '100vh', background: COLORS.bg, padding: '24px 12px 50px',
      display: 'flex', justifyContent: 'center',
    }}>
      <div style={{ width: '100%', maxWidth: 720 }}>{children}</div>
    </div>
  );
}
function SectionLabel({ children }) {
  return (
    <div style={{
      fontFamily: "'Space Grotesk', sans-serif", fontSize: 12, letterSpacing: '0.08em',
      textTransform: 'uppercase', color: COLORS.accentDim, marginBottom: 10,
    }}>
      {children}
    </div>
  );
}
function TopBar({ title, onSummary }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 18 }}>
      <h2 style={{ fontFamily: "'Fraunces', serif", color: COLORS.textPrimary, fontSize: 22, margin: 0 }}>{title}</h2>
      {onSummary && <Button variant="ghost" onClick={onSummary} style={{ padding: '8px 14px', fontSize: 13 }}>Summary</Button>}
    </div>
  );
}
function BalancedGameStrip({ currentGame, numPlayers }) {
  const cycleLength = balancedCycleLength(numPlayers) ?? 6;
  // Snap to whichever 12-game block the current game falls in, jumping
  // forward a full cycle at a time (1–12, then 7–18, then 13–24, ...)
  // rather than sliding by 1 each game.
  const blockStart = Math.floor((currentGame - 1) / cycleLength) * cycleLength + 1;
  const games = Array.from({ length: 12 }, (_, i) => blockStart + i);
  const rows = [games.slice(0, 6), games.slice(6, 12)];

  return (
    <div style={{ marginBottom: 18 }}>
      <SectionLabel>Even point every {cycleLength} games</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map((row, rowIdx) => (
          <div key={rowIdx} style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
            {row.map((n) => {
              const isBalanced = n % cycleLength === 0;
              const isCurrent = n === currentGame;
              return (
                <div
                  key={n}
                  style={{
                    height: 44, borderRadius: 10, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700,
                    fontSize: 15,
                    background: isBalanced ? COLORS.accent : COLORS.surfaceRaised,
                    color: isBalanced ? '#11200F' : COLORS.textPrimary,
                    border: isCurrent ? `2px solid ${COLORS.textPrimary}` : `1px solid ${COLORS.line}`,
                  }}
                >
                  {n}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
function Dot({ color }) {
  return <div style={{ width: 8, height: 8, borderRadius: 999, background: color }} />;
}
/**
 * Single-box-per-side score entry. Before a winner is picked, each side
 * shows a "WON" button. Once tapped, that side locks to the winning score
 * (11, or higher if the loser's score requires a deuce win-by-2) and the
 * other side becomes an editable loser-score input.
 */
function WinEntryPane({ name, sub, games, color, isWinner, winnerScore, onWinnerScoreChange, loserScore, onLoserScoreChange, onDeclareWinner, winnerChosen }) {
  const decLoser = () => onLoserScoreChange(Math.max(0, loserScore - 1));
  const incLoser = () => onLoserScoreChange(loserScore + 1);
  const decWinner = () => onWinnerScoreChange(Math.max(11, winnerScore - 1));
  const incWinner = () => onWinnerScoreChange(winnerScore + 1);

  return (
    <div style={{
      flex: 1, minWidth: 0, background: COLORS.surface, border: `2px solid ${color}33`, borderRadius: 14,
      padding: '14px 8px', textAlign: 'center', minHeight: 150, display: 'flex',
      flexDirection: 'column', justifyContent: 'space-between', position: 'relative',
    }}>
      {!winnerChosen && (
        <button
          onClick={onDeclareWinner}
          style={{
            position: 'absolute', top: 8, left: 8, background: COLORS.accent, color: '#11200F',
            border: 'none', borderRadius: 8, padding: '5px 10px', fontSize: 11, fontWeight: 700,
            fontFamily: "'Space Grotesk', sans-serif", cursor: 'pointer',
          }}
        >
          WON
        </button>
      )}
      <div>
        <div style={{
          color, fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 13,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: winnerChosen ? 0 : 18,
        }}>{name}</div>
        {sub && <div style={{ color: COLORS.textDim, fontSize: 11, marginTop: 2 }}>{sub}</div>}
        {games !== undefined && <div style={{ color: COLORS.textDim, fontSize: 12, marginTop: 4 }}>Games: {games}</div>}
      </div>

      {!winnerChosen && (
        <div style={{ fontFamily: "'Fraunces', serif", fontSize: 34, color: COLORS.textDim }}>–</div>
      )}

      {winnerChosen && isWinner && (
        <div>
          <div style={{ fontSize: 10, color: COLORS.textDim, marginBottom: 4 }}>Winner — adjust if it went past 11</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <button onClick={decWinner} style={stepperBtnStyle}>–</button>
            <div style={{ width: 44, fontFamily: "'Fraunces', serif", fontSize: 34, color: COLORS.accent }}>{winnerScore}</div>
            <button onClick={incWinner} style={stepperBtnStyle}>+</button>
          </div>
        </div>
      )}

      {winnerChosen && !isWinner && (
        <div>
          <div style={{ fontSize: 10, color: COLORS.textDim, marginBottom: 4 }}>Enter losing score</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <button onClick={decLoser} style={stepperBtnStyle}>–</button>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={String(loserScore)}
              onFocus={(e) => e.target.select()}
              onChange={(e) => {
                const digitsOnly = e.target.value.replace(/[^0-9]/g, '');
                const cleaned = digitsOnly.replace(/^0+(?=\d)/, '');
                onLoserScoreChange(cleaned === '' ? 0 : Math.min(99, parseInt(cleaned, 10)));
              }}
              style={{
                width: 44, textAlign: 'center', fontFamily: "'Fraunces', serif", fontSize: 34,
                background: 'transparent', border: 'none', color: COLORS.textPrimary, outline: 'none',
              }}
            />
            <button onClick={incLoser} style={stepperBtnStyle}>+</button>
          </div>
        </div>
      )}
    </div>
  );
}
const stepperBtnStyle = {
  width: 34, height: 34, flexShrink: 0, borderRadius: 999, border: `1px solid ${COLORS.line}`,
  background: COLORS.surfaceRaised, color: COLORS.textPrimary, fontSize: 18, cursor: 'pointer',
  fontFamily: "'Space Grotesk', sans-serif",
};

function ServeSchedule({ schedule }) {
  return (
    <div style={{
      background: COLORS.surfaceRaised, border: `1px solid ${COLORS.line}`, borderRadius: 10,
      padding: '12px 14px', marginBottom: 18,
    }}>
      <SectionLabel>Serve order (reference only — not tracked live)</SectionLabel>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 8 }}>
        {schedule.steps.map((step, i) => (
          <div key={i} style={{
            fontSize: 13, color: COLORS.textPrimary, background: COLORS.surface,
            border: `1px solid ${COLORS.line}`, borderRadius: 8, padding: '6px 10px',
          }}>
            {i + 1}. <strong>{step.server}</strong> → {step.receiver}
          </div>
        ))}
      </div>
      <p style={{ color: COLORS.textDim, fontSize: 12, margin: 0 }}>{schedule.note}</p>
    </div>
  );
}

/** Builds short, collision-safe initials for a set of names in play together. */
function buildInitialsMap(names) {
  const map = {};
  const used = new Set();
  for (const name of names) {
    let initials = name.slice(0, 1).toUpperCase();
    if (used.has(initials)) initials = name.slice(0, 2).toUpperCase();
    let extra = 3;
    while (used.has(initials) && extra <= name.length) {
      initials = name.slice(0, extra).toUpperCase();
      extra += 1;
    }
    used.add(initials);
    map[name] = initials;
  }
  return map;
}

/**
 * Visual top-down table diagram. leftSlots/rightSlots are ordered arrays of
 * player names occupying that end (1 player for singles, 2 stacked for
 * doubles — order encodes which position each player stands in).
 */
function TableDiagram({ leftSlots, rightSlots, sittingOut = [], leftColor, rightColor, server, endOrientation, onToggleOrientation }) {
  const allNames = [...leftSlots, ...rightSlots, ...sittingOut];
  const initials = buildInitialsMap(allNames);

  const Slot = ({ name, color }) => (
    <div style={{
      width: 64, height: 64, borderRadius: 14, background: COLORS.surface,
      border: `2px solid ${color}`, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 2, position: 'relative',
    }}>
      {name === server && (
        <div style={{
          position: 'absolute', top: -9, left: '50%', transform: 'translateX(-50%)',
          fontSize: 9, background: COLORS.accent, color: '#11200F', borderRadius: 999,
          padding: '2px 7px', fontWeight: 700, whiteSpace: 'nowrap',
        }}>
          SERVES
        </div>
      )}
      <div style={{ fontFamily: "'Fraunces', serif", fontSize: 22, color: COLORS.textPrimary }}>
        {initials[name]}
      </div>
      <div style={{ fontSize: 9, color: COLORS.textDim }}>{name}</div>
    </div>
  );

  return (
    <div style={{ marginBottom: 18 }}>
      <SectionLabel>Table positions</SectionLabel>
      <div style={{
        background: COLORS.surfaceRaised, border: `1px solid ${COLORS.line}`, borderRadius: 16,
        padding: '20px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
      }}>
        {/* Left end — direction label sits to the left, outside the slots */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 700, color: COLORS.accent,
          }}>
            {endLabel('left', endOrientation)}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {leftSlots.map((name) => <Slot key={name} name={name} color={leftColor} />)}
          </div>
        </div>

        {/* Table surface with net — tap to toggle N/S vs E/W labeling */}
        <div
          onClick={onToggleOrientation}
          style={{
            flex: 1, maxWidth: 140, height: 8, background: COLORS.bg, borderRadius: 2,
            position: 'relative', margin: '0 4px', cursor: 'pointer',
          }}
        >
          <div style={{
            position: 'absolute', left: '50%', top: -22, transform: 'translateX(-50%)',
            width: 2, height: 52, background: COLORS.line,
          }} />
          <div style={{
            position: 'absolute', left: '50%', top: 14, transform: 'translateX(-50%)',
            fontSize: 10, color: COLORS.textDim, whiteSpace: 'nowrap',
          }}>net</div>
        </div>

        {/* Right end — direction label sits to the right, outside the slots */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {rightSlots.map((name) => <Slot key={name} name={name} color={rightColor} />)}
          </div>
          <div style={{
            fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 700, color: COLORS.accent,
          }}>
            {endLabel('right', endOrientation)}
          </div>
        </div>
      </div>
      <div style={{ textAlign: 'center', padding: '8px 4px 0', fontSize: 11, color: COLORS.textDim }}>
        Tap the net to cycle N/S, S/N, E/W, W/E
      </div>
      {sittingOut.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: COLORS.textDim }}>Sitting out:</span>
          {sittingOut.map((name) => (
            <div key={name} style={{
              fontSize: 11, color: COLORS.textDim, background: COLORS.surface,
              border: `1px solid ${COLORS.line}`, borderRadius: 999, padding: '4px 10px',
            }}>
              {initials[name]} · {name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
function Schedule({ session }) {
  const upcoming = session.games.slice(session.currentIndex + 1, session.currentIndex + 4);
  if (!upcoming.length) return null;
  return (
    <div style={{ marginTop: 26 }}>
      <SectionLabel>Coming up</SectionLabel>
      {upcoming.map((g) => (
        <div key={g.gameNumber} style={{
          display: 'flex', justifyContent: 'space-between', fontSize: 13,
          color: COLORS.textDim, padding: '8px 4px', borderBottom: `1px solid ${COLORS.line}`,
        }}>
          <span>Game {g.gameNumber}</span>
          <span>{g.teamA.join('+')} ({g.endA}) vs {g.teamB.join('+')} ({g.endB})</span>
          {g.sittingOut.length > 0 && <span>sit out: {g.sittingOut.join(', ')}</span>}
        </div>
      ))}
    </div>
  );
}
