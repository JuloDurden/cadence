interface Props {
  label: string
  value: string | number
  sub?: string
  color?: string
}

// Correctif (2026-08-03, retour Julien : "plus d'émoticône, terminé, finito") — la prop `icon`
// (un caractère emoji : ✅/⚡/🏃/⚠) a été retirée, elle n'a plus aucun appelant. Titre repris tel
// quel comme référence de style pour normaliser les autres titres de widgets (voir
// `.dash-widget-title` dans index.css) : VelocityChart, BurndownChart, ClientRAG et le widget
// "Activité récente" (DashboardPage.tsx) reprennent désormais exactement ces mêmes propriétés.
//
// `height: 100%` + `boxSizing: 'border-box'` ajoutés (2026-08-06) — jusque-là inutile car StatCard
// était toujours enfant direct de `.dash-widget-content`, qui force `min-height: 100%` sur ses
// enfants directs (voir index.css). Les 3 widgets KPI (BlockersCard/DoneItemsCard/AvgVelocityCard)
// utilisent désormais StatCard comme face avant d'un FlipCard — enfant indirect, plus couvert par
// cette règle CSS — sans hauteur explicite, le fond blanc de la carte ne remplissait plus toute la
// tuile.
export function StatCard({ label, value, sub, color = 'var(--primary)' }: Props) {
  return (
    <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', height: '100%', boxSizing: 'border-box', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div className="dash-widget-title">{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{sub}</div>}
    </div>
  )
}
