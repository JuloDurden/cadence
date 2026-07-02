import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const hash = await bcrypt.hash('cadence2026', 10)
  await prisma.user.upsert({
    where: { email: 'admin@cadence.local' },
    update: {},
    create: {
      email: 'admin@cadence.local',
      passwordHash: hash,
      name: 'Admin',
      role: 'ADMIN',
    },
  })
  console.log('Seed OK — admin@cadence.local / cadence2026')
}

main().finally(() => prisma.$disconnect())
