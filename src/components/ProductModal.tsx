import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, ShoppingBag, X } from 'lucide-react'
import { toast } from 'sonner'
import type { Product } from '@/lib/api'
import { useCart } from '@/lib/cart'
import { money } from '@/lib/format'
import { ProductImage } from './ProductGrid'

export function ProductModal({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const { add, setOpen } = useCart()
  const [pick, setPick] = useState<{ id: number; size: string } | null>(null)
  const size = product && pick?.id === product.id ? pick.size : null
  const setSize = (s: string) => product && setPick({ id: product.id, size: s })

  useEffect(() => {
    if (!product) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [product, onClose])

  const addToCart = () => {
    if (!product || !size) return
    add(product, size)
    toast.success(`${product.name} (size ${size}) added to cart`)
    onClose()
    setOpen(true)
  }

  return (
    <AnimatePresence>
      {product && (
        <motion.div
          className="fixed inset-0 z-40 flex items-end justify-center sm:items-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-label={product.name}
            className="relative grid max-h-[92dvh] w-full max-w-3xl overflow-y-auto rounded-t-3xl bg-white sm:rounded-3xl md:grid-cols-2"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button onClick={onClose} aria-label="Close" className="btn-ghost absolute right-3 top-3 z-10 !min-h-[40px] !px-2.5">
              <X className="size-5" />
            </button>
            <ProductImage product={product} className="aspect-[4/3] md:aspect-auto md:min-h-[420px]" />
            <div className="flex flex-col p-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em]" style={{ color: 'var(--subtle)' }}>
                {product.category}
              </p>
              <h3 className="display mt-1 text-3xl font-bold">{product.name}</h3>
              <p className="display mt-2 text-2xl font-semibold tabular-nums">
                {money(product.priceRaw)} <span className="text-base font-medium" style={{ color: 'var(--subtle)' }}>USDC</span>
              </p>

              <p className="mb-2 mt-6 text-sm font-semibold">Select size</p>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Size">
                {product.sizes.map((s) => (
                  <button
                    key={s}
                    role="radio"
                    aria-checked={size === s}
                    onClick={() => setSize(s)}
                    className="flex min-h-[44px] min-w-[52px] items-center justify-center gap-1 rounded-xl px-3 text-sm font-semibold tabular-nums transition-colors"
                    style={size === s ? { background: 'var(--accent)', color: '#fff' } : { background: 'var(--surface-muted)', color: 'var(--ink)', border: '1px solid var(--border)' }}
                  >
                    {size === s && <Check className="size-3.5" />}
                    {s}
                  </button>
                ))}
              </div>

              <button onClick={addToCart} disabled={!size} className="btn-primary mt-8 w-full">
                <ShoppingBag className="size-[18px]" /> {size ? 'Add to cart' : 'Choose a size'}
              </button>
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
