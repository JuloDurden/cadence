# Guide utilisateur - Cadence

Cadence est un outil de planification de releases Agile conçu pour les équipes Scrum. Il s'ouvre directement dans le navigateur (`cadence.html`), sans compte ni installation.

---

## Premier lancement

Au premier lancement, Cadence charge automatiquement un projet de démonstration avec des sprints, membres, clients et User Stories préconfigurés. Vous pouvez le réinitialiser à tout moment depuis **Réglages > Charger les données de démo**.

Toutes vos données sont sauvegardées localement dans le navigateur (localStorage). Elles persistent entre les sessions.

---

## Navigation

La barre latérale gauche regroupe les sections par cérémonie Scrum :

| Section | Usage principal |
|---------|-----------------|
| Dashboard | Vue d'ensemble du sprint actif et métriques |
| Backlog | Gérer et prioriser les User Stories |
| Kanban | Suivre l'avancement des items en cours |
| Release Planning | Planifier les sprints sur la roadmap |
| Daily Standup | Faciliter le daily avec l'équipe |
| Rétrospective | Animer la rétro de fin de sprint |
| Historique | Consulter le journal des actions |
| Équipe | Gérer les membres et la capacité |
| Clients | Gérer le portefeuille clients |
| Réglages | Configurer le projet |

En bas à gauche : `↩` Annuler (`Ctrl+Z`), `↪` Rétablir (`Ctrl+Y`), 🔍 Recherche globale (`Ctrl+K`).

---

## Backlog

Le Backlog liste toutes les User Stories du projet, qu'elles soient assignées à un sprint ou non.

### Créer une User Story

Cliquer sur **+ Nouvelle US** en haut du Backlog. La modale s'ouvre avec 6 onglets :

**Général**
- Clé auto-générée (ex. `AUT-3`) selon le client sélectionné
- Description, Story Points, client, sprint cible, assigné
- Type : User Story, Bug, Epic, Spike, Task
- Deadline facultative

**User Story**
- Format Connextra : En tant que *[rôle]*, je veux *[action]* afin de *[bénéfice]*
- Critères d'acceptation BDD (Étant donné / Quand / Alors)

**Dépendances**
- Rechercher et lier des items dont cette US dépend
- Les dépendances bloquantes sont signalées sur le Kanban

**Priorité**
- WSJF : Valeur Métier, Criticité Temps, RR/OE, Durée
- RICE : Portée, Impact, Confiance, Effort
- MoSCoW : Must / Should / Could / Won't

**Équipe**
- Assignation nominative
- Commentaires threaded (avec images et liens)

**DoR / DoD**
- Cocher les critères de Definition of Ready et Definition of Done
- Jauge de progression en temps réel (rouge 0%, orange <100%, vert 100%)

### Tags

Dans la modale US (onglet Général), un champ **Tags** permet d'associer un ou plusieurs labels à l'item. En commençant à taper, les tags existants sont proposés en autocomplete. Si le tag n'existe pas encore, l'option "＋ Créer" l'ajoute à la liste globale du projet. Les tags apparaissent ensuite sous forme de chips sur les lignes du backlog.

Dans la modale d'un membre (onglet Equipe), on peut lui associer des **tags de compétences** (ex. "Front", "API"). Quand un item porte des tags, l'onglet Equipe de sa modale affiche en priorité les membres dont les compétences correspondent, facilitant l'assignation.

### Rechercher et filtrer

La barre de recherche en haut du Backlog filtre en temps réel sur la description et la clé. Les menus déroulants permettent de filtrer par client, sprint ou **tag**, et de trier par priorité, SP, statut ou assigné.

### Supprimer un item

Cliquer sur ✕ à droite de la ligne dans le Backlog. L'action est annulable avec `Ctrl+Z`.

---

## Kanban

Le Kanban affiche les items du sprint actif organisés par statut.

### Configurer les colonnes

Cliquer sur **+ Ajouter une colonne** pour ouvrir le catalogue de statuts disponibles (Todo, Doing, In Review, Done, Blocked, Testing, etc.). Sélectionner les statuts à afficher.

### Changer le statut d'un item

Glisser-déposer la carte vers la colonne souhaitée. Le statut est mis à jour immédiatement et consigné dans l'historique.

### Trier le board

Le sélecteur en haut permet de trier les cartes par priorité, SP ou assigné.

---

## Release Planning

La Release Planning affiche tous les sprints sous forme de cartes.

### Structure d'une carte sprint

Chaque carte affiche : nom du sprint, dates, Sprint Goal, items assignés (2 lignes par item avec clé + description), barre de capacité (SP planifiés vs capacité équipe).

### Activer un sprint

Cliquer sur **Activer** sur la carte sprint. Le sprint actif est signalé par une bordure colorée et alimente le Dashboard et le Kanban.

### Ajouter un sprint

Cliquer sur **+ Nouveau sprint** dans la barre d'outils. Un sprint vide est créé avec les dates calculées automatiquement depuis la date de démarrage configurée dans les Réglages.

### Clôturer un sprint

Cliquer sur **Clôturer** sur la carte du sprint actif. Un snapshot de vélocité (SP livrés vs estimés) est figé et visible dans les métriques historiques du Dashboard.

### Vue calendrier

Le bouton 📅 bascule vers une vue calendrier mensuelle montrant les sprints positionnés dans le temps.

---

## Daily Standup

L'onglet Daily affiche une carte par membre de l'équipe avec trois champs :

- **Hier** - ce qui a été accompli
- **Aujourd'hui** - ce qui est prévu
- **Blocages** - impediments à remonter

Un **timer 15 minutes** est disponible pour cadrer la réunion.

Le **Blocker Board** se met à jour automatiquement dès qu'un membre saisit un blocage, centralisant les impediments pour le Scrum Master.

Le bouton **Copier le résumé** génère un export texte du daily (pour Slack ou Teams). Le bouton **Archiver** sauvegarde le daily dans l'historique.

---

## Rétrospective

### Formats disponibles

- **Start / Stop / Continue** (défaut) - ce qu'on commence, arrête, ou continue
- **Mad / Sad / Glad** - ressentis émotionnels de l'équipe
- **4Ls** - Liked, Learned, Lacked, Longed for

### Animer une rétro

1. Sélectionner le format en haut de l'écran
2. Chaque membre ajoute ses cartes dans les colonnes
3. Voter pour les cartes les plus importantes (votes nominatifs)
4. Documenter les **actions** issues de la rétro dans la section dédiée

---

## Auto-planning & Mode What-if

### Auto-planning

La page **Auto-planning** génère automatiquement une proposition de planification en distribuant les items du backlog sur les sprints ouverts selon vos critères.

Cliquez **Nouveau scénario** pour créer un scénario, configurez les critères (Priorité, Importance client, Socle commun, Dette technique) par drag-and-drop, puis cliquez **Générer**. La proposition apparaît sous forme de slots sprint avec SP utilisés / capacité.

Cliquez **Appliquer** pour écrire la proposition en base.

### Mode What-if

Le mode What-if permet de comparer plusieurs planifications alternatives sans modifier les données réelles.

**Concepts clés**

| Élément | Description |
|---------|-------------|
| État actuel | Lane read-only toujours présente — affiche la répartition actuelle des items en base |
| Scénario | Planification alternative indépendante avec ses propres critères, capacités et items fictifs |
| Fork | Créer un scénario B qui hérite des sprints passés d'un scénario A et diverge à partir d'un sprint choisi |
| Comparaison | Afficher deux scénarios côte à côte via le bouton **Comparer** |

**Créer et utiliser un scénario**

1. Cliquez **Nouveau scénario** — une card s'ajoute dans la pile (layout wallet)
2. Configurez les critères, le facteur de vélocité (slider 40–120%) et les capacités par sprint
3. Cliquez **Générer** pour voir la proposition
4. Cliquez **Appliquer** pour écrire ce scénario en base

**État actuel : filtres highlights**

Dans la card État actuel, le panneau gauche permet de surligner les items selon trois filtres combinables en logique AND :

- **Clients** : cocher un ou plusieurs clients
- **Type** : Bug, Story, Tâche...
- **Priorité** : Critique, Haute...

Cocher FAXFA + Bug + Critique met en évidence uniquement les bugs critiques du client FAXFA (pas tous les bugs, pas tous les items FAXFA).

**Badges de mouvement**

Dans une proposition de scénario, chaque item affiche un badge indiquant s'il a été avancé ou reculé par rapport à son sprint d'origine :

| Badge | Signification |
|-------|--------------|
| `+` | Item non assigné, nouvellement placé |
| `=` | Item conservé dans son sprint d'origine |
| `S3↗` | Item avancé depuis le Sprint 3 |
| `S1↘` | Item reculé depuis le Sprint 1 |

## Recherche globale

`Ctrl+K` (ou le bouton 🔍 en haut à droite) ouvre la recherche globale.

Elle cherche en temps réel sur les clés (`AUT-3`), descriptions, notes et commentaires de tous les items, toutes suites confondues. Cliquer sur un résultat ouvre directement l'item concerné.

---

## Historique & Undo

Toutes les actions modifiant l'état (création, modification, suppression d'item, changement de statut, clôture de sprint...) sont consignées dans l'**Historique** avec horodatage, description et **nom de l'auteur** si un profil est actif.

Le journal propose un filtre par auteur pour n'afficher que les actions d'un membre donné. Le widget Activité récente du Dashboard affiche également l'auteur de chaque action.

`Ctrl+Z` annule la dernière action. `Ctrl+Y` la rétablit. La pile d'annulation est visible dans l'info-bulle des boutons `↩` / `↪`.

---

## Équipe

### Gérer les membres

Cliquer sur **+ Ajouter un membre** pour créer un profil : nom, rôle, SP/jour, photo optionnelle.

La **capacité sprint** est recalculée en temps réel : `nb membres × durée sprint × SP/jour`.

### Absences

Déclarer les absences d'un membre sur un sprint réduit automatiquement la capacité calculée.

---

## Clients

Chaque client possède : label, clé (préfixe des clés d'items), couleur, tier (Strategic / Key / Standard / Occasional), CA annuel, description et liste de contacts.

Le **RAG** (Rouge/Ambre/Vert) est calculé automatiquement selon le ratio d'items livrés vs planifiés pour ce client. Il est visible sur le Dashboard et la Timeline.

Le bouton **Rapport** génère un export HTML imprimable par client avec les items livrés, en cours et à venir.

---

## Réglages

| Paramètre | Description |
|-----------|-------------|
| Nom du projet | Affiché dans le header |
| Nom de l'équipe | Affiché sous le nom du projet |
| Durée d'un sprint | En jours ouvrés (défaut : 10) |
| Date de démarrage | Sert au calcul des dates de sprint |
| SP/personne/jour | Ratio de capacité individuelle |
| DoR (critères) | Liste des critères de Definition of Ready applicables à tous les items |
| DoD (critères) | Liste des critères de Definition of Done applicables à tous les items |
| Tags | Liste des tags disponibles dans le projet (8 prédéfinis + ajout libre) |

La section **Tags** permet de gérer la bibliothèque de tags du projet. Les 8 tags prédéfinis (Front, Back, API, Infra, UX, Dette technique, Sécurité, Performance) ne peuvent pas être supprimés. Les tags ajoutés manuellement peuvent l'être - la suppression les retire de tous les items et membres.

Le bouton **Charger les données de démo** recharge le projet de démonstration (remplace les données actuelles).

### Données & Export

La section **Données & Export** regroupe tous les outils d'import et d'export.

**Sauvegarde complète**

| Bouton | Description |
|--------|-------------|
| 💾 Sauvegarder (JSON) | Télécharge un fichier JSON contenant l'intégralité de l'état du projet (sprints, items, équipe, clients, historique). Utilisez-le pour migrer d'un navigateur à l'autre ou faire une sauvegarde manuelle. |
| 📂 Restaurer (JSON) | Importe un fichier JSON précédemment exporté et remplace les données actuelles. |

**Backlog**

| Bouton | Description |
|--------|-------------|
| 📊 Exporter Excel | Exporte le backlog complet au format Excel (.xlsx). Requiert une connexion internet (bibliothèque SheetJS chargée depuis un CDN). Si indisponible, bascule automatiquement sur l'export CSV. |
| 📄 Exporter CSV | Exporte le backlog au format CSV, sans aucune dépendance externe. Fonctionne hors ligne. |
| 📥 Importer Excel / CSV | Importe un backlog depuis un fichier Excel ou CSV existant, avec mapping de colonnes et prévisualisation avant import. |

---

## Raccourcis

| Raccourci | Action |
|-----------|--------|
| `Ctrl+K` | Recherche globale |
| `Ctrl+Z` | Annuler |
| `Ctrl+Y` | Rétablir |
| `Échap` | Fermer modale / recherche |
