/**
 * Suite de tests unitaires - Node.js pur, zero dependance.
 * Lance avec: node tests/run-tests.js
 */

let passed = 0, failed = 0, total = 0;

function test(name, fn) {
  total++;
  try {
    fn();
    console.log('  PASS  ' + name);
    passed++;
  } catch (e) {
    console.log('  FAIL  ' + name);
    console.log('         ' + e.message);
    failed++;
  }
}

function describe(suite, fn) {
  console.log('\n' + suite);
  fn();
}

function expect(val) {
  return {
    toBe: (expected) => {
      if (val !== expected) throw new Error('Expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(val));
    },
    toBeGreaterThan: (n) => {
      if (!(val > n)) throw new Error('Expected ' + val + ' > ' + n);
    },
    toBeLessThan: (n) => {
      if (!(val < n)) throw new Error('Expected ' + val + ' < ' + n);
    },
    toBeTruthy: () => {
      if (!val) throw new Error('Expected truthy, got ' + JSON.stringify(val));
    },
    toBeFalsy: () => {
      if (val) throw new Error('Expected falsy, got ' + JSON.stringify(val));
    },
  };
}

// ── Reproductions minimales des fonctions ───────────────────────────────────

const STATUS_CATALOG = [
  { id: 'backlog',   name: 'Backlog',     color: '#94a3b8' },
  { id: 'todo',      name: 'A faire',     color: '#6b7280' },
  { id: 'ready',     name: 'Pret',        color: '#3b82f6' },
  { id: 'doing',     name: 'En cours',    color: '#d97706' },
  { id: 'review',    name: 'En revue',    color: '#7c3aed' },
  { id: 'testing',   name: 'A tester',    color: '#ea580c' },
  { id: 'staging',   name: 'En recette',  color: '#0891b2' },
  { id: 'blocked',   name: 'Bloque',      color: '#1f2937' },
  { id: 'waiting',   name: 'En attente',  color: '#f59e0b' },
  { id: 'done',      name: 'Termine',     color: '#16a34a' },
  { id: 'delivered', name: 'Livre',       color: '#0d9488' },
  { id: 'cancelled', name: 'Annule',      color: '#dc2626' },
];

function makeIsDoneStatus(kanbanColumns) {
  return function isDoneStatus(statusId) {
    if (!statusId) return false;
    const DONE_IDS = ['done', 'delivered'];
    if (DONE_IDS.includes(statusId)) return true;
    const cols = kanbanColumns;
    const col = cols.find(c => c.id === statusId);
    if (!col) return false;
    if (!STATUS_CATALOG.find(c => c.id === statusId)) {
      return cols[cols.length - 1]?.id === statusId;
    }
    return false;
  };
}

function makeStatusInfo(kanbanColumns) {
  return function statusInfo(statusId) {
    const col = kanbanColumns.find(c => c.id === statusId);
    if (col) return { label: col.name, color: col.color };
    const cat = STATUS_CATALOG.find(c => c.id === statusId);
    if (cat) return { label: cat.name, color: cat.color };
    return { label: statusId || 'Aucun', color: '#94a3b8' };
  };
}

function computePct(checks, total) {
  if (!total) return 0;
  return Math.round(checks.filter(Boolean).length / total * 100);
}

function barColor(pct) {
  return pct === 100 ? 'var(--success)' : pct > 50 ? 'var(--warning)' : 'var(--danger)';
}

function sortClients(clients, field, dir) {
  return [...clients].sort((a, b) => {
    let v;
    if (field === 'caAnnuel') v = (b.caAnnuel || 0) - (a.caAnnuel || 0);
    else if (field === 'tier')  v = (a.tier || 'B').localeCompare(b.tier || 'B');
    else v = (a[field] || '').localeCompare(b[field] || '');
    return dir === 'asc' ? v : -v;
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

const defaultCols = [
  { id: 'todo',  name: 'A faire',  color: '#6b7280' },
  { id: 'doing', name: 'En cours', color: '#d97706' },
  { id: 'done',  name: 'Termine',  color: '#16a34a' },
];
const isDoneStatus = makeIsDoneStatus(defaultCols);
const statusInfo   = makeStatusInfo(defaultCols);

describe('isDoneStatus', () => {
  test('retourne false pour undefined', () => expect(isDoneStatus(undefined)).toBe(false));
  test('retourne false pour null',      () => expect(isDoneStatus(null)).toBe(false));
  test('retourne false pour chaine vide', () => expect(isDoneStatus('')).toBe(false));
  test('"done" est toujours terminal',  () => expect(isDoneStatus('done')).toBe(true));
  test('"delivered" est toujours terminal', () => expect(isDoneStatus('delivered')).toBe(true));
  test('"doing" n\'est pas terminal',   () => expect(isDoneStatus('doing')).toBe(false));
  test('"todo" n\'est pas terminal',    () => expect(isDoneStatus('todo')).toBe(false));
  test('"backlog" n\'est pas terminal', () => expect(isDoneStatus('backlog')).toBe(false));
  test('"cancelled" n\'est pas terminal', () => expect(isDoneStatus('cancelled')).toBe(false));

  test('colonne custom en derniere position = terminale', () => {
    const fn = makeIsDoneStatus([
      { id: 'todo',   name: 'A faire', color: '#6b7280' },
      { id: 'custom', name: 'Maison',  color: '#aaaaaa' },
    ]);
    expect(fn('custom')).toBe(true);
  });

  test('colonne custom pas en derniere = non terminale', () => {
    const fn = makeIsDoneStatus([
      { id: 'custom', name: 'Maison',  color: '#aaaaaa' },
      { id: 'todo',   name: 'A faire', color: '#6b7280' },
    ]);
    expect(fn('custom')).toBe(false);
  });

  test('done + delivered terminaux meme si done n\'est pas le dernier', () => {
    const fn = makeIsDoneStatus([
      { id: 'todo',      name: 'A faire', color: '#6b7280' },
      { id: 'done',      name: 'Termine', color: '#16a34a' },
      { id: 'delivered', name: 'Livre',   color: '#0d9488' },
      { id: 'doing',     name: 'En cours', color: '#d97706' },
    ]);
    expect(fn('done')).toBe(true);
    expect(fn('delivered')).toBe(true);
    expect(fn('doing')).toBe(false);
  });
});

describe('statusInfo', () => {
  test('retourne nom et couleur d\'une colonne active', () => {
    const r = statusInfo('doing');
    expect(r.label).toBe('En cours');
    expect(r.color).toBe('#d97706');
  });
  test('fallback sur STATUS_CATALOG pour statut non actif', () => {
    const r = statusInfo('blocked');
    expect(r.label).toBeTruthy();
    expect(r.color).toBeTruthy();
  });
  test('fallback generique pour id inconnu', () => {
    const r = statusInfo('zzz');
    expect(r.label).toBeTruthy();
    expect(r.color).toBeTruthy();
  });
});

describe('DoR/DoD progression', () => {
  test('0/3 coche = 0% = rouge',  () => { const p = computePct([], 3); expect(p).toBe(0); expect(barColor(p)).toBe('var(--danger)'); });
  test('1/3 coche = 33% = rouge', () => { const p = computePct([true, false, false], 3); expect(p).toBe(33); expect(barColor(p)).toBe('var(--danger)'); });
  test('2/3 coches = 67% = orange', () => { const p = computePct([true, true, false], 3); expect(p).toBe(67); expect(barColor(p)).toBe('var(--warning)'); });
  test('3/3 coches = 100% = vert', () => { const p = computePct([true, true, true], 3); expect(p).toBe(100); expect(barColor(p)).toBe('var(--success)'); });
  test('0 criteres = 0% sans erreur', () => expect(computePct([], 0)).toBe(0));
});

describe('calcul SP livres', () => {
  function spLivres(items, cols) {
    const fn = makeIsDoneStatus(cols || defaultCols);
    return items.filter(i => fn(i.status)).reduce((s, i) => s + (i.sp || 0), 0);
  }

  test('seuls "done" comptent',    () => expect(spLivres([{sp:5,status:'done'},{sp:3,status:'doing'},{sp:8,status:'todo'}])).toBe(5));
  test('"delivered" compte aussi', () => expect(spLivres([{sp:5,status:'done'},{sp:13,status:'delivered'}])).toBe(18));
  test('aucun done = 0 SP',        () => expect(spLivres([{sp:5,status:'todo'},{sp:3,status:'doing'}])).toBe(0));
  test('sp null/undefined ne crashe pas', () => expect(spLivres([{status:'done'},{sp:null,status:'done'},{sp:5,status:'done'}])).toBe(5));
});

describe('tri clients', () => {
  const clients = [
    { id:'c1', name:'Acme',  tier:'A', caAnnuel:120000 },
    { id:'c2', name:'Beta',  tier:'B', caAnnuel:45000  },
    { id:'c3', name:'Gamma', tier:'A', caAnnuel:80000  },
    { id:'c4', name:'Delta', tier:'C', caAnnuel:10000  },
  ];

  test('CA asc : Acme (120k) en premier', () => {
    const s = sortClients(clients, 'caAnnuel', 'asc');
    expect(s[0].name).toBe('Acme');
  });
  test('CA asc : Delta (10k) en dernier', () => {
    const s = sortClients(clients, 'caAnnuel', 'asc');
    expect(s[s.length - 1].name).toBe('Delta');
  });
  test('CA asc : numerique (pas string)', () => {
    const s = sortClients(clients, 'caAnnuel', 'asc');
    for (let i = 0; i < s.length - 1; i++) {
      expect(s[i].caAnnuel).toBeGreaterThan(s[i + 1].caAnnuel - 1);
    }
  });
  test('tier asc : A avant B avant C', () => {
    const s = sortClients(clients, 'tier', 'asc');
    const tiers = s.map(c => c.tier);
    expect(tiers.indexOf('A')).toBeLessThan(tiers.indexOf('B'));
    expect(tiers.indexOf('B')).toBeLessThan(tiers.indexOf('C'));
  });
  test('nom asc : ordre alphabetique', () => {
    const s = sortClients(clients, 'name', 'asc');
    expect(s[0].name).toBe('Acme');
    expect(s[1].name).toBe('Beta');
  });
});

// ── Bilan ────────────────────────────────────────────────────────────────────

console.log('\n' + '─'.repeat(50));
console.log(`${passed}/${total} tests passes` + (failed > 0 ? ` | ${failed} ECHEC(S)` : ' - Tous OK'));
if (failed > 0) process.exit(1);
