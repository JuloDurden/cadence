import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import type { PersonalSettings, ThemeMode, DisplayDensity } from '../types'
import { useAuth } from '../hooks/useAuth'
import { useCadence, DENSITY_SCALE } from './StateContext'
import { api } from '../services/api'
import { CADENCE_MARK_VIEWBOX, CADENCE_MARK_TRANSFORM, CADENCE_MARK_PATH } from '../assets/cadenceMark'

// Préférences personnelles (2026-08-19, décision Julien : "Le thème employé et les différentes
// préférences sont spécifiques aux utilisateurs. Un admin peut avoir une sidebar collapsée, un
// thème sombre avec une couleur principale orange tandis qu'un dev peut avoir sa sidebar non
// collapsée, un thème clair et une couleur principale verte"), thème/couleur principale/densité/
// page de démarrage, propres au compte connecté (backend `User.personalSettings`, voir
// backend/src/routes/personalSettings.ts), distincts de `state.settings` (workspace partagé,
// StateContext.tsx). Même structure de Provider que OnboardingContext.tsx (chargement une fois par
// token, `loadedForToken`). Monté À L'INTÉRIEUR de StateProvider (voir App.tsx) : la résolution en
// cascade ci-dessous a besoin de `state.settings` comme valeur de repli pour un compte qui n'a
// encore rien personnalisé, plutôt que d'inventer des valeurs par défaut dupliquées ici, ça évite
// aussi de casser l'écran de connexion (public, hors StateProvider), qui continue de lire
// `/api/public/branding` (workspace) sans rien savoir de ce contexte.
interface PersonalSettingsContextValue {
  // Valeurs brutes du compte (peuvent être partiellement vides tant que rien n'a été changé).
  personal: PersonalSettings
  // Valeurs réellement appliquées, repli sur `state.settings` (workspace) puis sur un défaut
  // « en dur » si les deux sont absents, ce que les pages doivent lire pour afficher/appliquer.
  effective: { theme: ThemeMode; primaryColorLight?: string; primaryColorDark?: string; density: DisplayDensity; defaultStartPage: string }
  updatePersonal: (patch: Partial<PersonalSettings>) => void
}

const PersonalSettingsContext = createContext<PersonalSettingsContextValue | null>(null)

export function usePersonalSettings() {
  const ctx = useContext(PersonalSettingsContext)
  if (!ctx) throw new Error('usePersonalSettings doit être utilisé dans un PersonalSettingsProvider')
  return ctx
}

// Favicon dynamique (2026-08-17, retour Julien : "utiliser le CadenceMark comme favicon, sa
// couleur serait la couleur principale utilisée par l'utilisateur") : construit à la volée en
// data-URI plutôt qu'un fichier statique, pour suivre --primary résolu (thème + couleur
// personnalisée) sans dépendre d'un serveur d'images. `public/favicon.svg` (index.html) reste le
// repli affiché avant que ce module ne s'exécute (notamment sur l'écran de connexion, rendu hors
// StateProvider/PersonalSettingsProvider, voir App.tsx) : même tracé, couleur par défaut figée.
// Déplacé depuis StateContext.tsx (2026-08-19) en même temps que l'effet thème ci-dessous.
function buildFaviconHref(color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${CADENCE_MARK_VIEWBOX}"><path fill="${color}" d="${CADENCE_MARK_PATH}" transform="${CADENCE_MARK_TRANSFORM}"/></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

function applyFavicon(color: string) {
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (!link) {
    link = document.createElement('link')
    link.rel = 'icon'
    document.head.appendChild(link)
  }
  link.type = 'image/svg+xml'
  link.href = buildFaviconHref(color)
}

export function PersonalSettingsProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth()
  const { state } = useCadence()
  const [personal, setPersonal] = useState<PersonalSettings>({})
  const loadedForToken = useRef<string | null>(null)

  // Chargement une fois par connexion (même mécanisme que OnboardingContext.tsx,
  // `loadedForToken` évite un rechargement à chaque re-render du Provider).
  useEffect(() => {
    if (!token || loadedForToken.current === token) return
    loadedForToken.current = token
    api.getPersonalSettings()
      .then(({ personalSettings }) => setPersonal(personalSettings ?? {}))
      .catch(() => {})
  }, [token])

  // Anti-rebond réseau (2026-08-19, même leçon que SettingsPage.tsx/applyAppearance : "un geste
  // continu (glisser le curseur de densité, glisser dans le color picker natif) déclenche un
  // `onChange` React à chaque pixel/frappe [...], donc un PUT complet à chaque étape") : l'état
  // local (`setPersonal`, retour visuel immédiat) reste synchrone, seul l'envoi réseau
  // (`PATCH /api/personal-settings`) est regroupé et retardé de 400ms après la dernière
  // interaction. Filet de sécurité (même leçon que Sprint Review, docs/corrections.md, "5e
  // complément" : un `setTimeout` annulé par le cleanup d'un effet avant d'avoir eu le temps de
  // partir avait fait perdre des décisions) : la sauvegarde en attente est vidée immédiatement au
  // démontage ET juste avant une fermeture/rechargement réel (`beforeunload`).
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingPatch = useRef<Partial<PersonalSettings> | null>(null)

  const flushSave = useCallback(() => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null }
    if (pendingPatch.current) {
      const patch = pendingPatch.current
      pendingPatch.current = null
      api.updatePersonalSettings(patch).catch(() => {})
    }
  }, [])

  useEffect(() => {
    window.addEventListener('beforeunload', flushSave)
    return () => {
      window.removeEventListener('beforeunload', flushSave)
      flushSave()
    }
  }, [flushSave])

  const updatePersonal = useCallback((patch: Partial<PersonalSettings>) => {
    setPersonal(p => ({ ...p, ...patch }))
    pendingPatch.current = { ...pendingPatch.current, ...patch }
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(flushSave, 400)
  }, [flushSave])

  // Résolution en cascade : préférence du compte, sinon valeur workspace (`state.settings`,
  // comportement d'origine avant ce chantier, pour ne rien changer visuellement à un compte qui
  // n'a encore rien personnalisé), sinon défaut en dur.
  const effective = {
    theme: personal.theme ?? state.settings?.theme ?? 'light',
    primaryColorLight: personal.primaryColorLight ?? state.settings?.primaryColorLight,
    primaryColorDark: personal.primaryColorDark ?? state.settings?.primaryColorDark,
    density: personal.density ?? state.settings?.density ?? 'comfortable',
    defaultStartPage: personal.defaultStartPage ?? state.settings?.defaultStartPage ?? '/backlog',
  }

  // Applique le thème (Phase 6bis, sous-chantier 4, 2026-08-13, déplacé ici le 2026-08-19) :
  // 'system' résolu via prefers-color-scheme, réévalué en direct si l'OS change de thème pendant
  // que l'onglet est ouvert (mq 'change'). Couleur principale par thème appliquée en variable CSS
  // inline sur <html>, seulement si personnalisée (sinon on laisse index.css gérer la valeur
  // d'origine par thème, --primary-light dérivée en hex 8 chiffres avec alpha, même trucage que le
  // composant ColorPicker.tsx pour un aperçu rapide sans dépendance supplémentaire).
  useEffect(() => {
    const mode = effective.theme
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const applyResolved = () => {
      const resolved = mode === 'system' ? (mq.matches ? 'dark' : 'light') : mode
      document.documentElement.setAttribute('data-theme', resolved)
      const custom = resolved === 'dark' ? effective.primaryColorDark : effective.primaryColorLight
      if (custom) {
        document.documentElement.style.setProperty('--primary', custom)
        document.documentElement.style.setProperty('--primary-light', custom + '1a')
      } else {
        document.documentElement.style.removeProperty('--primary')
        document.documentElement.style.removeProperty('--primary-light')
      }
      // Résolu APRÈS avoir posé/retiré la variable inline ci-dessus : `getComputedStyle` reflète
      // alors la vraie couleur affichée, personnalisée ou valeur d'origine du thème (index.css).
      applyFavicon(getComputedStyle(document.documentElement).getPropertyValue('--primary').trim())
    }
    applyResolved()
    if (mode === 'system') {
      mq.addEventListener('change', applyResolved)
      return () => mq.removeEventListener('change', applyResolved)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effective.theme, effective.primaryColorLight, effective.primaryColorDark])

  // Densité d'affichage (Phase 6bis, sous-chantier 4, déplacé ici le 2026-08-19) : 4 variables CSS
  // pilotées depuis un seul réglage à 5 crans, plutôt qu'une variable unique, les paddings
  // d'origine (Backlog/Kanban) n'ont pas la même échelle de base, un simple facteur multiplicatif
  // les aurait déformés relativement les uns aux autres.
  useEffect(() => {
    const scale = DENSITY_SCALE[effective.density] ?? DENSITY_SCALE.comfortable
    document.documentElement.style.setProperty('--density-th-pad', scale.th)
    document.documentElement.style.setProperty('--density-td-pad', scale.td)
    document.documentElement.style.setProperty('--density-card-pad', scale.cardPad)
    document.documentElement.style.setProperty('--density-cards-gap', scale.cardsGap)
  }, [effective.density])

  return (
    <PersonalSettingsContext.Provider value={{ personal, effective, updatePersonal }}>
      {children}
    </PersonalSettingsContext.Provider>
  )
}
