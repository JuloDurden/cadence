import type { CadenceState } from '../types'

export const DEMO_STATE: CadenceState = {
  sprints: [
    { id: 's1', number: 1, label: 'Sprint 1 - Fondations', startDate: '2026-05-01', endDate: '2026-05-14', capacity: 40, closed: true, goal: 'Mettre en place les fondations du produit', velocitySnapshot: 38 },
    { id: 's2', number: 2, label: 'Sprint 2 - Sinistres', startDate: '2026-05-15', endDate: '2026-05-28', capacity: 40, closed: false, goal: 'Automatiser le traitement des sinistres' },
    { id: 's3', number: 3, label: 'Sprint 3 - Reporting', startDate: '2026-05-29', endDate: '2026-06-11', capacity: 40, closed: false },
  ],
  items: [
    { id: 'i1', key: 'AUT-1', desc: 'Intégration API sinistres partenaires', sp: 8, status: 'done', clientId: 'c1', sprintId: 's1', priority: 'critical', assignees: ['m1'], tags: ['api', 'sinistres'], createdAt: '2026-04-28T10:00:00Z' },
    { id: 'i2', key: 'AUT-2', desc: 'Module de détection de fraude automatique', sp: 13, status: 'done', clientId: 'c2', sprintId: 's1', priority: 'high', assignees: ['m2', 'm3'], tags: ['ia', 'fraude'], createdAt: '2026-04-28T11:00:00Z' },
    { id: 'i3', key: 'AUT-3', desc: 'Dashboard temps réel des sinistres en cours', sp: 8, status: 'done', clientId: 'c1', sprintId: 's1', priority: 'high', assignees: ['m1'], tags: ['dashboard'], createdAt: '2026-04-29T09:00:00Z' },
    { id: 'i4', key: 'AUT-4', desc: 'Calcul automatique des indemnités', sp: 13, status: 'doing', clientId: 'c2', sprintId: 's2', priority: 'critical', assignees: ['m2'], tags: ['calcul', 'indemnités'], createdAt: '2026-05-15T08:00:00Z' },
    { id: 'i5', key: 'AUT-5', desc: 'Notification SMS/email aux assurés', sp: 5, status: 'todo', clientId: 'c1', sprintId: 's2', priority: 'medium', assignees: ['m3'], tags: ['notif'], createdAt: '2026-05-15T09:00:00Z' },
    { id: 'i6', key: 'AUT-6', desc: 'Export PDF des rapports sinistres', sp: 5, status: 'review', clientId: 'c3', sprintId: 's2', priority: 'medium', assignees: ['m1'], tags: ['export', 'pdf'], createdAt: '2026-05-16T10:00:00Z' },
    { id: 'i7', key: 'AUT-7', desc: 'Tableau de bord KPIs direction', sp: 8, status: 'todo', clientId: 'c1', sprintId: 's3', priority: 'high', assignees: [], tags: ['dashboard', 'kpi'], createdAt: '2026-05-20T08:00:00Z' },
    { id: 'i8', key: 'AUT-8', desc: 'Import historique sinistres legacy', sp: 13, status: 'todo', clientId: 'c2', sprintId: null, priority: 'low', assignees: [], tags: ['migration'], createdAt: '2026-05-20T09:00:00Z' },
  ],
  team: [
    { id: 'm1', name: 'Alice Martin', role: 'Dev Backend', spPerDay: 6, tags: ['api', 'python', 'backend'] },
    { id: 'm2', name: 'Bob Dupont', role: 'Dev Frontend', spPerDay: 6, tags: ['react', 'typescript', 'frontend'] },
    { id: 'm3', name: 'Claire Petit', role: 'Dev Fullstack', spPerDay: 5, tags: ['api', 'react', 'ia'] },
  ],
  clients: [
    { id: 'c1', name: 'AutoClaimsTech', tier: 'Enterprise', annualRevenue: 2400000, rag: 'G', color: '#4f46e5', prefix: 'AUT', contacts: [{ id: 'ct1', name: 'Sophie Bernard', role: 'DSI', email: 'sbernard@autoclaimstech.fr', phone: '+33 6 11 22 33 44' }, { id: 'ct2', name: 'Marc Leroy', role: 'PO', email: 'mleroy@autoclaimstech.fr' }] },
    { id: 'c2', name: 'AssurPlus', tier: 'Mid-Market', annualRevenue: 800000, rag: 'A', color: '#f59e0b', prefix: 'ASS', contacts: [{ id: 'ct3', name: 'Julie Moreau', role: 'Directrice Produit', email: 'jmoreau@assurplus.fr' }] },
    { id: 'c3', name: 'SécurAuto', tier: 'SMB', annualRevenue: 120000, rag: 'R', color: '#ef4444', prefix: 'SEC', contacts: [{ id: 'ct4', name: 'Pierre Duval', role: 'CEO', email: 'pduval@securauto.fr', phone: '+33 6 99 88 77 66' }] },
  ],
  kanbanCols: [
    { id: 'todo', label: 'À faire', color: '#6e6e73', isDone: false, isDefault: true },
    { id: 'doing', label: 'En cours', color: '#4f46e5', isDone: false },
    { id: 'review', label: 'En review', color: '#f59e0b', isDone: false },
    { id: 'done', label: 'Terminé', color: '#34c759', isDone: true },
    { id: 'blocked', label: 'Bloqué', color: '#ef4444', isDone: false },
  ],
  settings: { sprintDuration: 14, defaultCapacity: 40, theme: 'light' },
  retroSessions: [
    {
      id: 'r1', sprintId: 's1', format: 'start-stop-continue' as const,
      date: '2026-05-14',
      columns: {
        start: [
          { id: 'ri1', text: 'Faire des revues de code plus régulières', votes: ['m1', 'm2'], authorId: 'm3' },
          { id: 'ri2', text: 'Intégrer des tests automatisés dès le début', votes: ['m1'], authorId: 'm2' },
        ],
        stop: [
          { id: 'ri3', text: 'Les réunions de statut trop longues', votes: ['m2', 'm3'], authorId: 'm1' },
        ],
        continue: [
          { id: 'ri4', text: 'Le Daily de 15 minutes bien cadré', votes: ['m1', 'm2', 'm3'], authorId: 'm1' },
          { id: 'ri5', text: 'La collaboration entre front et back', votes: ['m3'], authorId: 'm2' },
        ],
      },
      actions: [
        { id: 'ra1', text: 'Mettre en place une checklist de code review', ownerId: 'm1', dueDate: '2026-05-20', done: true },
        { id: 'ra2', text: 'Réduire les réunions de statut à 10 min', ownerId: 'm3', dueDate: '2026-05-15', done: false },
      ],
    },
  ],
  dailyEntries: [
    { memberId: 'm1', date: '2026-07-02', yesterday: 'Finalisé l\'intégration API sinistres', today: 'Démarrage module notifications', blockers: '' },
    { memberId: 'm2', date: '2026-07-02', yesterday: 'Review du dashboard burndown', today: 'Implémentation KPIs direction', blockers: 'En attente des specs UI du PO' },
    { memberId: 'm3', date: '2026-07-02', yesterday: 'Tests calcul indemnités', today: 'Correction bug calcul TVA', blockers: '' },
  ],
  roadmap: [
    { id: 'g1', sprintId: 's1', icon: '🏗️', color: 'linear-gradient(135deg,#0891b2,#0e7490)', name: 'Fondations', goal: 'Mettre en place les fondations du produit AutoClaimsTech', metrics: ['Integration API sinistres stable', 'Detection fraude operationnelle > 90%', 'Dashboard temps reel < 2s'] },
    { id: 'g2', sprintId: 's2', icon: '⚡', color: 'linear-gradient(135deg,#4f46e5,#4338ca)', name: 'Automatisation', goal: 'Automatiser le traitement des sinistres de bout en bout', metrics: ['Calcul indemnites automatise > 95% cas', 'Notifications envoyees < 1h apres sinistre', 'Rapports PDF exportables par les gestionnaires'] },
    { id: 'g3', sprintId: 's3', icon: '📊', color: 'linear-gradient(135deg,#059669,#047857)', name: 'Reporting', goal: 'Fournir une visibilite complete aux directions et clients', metrics: ['KPIs direction disponibles en temps reel', 'Historique legacy importe a 100%', 'Tableau de bord operationnel valide par la DSI'] },
  ],
  history: [
    { id: 'h1', type: 'item_create' as const, timestamp: new Date(Date.now()-86400000*2).toISOString(), itemKey: 'AUT-1', itemDesc: 'Integration API sinistres partenaires', detail: 'US creee', author: 'm1' },
    { id: 'h2', type: 'item_status' as const, timestamp: new Date(Date.now()-86400000).toISOString(), itemKey: 'AUT-2', itemDesc: 'Module de detection de fraude automatique', from: 'todo', to: 'done', author: 'm2' },
    { id: 'h3', type: 'item_create' as const, timestamp: new Date(Date.now()-3600000*5).toISOString(), itemKey: 'AUT-7', itemDesc: 'Tableau de bord KPIs direction', detail: 'US creee', author: 'm1' },
  ],
}
