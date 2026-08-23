// Phase 7 (Polish final, 2026-08-23) : échappement HTML minimal pour tout texte utilisateur
// affiché via dangerouslySetInnerHTML (surlignage de résultat de recherche - Header.tsx,
// ChangelogPage.tsx). Sans ça, une description d'item ou un texte de changelog contenant du HTML
// (ex. "<img src=x onerror=...>") s'exécutait tel quel chez quiconque tombait dessus en cherchant
// - faille XSS stockée trouvée en auditant le code avant ce chantier, voir docs/corrections.md.
// Volontairement séparé de la sanitisation DOMPurify du texte NNL (voir NNLCanvas.tsx) : ici on
// n'a jamais besoin de conserver du HTML (juste du texte brut + un <mark> ajouté après coup), donc
// un échappement complet est plus simple et plus sûr qu'une liste blanche de balises.
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
