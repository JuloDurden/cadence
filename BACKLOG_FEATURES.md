# Backlog des futures fonctionnalités — Cadence

> Dernière mise à jour : 17 juillet 2026.
> v0.90.5 (livré) : NNL — rubber-band select (rect/lasso, scope calque, long-press flyout, chevron), copier/coller/dupliquer (Ctrl+C/V/D), groupes de formes (Ctrl+G / Ctrl+Shift+G, shapeGroupId), grille magnétique (Shift+G, toggle bouton near ZoomControls).
> v0.90 (livré) : NNL — barre d'outils complète (rect/ellipse/flèche/texte/stylo/marqueur/gomme), panneau calques (groupes, DnD, masquage, verrouillage), sélection/déplacement/resize/rotation des formes et blocs texte, TextPropertiesPanel, undo/redo NNL isolé.

---

## v0.91 — Premier chantier majeur

> Les 4 features NNL de v0.91 ont été avancées en v0.90.5. La v0.91 ouvre le premier chantier majeur d'ici la v1.

---

## Chantiers majeurs d'ici la v1

### 🏗 Initiative > Epic > Items — hiérarchie complète

Aujourd'hui : Epic → Items (Story, Bug, Tâche, Spike). À faire :

- **Niveau Initiative** au-dessus des Epics : vision stratégique sur plusieurs mois, portée multi-équipes ou multi-produits
- Hiérarchie : Initiative → Epic → Items
- Vue dédiée (tree ou tableau) pour visualiser la hiérarchie complète
- Release Planning, Auto-planning et Roadmap capables d'afficher les 3 niveaux
- Backlog filtrable par Initiative

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

Page à créer — contenu à préciser :

- **Récap du sprint** : objectif, vélocité, items livrés vs planifiés, taux de completion
- **Demo checklist** : liste des items à présenter, cases à cocher en direct
- **Format slides** : une carte par item livré (description, client, SP), défilable en mode présentation
- **Actions de rétrospective** : lien direct vers la section Rétro du même sprint
- **Export PDF** : compte-rendu Sprint Review imprimable / partageable aux parties prenantes

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
