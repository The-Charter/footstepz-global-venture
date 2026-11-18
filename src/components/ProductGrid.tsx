import { useMemo, useState } from 'react'
import { Footprints } from 'lucide-react'
import { useProducts } from '@/lib/hooks'
import type { Product } from '@/lib/api'
import { money } from '@/lib/format'
import { ProductModal } from './ProductModal'

export function ProductImage({ product, className = '' }: { product: Pick<Product, 'imageUrl' | 'name'>; className?: string }) {
  return (
    <div className={`flex items-center justify-center overflow-hidden bg-[var(--surface-muted)] ${className}`}>
      {product.imageUrl ? (
        <img src={product.imageUrl} alt={product.name} loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <Footprints className="size-10" style={{ color: 'var(--subtle)' }} />
      )}
    </div>
  )
}

export function ProductGrid() {
  const { data: products, isLoading, isError, refetch } = useProducts()
  const [category, setCategory] = useState('All')
  const [selected, setSelected] = useState<Product | null>(null)

  const categories = useMemo(() => ['All', ...new Set((products ?? []).map((p) => p.category))], [products])
  const visible = useMemo(() => (products ?? []).filter((p) => category === 'All' || p.category === category), [products, category])

  return (
    <section id="shop" className="mx-auto max-w-6xl scroll-mt-20 px-4 pb-24 pt-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <h2 className="display text-3xl font-bold">Available footwear</h2>
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Categories">
          {categories.map((c) => (
            <button
              key={c}
              role="tab"
              aria-selected={category === c}
              onClick={() => setCategory(c)}
              className="min-h-[40px] rounded-full px-4 text-sm font-semibold transition-colors"
              style={category === c ? { background: 'var(--accent)', color: '#fff' } : { background: 'var(--surface-strong)', border: '1px solid var(--border)', color: 'var(--ink-2)' }}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {isLoading && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4" aria-busy="true">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="glass animate-pulse rounded-3xl p-2.5">
              <div className="aspect-[4/3] rounded-2xl bg-black/5" />
              <div className="mt-3 h-4 w-2/3 rounded bg-black/5" />
              <div className="mt-2 h-4 w-1/3 rounded bg-black/5" />
            </div>
          ))}
        </div>
      )}

      {isError && (
        <div className="glass rounded-3xl p-8 text-center">
          <p className="font-semibold">We could not load the footwear list.</p>
          <button className="btn-ghost mt-4" onClick={() => void refetch()}>
            Try again
          </button>
        </div>
      )}

      {!isLoading && !isError && visible.length === 0 && (
        <div className="glass rounded-3xl p-10 text-center">
          <Footprints className="mx-auto size-8" style={{ color: 'var(--subtle)' }} />
          <p className="display mt-3 text-xl font-semibold">Nothing here yet</p>
          <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
            New footwear is added regularly. Check back soon.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {visible.map((p) => (
          <button
            key={p.id}
            onClick={() => setSelected(p)}
            className="glass group rounded-3xl p-2.5 text-left transition-transform hover:-translate-y-0.5"
          >
            <ProductImage product={p} className="aspect-[4/3] rounded-2xl" />
            <div className="px-1.5 pb-1.5 pt-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--subtle)' }}>
                {p.category}
              </p>
              <p className="display mt-0.5 truncate text-base font-semibold">{p.name}</p>
              <p className="mt-1 text-sm font-semibold tabular-nums">
                {money(p.priceRaw)} <span style={{ color: 'var(--subtle)' }}>USDC</span>
              </p>
            </div>
          </button>
        ))}
      </div>

      <ProductModal product={selected} onClose={() => setSelected(null)} />
    </section>
  )
}
