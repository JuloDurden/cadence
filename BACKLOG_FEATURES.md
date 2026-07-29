# Backlog des futures fonctionnalités — Cadence

> Dernière mise à jour : 18 juillet 2026.
> v0.90.5 (livré) : NNL — rubber-band select (rect/lasso, scope calque, long-press flyout, chevron), copier/coller/dupliquer (Ctrl+C/V/D), groupes de formes (Ctrl+G / Ctrl+Shift+G, shapeGroupId), grille magnétique (Shift+G, toggle bouton near ZoomControls).
> v0.90 (livré) : NNL — barre d'outils complète (rect/ellipse/flèche/texte/stylo/marqueur/gomme), panneau calques (groupes, DnD, masquage, verrouillage), sélection/déplacement/resize/rotation des formes et blocs texte, TextPropertiesPanel, undo/redo NNL isolé.

---

## v0.91 — Premier chantier majeur

> Les 4 features NNL de v0.91 ont été avancées en v0.90.5. La v0.91 ouvre le premier chantier majeur d'ici la v1.

---

## Chantiers majeurs d'ici la v1

### 🏗 Initiative > Epic > Items — hiérarchie complète

Sous-chantiers 1, 2, 4/6 et 5 faits (2026-07-28/29, v0.92–v0.92.5, voir `docs/roadmap-v1.md` Phase 1 et `docs/corrections.md`) : Epic n'est plus un `Item` (`type: 'epic'`) mais un `HierarchyNode` dédié (`level: 'epic' | 'initiative'`) ; utilitaire de regroupement partagé (`utils/hierarchyScore.ts`) ; niveau Initiative dans le Backlog, rendu en cards repliables imbriquées (Initiative > Epic > Items), tous les modes de regroupement du Backlog étant passés en cards à cette occasion ; Sprint Review ("Incrément livré") regroupé par Epic/Initiative via en-têtes non repliables. Reste à faire (sous-chantier 6) :

- **Piste NNL (idée utilisateur, 2026-07-20)** : sur le canevas Now/Next/Later (Vision), permettre de regrouper visuellement plusieurs post-its/items dans un cadre représentant un Epic, et plusieurs Epics dans un cadre représentant une Initiative — ce regroupement visuel se synchroniserait avec la vraie hiérarchie Initiative → Epic → Items du Backlog. Suppose au minimum : un mécanisme de groupement/cadre sur le canevas NNL (au-delà des calques actuels), et une synchronisation bidirectionnelle avec le Backlog. À concevoir une fois cette hiérarchie posée côté Backlog.
- **Drag-and-drop dans les cards du Backlog** (idée Julien, 2026-07-29, explicitement hors périmètre du sous-chantier 4) : glisser un item directement dans une card Epic ou Initiative pour le rattacher, plutôt que de passer par le sélecteur "EPIC / INITIATIVE" de sa modale. Le choix de faire passer *tous* les modes de regroupement du Backlog en cards (plutôt que seulement Epic/Initiative) a été fait en pensant à cette évolution — la structure est prête à l'accueillir, mais aucun handler de drag n'est câblé pour l'instant.

---

### 👥 Gestion des utilisateurs — rôles, permissions, interactions

- **Rôles** : PO (lecture/écriture totale), Scrum Master, Dev (écriture statut + commentaires), Stakeholder (lecture seule), Admin
- **Onboarding** : parcours guidé à la première connexion (tooltips progressifs, checklist "premiers pas", démo interactable)
- **Permissions fines** :
  - Daily : seul le Scrum Master peut archiver ; chaque Dev renseigne uniquement ses propres entrées
  - Rétrospective : votes anonymisables, export réservé au SM
  - Auto-planning / What-if : PO uniquement
  - Backlog : PO full CRUD, Dev lecture + changement de statut
- **Profil utilisateur** : avatar, préférences (thème, langue), notification digest
- **Interactions nominatives** : commentaires, @mentions dans les notes d'item, attributions visibles avec avatar

---

### 🖥 Lecture seule & Mode présentation

*Lié à la gestion des utilisateurs.*

- **Mode lecture seule** : URL partageable (token) sans auth — Stakeholder ou client voit les données sans pouvoir les modifier ; boutons d'action masqués
- **Mode présentation** : vue "slide-ready" adaptée aux comités, PI Planning, Sprint Review :
  - Sidebar masquée, header simplifié, contenu plein écran
  - Navigation clavier (←/→) entre les sections
  - Applicable à : Dashboard, Roadmap, NNL, Sprint Review

---

### 📋 Page Sprint Review

Route dédiée `/sprint-review` — entrée dans la sidebar. Conçue comme une **réunion de collaboration** (pas uniquement démo), time-boxée à 1h par semaine de sprint. La sortie principale est la révision du Backlog produit.

#### Structure (6 sections)

**Header**
- Sélecteur de sprint (liste déroulante)
- Objectif du sprint (sprint goal)
- Time-box recommandé (calculé : 1h × nb semaines du sprint)
- Participants (liste libre) + date de revue
- Dates de début / fin du sprint

**Section 1 — Incrément livré**
- Liste des items `isDone` du sprint
- Badge "À démontrer" par item (toggle on/off — à décider : simple toggle ou checkbox multi-sélection + mode présentation séquencé)
- Badge PO **local à la Sprint Review** : `Accepté` / `Refusé` / `En attente` — 3 états, clic pour cycler. *Non stocké sur l'Item — DoR/DoD restent sur la page Backlog.*
- Note PO inline par item (champ texte)
- ✅ Groupement par Epic/Initiative fait (2026-07-29, v0.92.5, voir `docs/roadmap-v1.md` Phase 1 sous-chantier 5)

**Section 2 — Non terminé**
- Items du sprint non livrés, avec raison (champ texte)
- Décision par item : `Reporter au sprint suivant` / `Annuler` / `Redimensionner`

**Section 3 — Vélocité**
- SP livrés vs SP planifiés + taux de complétion
- Mini bar chart des N derniers sprints (sprint courant mis en évidence)

**Section 4 — Décisions backlog**
- Items à créer ou modifier issus de la revue
- Type `Nouvel item` → **création directe dans le Backlog** (même composant modal que l'ajout d'item)
- Type `Reprioriser / Rescoper` → **modification directe de l'item existant** (ouvre l'item en édition)

**Section 5 — Notes globales**
- Textarea libre : retours stakeholders, points d'attention, décisions prises en séance

**Section 6 — Archive**
- Même pattern que la Rétrospective (cards repliables, liste des Sprint Reviews passées)

#### Mockup (structure visuelle)

```
┌─────────────────────────────────────────────────────────┐
│  Sprint 14 — 30 juin au 11 juillet 2026    [Time-box 2h]│
│  Objectif : Livrer NNL texte enrichi + ops booléennes   │
│  Julien, Sarah, Marc, Lena +2  ·  11 juillet 2026       │
└─────────────────────────────────────────────────────────┘

┌─ Incrément livré (6 items) ──────── [ Filtrer "À démontrer" ] ─┐
│ ✓ Éditeur de texte enrichi      8SP  [À démontrer] [Accepté  ] │
│   Note PO : RAS, conforme DoD                                   │
│ ✓ Opérations booléennes         5SP             [Accepté  ]    │
│ ✓ Resize tracés Stylo/Marqueur  3SP             [Refusé   ]    │
│   Note PO : Handle rotation à revoir                           │
│ ✓ Opacité globale formes        2SP             [En attente]   │
│   2 items supplémentaires…                                      │
└─────────────────────────────────────────────────────────────────┘

┌─ Non terminé (2 items) ────────────────────────────────────────┐
│ ✗ Export PDF NNL          5SP  Bloqué lib  [Reporter ▾]        │
│ ✗ Minimap de navigation   3SP  Non commencé [Annuler  ▾]       │
└─────────────────────────────────────────────────────────────────┘

┌─ Vélocité ─────────────────────────────────────────────────────┐
│  Planifiés : 26 SP   Livrés : 18 SP   Complétion : 69 %        │
│  ▁▃▂▄  (4 derniers sprints, sprint courant en bleu)            │
└─────────────────────────────────────────────────────────────────┘

┌─ Décisions backlog (2) ────────────────────────────────────────┐
│ [Nouvel item]   Handle rotation unifié formes + tracés   3 SP  │
│ [Reprioriser]   Export PDF — remonter priorité           5 SP  │
│ + Ajouter une décision                                         │
└─────────────────────────────────────────────────────────────────┘

┌─ Notes globales ───────────────────────────────────────────────┐
│ Retours stakeholders, points d'attention, décisions…           │
│ [                                                            ]  │
└─────────────────────────────────────────────────────────────────┘

┌─ Archives — 13 sprint reviews passées ─── [Voir toutes ›] ────┐
└─────────────────────────────────────────────────────────────────┘
```

#### Points à trancher lors de l'implémentation
- Badge "À démontrer" : toggle simple par item, ou mode présentation séquencé ?
- Filtrage de la section 1 par Epic (anticipation hiérarchie Initiative > Epic > Item)

---

### 📊 Dashboard — widgets opérationnels

Page actuelle : KPI statiques. À faire :

- **Trend de vélocité** : graphique N derniers sprints (courbe + moyenne mobile)
- **Forecast de livraison** : basé sur la vélocité moyenne — date estimée de fin d'une Epic ou d'un ensemble d'items sélectionnés
- **Burndown en temps réel** : pour le sprint actif
- **Widgets configurables** : choisir quels blocs afficher, redimensionner (layout drag-and-drop)
- **Vue par client** : charge assignée / réalisée par client sur les N derniers sprints

---

### 🔄 Historique & Undo/Redo

- **Couverture complète** : vérifier que toutes les actions v0.80–v0.89 (Vision Board, Groupes clients, What-if, Sprint Planning) sont bien tracées dans l'historique
- **Undo/Redo opérationnel** : Ctrl+Z / Ctrl+Y fonctionnels sur toutes les pages (actuellement partiel — NNL a son propre stack isolé depuis v0.90)
- **Journal d'audit détaillé** : qui a fait quoi, quand — export CSV

---

### ⚙️ Page Réglages — étoffement et organisation

- **Organisation en onglets** : Général, Équipe, Notifications, Intégrations, Sécurité, Import/Export, Avancé
- **Jours ouvrés** : configurer les jours de travail (ex : équipe travaillant le samedi)
- **Capacité nominative** : allocation SP par développeur et par sprint (vs capacité globale actuelle)
- **Thèmes** : personnalisation couleur primaire, logo équipe
- **Gestion des rôles et utilisateurs** (voir chantier dédié)

---

### 📥 Intégrations

- **Import Jira** : ingestion d'un backlog via export CSV Jira ou API Jira (Stories, Epics, SP, priorités, statuts)
- **Import Excel** : template Cadence en téléchargement, re-import avec mapping de colonnes configurable
- **Intégration Slack** :
  - Résumé automatique du Daily dans un canal configuré
  - Notification de clôture de sprint (vélocité, items livrés)
  - Alertes bloquants / dépendances non satisfaites
- **MCP Claude** : MCP Cadence exposant les données Cadence (items, sprints, équipe) à Claude pour requêtes en langage naturel ("Quels items ne sont pas prêts pour le sprint 3 ?")

---

### 🤖 Compagnon IA

- **Aide à la rédaction** : suggérer ou compléter la description d'un item, les critères BDD (Given/When/Then), la DoR/DoD à partir du titre
- **Estimation automatique** : proposer un SP à partir de la complexité perçue (titre + description + dépendances)
- **Résumé de sprint** : générer un compte-rendu Sprint Review ou Rétro en un clic
- **Détection d'anomalies** : items sans SP, sans assigné, sans dépendances déclarées, deadlines à risque

---

### 🔒 Polish final — sécurité & performances

- **Sécurité** : validation des entrées (XSS), Content Security Policy, sanitisation des imports JSON/CSV
- **Optimisations React** : React.memo sur les listes longues (Backlog, Planning), virtualisation si > 500 items
- **Tests** : couverture E2E > 90 %, tests unitaires sur les fonctions critiques (algorithme auto-planning, calcul WSJF, coords NNL)
- **Accessibilité** : focus visible, aria-labels manquants, navigation clavier sur toutes les modales
- **PWA** : manifest + service worker pour usage offline basique

---

## ✅ Réalisé (pour mémoire)

### Vision & NNL
- **NNL — canvas avancé** ✅ *v0.90.5* — rubber-band select (rect/lasso, scope calque, long-press flyout + chevron sur bouton), copier/coller/dupliquer (Ctrl+C/V/D, clipboard interne, offset +20), groupes de formes (Ctrl+G / Ctrl+Shift+G, shapeGroupId, clic groupe → sélection auto), grille magnétique (Shift+G, bouton toggle near ZoomControls, snap 20 unités monde)
- **NNL — canvas de dessin vectoriel** ✅ *v0.90* — barre d'outils 8 outils, panneau calques (DnD, groupes, masquage, verrouillage), sélection/déplacement/resize/rotation formes et textes, TextPropertiesPanel (G/I/S, police, couleur), ShapePropertiesPanel (fill/stroke/opacité), undo/redo NNL isolé, persistance serveur
- **NNL — post-its enrichis** ✅ *v0.90* — modal 3 onglets (Général, Notes, Rattachement), couleur/image/lien/notes/rattachement item Cadence, 2 types (feature/release)
- **Vision Board produit (Roman Pichler)** ✅ *v0.88* — page /vision dédiée, layout 4 colonnes, export PDF, nom produit éditable, toast global
- **NNL — tableau blanc infini** ✅ *v0.89* — canvas style Miro : pan/zoom vers curseur, 2 cercles concentriques, post-its en coordonnées monde, minimap, grille de points, labels alignés, cercles redimensionnables

### Auto-planning & What-if
- **Mode What-if** ✅ *v0.77* — scénarios alternatifs, branches Git-graph, forks, comparaison, items fictifs
- **What-if UX : wallet cards + highlights + badges** ✅ *v0.78*
- **Auto-planning ProposalPanel** ✅ *v0.84* — groupement Epic, highlight chaîne deps au hover, badges dep Niv.N

### Release Planning
- **Release Planning v2** ✅ *v0.79* — header contextuel, filtres, Epic grouping, DnD
- **Release Planning v3** ✅ *v0.80* — Gantt, Swimlanes, faisabilité, deadlines, overlay deps Bézier
- **Fix items Epic dans SprintColumn** ✅ *v0.84.1*

### Sprint Planning
- **Sprint Planning dédié** ✅ *v0.81* — kanban par membre, barre de charge SP/capacité
- **Auto-attribution et co-assignation** ✅ *v0.82* — modal config, solo/duo/trio, warning overflow

### Design & UX
- **ItemModal : 3 modes** ✅ *v0.83* — fenêtre centrée / volet latéral / pleine page, persistance localStorage
- **Clients : groupes, layout cards, groupement Roadmap** ✅ *v0.87*
- **Roadmap : header unifié, toggle vues, groupement Epic** ✅ *v0.86*
- **Changelog : versions standardisées, nav indentée, effet Dock** ✅ *v0.87.1*

### Backlog & Planification
- **DoR/DoD colonnes Backlog + filtre Prêt + bandeau Sprint Planning** ✅ *v0.85*
- **Rapport client imprimable** ✅ *v0.30*
- **Recherche globale Ctrl+K** ✅ *v0.29*
- **Lead time, Cycle time, CFD** ✅ *v0.34*
- **Scoring WSJF / RICE / MoSCoW** ✅ *en place*
- **Critères BDD (Gherkin)** ✅ *en place*
- **Export / Import JSON + CSV + Excel** ✅ *v0.46–v0.47*
- **Tags / labels libres** ✅ *v0.47*
- **Auto-planning** ✅ *en place*
- **Sprint Goal, clôture sprint, snapshot vélocité** ✅ *v0.19–v0.34*
- **Burndown Chart** ✅ *v0.12*
