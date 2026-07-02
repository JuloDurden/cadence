# Backlog des futures fonctionnalités - Cadence

> Dernière mise à jour : 2 juillet 2026. v0.48 : Attribution utilisateur archivée. v0.49-v0.50 : Refonte visuelle Backlog (2 passes). v0.51 : Sidebar icones SVG + collapse. v0.52-v0.53 : Header fixe, dropdowns, fixes. v0.54 : Menu bar contextuel (style macOS) — contrôles de chaque page migrés dans le header. v0.55 : Corrections UI header contextuel — sidebar collapse, recherche, design boutons, Daily timer, Kanban/Retro/Planning. v0.56 : Corrections UI v2 — Sprint selects courts, filtres Backlog/Planning/Kanban/Retro alignés à droite, fix filtre Sprint/Tag Backlog, 144 tests Playwright.

---

## 🎨 Design & UX

- **Mode présentation** — vue slide-ready pour Sprint Reviews, PI Planning ou comités. Masque la sidebar, agrandit le contenu, navigation au clavier.
- **Onboarding nouvel utilisateur** — parcours guidé à la première ouverture (tooltip progressive, checklist "premiers pas").

---

## 📋 Backlog & Planification

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

- **Import depuis Jira / Excel** — ingestion d'un backlog existant via CSV ou JSON Jira.
- **Intégration Slack** — envoi automatique du résumé du Daily ou de la clôture de sprint dans un canal.

---
---

## ✅ Réalisé (pour mémoire)

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