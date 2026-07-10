# Backlog des futures fonctionnalités - Cadence

> Dernière mise à jour : 10 juillet 2026. v0.78 : What-if UX — wallet cards, État actuel highlights, badges de mouvement, 53 tests unitaires. v0.79 : Release Planning — header contextuel, highlights Client × Type, Epic grouping DnD, scroll horizontal, icônes Lucide.

---

## 🎨 Design & UX

- **Mode présentation** — vue slide-ready pour Sprint Reviews, PI Planning ou comités. Masque la sidebar, agrandit le contenu, navigation au clavier.
- **Onboarding nouvel utilisateur** — parcours guidé à la première ouverture (tooltip progressive, checklist "premiers pas").

---

## 📋 Backlog & Planification

- **Capacité nominative par sprint** — allocation individuelle (qui fait quoi sur ce sprint), pas seulement une capacité globale d'équipe.
- **Épics et roadmap par thème** — regrouper les sprints ou les items par initiative / epic avec vue dédiée.
- **Critères de départ / d'entrée de sprint** — check-list de Sprint Planning (DoR équipe validée, capacité confirmée, objectif défini).

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

### Release Planning
- **Release Planning v2** ✅ *v0.79.0* — header contextuel (stats SP + items), filtres highlights Client × Type (AND), colonnes sprint fixes 380px + scroll horizontal BFC, panneau Non-assigné sous la grille, Epic grouping avec DnD groupe/individuel bidirectionnel, icônes Lucide SVG inline
- **Release Planning v3** ✅ *v0.80.0* — Gantt par membre (charge SP/capacité avec jours fériés, remplace Calendrier), Swimlanes par client (toggle Grille), indicateur de faisabilité sprint OK/Limite/Surcharge, deadlines flottantes sur les cards avec alerte header sprint, vue dépendances cross-sprint (overlay SVG Bézier activable)

### Design & UX
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
- **Tags / labels libres** ✅ *v0.47.0* — tags sur items et membres, autocomplete, filtre backlog, membres suggérés, ex