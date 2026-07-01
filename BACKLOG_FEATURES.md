# Backlog des futures fonctionnalités - Cadence

> Fichier de référence pour les idées de features. Non priorisé, non exhaustif.
> Dernière mise à jour : 26 juin 2026

---

## 🎨 Design & UX

- **Refonte complète du design** - nouveau look global de l'outil, révision possible du module DESIGN.md
- **Refonte de la page Réglages** ✅ *v0.26.0* - Thème et Export supprimés, Réinitialisation corrigée (état vide), SP/jour déplacé dans RH
- **Réorganisation sidebar** ✅ *v0.32.0* - Footer: 6 boutons uniformes 30×30px sans débordement. Menu Clients collapsible avec chevron et liste des clients. Bouton 📄 Rapport visible sur chaque carte client.
- **Refonte de la page Changelog** ✅ *déjà en place* - timeline verticale style macOS Dock, heatmap 21 jours, nav sticky avec magnification
- **Refonte des cartes items (Release Planning)** ✅ *déjà en place* - layout 2 lignes (description + méta), bordure gauche colorée par client, grille horizontale scrollable
- **Mode présentation** - vue slide-ready pour sprint reviews / PI Planning / comités
- **Vue calendrier** ✅ *déjà en place* - calendrier mensuel dans Release Planning, barres de sprint multi-semaine, today marker, jours fériés, navigation mois, modale détail sprint au clic

---

## 📋 Backlog & Planification

- **Rapport client imprimable** ✅ *v0.30.0* - export HTML standalone par client (bouton 📄 sur chaque carte client), KPIs, barre de progression, détail par sprint, CSS print intégré
- **Recherche globale** ✅ *v0.29.0* - modal Ctrl+K, live search sur clés/descriptions/US/notes/critères, navigation clavier, clic → ouvre la modale item
- **Dashboard personnalisable** - widgets déplaçables, métriques choisies par l'utilisateur
- **Suivi de vélocité & performance** ✅ *déjà en place* - graphique vélocité réelle vs estimée dans l'onglet Historique, drill-down par sprint avec liste des items et changements de statut
- **Burndown Chart** ✅ *v0.12.0* - burndown idéal vs réel par sprint sur le Dashboard
- **Lead time & Cycle time** ✅ *v0.34.0* - métriques de flow par sprint et global sur le Dashboard (createdAt, startedAt, completedAt trackés automatiquement)
- **Cumulative Flow Diagram** ✅ *v0.34.0* - stacked bars par jour de sprint sur le Dashboard, reconstruction depuis startedAt/completedAt
- **Capacité par personne** ✅ *partiellement* - SP/jour global configurable dans l'onglet RH avec calcul temps réel (N membres × durée sprint × SP/j). Manque : allocation nominative par sprint (qui fait quoi)
- **Mode "what-if"** ✅ *partiellement* - l'auto-planning permet déjà de simuler sans sauvegarder. Manque : remplissage manuel d'un planning alternatif + vue comparaison avant/après
- **Statuts avancés sur les items** ✅ *partiellement* - statuts Kanban personnalisables. Manque : liste de suggestions prédéfinies à la création, réorganisation des statuts par drag & drop
- **Critères d'acceptation (Gherkin)** ✅ *déjà en place* - onglet User Story avec format Étant donné / Quand / Alors sur stories et epics
- **Tags / labels libres** - catégoriser les items en dehors de la dimension client

---

## 👥 Utilisateurs & Collaboration

- **Commentaires collaboratifs** ✅ *v0.35.0* - threading (réponses imbriquées par parentId), auteur tagué via profil actif, support URL image (preview inline), auto-linkification des URLs
- **Gestion des utilisateurs** ✅ *v0.31.0 partiel* - sélecteur "Je suis…" dans la sidebar (parmi les membres de l'équipe), persisté en localStorage. Votes retro nominatifs par userId. Historique tagué par auteur. Manque : login/auth, rôles (PO/Dev/Stakeholder), permissions, multi-device
- **Onboarding nouvel utilisateur** - parcours guidé à la première ouverture
- **Partage en lecture seu