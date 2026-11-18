import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { api, ApiError, type Product } from '@/lib/api'
import { useProducts } from '@/lib/hooks'
import { money } from '@/lib/format'
import { ProductImage } from '../ProductGrid'

export function ProductList({ onEdit, editingId }: { onEdit: (p: Product) => void; editingId: number | null }) {
  const { data: products, isLoading } = useProducts()
  const qc = useQueryClient()
  const [confirmId, setConfirmId] = useState<number | null>(null)

  async function remove(id: number) {
    try {
      await api.deleteProduct(id)
      await qc.invalidateQueries({ queryKey: ['products'] })
      toast.success('Listing removed')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not remove the listing.')
    } finally {
      setConfirmId(null)
    }
  }

  if (isLoading) return <div className="glass h-40 animate-pulse rounded-3xl" aria-busy="true" />

  if (!products || products.length === 0) {
    return (
      <div className="glass rounded-3xl p-8 text-center">
        <p className="display text-lg font-semibold">No listings yet</p>
        <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
          Add your first pair using the form.
        </p>
      </div>
    )
  }

  return (
    <ul className="space-y-2">
      {products.map((p) => (
        <li key={p.id} className="glass flex items-center gap-3 rounded-2xl p-2.5" style={editingId === p.id ? { borderColor: 'var(--focus)' } : undefined}>
          <ProductImage product={p} className="size-16 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1">
            <p className="display truncate font-semibold">{p.name}</p>
            <p className="truncate text-xs" style={{ color: 'var(--muted)' }}>
              {p.category} · sizes {p.sizes.join(', ')}
            </p>
            <p className="text-sm font-semibold tabular-nums">{money(p.priceRaw)} USDC</p>
          </div>
          {confirmId === p.id ? (
            <div className="flex gap-1.5">
              <button className="btn-ghost !px-3" onClick={() => setConfirmId(null)}>
                Keep
              </button>
              <button className="btn-primary !min-h-[44px] !px-3" style={{ background: 'var(--danger)' }} onClick={() => void remove(p.id)}>
                Delete
              </button>
            </div>
          ) : (
            <div className="flex gap-1.5">
              <button className="btn-ghost !px-3" onClick={() => onEdit(p)} aria-label={`Edit ${p.name}`}>
                <Pencil className="size-4" />
              </button>
              <button className="btn-ghost !px-3" onClick={() => setConfirmId(p.id)} aria-label={`Delete ${p.name}`}>
                <Trash2 className="size-4" />
              </button>
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}
