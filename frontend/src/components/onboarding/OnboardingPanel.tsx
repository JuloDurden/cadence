import { useEffect } from 'react'
import { useOnboarding } from '../../context/OnboardingContext'
import { useDialog } from '../../context/DialogContext'

// Phase 2.5 (roadmap v1), Onboarding, point 3 (checklist) — panneau latéral, ouvert depuis le
// bouton Aide du Header (voir Header.tsx) ou automatiquement une seule fois pour un compte
// réellement nouveau (voir OnboardingContext.tsx). Chaque ligne cliquée navigue vers sa page et
// lance un tunnel de tooltips (voir activateItem, OnboardingContext.tsx).
//
// Retour Julien après un 1er essai : le panneau se fermait automatiquement dès qu'une ligne était
// cliquée — il doit au contraire "rester visible entre chaque étape du guide tant qu'on ne le
// ferme pas". Conséquences : plus de fermeture au clic extérieur (l'utilisateur doit pouvoir
// cliquer un bouton de la page pendant un tunnel sans refermer le panneau) — seules la croix et
// Echap ferment désormais. Repositionné par Julien en petit panneau ancré en bas à droite
// (`bottom`/`right`, 50vh de hauteur) plutôt qu'en plein hauteur sous le Header, pour prendre le
// moins de place possible pendant qu'un tunnel est en cours. `z-index: 10002`, volontairement
// au-dessus de tout (y compris le cadre de surbrillance des tunnels, z-index 10000) sauf la bulle
// `onboarding-spotlight` elle-même (z-index 10003, voir Spotlight.tsx) — la bulle doit toujours
// rester lisible par-dessus le panneau si les deux se chevauchent en bas de l'écran.
export function OnboardingPanel() {
  const { panelOpen, closePanel, checklist, completedItems, progress, activateItem, resetProgress } = useOnboarding()
  const { confirm } = useDialog()

  useEffect(() => {
    if (!panelOpen) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') closePanel() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [panelOpen, closePanel])

  async function handleReset() {
    const ok = await confirm(
      'La progression de toutes les lignes sera remise à zéro. Vous pourrez refaire le Guide de démarrage depuis le début.',
      { title: 'Réinitialiser le Guide de démarrage ?', confirmLabel: 'Réinitialiser', danger: true }
    )
    if (ok) resetProgress()
  }

  if (!panelOpen) return null

  return (
    <div
      data-testid="onboarding-panel"
      style={{
        position: 'fixed', bottom: '5px', right: '5px', height: '50vh', width: 360, maxWidth: '92vw',
        background: 'var(--surface)', borderLeft: '1px solid var(--border)', borderRadius: 'var(--radius)',
        boxShadow: '-8px 0 24px rgba(0,0,0,.18)', zIndex: 10002,
        display: 'flex', flexDirection: 'column',
      }}
    >
      <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Guide de démarrage</div>
          <button
            onClick={closePanel}
            aria-label="Fermer"
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}
          >×</button>
        </div>
        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)' }}>
          {progress.done} / {progress.total} étapes complétées
        </div>
        <div style={{ marginTop: 6, height: 6, borderRadius: 3, background: 'var(--surface2)', overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 3, background: 'var(--primary)',
            width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%`,
            transition: 'width .2s ease',
          }} />
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px' }}>
        {checklist.map(item => {
          const done = completedItems.includes(item.id)
          return (
            <button
              key={item.id}
              data-testid={`onboarding-item-${item.id}`}
              onClick={() => activateItem(item)}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 10, width: '100%', textAlign: 'left',
                padding: '10px 8px', borderRadius: 8, border: 'none', background: 'none', cursor: 'pointer',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface2)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              <span style={{
                flexShrink: 0, width: 18, height: 18, borderRadius: '50%', marginTop: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: done ? 'none' : '2px solid var(--border)',
                background: done ? 'var(--primary)' : 'none',
                color: '#fff', fontSize: 11,
              }}>
                {done ? '✓' : ''}
              </span>
              <span>
                <div style={{ fontSize: 13, fontWeight: 600, color: done ? 'var(--text-muted)' : 'var(--text)', textDecoration: done ? 'line-through' : 'none' }}>
                  {item.label}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{item.description}</div>
              </span>
            </button>
          )
        })}
      </div>

      <div style={{ padding: '10px 18px', borderTop: '1px solid var(--border)' }}>
        <button
          data-testid="onboarding-reset-btn"
          onClick={handleReset}
          style={{
            background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer',
            fontSize: 12, padding: 0,
          }}
        >
          Réinitialiser le Guide de démarrage
        </button>
      </div>
    </div>
  )
}
