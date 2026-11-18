import { SQL } from 'bun'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is not set')

export const sql = new SQL(url)

export type OrderStatus = 'pending' | 'paid' | 'shipped' | 'refunded'

export interface ProductRow {
  id: number
  name: string
  category: string
  price_raw: string | number | bigint
  sizes: string
  image_type: string | null
  updated_at: string | Date
}

export interface OrderItem {
  productId: number
  name: string
  size: string
  qty: number
  unitRaw: string
}

export interface Delivery {
  fullName: string
  phone: string
  address: string
  city: string
  country: string
  notes?: string
}

export interface OrderRow {
  id: string
  buyer: string
  items: string
  total_raw: string | number | bigint
  delivery: string
  status: OrderStatus
  paid_tx: string | null
  final_tx: string | null
  created_at: string | Date
}

export async function migrate() {
  await sql`
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      price_raw BIGINT NOT NULL CHECK (price_raw > 0),
      sizes TEXT NOT NULL,
      image BYTEA,
      image_type TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`
  await sql`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      buyer TEXT NOT NULL,
      items TEXT NOT NULL,
      total_raw BIGINT NOT NULL,
      delivery TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      paid_tx TEXT,
      final_tx TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`
  await sql`CREATE INDEX IF NOT EXISTS orders_buyer_idx ON orders (buyer)`
  await sql`
    CREATE TABLE IF NOT EXISTS admin_sessions (
      token_hash TEXT PRIMARY KEY,
      address TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL
    )`
}
