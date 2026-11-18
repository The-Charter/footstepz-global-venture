import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Minus, Plus, ShoppingBag, Trash2, X } from 'lucide-react'
import { useCart } from '@/lib/cart'
import { money } from '@/lib/format'
import { Checkout } from './Checkout'
import { ProductImage } from './ProductGrid'

export function CartDrawer() {
  const { open, setOpen, lines, setQty, remove, totalRaw } = useCart()
  const [step, setStep] = useState<'cart' | 'checkout'>('cart')

  const close = useCallback(() => {
    setStep('cart')
    setOpen(false)
  }, [setOpen])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex justify-end" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close}>
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label="Cart"
            className="relative flex h-full w-full max-w-md flex-col bg-white shadow-2xl"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 38 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-1" style={{ background: 'linear-gradient(90deg,#122d45,#1061a6,#e8692a)' }} />
            <div className="flex items-center justify-between px-5 py-4">
              <h2 className="display text-2xl font-bold">{step === 'cart' ? 'Your cart' : 'Checkout'}</h2>
              <button onClick={close} aria-label="Close cart" className="btn-ghost !min-h-[40px] !px-2.5">
                <X className="size-5" />
              </button>
            </div>

            {step === 'checkout' ? (
              <Checkout onBack={() => setStep('cart')} onClose={close} />
            ) : lines.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
                <ShoppingBag className="size-10" style={{ color: 'var(--subtle)' }} />
                <p className="display text-xl font-semibold">Your cart is empty</p>
                <p className="text-sm" style={{ color: 'var(--muted)' }}>
                  Pick a pair and a size to get started.
                </p>
                <button className="btn-ghost mt-2" onClick={close}>
                  Keep shopping
                </button>
              </div>
            ) : (
              <>
                <ul className="flex-1 space-y-3 overflow-y-auto px-5 pb-4">
                  {lines.map((l) => (
                    <li key={`${l.productId}-${l.size}`} className="flex gap-3 rounded-2xl p-2.5" style={{ background: 'var(--surface-muted)' }}>
                      <ProductImage product={{ imageUrl: l.imageUrl, name: l.name }} className="size-20 shrink-0 rounded-xl" />
                      <div className="flex min-w-0 flex-1 flex-col">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="display truncate text-base font-semibold">{l.name}</p>
                            <p className="text-xs" style={{ color: 'var(--muted)' }}>
                              Size {l.size}
                            </p>
                          </div>
                          <button onClick={() => remove(l.productId, l.size)} aria-label={`Remove ${l.name}`} className="rounded-lg p-2 hover:bg-black/5">
                            <Trash2 className="size-4" style={{ color: 'var(--subtle)' }} />
                          </button>
                        </div>
                        <div className="mt-auto flex items-center justify-between">
                          <div className="flex items-center gap-1 rounded-xl bg-white" style={{ border: '1px solid var(--border)' }}>
                            <button onClick={() => setQty(l.productId, l.size, l.qty - 1)} aria-label="Decrease quantity" className="flex size-9 items-center justify-center">
                              <Minus className="size-4" />
                            </button>
                            <span className="w-6 text-center text-sm font-semibold tabular-nums">{l.qty}</span>
                            <button onClick={() => setQty(l.productId, l.size, l.qty + 1)} disabled={l.qty >= 10} aria-label="Increase quantity" className="flex size-9 items-center justify-center disabled:opacity-30">
                              <Plus className="size-4" />
                            </button>
                          </div>
                          <p className="text-sm font-semibold tabular-nums">{money(BigInt(l.priceRaw) * BigInt(l.qty))} USDC</p>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="border-t px-5 pb-6 pt-4" style={{ borderColor: 'var(--border)' }}>
                  <div className="mb-4 flex items-baseline justify-between">
                    <span className="text-sm" style={{ color: 'var(--muted)' }}>
                      Total
                    </span>
                    <span className="display text-3xl font-bold tabular-nums">
                      {money(totalRaw)} <span className="text-base font-medium" style={{ color: 'var(--subtle)' }}>USDC</span>
                    </span>
                  </div>
                  <button className="btn-primary w-full" onClick={() => setStep('checkout')}>
                    Continue to checkout
                  </button>
                </div>
              </>
            )}
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
