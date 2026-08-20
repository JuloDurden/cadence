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

// `toContain`/`.not` (2026-08-20, ajoutes pour les tests Retro plus bas) : la suite Compagnon IA
// (verifyApplyIsConfirmed) et les precedentes n'en avaient pas eu besoin (comparaisons directes
// suffisaient), mais la fusion des sessions Retro compare des tableaux (votes/dislikes) - plus
// naturel a lire avec toContain()/not.toContain() qu'avec des .includes() manuels repetes.
function expect(val) {
  const matchers = {
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
    toContain: (item) => {
      if (!Array.isArray(val) && typeof val !== 'string') throw new Error('toContain: ' + JSON.stringify(val) + ' is not an array or string');
      if (!val.includes(item)) throw new Error('Expected ' + JSON.stringify(val) + ' to contain ' + JSON.stringify(item));
    },
  };
  const positiveEntries = Object.entries(matchers); // capture avant d'ajouter `not` lui-meme
  matchers.not = {};
  for (const [name, fn] of positiveEntries) {
    matchers.not[name] = (...args) => {
      let threw = false;
      try { fn(...args); } catch { threw = true; }
      if (!threw) throw new Error(name + ': expected the opposite, but the positive assertion passed');
    };
  }
  return matchers;
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

// ── verifyApplyIsConfirmed (Compagnon IA, backend/src/routes/ai.ts) ────────────
// Reproduction fidele de la fonction reelle (v0.98.18, retour Julien) : garantit
// techniquement, a partir de l'historique complet de conversation deja recu par
// /api/ai-chat (le chat reste sans etat persiste cote serveur), qu'un appel
// apply_sprint_plan est bien precede d'un simulate_sprint_plan ET d'un vrai
// message utilisateur envoye depuis (distingue d'un tool_result synthetique
// reinjecte par la boucle agentique via son `content` de type tableau, pas
// chaine). L'ancre n'est pas systematiquement la simulation : si un plan a deja
// ete applique depuis, l'ancre devient cette application, pour exiger une
// nouvelle confirmation avant toute reapplication du meme plan.
function verifyApplyIsConfirmed(messages, beforeIndex) {
  let simIdx = -1;
  let simInput = null;
  let lastApplyIdx = -1;
  for (let i = 0; i < beforeIndex; i++) {
    const m = messages[i];
    if (m.role !== 'assistant' || typeof m.content === 'string') continue;
    for (const block of m.content) {
      if (block.type === 'tool_use' && block.name === 'simulate_sprint_plan') {
        simIdx = i;
        simInput = block.input;
      }
      if (block.type === 'tool_use' && block.name === 'apply_sprint_plan') {
        lastApplyIdx = i;
      }
    }
  }
  if (simIdx === -1 || !simInput) {
    return { ok: false, reason: 'no-simulation' };
  }
  const anchorIdx = Math.max(simIdx, lastApplyIdx);
  const hasRealUserMessageSince = messages
    .slice(anchorIdx + 1, beforeIndex)
    .some(m => m.role === 'user' && typeof m.content === 'string');
  if (!hasRealUserMessageSince) {
    return { ok: false, reason: lastApplyIdx > simIdx ? 'already-applied' : 'no-confirmation' };
  }
  return { ok: true, input: simInput };
}

describe('verifyApplyIsConfirmed (Compagnon IA, garantie de confirmation)', () => {
  test('aucune simulation prealable -> rejet', () => {
    const messages = [
      { role: 'user', content: 'Planifie les prochains sprints' },
      { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'apply_sprint_plan', input: {} }] },
    ];
    const r = verifyApplyIsConfirmed(messages, 1);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('no-simulation');
  });

  test('simulation puis application dans le meme tour (tool_result seul, pas un vrai message) -> rejet', () => {
    const messages = [
      { role: 'user', content: 'Simule puis applique directement' },
      { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'simulate_sprint_plan', input: { criteria: ['priority'] } }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: '{"result":"ok"}' }] },
      { role: 'assistant', content: [{ type: 'tool_use', id: 't2', name: 'apply_sprint_plan', input: { criteria: ['priority'] } }] },
    ];
    const r = verifyApplyIsConfirmed(messages, 3);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('no-confirmation');
  });

  test('simulation + vrai message utilisateur + application -> accepte, memes parametres que la simulation', () => {
    const simInput = { criteria: ['priority', 'client'], velocityFactor: 0.8 };
    const messages = [
      { role: 'user', content: 'Simule un plan' },
      { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'simulate_sprint_plan', input: simInput }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: '{"result":"ok"}' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'Voici le plan simule.' }] },
      { role: 'user', content: 'Applique' },
      { role: 'assistant', content: [{ type: 'tool_use', id: 't2', name: 'apply_sprint_plan', input: { criteria: ['autre chose'] } }] },
    ];
    const r = verifyApplyIsConfirmed(messages, 5);
    expect(r.ok).toBe(true);
    expect(JSON.stringify(r.input)).toBe(JSON.stringify(simInput));
  });

  test('deux simulations successives -> reprend la derniere, pas la premiere', () => {
    const simInput1 = { criteria: ['priority'] };
    const simInput2 = { criteria: ['client'], velocityFactor: 1.2 };
    const messages = [
      { role: 'user', content: 'Simule un premier plan' },
      { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'simulate_sprint_plan', input: simInput1 }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: '{}' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'Plan 1.' }] },
      { role: 'user', content: 'Essaie plutot avec un autre critere' },
      { role: 'assistant', content: [{ type: 'tool_use', id: 't2', name: 'simulate_sprint_plan', input: simInput2 }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't2', content: '{}' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'Plan 2.' }] },
      { role: 'user', content: 'Applique celui-la' },
      { role: 'assistant', content: [{ type: 'tool_use', id: 't3', name: 'apply_sprint_plan', input: simInput1 }] },
    ];
    const r = verifyApplyIsConfirmed(messages, 9);
    expect(r.ok).toBe(true);
    expect(JSON.stringify(r.input)).toBe(JSON.stringify(simInput2));
  });

  test('reapplication sans nouveau message utilisateur apres une premiere application reussie -> rejet', () => {
    const simInput = { criteria: ['priority'] };
    const messages = [
      { role: 'user', content: 'Simule' },
      { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'simulate_sprint_plan', input: simInput }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: '{}' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'Plan.' }] },
      { role: 'user', content: 'Applique' },
      { role: 'assistant', content: [{ type: 'tool_use', id: 't2', name: 'apply_sprint_plan', input: simInput }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't2', content: '{"applied":true}' }] },
      { role: 'assistant', content: [{ type: 'tool_use', id: 't3', name: 'apply_sprint_plan', input: simInput }] },
    ];
    const r = verifyApplyIsConfirmed(messages, 7);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('already-applied');
  });
});

// ── Fusion des sessions Retro contre l'etat reducer (StateContext.tsx) ─────────
// Reproduction fidele du principe des reducers ADD_RETRO_ITEM/DELETE_RETRO_ITEM/
// TOGGLE_RETRO_VOTE/TOGGLE_RETRO_DISLIKE/TOGGLE_RETRO_ANONYMOUS/ADD_RETRO_ACTION/
// TOGGLE_RETRO_ACTION/DELETE_RETRO_ACTION (2026-08-20, retour Julien : "meme pattern de
// fusion fragile que Sprint Review"). Avant : RetroPage.tsx (helper `save()`, supprime)
// reconstruisait toute la session cote page a partir d'un instantane `session` (useMemo)
// potentiellement perime, puis dispatchait UPSERT_RETRO_SESSION avec CETTE copie complete -
// un `UPSERT_RETRO_SESSION` recu entre-temps (synchro temps reel, v0.98.16, ou un 2e clic
// local avant qu'un rendu ne s'intercale) pouvait donc silencieusement ecraser un changement
// concurrent. Desormais, chaque action ne transporte qu'un changement cible et se fusionne
// DANS LE REDUCER contre son PROPRE etat a jour (`sessions.find(...)`), jamais contre
// l'instantane fourni par la page (`sessionDefaults`, utilise seulement en tout dernier
// recours si la session n'existe pas encore) - meme principe que UPDATE_SR_ITEM_RECORD.
function upsertRetroBySessionDefaults(sessions, sessionDefaults, mutate) {
  const base = sessions.find(s => s.id === sessionDefaults.id) ?? sessionDefaults;
  const nextSession = mutate(base);
  return [...sessions.filter(s => s.id !== nextSession.id), nextSession];
}
function addRetroItem(sessions, sessionDefaults, colKey, item) {
  return upsertRetroBySessionDefaults(sessions, sessionDefaults, base => ({
    ...base,
    columns: { ...base.columns, [colKey]: [...(base.columns[colKey] ?? []), item] },
  }));
}
function deleteRetroItem(sessions, sessionDefaults, colKey, itemId) {
  return upsertRetroBySessionDefaults(sessions, sessionDefaults, base => ({
    ...base,
    columns: { ...base.columns, [colKey]: (base.columns[colKey] ?? []).filter(i => i.id !== itemId) },
  }));
}
function toggleRetroVote(sessions, sessionDefaults, colKey, itemId, userId) {
  return upsertRetroBySessionDefaults(sessions, sessionDefaults, base => {
    const items = (base.columns[colKey] ?? []).map(i => {
      if (i.id !== itemId) return i;
      const liked = i.votes.includes(userId);
      return {
        ...i,
        votes: liked ? i.votes.filter(v => v !== userId) : [...i.votes, userId],
        dislikes: liked ? (i.dislikes ?? []) : (i.dislikes ?? []).filter(v => v !== userId),
      };
    });
    return { ...base, columns: { ...base.columns, [colKey]: items } };
  });
}
function toggleRetroDislike(sessions, sessionDefaults, colKey, itemId, userId) {
  return upsertRetroBySessionDefaults(sessions, sessionDefaults, base => {
    const items = (base.columns[colKey] ?? []).map(i => {
      if (i.id !== itemId) return i;
      const disliked = (i.dislikes ?? []).includes(userId);
      return {
        ...i,
        dislikes: disliked ? (i.dislikes ?? []).filter(v => v !== userId) : [...(i.dislikes ?? []), userId],
        votes: disliked ? i.votes : i.votes.filter(v => v !== userId),
      };
    });
    return { ...base, columns: { ...base.columns, [colKey]: items } };
  });
}
function toggleRetroAnonymous(sessions, sessionDefaults) {
  return upsertRetroBySessionDefaults(sessions, sessionDefaults, base => ({ ...base, anonymousVotes: !base.anonymousVotes }));
}
function addRetroAction(sessions, sessionDefaults, action) {
  return upsertRetroBySessionDefaults(sessions, sessionDefaults, base => ({ ...base, actions: [...base.actions, action] }));
}
function toggleRetroAction(sessions, sessionDefaults, actionId) {
  return upsertRetroBySessionDefaults(sessions, sessionDefaults, base => ({
    ...base, actions: base.actions.map(a => a.id === actionId ? { ...a, done: !a.done } : a),
  }));
}
function deleteRetroAction(sessions, sessionDefaults, actionId) {
  return upsertRetroBySessionDefaults(sessions, sessionDefaults, base => ({
    ...base, actions: base.actions.filter(a => a.id !== actionId),
  }));
}

const baseRetroSession = () => ({
  id: 's1', sprintId: 'sp1', format: 'start-stop-continue',
  columns: { start: [{ id: 'i1', text: 'Existant', votes: [], dislikes: [] }], stop: [], continue: [] },
  actions: [{ id: 'a1', text: 'Action existante', ownerId: 'm1', done: false }],
});

describe('Retro - chaque action ne touche que sa propre partie de la session', () => {
  test('ADD_RETRO_ITEM ajoute dans la bonne colonne, laisse le reste intact', () => {
    const sessions = addRetroItem([baseRetroSession()], baseRetroSession(), 'stop', { id: 'i2', text: 'Nouveau', votes: [], dislikes: [] });
    const s = sessions[0];
    expect(s.columns.stop.length).toBe(1);
    expect(s.columns.start.length).toBe(1); // colonne "start" inchangee
    expect(s.actions.length).toBe(1); // actions inchangees
  });
  test('DELETE_RETRO_ITEM retire uniquement l\'item cible', () => {
    const sessions = deleteRetroItem([baseRetroSession()], baseRetroSession(), 'start', 'i1');
    expect(sessions[0].columns.start.length).toBe(0);
  });
  test('TOGGLE_RETRO_VOTE ajoute le vote sans toucher aux dislikes d\'un autre item', () => {
    const base = baseRetroSession();
    base.columns.start.push({ id: 'i9', text: 'Autre', votes: [], dislikes: ['userZ'] });
    const sessions = toggleRetroVote([base], base, 'start', 'i1', 'userA');
    const s = sessions[0];
    expect(s.columns.start.find(i => i.id === 'i1').votes).toContain('userA');
    expect(s.columns.start.find(i => i.id === 'i9').dislikes).toContain('userZ'); // non touche
  });
  test('TOGGLE_RETRO_VOTE est bien un toggle (revote retire le vote)', () => {
    let sessions = [baseRetroSession()];
    sessions = toggleRetroVote(sessions, sessions[0], 'start', 'i1', 'userA');
    sessions = toggleRetroVote(sessions, sessions[0], 'start', 'i1', 'userA');
    expect(sessions[0].columns.start.find(i => i.id === 'i1').votes).not.toContain('userA');
  });
  test('TOGGLE_RETRO_DISLIKE retire un vote existant (mutuellement exclusifs)', () => {
    const base = baseRetroSession();
    base.columns.start[0].votes = ['userA'];
    const sessions = toggleRetroDislike([base], base, 'start', 'i1', 'userA');
    const item = sessions[0].columns.start.find(i => i.id === 'i1');
    expect(item.dislikes).toContain('userA');
    expect(item.votes).not.toContain('userA');
  });
  test('TOGGLE_RETRO_ANONYMOUS bascule le seul champ anonymousVotes', () => {
    const sessions = toggleRetroAnonymous([baseRetroSession()], baseRetroSession());
    expect(sessions[0].anonymousVotes).toBe(true);
    expect(sessions[0].columns.start.length).toBe(1); // colonnes inchangees
  });
  test('ADD_RETRO_ACTION ajoute une action sans toucher aux colonnes', () => {
    const sessions = addRetroAction([baseRetroSession()], baseRetroSession(), { id: 'a2', text: 'Nouvelle', ownerId: 'm2', done: false });
    expect(sessions[0].actions.length).toBe(2);
    expect(sessions[0].columns.start.length).toBe(1);
  });
  test('TOGGLE_RETRO_ACTION bascule uniquement done, sur la bonne action', () => {
    const sessions = toggleRetroAction([baseRetroSession()], baseRetroSession(), 'a1');
    expect(sessions[0].actions[0].done).toBe(true);
  });
  test('DELETE_RETRO_ACTION retire uniquement l\'action ciblee', () => {
    const sessions = deleteRetroAction([baseRetroSession()], baseRetroSession(), 'a1');
    expect(sessions[0].actions.length).toBe(0);
  });
});

describe('Retro - regression : 2 actions basees sur le MEME instantane perime ne s\'ecrasent plus', () => {
  test('un ajout d\'item (compte A) et un vote sur un autre item (compte B) survivent tous les deux', () => {
    // Simule le scenario reel du bug rapporte : 2 comptes, chacun parti du MEME instantane de
    // session (staleSnapshot) - avant ce correctif, le 2e dispatch (UPSERT_RETRO_SESSION avec une
    // copie complete reconstruite depuis cet instantane) aurait totalement REMPLACE la session,
    // effacant l'ajout du 1er compte au passage.
    const staleSnapshot = baseRetroSession();
    let sessions = [baseRetroSession()]; // etat reducer initial, identique a l'instantane pour l'instant
    sessions = addRetroItem(sessions, staleSnapshot, 'start', { id: 'i2', text: 'Nouveau item compte A', votes: [], dislikes: [] });
    sessions = toggleRetroVote(sessions, staleSnapshot, 'start', 'i1', 'userB'); // toujours base sur staleSnapshot, pas sur le resultat du dispatch precedent
    const session = sessions.find(s => s.id === 's1');
    expect(session.columns.start.length).toBe(2); // le nouvel item de A n'a pas ete efface par B
    expect(session.columns.start.find(i => i.id === 'i1').votes).toContain('userB'); // le vote de B est bien applique
  });
});

// ── Id deterministe de la session Retro par defaut (RetroPage.tsx) ─────────────
// Meme correctif que celui deja applique a Sprint Review (SprintReviewPage.tsx,
// `sr-session-${sprintId}`, voir docs/corrections.md, 2026-07-22) : sans id deterministe,
// generer une session par defaut (aucune session existante pour ce sprint/format) produirait
// un id ALEATOIRE a chaque recalcul du useMemo - problematique maintenant qu'un effet de
// persistance reagit a CHAQUE changement de reference de `session` (voir RetroPage.tsx) :
// changer de format sans aucune session existante creerait sinon une nouvelle ligne "vide"
// cote serveur a chaque fois, plutot que de reutiliser toujours la meme.
function defaultRetroSessionId(sprintId, format) {
  return `retro-session-${sprintId ?? 'no-sprint'}-${format}`;
}
describe('Retro - id deterministe de la session par defaut', () => {
  test('meme sprint + meme format -> toujours le meme id', () => {
    expect(defaultRetroSessionId('sp1', 'start-stop-continue')).toBe(defaultRetroSessionId('sp1', 'start-stop-continue'));
  });
  test('format different -> id different', () => {
    expect(defaultRetroSessionId('sp1', 'start-stop-continue')).not.toBe(defaultRetroSessionId('sp1', 'mad-sad-glad'));
  });
  test('sprint different -> id different', () => {
    expect(defaultRetroSessionId('sp1', 'start-stop-continue')).not.toBe(defaultRetroSessionId('sp2', 'start-stop-continue'));
  });
});

// Reproduction de utils/permissions.ts (hasRole + canDeleteRetroItem), correctif 2026-08-20 (retour
// Julien : "un compte dev peut supprimer les messages des autres dans la Retro. Seul l'admin ou le
// PO ou le proprietaire du message devrait pouvoir le faire.").
function hasRole(userRole, ...allowed) {
  if (!userRole) return false;
  if (userRole === 'ADMIN') return true;
  return allowed.includes(userRole);
}
function canDeleteRetroItem(role, userId, item) {
  if (hasRole(role, 'PO')) return true;
  return !!userId && !!item.authorId && item.authorId === userId;
}
describe('canDeleteRetroItem (Retro, suppression restreinte auteur/PO/Admin)', () => {
  test('ADMIN peut supprimer l\'item de n\'importe qui', () => {
    expect(canDeleteRetroItem('ADMIN', 'u-admin', { authorId: 'u-autre' })).toBeTruthy();
  });
  test('PO peut supprimer l\'item de n\'importe qui', () => {
    expect(canDeleteRetroItem('PO', 'u-po', { authorId: 'u-autre' })).toBeTruthy();
  });
  test('l\'auteur peut supprimer son propre item', () => {
    expect(canDeleteRetroItem('DEV', 'u-dev', { authorId: 'u-dev' })).toBeTruthy();
  });
  test('un DEV ne peut PAS supprimer l\'item d\'un autre (bug corrige)', () => {
    expect(canDeleteRetroItem('DEV', 'u-dev', { authorId: 'u-autre' })).toBeFalsy();
  });
  test('un SCRUM_MASTER ne peut PAS supprimer l\'item d\'un autre (non demande par Julien)', () => {
    expect(canDeleteRetroItem('SCRUM_MASTER', 'u-sm', { authorId: 'u-autre' })).toBeFalsy();
  });
  test('item sans authorId connu (cree avant le Chantier J) -> fail-closed, seul PO/Admin', () => {
    expect(canDeleteRetroItem('DEV', 'u-dev', {})).toBeFalsy();
    expect(canDeleteRetroItem('PO', 'u-po', {})).toBeTruthy();
  });
});

// ── Bilan ────────────────────────────────────────────────────────────────────

console.log('\n' + '-'.repeat(50));
console.log(passed + '/' + total + ' tests passes' + (failed > 0 ? ' | ' + failed + ' ECHEC(S)' : ' - Tous OK'));
if (failed > 0) process.exit(1);
