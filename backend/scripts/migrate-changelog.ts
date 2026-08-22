// Reforme du Changelog (2026-08-22, decision Julien) : script ponctuel a lancer UNE FOIS, apres
// avoir applique la migration Prisma (npx prisma migrate deploy, table changelog_entries), pour
// importer l'historique fige dans changelog-seed.json (170 versions, snapshot de CHANGELOG tel
// qu'il etait dans frontend/src/data/changelog.ts au moment de la reforme - fichier depuis retire,
// voir docs/corrections.md). Idempotent (upsert par `version`, cle unique) : relancer ce script ne
// duplique rien, utile si une premiere execution s'est arretee en cours de route.
//
// Usage : cd backend && npx tsx scripts/migrate-changelog.ts
import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

interface SeedChange { tag: string; text: string }
interface SeedVersion {
  version: string; date: string; dateISO?: string; title: string
  current?: boolean; changes: SeedChange[]
}

async function main() {
  const prisma = new PrismaClient()
  const raw = readFileSync(join(__dirname, 'changelog-seed.json'), 'utf-8')
  const seed: SeedVersion[] = JSON.parse(raw)

  // seed[0] = la plus RECENTE (CHANGELOG etait ordonne du plus recent au plus ancien) - `order` doit
  // grandir avec la recence, donc l'indice est inverse : le DERNIER element du tableau (le plus
  // ancien, v0.1) recoit order 0, le PREMIER (le plus recent) recoit order = seed.length - 1.
  const total = seed.length
  let migrated = 0
  for (let i = 0; i < total; i++) {
    const v = seed[i]
    const order = total - 1 - i
    await prisma.changelogEntry.upsert({
      where: { version: v.version },
      update: {},
      create: {
        version: v.version,
        date: v.date,
        dateISO: v.dateISO ?? '',
        title: v.title,
        current: Boolean(v.current),
        changes: v.changes as unknown as object,
        order,
      },
    })
    migrated++
  }

  const currentCount = await prisma.changelogEntry.count({ where: { current: true } })
  console.log(`${migrated} version(s) migree(s). ${currentCount} entree(s) marquee(s) "current" (doit valoir 1).`)
  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
