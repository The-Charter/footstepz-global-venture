import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Product } from './api'

export interface CartLine {
  productId: number
  name: string
  size: string
  qty: number
  priceRaw: string
  imageUrl: string | null
}

interface CartValue {
  lines: CartLine[]
  count: number
  totalRaw: bigint
  open: boolean
  setOpen: (open: boolean) => void
  add: (product: Product, size: string) => void
  setQty: (productId: number, size: string, qty: number) => void
  remove: (productId: number, size: string) => void
  clear: () => void
}

const KEY = 'footstepz.cart.v1'
const CartContext = createContext<CartValue | null>(null)

function load(): CartLine[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '[]') as CartLine[]
    return Array.isArray(parsed) ? parsed.filter((l) => l && typeof l.productId === 'number' && l.qty > 0) : []
  } catch {
    return []
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>(load)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(lines))
  }, [lines])

  const add = useCallback((product: Product, size: string) => {
    setLines((prev) => {
      const existing = prev.find((l) => l.productId === product.id && l.size === size)
      if (existing) return prev.map((l) => (l === existing ? { ...l, qty: Math.min(10, l.qty + 1) } : l))
      return [...prev, { productId: product.id, name: product.name, size, qty: 1, priceRaw: product.priceRaw, imageUrl: product.imageUrl }]
    })
  }, [])

  const setQty = useCallback((productId: number, size: string, qty: number) => {
    setLines((prev) =>
      prev.flatMap((l) => (l.productId === productId && l.size === size ? (qty <= 0 ? [] : [{ ...l, qty: Math.min(10, qty) }]) : [l])),
    )
  }, [])

  const remove = useCallback((productId: number, size: string) => {
    setLines((prev) => prev.filter((l) => !(l.productId === productId && l.size === size)))
  }, [])

  const clear = useCallback(() => setLines([]), [])

  const value = useMemo<CartValue>(
    () => ({
      lines,
      count: lines.reduce((n, l) => n + l.qty, 0),
      totalRaw: lines.reduce((sum, l) => sum + BigInt(l.priceRaw) * BigInt(l.qty), 0n),
      open,
      setOpen,
      add,
      setQty,
      remove,
      clear,
    }),
    [lines, open, add, setQty, remove, clear],
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used inside CartProvider')
  return ctx
}
