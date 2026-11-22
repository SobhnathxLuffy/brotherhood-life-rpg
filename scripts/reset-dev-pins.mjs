/**
 * One-off dev utility: reset both players' PINs to the factory defaults
 * (sobhnath=1111, umang=2222) in the LOCAL SQLite dev database only.
 * Never touches production — production PINs live in Supabase.
 */
import { scryptSync, randomBytes } from 'crypto'
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient({ datasources: { db: { url: 'file:../db/custom.db' } } })

function hashPin(pin) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(pin, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

async function main() {
  await db.player.update({ where: { id: 'sobhnath' }, data: { pinHash: hashPin('1111') } })
  await db.player.update({ where: { id: 'umang' }, data: { pinHash: hashPin('2222') } })
  const players = await db.player.findMany({ select: { id: true, displayName: true } })
  console.log('PINs reset to defaults for:', players.map((p) => p.id).join(', '))
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
