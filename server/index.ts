import { randomBytes } from 'node:crypto'
import { getAddress, isAddress } from 'viem'
import { formatUsdc, parseUsdc } from '../src/onchain-money'
import { isAdmin, issueNonce, login, logout, OWNER_ADDRESS } from './auth'
import { ESCROW_ADDRESS, client, readOnchainOrder } from './chain'
import { migrate, sql, type Delivery, type OrderItem, type OrderRow, type OrderStatus, type ProductRow } from './db'

const PORT = Number(process.env.PORT || process.env.API_PORT || 3001)
const CORS_ORIGINS = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((o) => o.trim().replace(/\/+$/, ''))
  .filter(Boolean)
const MAX_IMAGE_BYTES = 2 * 1024 * 1024
const MAX_PRICE_RAW = parseUsdc('100000')

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })

const str = (v: unknown, max: number, field: string, required = true) => {
  const s = typeof v === 'string' ? v.trim() : ''
  if (required && !s) throw new HttpError(400, `${field} is required`)
  if (s.length > max) throw new HttpError(400, `${field} is too long`)
  return s
}

function parseSizes(raw: unknown): string[] {
  let list: unknown = raw
  if (typeof raw === 'string') {
    try {
      list = JSON.parse(raw)
    } catch {
      list = raw.split(',')
    }
  }
  if (!Array.isArray(list)) throw new HttpError(400, 'sizes must be a list')
  const out = [...new Set(list.map((s) => String(s).trim()).filter(Boolean))]
  if (out.length === 0) throw new HttpError(400, 'Add at least one size')
  if (out.length > 30 || out.some((s) => s.length > 12)) throw new HttpError(400, 'Invalid sizes')
  return out
}

function parsePrice(raw: unknown): bigint {
  try {
    const raw6 = parseUsdc(String(raw).trim())
    if (raw6 <= 0n || raw6 > MAX_PRICE_RAW) throw new Error('range')
    return raw6
  } catch {
    throw new HttpError(400, 'Enter a valid USDC price greater than 0')
  }
}

function sniffImage(bytes: Uint8Array, declared: string): string {
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
  const isWebp =
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  const detected = isJpeg ? 'image/jpeg' : isPng ? 'image/png' : isWebp ? 'image/webp' : ''
  if (!detected || detected !== declared) throw new HttpError(400, 'Image must be a JPEG, PNG or WebP file')
  return detected
}

async function readProductForm(req: Request, imageRequired: boolean) {
  const form = await req.formData()
  const name = str(form.get('name'), 80, 'Name')
  const category = str(form.get('category'), 30, 'Category')
  const priceRaw = parsePrice(form.get('price'))
  const sizes = parseSizes(form.get('sizes'))
  const file = form.get('image')
  let image: Buffer | null = null
  let imageType: string | null = null
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_IMAGE_BYTES) throw new HttpError(400, 'Image must be 2 MB or smaller')
    const bytes = new Uint8Array(await file.arrayBuffer())
    imageType = sniffImage(bytes, file.type)
    image = Buffer.from(bytes)
  } else if (imageRequired) {
    throw new HttpError(400, 'A photo is required')
  }
  return { name, category, priceRaw, sizes, image, imageType }
}

const productDto = (p: ProductRow) => ({
  id: p.id,
  name: p.name,
  category: p.category,
  priceRaw: String(p.price_raw),
  price: formatUsdc(BigInt(p.price_raw)),
  sizes: JSON.parse(p.sizes) as string[],
  imageUrl: p.image_type ? `/products/${p.id}/image?v=${new Date(p.updated_at).getTime()}` : null,
})

const orderDto = (o: OrderRow, withDelivery: boolean) => ({
  id: o.id,
  buyer: o.buyer,
  items: JSON.parse(o.items) as OrderItem[],
  totalRaw: String(o.total_raw),
  total: formatUsdc(BigInt(o.total_raw)),
  status: o.status,
  paidTx: o.paid_tx,
  finalTx: o.final_tx,
  createdAt: new Date(o.created_at).toISOString(),
  ...(withDelivery ? { delivery: JSON.parse(o.delivery) as Delivery } : {}),
})

const STATUS_BY_CODE: Record<number, OrderStatus> = { 1: 'paid', 2: 'shipped', 3: 'refunded' }

async function verifyTx(hash: unknown, expectedFrom?: string) {
  if (typeof hash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(hash)) return null
  try {
    const receipt = await client.getTransactionReceipt({ hash: hash as `0x${string}` })
    if (receipt.status !== 'success' || !receipt.to || getAddress(receipt.to) !== ESCROW_ADDRESS) return null
    if (expectedFrom && getAddress(receipt.from) !== getAddress(expectedFrom)) return null
    return hash
  } catch {
    return null
  }
}

/** Reads the escrow's own record for an order and mirrors it into the database. */
async function syncOrder(order: OrderRow, txHash?: unknown) {
  const chain = await readOnchainOrder(order.buyer, order.id)
  if (chain.status === 0) return { order, mismatch: false }
  if (chain.amount !== BigInt(order.total_raw)) return { order, mismatch: true }
  const next = STATUS_BY_CODE[chain.status]
  if (!next || next === order.status) return { order, mismatch: false }
  const tx = await verifyTx(txHash, next === 'paid' ? order.buyer : undefined)
  if (next === 'paid') {
    await sql`UPDATE orders SET status = 'paid', paid_tx = COALESCE(${tx}, paid_tx) WHERE id = ${order.id}`
  } else {
    await sql`UPDATE orders SET status = ${next}, final_tx = COALESCE(${tx}, final_tx) WHERE id = ${order.id}`
  }
  const [fresh] = await sql`SELECT * FROM orders WHERE id = ${order.id}`
  return { order: fresh as OrderRow, mismatch: false }
}

async function requireAdmin(req: Request) {
  if (!(await isAdmin(req))) throw new HttpError(401, 'Owner sign-in required')
}

async function route(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const path = url.pathname.replace(/\/+$/, '') || '/'
  const method = req.method

  if (path === '/health') return json({ ok: true })

  // ---- Public catalogue
  if (method === 'GET' && path === '/products') {
    const rows = (await sql`SELECT id, name, category, price_raw, sizes, image_type, updated_at FROM products ORDER BY created_at DESC, id DESC`) as ProductRow[]
    return json({ products: rows.map(productDto) })
  }
  let m = path.match(/^\/products\/(\d+)\/image$/)
  if (method === 'GET' && m) {
    const rows = await sql`SELECT image, image_type FROM products WHERE id = ${Number(m[1])}`
    const row = rows[0] as { image: Uint8Array | null; image_type: string | null } | undefined
    if (!row?.image || !row.image_type) return new Response('Not found', { status: 404 })
    return new Response(row.image, {
      headers: { 'content-type': row.image_type, 'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' },
    })
  }

  // ---- Admin auth
  if (method === 'POST' && path === '/admin/nonce') return json(issueNonce())
  if (method === 'POST' && path === '/admin/login') {
    const body = (await req.json().catch(() => ({}))) as { address?: string; nonce?: string; signature?: string }
    const session = await login(String(body.address ?? ''), String(body.nonce ?? ''), String(body.signature ?? ''))
    if (!session) throw new HttpError(401, 'Sign-in failed. Connect the owner wallet and try again.')
    return json({ ...session, address: OWNER_ADDRESS })
  }
  if (method === 'POST' && path === '/admin/logout') {
    await logout(req)
    return json({ ok: true })
  }
  if (method === 'GET' && path === '/admin/session') {
    return json({ admin: await isAdmin(req), owner: OWNER_ADDRESS })
  }
  if (method === 'GET' && path === '/config') {
    return json({ owner: OWNER_ADDRESS, escrow: ESCROW_ADDRESS })
  }

  // ---- Admin products
  if (method === 'POST' && path === '/admin/products') {
    await requireAdmin(req)
    const p = await readProductForm(req, true)
    const [row] = await sql`
      INSERT INTO products (name, category, price_raw, sizes, image, image_type)
      VALUES (${p.name}, ${p.category}, ${p.priceRaw.toString()}, ${JSON.stringify(p.sizes)}, ${p.image}, ${p.imageType})
      RETURNING id, name, category, price_raw, sizes, image_type, updated_at`
    return json({ product: productDto(row as ProductRow) }, 201)
  }
  m = path.match(/^\/admin\/products\/(\d+)$/)
  if (m && method === 'PUT') {
    await requireAdmin(req)
    const id = Number(m[1])
    const p = await readProductForm(req, false)
    const rows = p.image
      ? await sql`UPDATE products SET name = ${p.name}, category = ${p.category}, price_raw = ${p.priceRaw.toString()}, sizes = ${JSON.stringify(p.sizes)}, image = ${p.image}, image_type = ${p.imageType}, updated_at = now() WHERE id = ${id} RETURNING id, name, category, price_raw, sizes, image_type, updated_at`
      : await sql`UPDATE products SET name = ${p.name}, category = ${p.category}, price_raw = ${p.priceRaw.toString()}, sizes = ${JSON.stringify(p.sizes)}, updated_at = now() WHERE id = ${id} RETURNING id, name, category, price_raw, sizes, image_type, updated_at`
    if (rows.length === 0) throw new HttpError(404, 'Listing not found')
    return json({ product: productDto(rows[0] as ProductRow) })
  }
  if (m && method === 'DELETE') {
    await requireAdmin(req)
    await sql`DELETE FROM products WHERE id = ${Number(m[1])}`
    return json({ ok: true })
  }

  // ---- Admin orders
  if (method === 'GET' && path === '/admin/orders') {
    await requireAdmin(req)
    const open = (await sql`SELECT * FROM orders WHERE status IN ('pending', 'paid') ORDER BY created_at DESC LIMIT 50`) as OrderRow[]
    await Promise.all(open.map((o) => syncOrder(o).catch(() => null)))
    const rows = (await sql`SELECT * FROM orders WHERE status <> 'pending' ORDER BY created_at DESC LIMIT 200`) as OrderRow[]
    return json({ orders: rows.map((o) => orderDto(o, true)) })
  }
  m = path.match(/^\/admin\/orders\/(0x[0-9a-fA-F]{64})\/sync$/)
  if (m && method === 'POST') {
    await requireAdmin(req)
    const body = (await req.json().catch(() => ({}))) as { txHash?: string }
    const [row] = await sql`SELECT * FROM orders WHERE id = ${m[1].toLowerCase()}`
    if (!row) throw new HttpError(404, 'Order not found')
    const { order } = await syncOrder(row as OrderRow, body.txHash)
    return json({ order: orderDto(order, true) })
  }

  // ---- Customer orders
  if (method === 'POST' && path === '/orders') {
    const body = (await req.json().catch(() => null)) as {
      buyer?: string
      items?: { productId?: number; size?: string; qty?: number }[]
      delivery?: Partial<Delivery>
    } | null
    if (!body) throw new HttpError(400, 'Invalid request')
    if (!body.buyer || !isAddress(body.buyer)) throw new HttpError(400, 'Connect your wallet first')
    const buyer = getAddress(body.buyer)
    const requested = body.items
    if (!Array.isArray(requested) || requested.length === 0 || requested.length > 20) throw new HttpError(400, 'Your cart is empty')
    const d = body.delivery ?? {}
    const delivery: Delivery = {
      fullName: str(d.fullName, 80, 'Full name'),
      phone: str(d.phone, 30, 'Phone number'),
      address: str(d.address, 200, 'Delivery address'),
      city: str(d.city, 80, 'City'),
      country: str(d.country, 80, 'Country'),
      notes: str(d.notes, 300, 'Notes', false),
    }
    const [{ count }] = await sql`SELECT count(*)::int AS count FROM orders WHERE buyer = ${buyer} AND status = 'pending'`
    if (Number(count) >= 20) throw new HttpError(429, 'Too many unpaid orders. Complete or wait before ordering again.')

    const items: OrderItem[] = []
    let total = 0n
    for (const it of requested) {
      const qty = Number(it.qty)
      if (!Number.isInteger(qty) || qty < 1 || qty > 10) throw new HttpError(400, 'Invalid quantity')
      const [p] = (await sql`SELECT id, name, category, price_raw, sizes, image_type, updated_at FROM products WHERE id = ${Number(it.productId)}`) as ProductRow[]
      if (!p) throw new HttpError(400, 'A product in your cart is no longer available')
      const size = String(it.size ?? '')
      if (!(JSON.parse(p.sizes) as string[]).includes(size)) throw new HttpError(400, `Size ${size} is not available for ${p.name}`)
      const unit = BigInt(p.price_raw)
      total += unit * BigInt(qty)
      items.push({ productId: p.id, name: p.name, size, qty, unitRaw: unit.toString() })
    }
    const id = '0x' + randomBytes(32).toString('hex')
    await sql`INSERT INTO orders (id, buyer, items, total_raw, delivery) VALUES (${id}, ${buyer}, ${JSON.stringify(items)}, ${total.toString()}, ${JSON.stringify(delivery)})`
    return json({ orderId: id, totalRaw: total.toString(), total: formatUsdc(total), escrow: ESCROW_ADDRESS }, 201)
  }
  if (method === 'GET' && path === '/orders') {
    const buyer = url.searchParams.get('buyer') ?? ''
    if (!isAddress(buyer)) throw new HttpError(400, 'Invalid wallet address')
    const open = (await sql`SELECT * FROM orders WHERE buyer = ${getAddress(buyer)} AND status IN ('pending', 'paid') ORDER BY created_at DESC LIMIT 20`) as OrderRow[]
    await Promise.all(open.map((o) => syncOrder(o).catch(() => null)))
    const rows = (await sql`SELECT * FROM orders WHERE buyer = ${getAddress(buyer)} AND status <> 'pending' ORDER BY created_at DESC LIMIT 100`) as OrderRow[]
    return json({ orders: rows.map((o) => orderDto(o, false)) })
  }
  m = path.match(/^\/orders\/(0x[0-9a-fA-F]{64})\/sync$/)
  if (m && method === 'POST') {
    const body = (await req.json().catch(() => ({}))) as { txHash?: string }
    const [row] = await sql`SELECT * FROM orders WHERE id = ${m[1].toLowerCase()}`
    if (!row) throw new HttpError(404, 'Order not found')
    const { order, mismatch } = await syncOrder(row as OrderRow, body.txHash)
    return json({ order: orderDto(order, false), mismatch })
  }

  throw new HttpError(404, 'Not found')
}

await migrate()

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin')
  if (!origin || !CORS_ORIGINS.includes(origin.replace(/\/+$/, ''))) return {}
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'access-control-max-age': '86400',
    vary: 'Origin',
  }
}

Bun.serve({
  port: PORT,
  maxRequestBodySize: 4 * 1024 * 1024,
  async fetch(req) {
    const cors = corsHeaders(req)
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    let res: Response
    try {
      res = await route(req)
    } catch (err) {
      if (err instanceof HttpError) res = json({ error: err.message }, err.status)
      else {
        console.error('Unhandled error', err instanceof Error ? err.message : err)
        res = json({ error: 'Something went wrong. Please try again.' }, 500)
      }
    }
    for (const [k, v] of Object.entries(cors)) res.headers.set(k, v)
    return res
  },
})

console.log(`Footstepz API listening on :${PORT}`)
