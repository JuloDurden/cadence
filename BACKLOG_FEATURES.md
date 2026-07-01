# Backlog des futures fonctionnalités - Cadence

> Dernière mise à jour : 1er juillet 2026 — Tri effectué : ✅ réalisé archivé en bas, seules les features à faire restent ici.

---

## 🎨 Design & UX

- **Mode présentation** — vue slide-ready pour Sprint Reviews, PI Planning ou comités. Masque la sidebar, agrandit le contenu, navigation au clavier.
- **Onboarding nouvel utilisateur** — parcours guidé à la première ouverture (tooltip progressive, checklist "premiers pas").

---

## 📋 Backlog & Planification

- **Tags / labels libres** — catégoriser les items en dehors de la dimension client (ex. "Front", "API", "Dette technique").
- **Capacité nominative par sprint** — allocation individuelle (qui fait quoi sur ce sprint), pas seulement une capacité globale d'équipe.
- **Mode "what-if"** — remplissage manuel d'un planning alternatif + vue comparaison avant/après (l'auto-planning existe déjà mais ne permet pas de comparaison).
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

- **Export / Import JSON** — sauvegarde et restauration complète de l'état, utile pour migration ou archivage.
- **Import depuis Jira / Excel** — ingestion d'un backlog existant via CSV ou JSON Jira.
- **Intégration Slack** — envoi automatique du résumé du Daily ou de la clôture de sprint dans un canal.

---
---

## ✅ Réalisé (pour mémoire)

### Design & UX
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
- **Export PDF (Planning / Roadmap)** ✅ *v0.09.0*
- **RAG par client** ✅ *v0.11.0*
- **Dashboard personnalisable** ✅ *v0.38.0–0.42.0* — grille de widgets, drag-and-drop, zones verticales
- **Statuts avancés** ✅ *en place* — catalogue de statuts Kanban configurables

### Cérémonies Scrum
- **Daily Standup helper** ✅ *v0.26.0* — timer, blocker board, export résumé
- **Rétrospective** ✅ *v0.23.0* — formats SSC / Mad-Sad-Glad / 4Ls, votes nominatifs, actions
- **Onglet Historique** ✅ *v0.17.0* — journal des actions, filtres, purge
- **Undo / Redo (Ctrl+Z / Ctrl+Y)** ✅ *v0.16.0*

### Collaboration & Utilisateurs
- **Commentaires collaboratifs threaded** ✅ *v0.35.0* — réponses imbriquées, auteur, images, liens
- **Gestion des utilisateurs (profil actif)** ✅ *v0.31.0* — sélecteur "Je suis…", votes nominatifs, historique tagué
- **Capacité sprint en temps réel** ✅ *en place* — N membres × durée × SP/jour, absences déduites
