/**
 * @deprecated Remplacé par utils/hierarchyScore.ts (2026-07-28, Phase 1). Epic n'est plus
 * un `Item` (voir HierarchyNode dans types/index.ts) : `getEpicSP()` prend maintenant un
 * `HierarchyNode` en premier argument. Ce fichier ne peut pas être supprimé dans ce
 * sandbox (échec de suppression sur le montage réseau) — il ne fait que ré-exporter la
 * nouvelle implémentation ; à supprimer manuellement si l'occasion se présente.
 */
export { getEpicSP, getHierarchyNodeSP } from './hierarchyScore'
