import { useCadence } from '../../context/StateContext'
import {
  PRESENTABLE_PAGE_CATALOG, DEFAULT_PRESENTATION_PAGE_IDS, resolvePresentationPages,
} from '../../data/presentablePages'
import type { PresentablePageId } from '../../data/presentablePages'

// Chantier "Config pages présentables" (roadmap v1, Phase 3 suite, 2026-08-02 — retour Julien du
// 2026-08-01) : sélection + ordre des pages du mode présentation, éditables par Admin + PO (même
// gating que PresentationLinkSection.tsx, fait par l'appelant SettingsPage.tsx). Persisté dans
// `state.settings.presentationPages` (liste d'ids ordonnée) — récupéré automatiquement par les
// DEUX points d'entrée du mode présentation (compte connecté et lien public), qui lisent tous les
// deux le même `WorkspaceState.data`, voir PresentationModeContext.tsx et PresentationPublicPage.tsx.
//
// Sauvegarde immédiate à chaque action (monter/descendre/retirer/ajouter/réinitialiser), même
// convention que PresentationLinkSection.tsx et le toggle de thème (Header.tsx) — pas de bouton
// "Enregistrer" séparé pour ce genre de réglage.
export function PresentationPagesSection() {
  const { state, dispatch, saveToServer } = useCadence()

  // Tolère un id inconnu dans state.settings.presentationPages (catalogue modifié entre-temps) en
  // retombant sur la sélection par défaut plutôt que de planter — même logique de repli que
  // resolvePresentationPages, réutilisée ici pour obtenir la liste d'ids déjà filtrée/valide.
  const selectedIds: PresentablePageId[] = resolvePresentationPages(state.settings.presentationPages).map(p => p.id)
  const available = PRESENTABLE_PAGE_CATALOG.filter(p => !selectedIds.includes(p.id))

  function persist(next: PresentablePageId[]) {
    const nextSettings = { ...state.settings, presentationPages: next }
    dispatch({ type: 'UPDATE_SETTINGS', payload: nextSettings })
    saveToServer({ ...state, settings: nextSettings })
  }

  function moveUp(index: number) {
    if (index <= 0) return
    const next = [...selectedIds]
    ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
    persist(next)
  }
  function moveDown(index: number) {
    if (index >= selectedIds.length - 1) return
    const next = [...selectedIds]
    ;[next[index], next[index + 1]] = [next[index + 1], next[index]]
    persist(next)
  }
  function remove(id: PresentablePageId) {
    // Au moins 1 page doit rester présentable — le bouton est de toute façon désactivé dans ce cas,
    // garde-fou redondant si jamais appelé autrement.
    if (selectedIds.length <= 1) return
    persist(selectedIds.filter(x => x !== id))
  }
  function add(id: PresentablePageId) {
    if (selectedIds.includes(id)) return
    persist([...selectedIds, id])
  }
  function reset() {
    persist([...DEFAULT_PRESENTATION_PAGE_IDS])
  }

  function labelFor(id: PresentablePageId) {
    return PRESENTABLE_PAGE_CATALOG.find(p => p.id === id)?.label ?? id
  }

  return (
    <section data-testid="presentation-pages-section" style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: 20, marginBottom: 16 }}>
      <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Pages du mode présentation</h3>
      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.6 }}>
        Choisissez les pages affichées en mode présentation (bouton "Présenter" ou lien public) et leur ordre.
      </p>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
          Pages affichées, dans l'ordre
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {selectedIds.map((id, i) => (
            <div key={id} data-testid={`presentation-page-row-${id}`}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 6, background: 'var(--surface-alt)', border: '1px solid var(--border)' }}>
              <span style={{ flex: 1, fontSize: 12, fontWeight: 500 }}>{i + 1}. {labelFor(id)}</span>
              <button className="hdr-ctx-btn" style={{ fontSize: 11, padding: '3px 8px' }} title="Monter"
                data-testid={`presentation-page-up-${id}`} disabled={i === 0} onClick={() => moveUp(i)}>↑</button>
              <button className="hdr-ctx-btn" style={{ fontSize: 11, padding: '3px 8px' }} title="Descendre"
                data-testid={`presentation-page-down-${id}`} disabled={i === selectedIds.length - 1} onClick={() => moveDown(i)}>↓</button>
              <button className="hdr-ctx-btn" style={{ fontSize: 11, padding: '3px 8px' }} title="Retirer de la présentation"
                data-testid={`presentation-page-remove-${id}`} disabled={selectedIds.length <= 1} onClick={() => remove(id)}>Retirer</button>
            </div>
          ))}
        </div>
      </div>

      {available.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
            Ajouter une page
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {available.map(p => (
              <button key={p.id} className="hdr-ctx-btn" style={{ fontSize: 11 }}
                data-testid={`presentation-page-add-${p.id}`} onClick={() => add(p.id)}>
                + {p.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <button className="hdr-ctx-btn" style={{ fontSize: 11 }} data-testid="presentation-pages-reset" onClick={reset}>
        Réinitialiser (sélection par défaut)
      </button>
    </section>
  )
}
