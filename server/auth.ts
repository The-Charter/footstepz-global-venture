import { createHmac, randomBytes } from 'node:crypto'
import { getAddress, isAddress, verifyMessage, type Hex } from 'viem'
import { sql } from './db'

const SESSION_TTL_MS = 8 * 60 * 60 * 1000
const NONCE_TTL_MS = 5 * 60 * 1000

const secret = process.env.SESSION_SECRET
if (!secret) throw new Error('SESSION_SECRET is not set')

const ownerEnv = process.env.OWNER_ADDRESS
if (!ownerEnv || !isAddress(ownerEnv)) throw new Error('OWNER_ADDRESS is missing or invalid')
export const OWNER_ADDRESS = getAddress(ownerEnv)

const nonces = new Map<string, number>()

const hashToken = (token: string) => createHmac('sha256', secret).update(token).digest('hex')

export function signInMessage(nonce: string) {
  return `Footstepz Global Venture admin sign-in\nNonce: ${nonce}`
}

export function issueNonce() {
  const now = Date.now()
  for (const [n, exp] of nonces) if (exp < now) nonces.delete(n)
  const nonce = randomBytes(16).toString('hex')
  nonces.set(nonce, now + NONCE_TTL_MS)
  return { nonce, message: signInMessage(nonce) }
}

export async function login(address: string, nonce: string, signature: string) {
  const exp = nonces.get(nonce)
  if (!exp || exp < Date.now()) return null
  nonces.delete(nonce) // single use
  if (!isAddress(address) || getAddress(address) !== OWNER_ADDRESS) return null
  const ok = await verifyMessage({
    address: OWNER_ADDRESS,
    message: signInMessage(nonce),
    signature: signature as Hex,
  }).catch(() => false)
  if (!ok) return null
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
  await sql`INSERT INTO admin_sessions (token_hash, address, expires_at) VALUES (${hashToken(token)}, ${OWNER_ADDRESS}, ${expiresAt})`
  await sql`DELETE FROM admin_sessions WHERE expires_at < now()`
  return { token, expiresAt: expiresAt.toISOString() }
}

export async function isAdmin(req: Request) {
  const header = req.headers.get('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!token) return false
  const rows = await sql`SELECT address FROM admin_sessions WHERE token_hash = ${hashToken(token)} AND expires_at > now() LIMIT 1`
  return rows.length === 1 && getAddress(rows[0].address as string) === OWNER_ADDRESS
}

export async function logout(req: Request) {
  const header = req.headers.get('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (token) await sql`DELETE FROM admin_sessions WHERE token_hash = ${hashToken(token)}`
}
