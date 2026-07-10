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


// ── Auto-planning : fonctions pures ─────────────────────────────────────────

// ── computeMoveBadge ────────────────────────────────────────────────────────
function computeMoveBadge(item, slotNumber, sprintsMeta) {
  if (!item.sprintId) return { text: '+', color: '#059669' };
  const origSprint = sprintsMeta.find(s => s.id === item.sprintId);
  if (!origSprint) return { text: '→', color: '#d97706' };
  if (origSprint.number === slotNumber) return { text: '=', color: 'var(--text-muted)' };
  const dir = origSprint.number > slotNumber ? '↗' : '↘';
  return { text: 'S' + origSprint.number + dir, color: '#d97706' };
}

// ── isItemHighlighted ───────────────────────────────────────────────────────
function isItemHighlighted(item, highlightClients, highlightTypes, highlightPriority) {
  const hasAnyFilter = highlightClients.size > 0 || highlightTypes.size > 0 || highlightPriority.size > 0;
  if (!hasAnyFilter) return false;
  const clientMatch   = highlightClients.size   === 0 || highlightClients.has(item.clientId || '');
  const typeMatch     = highlightTypes.size     === 0 || highlightTypes.has(item.type || '');
  const priorityMatch = highlightPriority.size  === 0 || highlightPriority.has(item.priority || '');
  return clientMatch && typeMatch && priorityMatch;
}

// ── nextScenarioIdx ─────────────────────────────────────────────────────────
function nextScenarioIdx(removedIdx, totalAfterRemoval) {
  if (totalAfterRemoval === 0) return 0;
  return Math.max(0, Math.min(removedIdx - 1, totalAfterRemoval - 1));
}

// ── isSlotNonEmpty ──────────────────────────────────────────────────────────
function isSlotNonEmpty(slot) {
  return slot.assigned.length > 0 || ((slot.usedItems || []).length > 0);
}

// ── topoSort ────────────────────────────────────────────────────────────────
function topoSort(items) {
  const keySet = new Set(items.map(i => i.key));
  const inDeg = {};
  const adj = {};
  items.forEach(i => { inDeg[i.key] = 0; adj[i.key] = []; });
  items.forEach(i => {
    (i.deps || []).forEach(dk => {
      if (!keySet.has(dk)) return;
      adj[dk].push(i.key);
      inDeg[i.key] = (inDeg[i.key] || 0) + 1;
    });
  });
  const queue = items.filter(i => inDeg[i.key] === 0);
  const result = [];
  while (queue.length) {
    const node = queue.shift(); result.push(node);
    (adj[node.key] || []).forEach(nk => {
      inDeg[nk]--;
      if (inDeg[nk] === 0) { const it = items.find(i => i.key === nk); if (it) queue.push(it); }
    });
  }
  items.forEach(i => { if (!result.includes(i)) result.push(i); });
  return result;
}

// ── Tests autoPlanning ───────────────────────────────────────────────────────

const SPRINTS_META = [
  { id: 's1', number: 1 },
  { id: 's2', number: 2 },
  { id: 's3', number: 3 },
];

describe('computeMoveBadge', () => {
  test('item non assigne -> badge +', () => {
    const badge = computeMoveBadge({ sprintId: null }, 2, SPRINTS_META);
    expect(badge.text).toBe('+');
  });
  test('item deja dans ce sprint -> =', () => {
    const badge = computeMoveBadge({ sprintId: 's2' }, 2, SPRINTS_META);
    expect(badge.text).toBe('=');
  });
  test('item venant S3 place en S1 -> avance (fleche haut)', () => {
    const badge = computeMoveBadge({ sprintId: 's3' }, 1, SPRINTS_META);
    expect(badge.text).toBe('S3↗');
  });
  test('item venant S1 place en S3 -> recule (fleche bas)', () => {
    const badge = computeMoveBadge({ sprintId: 's1' }, 3, SPRINTS_META);
    expect(badge.text).toBe('S1↘');
  });
  test('sprintId inconnu -> fleche simple', () => {
    const badge = computeMoveBadge({ sprintId: 'unknown' }, 2, SPRINTS_META);
    expect(badge.text).toBe('→');
  });
});

describe('isItemHighlighted (logique AND)', () => {
  const item = { clientId: 'faxfa', type: 'bug', priority: 'critical' };

  test('aucun filtre -> false', () => {
    expect(isItemHighlighted(item, new Set(), new Set(), new Set())).toBeFalsy();
  });
  test('client seul correspondant -> true', () => {
    expect(isItemHighlighted(item, new Set(['faxfa']), new Set(), new Set())).toBeTruthy();
  });
  test('client + type corrects -> true', () => {
    expect(isItemHighlighted(item, new Set(['faxfa']), new Set(['bug']), new Set())).toBeTruthy();
  });
  test('client + type + priorite corrects -> true', () => {
    expect(isItemHighlighted(item, new Set(['faxfa']), new Set(['bug']), new Set(['critical']))).toBeTruthy();
  });
  test('client correct mais type incorrect -> false (AND)', () => {
    expect(isItemHighlighted(item, new Set(['faxfa']), new Set(['story']), new Set())).toBeFalsy();
  });
  test('client incorrect, type correct -> false (AND)', () => {
    expect(isItemHighlighted(item, new Set(['manfife']), new Set(['bug']), new Set())).toBeFalsy();
  });
  test('type + priorite corrects mais client incorrect -> false (AND)', () => {
    expect(isItemHighlighted(item, new Set(['manfife']), new Set(['bug']), new Set(['critical']))).toBeFalsy();
  });
});

describe('nextScenarioIdx (navigation apres suppression)', () => {
  test('supprimer le dernier (idx 4) -> atterrit sur idx 3', () => {
    expect(nextScenarioIdx(4, 4)).toBe(3);
  });
  test('supprimer idx 2 sur 4 -> atterrit sur idx 1', () => {
    expect(nextScenarioIdx(2, 3)).toBe(1);
  });
  test('supprimer premier non-current (idx 1) -> atterrit sur idx 0', () => {
    expect(nextScenarioIdx(1, 1)).toBe(0);
  });
  test('plus aucun scenario -> idx 0', () => {
    expect(nextScenarioIdx(0, 0)).toBe(0);
  });
});

describe('isSlotNonEmpty', () => {
  test('slot avec items assignes -> non vide', () => {
    expect(isSlotNonEmpty({ assigned: [{ id: 'x' }], usedItems: [] })).toBeTruthy();
  });
  test('slot avec usedItems -> non vide', () => {
    expect(isSlotNonEmpty({ assigned: [], usedItems: [{ id: 'x' }] })).toBeTruthy();
  });
  test('slot vide -> filtre', () => {
    expect(isSlotNonEmpty({ assigned: [], usedItems: [] })).toBeFalsy();
  });
  test('slot vide sans usedItems -> filtre', () => {
    expect(isSlotNonEmpty({ assigned: [] })).toBeFalsy();
  });
});

describe('topoSort', () => {
  test('sans dependances : ordre inchange', () => {
    const items = [{ key: 'A', deps: [] }, { key: 'B', deps: [] }, { key: 'C', deps: [] }];
    const result = topoSort(items).map(i => i.key);
    expect(result.join(',')).toBe('A,B,C');
  });
  test('B depend de A : A avant B', () => {
    const items = [{ key: 'B', deps: ['A'] }, { key: 'A', deps: [] }];
    const result = topoSort(items).map(i => i.key);
    expect(result.indexOf('A')).toBeLessThan(result.indexOf('B'));
  });
  test('chaine C->B->A : A en premier', () => {
    const items = [{ key: 'C', deps: ['B'] }, { key: 'B', deps: ['A'] }, { key: 'A', deps: [] }];
    const result = topoSort(items).map(i => i.key);
    expect(result[0]).toBe('A');
    expect(result[1]).toBe('B');
    expect(result[2]).toBe('C');
  });
  test('dependance externe ignoree', () => {
    const items = [{ key: 'A', deps: ['EXTERN'] }, { key: 'B', deps: [] }];
    const result = topoSort(items).map(i => i.key);
    expect(result.includes('A')).toBeTruthy();
  });
});

// ── Bilan ────────────────────────────────────────────────────────────────────

console.log('\n' + '-'.repeat(50));
console.log(passed + '/' + total + ' tests passes' + (failed > 0 ? ' | ' + failed + ' ECHEC(S)' : ' - Tous OK'));
if (failed > 0) process.exit(1);
