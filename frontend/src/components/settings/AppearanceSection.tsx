import { useState, useEffect } from 'react'
import type { Settings, DisplayDensity } from '../../types'
import { DENSITY_SCALE } from '../../context/StateContext'
import { usePersonalSettings } from '../../context/PersonalSettingsContext'
import { ImageCropModal } from '../ui/ImageCropModal'

// Phase 6bis (roadmap v1), sous-chantier 4 (2026-08-13) : section Apparence étoffée (thème
// Système + cartes visuelles, couleur principale par thème avec aperçu concret, logo d'équipe,
// densité d'affichage, page de démarrage, sidebar repliée par défaut), voir maquette validée avec
// Julien avant codage (3 itérations : cartes de thème, prévisualisation couleur, positionnement du
// logo retiré du périmètre, écran de connexion explicitement exclu de ce sous-chantier).
// Icônes : même idiome que les autres fichiers du projet (`Svg`/`ICO_*` locaux, dupliqués par
// fichier plutôt que partagés, voir ItemModal.tsx/SettingsPage.tsx).

function Svg({ d, size = 14 }: { d: string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    dangerouslySetInnerHTML={{ __html: d }} />
}

const ICO_SUN = '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>'
const ICO_MOON = '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>'
const ICO_MONITOR = '<rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/>'
const ICO_CHECK = '<path d="M20 6 9 17l-5-5"/>'
const ICO_UPLOAD = '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>'

const PALETTE_LIGHT = ['#4f46e5', '#2563eb', '#0891b2', '#059669', '#d97706', '#dc2626', '#db2777', '#7c3aed']
const PALETTE_DARK  = ['#7c7ff5', '#5b9bf0', '#3fc4d6', '#4ade80', '#fbbf24', '#f87171', '#f472b6', '#a78bfa']

const DENSITY_ORDER: DisplayDensity[] = ['compact-2', 'compact', 'comfortable', 'spacious', 'spacious-2']
const DENSITY_LABELS: Record<DisplayDensity, string> = {
  'compact-2': 'Très compact', 'compact': 'Compact', 'comfortable': 'Confortable',
  'spacious': 'Spacieux', 'spacious-2': 'Très spacieux',
}

const START_PAGE_OPTIONS = [
  { value: '/dashboard', label: 'Dashboard' },
  { value: '/backlog', label: 'Product Backlog' },
  { value: '/sprint-planning', label: 'Sprint Planning' },
  { value: '/kanban', label: 'Kanban' },
]

/** Thème réellement affiché à l'instant (résout 'system' via prefers-color-scheme, réévalué en
 *  direct si l'appareil change de réglage). Même logique que l'effet global de StateContext.tsx,
 *  dupliquée ici pour piloter l'affichage de cette section sans dépendre de son ordre de montage. */
function useEffectiveTheme(mode: Settings['theme']): 'light' | 'dark' {
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  useEffect(() => {
    if (mode !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => setSystemDark(mq.matches)
    handler()
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [mode])
  if (mode === 'light' || mode === 'dark') return mode
  return systemDark ? 'dark' : 'light'
}

/** Applique un thème immédiatement sur <html>, y compris 'system' (résolu tout de suite via
 *  prefers-color-scheme), retour Julien (2026-08-14) : "le thème Système ne se met à jour qu'en
 *  appliquant", contrairement à Clair/Sombre qui s'appliquaient déjà au clic. Redondant avec
 *  l'effet global de StateContext.tsx une fois "Enregistrer" cliqué, mais c'est justement ce qui
 *  manquait avant l'enregistrement. */
function applyThemeAttrLive(mode: Settings['theme']) {
  const resolved = mode === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : mode
  document.documentElement.setAttribute('data-theme', resolved)
}

function ColorSwatchRow({ palette, value, onPick }: { palette: string[]; value: string; onPick: (c: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
      {palette.map(c => (
        <button key={c} type="button" aria-label={c} onClick={() => onPick(c)}
          style={{
            width: 22, height: 22, borderRadius: '50%', background: c, cursor: 'pointer', padding: 0,
            border: `2px solid ${c.toLowerCase() === value.toLowerCase() ? 'var(--text)' : 'transparent'}`,
          }} />
      ))}
    </div>
  )
}

/** Miniature d'un thème (barre latérale + 3 lignes de contenu), réutilisée telle quelle pour les
 *  cartes Clair/Sombre et, recomposée à 50/50, pour la carte Système. */
function ThemeThumb({ sidebarBg, contentBg, bar, primary }: { sidebarBg: string; contentBg: string; bar: string; primary: string }) {
  return (
    <div style={{ display: 'flex', width: '100%', height: '100%' }}>
      <div style={{ width: 18, background: sidebarBg, flexShrink: 0 }} />
      <div style={{ flex: 1, padding: 6, display: 'flex', flexDirection: 'column', gap: 4, background: contentBg }}>
        <div style={{ width: '60%', height: 5, borderRadius: 2, background: primary }} />
        <div style={{ width: '80%', height: 5, borderRadius: 2, background: bar }} />
        <div style={{ width: '40%', height: 5, borderRadius: 2, background: bar }} />
      </div>
    </div>
  )
}

type ThemeCardId = 'system' | 'light' | 'dark'

function ThemeCard({ id, label, icon, active, onClick }: { id: ThemeCardId; label: string; icon: string; active: boolean; onClick: () => void }) {
  return (
    <div onClick={onClick} data-testid={`theme-card-${id}`} className={active ? 'active' : ''} style={{
      flex: 1, cursor: 'pointer', borderRadius: 10, position: 'relative',
      border: `2px solid ${active ? 'var(--primary)' : 'transparent'}`, padding: 6,
    }}>
      <div style={{ height: 56, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)', display: 'flex' }}>
        {id === 'light' && <ThemeThumb sidebarBg="#ffffff" contentBg="#f5f5f7" bar="#d1d1d6" primary="#4f46e5" />}
        {id === 'dark' && <ThemeThumb sidebarBg="#000000" contentBg="#1c1c1e" bar="#48484a" primary="#7c7ff5" />}
        {id === 'system' && (
          <>
            {/* Moitié gauche = moitié gauche réelle de la carte Clair, moitié droite = moitié
                droite réelle de la carte Sombre, recomposées sur toute la largeur de la carte
                (retour Julien : pas juste 2 icônes soleil/lune côte à côte). */}
            <div style={{ width: '50%', height: '100%', overflow: 'hidden', position: 'relative' }}>
              <div style={{ width: '200%', height: '100%', position: 'absolute', left: 0, top: 0 }}>
                <ThemeThumb sidebarBg="#ffffff" contentBg="#f5f5f7" bar="#d1d1d6" primary="#4f46e5" />
              </div>
            </div>
            <div style={{ width: '50%', height: '100%', overflow: 'hidden', position: 'relative' }}>
              <div style={{ width: '200%', height: '100%', position: 'absolute', left: '-100%', top: 0 }}>
                <ThemeThumb sidebarBg="#000000" contentBg="#1c1c1e" bar="#48484a" primary="#7c7ff5" />
              </div>
            </div>
          </>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: 'var(--text)', marginTop: 6 }}>
        <Svg d={icon} size={11} />{label}
      </div>
      {active && (
        <div style={{ position: 'absolute', top: 2, right: 2, width: 16, height: 16, borderRadius: '50%', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Svg d={ICO_CHECK} size={10} />
        </div>
      )}
    </div>
  )
}

/** Fenêtre concrète (onglets, boutons, mini-liste) prévisualisant une seule couleur/thème à la
 *  fois, pas 2 aperçus côte à côte en continu (retour Julien : dans l'app réelle, un seul affichage
 *  reflète le thème effectivement choisi, cette fenêtre bascule juste manuellement pour comparer). */
function ColorWindow({ variant, primary }: { variant: 'light' | 'dark'; primary: string }) {
  const t = variant === 'light'
    ? { bg: '#f5f5f7', surface: '#ffffff', text: 'var(--text, #1d1d1f)', muted: '#6e6e73', border: 'rgba(0,0,0,.09)' }
    : { bg: '#1c1c1e', surface: '#2c2c2e', text: '#f5f5f7', muted: '#aeaeb2', border: 'rgba(255,255,255,.1)' }
  const tint = primary + '1a'
  return (
    <div style={{ borderRadius: 8, overflow: 'hidden', border: `1px solid ${t.border}`, background: t.bg }}>
      <div style={{ display: 'flex', gap: 14, padding: '8px 12px', background: t.surface, borderBottom: `1px solid ${t.border}` }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: primary, padding: '4px 8px', borderRadius: 6, background: tint }}>Backlog</span>
        <span style={{ fontSize: 11, color: t.muted, padding: '4px 8px' }}>Sprint</span>
      </div>
      <div style={{ padding: '10px 12px' }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#fff', background: primary, borderRadius: 6, padding: '5px 10px' }}>+ Nouveau</span>
          <span style={{ fontSize: 11, color: t.text, border: `1px solid ${t.border}`, borderRadius: 6, padding: '5px 10px' }}>Filtrer</span>
        </div>
        <div style={{ background: t.surface, borderRadius: 6, border: `1px solid ${t.border}`, overflow: 'hidden' }}>
          {[0, 1].map(i => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderBottom: i === 0 ? `1px solid ${t.border}` : 'none' }}>
              <span style={{ width: 12, height: 12, borderRadius: 4, border: `2px solid ${primary}`, flexShrink: 0 }} />
              <span style={{ flex: 1, height: 6, borderRadius: 3, background: i === 0 ? t.text : t.muted, opacity: .8, maxWidth: i === 0 ? '70%' : '50%' }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function AppearanceSection({ settings, onChange, showTeamLogo = true }: { settings: Settings; onChange: (patch: Partial<Settings>) => void; showTeamLogo?: boolean }) {
  // Thème/couleur principale/densité/page de démarrage devenus des préférences personnelles
  // (2026-08-19, décision Julien), lus/écrits directement via PersonalSettingsContext.tsx plutôt
  // que par les props `settings`/`onChange` (qui restent réservées aux réglages partagés : Logo
  // d'équipe, Sidebar repliée par défaut, voir plus bas). `effective` résout déjà le repli sur la
  // valeur workspace pour un compte qui n'a encore rien personnalisé.
  const { effective: personal, updatePersonal } = usePersonalSettings()
  const colorLight = personal.primaryColorLight || '#4f46e5'
  const colorDark = personal.primaryColorDark || '#7c7ff5'
  const effectiveTheme = useEffectiveTheme(personal.theme)
  const density = personal.density
  const densityIndex = DENSITY_ORDER.indexOf(density)
  const scale = DENSITY_SCALE[density]
  // Recadrage du logo (2026-08-19, retour Julien) : image brute en attente de recadrage, voir
  // ImageCropModal.tsx plus bas.
  const [logoCropSrc, setLogoCropSrc] = useState<string | null>(null)

  return (
    <>
      {/* Thème */}
      <section style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: 20, marginBottom: 16 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Thème</h3>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.6 }}>
          Système suit le réglage clair/sombre de l'appareil et bascule automatiquement.
        </p>
        <div style={{ display: 'flex', gap: 12 }}>
          <ThemeCard id="system" label="Système" icon={ICO_MONITOR} active={personal.theme === 'system'}
            onClick={() => { applyThemeAttrLive('system'); updatePersonal({ theme: 'system' }) }} />
          <ThemeCard id="light" label="Clair" icon={ICO_SUN} active={personal.theme === 'light'}
            onClick={() => { applyThemeAttrLive('light'); updatePersonal({ theme: 'light' }) }} />
          <ThemeCard id="dark" label="Sombre" icon={ICO_MOON} active={personal.theme === 'dark'}
            onClick={() => { applyThemeAttrLive('dark'); updatePersonal({ theme: 'dark' }) }} />
        </div>
      </section>

      {/* Couleur principale (retour Julien, 2026-08-14) : un seul réglage visible à la fois, celui
          du thème effectivement affiché (Système résolu), pas de bascule manuelle indépendante du
          thème choisi ci-dessus. */}
      <section style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: 20, marginBottom: 16 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Couleur principale</h3>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.6 }}>
          Une couleur dédiée par thème, pour garder un bon contraste en sombre. Le réglage affiché suit le thème actuellement affiché ({effectiveTheme === 'light' ? 'Clair' : 'Sombre'}{personal.theme === 'system' ? ', via Système' : ''}).
        </p>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>
              <Svg d={effectiveTheme === 'light' ? ICO_SUN : ICO_MOON} size={13} />Thème {effectiveTheme === 'light' ? 'clair' : 'sombre'}
            </label>
            {effectiveTheme === 'light' ? (
              <>
                <ColorSwatchRow palette={PALETTE_LIGHT} value={colorLight} onPick={c => updatePersonal({ primaryColorLight: c })} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                  <input type="color" data-testid="primary-color-light" value={colorLight} onChange={e => updatePersonal({ primaryColorLight: e.target.value })}
                    style={{ width: 26, height: 26, padding: 0, border: '1px solid var(--border-strong)', borderRadius: 6, cursor: 'pointer' }} />
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{colorLight.toUpperCase()}</span>
                </div>
              </>
            ) : (
              <>
                <ColorSwatchRow palette={PALETTE_DARK} value={colorDark} onPick={c => updatePersonal({ primaryColorDark: c })} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                  <input type="color" data-testid="primary-color-dark" value={colorDark} onChange={e => updatePersonal({ primaryColorDark: e.target.value })}
                    style={{ width: 26, height: 26, padding: 0, border: '1px solid var(--border-strong)', borderRadius: 6, cursor: 'pointer' }} />
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{colorDark.toUpperCase()}</span>
                </div>
              </>
            )}
          </div>
        </div>
        <div data-testid="color-preview-window" style={{ maxWidth: 340 }}>
          <ColorWindow variant={effectiveTheme} primary={effectiveTheme === 'light' ? colorLight : colorDark} />
        </div>
      </section>

      {/* Logo (retour Julien, 2026-08-19 : "la zone pour changer de logo n'a plus besoin
          d'afficher les initiales ACT", plus de pastille de repli avec initiales, seulement un
          bouton d'upload et, si un logo est chargé, sa prévisualisation, rien de plus). Réglage
          d'équipe/workspace, pas une préférence personnelle : masqué pour un compte Dev, voir
          `showTeamLogo` (SettingsPage.tsx, décision Julien même jour), contrairement au reste de
          cette section (Thème/Couleur/Réglages d'affichage) qui reste visible à tous les rôles.
          Recadrage (déplacement + zoom, même retour Julien, même jour) : réutilise
          ImageCropModal.tsx (extrait de TeamPage.tsx), `shape="square"` (pas de clip circulaire
          baké dans l'image exportée, contrairement aux photos de profil, chaque contexte
          d'affichage du logo a son propre arrondi CSS). */}
      {showTeamLogo && (
      <section style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: 20, marginBottom: 16 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Logo de l'équipe</h3>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.6 }}>
          Affiché dans la Sidebar (et, à terme, en Mode présentation et à l'export).
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {settings.logoDataUrl && (
            <div data-testid="logo-preview" style={{ width: 44, height: 44, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0, border: '1px solid var(--border)' }}>
              <img src={settings.logoDataUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <label style={{ fontSize: 12, padding: '6px 12px', border: '1px solid var(--border-strong)', borderRadius: 8, cursor: 'pointer', textAlign: 'center', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <Svg d={ICO_UPLOAD} size={13} />{settings.logoDataUrl ? 'Changer le logo' : 'Uploader un logo'}
                <input type="file" accept="image/*" data-testid="logo-upload-input" style={{ display: 'none' }} onChange={e => {
                  const file = e.target.files?.[0]; if (!file) return
                  const reader = new FileReader()
                  reader.onload = ev => setLogoCropSrc(ev.target?.result as string)
                  reader.readAsDataURL(file)
                  e.target.value = ''
                }} />
              </label>
            </div>
            {settings.logoDataUrl && (
              <div style={{ display: 'flex', gap: 12 }}>
                <span data-testid="logo-recrop-btn" onClick={() => setLogoCropSrc(settings.logoDataUrl!)} style={{ fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer', textDecoration: 'underline' }}>Recadrer</span>
                <span data-testid="logo-remove-btn" onClick={() => onChange({ logoDataUrl: undefined })} style={{ fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer', textDecoration: 'underline' }}>Retirer</span>
              </div>
            )}
          </div>
        </div>
      </section>
      )}

      {logoCropSrc && (
        <ImageCropModal
          src={logoCropSrc}
          shape="square"
          title="Recadrer le logo"
          onConfirm={cropped => { onChange({ logoDataUrl: cropped }); setLogoCropSrc(null) }}
          onCancel={() => setLogoCropSrc(null)}
        />
      )}

      {/* Réglages d'affichage */}
      <section style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: 20, marginBottom: 16 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>Réglages d'affichage</h3>

        <div style={{ marginBottom: 18 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 8 }}>Densité</label>
          <input type="range" data-testid="density-slider" min={0} max={4} step={1} value={densityIndex}
            onChange={e => updatePersonal({ density: DENSITY_ORDER[+e.target.value] })}
            style={{ width: '100%' }} />
          <div data-testid="density-label" style={{ textAlign: 'center', fontSize: 12, fontWeight: 600, marginTop: 4 }}>{DENSITY_LABELS[density]}</div>
          <div style={{ marginTop: 10, background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden' }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: scale.td, borderBottom: i < 2 ? '1px solid var(--border)' : 'none' }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--border-strong)', flexShrink: 0 }} />
                <span style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--border-strong)', maxWidth: '60%' }} />
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingTop: 14, borderTop: '1px solid var(--border)', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600 }}>Page de démarrage</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Page affichée après connexion, prend effet à la prochaine connexion</div>
          </div>
          <select className="form-input" data-testid="start-page-select" value={personal.defaultStartPage}
            onChange={e => updatePersonal({ defaultStartPage: e.target.value })} style={{ width: 'auto', fontSize: 12 }}>
            {START_PAGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600 }}>Sidebar repliée par défaut</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Au tout premier chargement, avant toute préférence explicite</div>
          </div>
          <button type="button" data-testid="sidebar-collapsed-default-toggle" onClick={() => onChange({ sidebarCollapsedDefault: !settings.sidebarCollapsedDefault })}
            style={{
              width: 34, height: 20, borderRadius: 99, position: 'relative', border: 'none', cursor: 'pointer', padding: 0,
              background: settings.sidebarCollapsedDefault ? 'var(--primary)' : 'var(--border-strong)',
            }}>
            <div style={{ width: 16, height: 16, borderRadius: '50%', background: '#fff', position: 'absolute', top: 2, left: settings.sidebarCollapsedDefault ? 16 : 2, transition: 'left .15s' }} />
          </button>
        </div>
      </section>
    </>
  )
}
