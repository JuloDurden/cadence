# Backlog des futures fonctionnalités - Cadence

> Dernière mise à jour : 13 juillet 2026. v0.85.0 : Backlog colonnes DoR/DoD, filtre Prêt, filtre Statut, bandeau Sprint Planning. v0.84.x : Auto-planning ProposalPanel, fix SprintColumn Epic, ItemModal 3 modes, Sprint Planning dédié.

---

## v0.90

Voici les modifications que l'on peut apporter aux posts-its :

- **type de post-it** : feature, release,...
- **couleur du post-it**
- **titre du post-it**
- **ajout d'une image**
- **ajout d'un lien**
- **ajout de note**
- pouvoir rattacher les posts-its aux différents éléments quez l'on a créé jusqu'alors :
    - items (story, Epic, Initiative)
    - Sprint Goal
    - et si tu vois un ou des autres éléments à y rattacher... je suis preneur.

Si l'élément rattaché a une image, des notes ou un lien, ils seront visible en cliquant sur le post Le corps du post-it sera très simple : juste le titre du post-it, la couleur, un bouton pour modifier, un autre pour supprimer et des icônes représentant les détails du post-it (rattachement, image, note, lien).

On pourra ensuite rajouter d'autres éléments :

- une barre d'outils pour rajouter des formes (carré, rectangle, ellipse, flèche) que l'on peut évidemment modifier, colorer (fond, bords) et supprimer,
- un système de stylo, outil texte et marqueur pour pouvoir annoter des trucs ou dessiner des trucs,
- un système de calques (pour gérer les profondeurs et l'ordre d'affichage) que l'on peut aussi modifier, renommer, supprimer.

## 🎨 Design & UX

- **Mode présentation** — vue slide-ready pour Sprint Reviews, PI Planning ou comités. Masque la sidebar, agrandit le contenu, navigation au clavier.
- **Onboarding nouvel utilisateur** — parcours guidé à la première ouverture (tooltip progressive, checklist "premiers pas").

---

## 📋 Backlog & Planification

- **Capacité nominative par sprint** — allocation individuelle (qui fait quoi sur ce sprint), pas seulement une capacité globale d'équipe.
- **Épics et roadmap par thème** — regrouper les sprints ou les items par initiative / epic avec vue dédiée.

---

## 👥 Collaboration & Utilisateurs

- **Partage en lecture seule** — générer un lien (ou un export HTML autonome) consultable sans modifier les données.
- **Notifications** — alertes visuelles sur les items bloqués, les dépendances non satisfaites, les items sans assigné.
- **Rôles et permissions** — PO (lecture/écriture), Dev (écriture statut uniquement), Stakeholder (lecture), avec restrictions UI.

---

## 📊 Métriques & Reporting

- **Rapport de sprint** — export PDF/HTML automatique en fin de sprint (vélocité, items livrés, objectif atteint, retrospective actions).
- **Trend de vélocité sur N sprints** — graphique dédié (au-delà du seul historique par sprint déjà présent).
- **Forecast de livraison** — basé sur la vélocité moyenne, estimer la date de fin d'une epic ou d'un ensemble d'items.

---

## ⚙️ Technique & Intégration

- **Import depuis Jira / Excel** — ingestion d'un backlog existant via CSV ou JSON Jira.
- **Intégration Slack** — envoi automatique du résumé du Daily ou de la clôture de sprint dans un canal.

---
---

## ✅ Réalisé (pour mémoire)

### Auto-planning & What-if
- **Mode What-if** ✅ *v0.77.0* — scénarios alternatifs de planification avec branches Git-graph, forks, comparaison côte à côte, items fictifs, capacités par sprint et facteur de vélocité
- **What-if UX : wallet cards + highlights + badges** ✅ *v0.78.0* — layout iOS Wallet animé, État actuel avec filtres highlights combinables (AND), badges de mouvement S3↗/S1↘, extraction fonctions pures + 53 tests unitaires
- **Auto-planning ProposalPanel** ✅ *v0.84.0* — groupement Epic dans la proposition (en-tête Epic, compteur N/M, multi-sprint), highlight chaîne de dépendances au hover (BFS prédécesseurs + successeurs), badge dep avec clé directe et "Niv.N" pour les transitives, icône Lucide calendar-1 en remplacement de l'emoji 📅

### Release Planning
- **Release Planning v2** ✅ *v0.79.0* — header contextuel (stats SP + items), filtres highlights Client × Type (AND), colonnes sprint fixes 380px + scroll horizontal BFC, panneau Non-assigné sous la grille, Epic grouping avec DnD groupe/individuel bidirectionnel, icônes Lucide SVG inline
- **Release Planning v3** ✅ *v0.80.0* — Gantt par membre (charge SP/capacité avec jours fériés, remplace Calendrier), Swimlanes par client (toggle Grille), indicateur de faisabilité sprint OK/Limite/Surcharge, deadlines flottantes sur les cards avec alerte header sprint, vue dépendances cross-sprint (overlay SVG Bézier activable)
- **Fix items Epic dans SprintColumn** ✅ *v0.84.1* — les items de type Epic sans enfants dans le sprint étaient silencieusement ignorés (continue trop large) ; ils s'affichent désormais comme cards normales au même titre que Bug ou US

### Sprint Planning
- **Sprint Planning dédié** ✅ *v0.81.0* — page /sprint-planning avec kanban par membre (colonnes par dev + Non-assigné), drag-drop pour réassigner, barre de charge SP/capacité par dev (indicateur vert/orange/rouge), SP co-assignés divisés proportionnellement
- **Auto-attribution et co-assignation** ✅ *v0.82.0* — modal de configuration avec prévisualisation temps réel, co-assignation solo/duo/trio selon capacité, devs absents filtrés, bouton shredder "Effacer toutes les attributions", warning overflow SP

### Design & UX
- **ItemModal : 3 modes d'affichage** ✅ *v0.83.0* — sélecteur fenêtre centrée / volet latéral redimensionnable / pleine page, persistance du mode et de la largeur dans localStorage
- **Corrections UI header contextuel** ✅ *v0.55.0* — sidebar collapse décale le contenu, recherche avant notifications, design boutons uniformisé (référence Backlog), Daily timer à droite + 20/30 min + flash fin, Kanban sprint élargi + Ordre/Réorganiser/+Colonne dans header, Planning Client/Affichage en dropdowns, Retro sprint élargi + label format, icônes monochromes (Dashboard, Auto-planning).
- **Menu bar contextuel (style macOS)** ✅ *v0.54.0* — contrôles spécifiques à chaque page (filtres, sélecteurs, actions) migrés dans le header fixe via `#hdr-ctx`. Backlog, Dashboard, Kanban, Planning, Auto-planning, Daily, Rétrospective, Clients.
- **Réorganisation sidebar** ✅ *v0.32.0* — footer uniforme, menu Clients collapsible, bouton Rapport par client
- **Refonte des cartes items** ✅ *v0.40.0* — layout 2 lignes, bordure colorée par client
- **Refonte de la page Réglages** ✅ *v0.26.0*
- **Vue calendrier** ✅ *v0.21.0* — calendrier mensuel dans Release Planning
- **Refonte de la page Changelog** ✅ *v0.40.0* — timeline verticale, heatmap, magnification
- **Redesign global (système de design HIG)** ✅ *v0.40.0–0.42.0*
- **Refonte complète du design** ✅ *v0.40.0–0.42.0* — système de design HIG, tokens couleurs, dark mode

### Backlog & Planification
- **Rapport client imprimable** ✅ *v0.30.0*
- **Recherche globale Ctrl+K** ✅ *v0.29.0*
- **Burndown Chart** ✅ *v0.12.0*
- **Lead time & Cycle time** ✅ *v0.34.0*
- **Cumulative Flow Diagram** ✅ *v0.34.0*
- **DoR / DoD par item** ✅ *v0.20.0* — jauges et compteur X/Y
- **Critères d'acceptation BDD (Gherkin)** ✅ *en place*
- **Scoring WSJF / RICE / MoSCoW** ✅ *en place*
- **Sprint Goal** ✅ *v0.34.0*
- **Clôture de sprint + snapshot vélocité** ✅ *v0.19.0*
- **Auto-planning** ✅ *en place* — affectation selon capacité et dépendances
- **Export Excel (backlog)** ✅ *v0.09.0*
- **Export / Import JSON** ✅ *v0.46.0* — sauvegarde et restauration complète, import/export unifiés dans Réglages
- **Export CSV natif (backlog)** ✅ *v0.46.0* — zéro dépendance, fallback auto si SheetJS indisponible
- **Tags / labels libres** ✅ *v0.47.0* — tags sur items et membres, autocomplete, filtre backlog, membres suggérés, export CSV+Excel avec colonne Tags, gestion globale des tags dans Réglages
- ~~**Critères de départ / d'entrée de sprint**~~ ✅ *v0.85.0* — colonnes DoR/DoD dans le Backlog (encoche si 100%), filtre "Prêt", filtre Statut, bandeau Sprint Planning pour les items sans DoR complète.
