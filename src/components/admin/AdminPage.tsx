import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { LogOut, Plus } from 'lucide-react'
import { adminToken, api, type Product } from '@/lib/api'
import { AdminGate } from './AdminGate'
import { OrdersTable } from './OrdersTable'
import { ProductForm } from './ProductForm'
import { ProductList } from './ProductList'

function Panel() {
  const [tab, setTab] = useState<'listings' | 'orders'>('listings')
  const [editing, setEditing] = useState<Product | null>(null)
  const qc = useQueryClient()

  async function signOut() {
    await api.adminLogout().catch(() => undefined)
    adminToken.clear()
    await qc.invalidateQueries({ queryKey: ['admin-session'] })
  }

  const tabClass = (active: boolean) =>
    `min-h-[44px] rounded-full px-5 text-sm font-semibold transition-colors ${active ? 'bg-[var(--accent)] text-white' : 'bg-white/70 text-[var(--ink-2)] hover:bg-white'}`

  return (
    <main className="mx-auto max-w-5xl px-4 pb-24 pt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="display text-4xl font-bold">Shop admin</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
            Manage footwear listings and fulfil paid orders.
          </p>
        </div>
        <button className="btn-ghost" onClick={() => void signOut()}>
          <LogOut className="size-4" /> Sign out
        </button>
      </div>

      <div className="mt-6 flex gap-2" role="tablist">
        <button role="tab" aria-selected={tab === 'listings'} className={tabClass(tab === 'listings')} onClick={() => setTab('listings')}>
          Listings
        </button>
        <button role="tab" aria-selected={tab === 'orders'} className={tabClass(tab === 'orders')} onClick={() => setTab('orders')}>
          Orders
        </button>
      </div>

      {tab === 'listings' ? (
        <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1.1fr] lg:items-start">
          <div className="lg:sticky lg:top-24">
            <ProductForm key={editing?.id ?? 'new'} product={editing} onDone={() => setEditing(null)} />
            {editing && (
              <button className="btn-ghost mt-3 w-full" onClick={() => setEditing(null)}>
                <Plus className="size-4" /> Add a new listing instead
              </button>
            )}
          </div>
          <ProductList editingId={editing?.id ?? null} onEdit={(p) => { setEditing(p); window.scrollTo({ top: 0, behavior: 'smooth' }) }} />
        </div>
      ) : (
        <div className="mt-5">
          <OrdersTable />
        </div>
      )}
    </main>
  )
}

export function AdminPage() {
  return (
    <AdminGate>
      <Panel />
    </AdminGate>
  )
}
