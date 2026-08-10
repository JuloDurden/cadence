// Phase 6 (roadmap v1), Compagnon IA, sous-chantier 3 (detection d'anomalies), 2026-08-10 : Julien
// a teste le chat en pre-travail de ce sous-chantier et a directement demande des raccourcis
// ("/points", "/story"...) plutot qu'une phrase a chaque fois - decision actee, avec un "/audit"
// qui lance tout d'un coup. Detection et expansion cote CLIENT (ChatContext.tsx) : le backend ne
// connait rien des commandes, seulement des prompts en langage naturel comme n'importe quel autre
// message - meme principe "commencer simple" que le reste du chat (pas d'etat serveur ajoute pour
// une fonctionnalite qui n'est qu'un raccourci de saisie).
//
// Chaque commande porte un `prompt` (envoye a l'API) distinct de ce que l'utilisateur tape (`cmd`,
// affiche tel quel dans sa bulle - voir ChatMessage.apiContent, types/index.ts) : la bulle de
// Julien reste courte ("/audit") plutot que d'afficher le paragraphe complet envoye au modele.
export interface ChatCommand {
  cmd: string          // ex. "/points", tape par l'utilisateur
  label: string        // libelle court affiche dans le popover d'aide
  description: string  // description affichee dans le popover d'aide et l'infobulle rotative
  prompt: string        // texte reellement envoye a l'API a la place de `cmd`
}

export const CHAT_COMMANDS: ChatCommand[] = [
  {
    cmd: '/points', label: 'Sans Story Points',
    description: 'Liste les items sans Story Points attribues.',
    prompt: 'Liste les items qui n\'ont pas de Story Points attribues (0 SP).',
  },
  {
    cmd: '/story', label: 'Sans User Story',
    description: 'Liste les User Stories sans role/besoin/benefice renseigne.',
    prompt: 'Parmi les items de type User Story, liste ceux dont le role, le besoin et le benefice sont tous les 3 vides.',
  },
  {
    cmd: '/acceptance', label: 'Sans critere d\'acceptation',
    description: 'Liste les items sans aucun critere d\'acceptation.',
    prompt: 'Liste les items qui n\'ont aucun critere d\'acceptation renseigne.',
  },
  {
    cmd: '/ready', label: 'DoR incomplete',
    description: 'Liste les items dont la Definition of Ready n\'est pas complete.',
    prompt: 'Liste les items dont la Definition of Ready est incomplete (vide, ou avec au moins une case non cochee).',
  },
  {
    cmd: '/done', label: 'DoD incomplete',
    description: 'Liste les items dont la Definition of Done n\'est pas complete.',
    prompt: 'Liste les items dont la Definition of Done est incomplete (vide, ou avec au moins une case non cochee).',
  },
  {
    cmd: '/assign', label: 'Non assignes',
    description: 'Liste les items non termines sans aucun assigne.',
    prompt: 'Liste les items non termines qui n\'ont aucun assigne.',
  },
  {
    cmd: '/deadline', label: 'Deadlines a risque',
    description: 'Liste les items non termines avec une date de livraison depassee ou proche (7 jours).',
    prompt: 'Liste les items non termines dont la date de livraison est deja depassee, ou tombe dans les 7 prochains jours. Distingue les 2 cas dans la reponse.',
  },
  {
    cmd: '/blocked', label: 'Items bloques',
    description: 'Liste les items actuellement au statut Bloque.',
    prompt: 'Liste les items actuellement au statut Bloque.',
  },
  {
    cmd: '/epic', label: 'Ecart de SP (Epic)',
    description: 'Liste les Epics/Initiatives dont le score en SP ne correspond pas a la somme de leurs items.',
    prompt: 'Liste les Epics et Initiatives dont le score en Story Points ne correspond pas a la somme des Story Points de leurs items rattaches.',
  },
  {
    cmd: '/sprint', label: 'Sprint en cours sans SP',
    description: 'Liste les items du sprint en cours sans Story Points.',
    prompt: 'Liste les items du sprint en cours qui n\'ont pas de Story Points attribues.',
  },
  {
    cmd: '/stale', label: 'Dependances obsoletes',
    description: 'Liste les items dependant d\'un item deja termine.',
    prompt: 'Liste les items dont au moins une dependance pointe vers un item deja termine.',
  },
  {
    cmd: '/audit', label: 'Audit complet', description: 'Lance toutes les verifications ci-dessus et fait une synthese.',
    prompt: 'Fais un etat des lieux complet du Backlog. Pour chacune des categories suivantes, indique le nombre d\'items concernes et leur Cle, dans un rapport structure par section (un titre markdown par categorie) : sans Story Points, User Stories sans role/besoin/benefice, sans critere d\'acceptation, Definition of Ready incomplete, Definition of Done incomplete, non termines sans assigne, deadlines depassees, deadlines dans les 7 prochains jours, items actuellement bloques, Epics/Initiatives avec un ecart de SP par rapport a leurs items, items du sprint en cours sans Story Points, items dependant d\'un item deja termine. Termine par un court resume des points les plus urgents.',
  },
]

export function matchChatCommand(text: string): ChatCommand | undefined {
  const trimmed = text.trim().toLowerCase()
  return CHAT_COMMANDS.find(c => c.cmd === trimmed)
}
