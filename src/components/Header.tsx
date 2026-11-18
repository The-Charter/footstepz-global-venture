import { ConnectKitButton } from 'connectkit'
import { ShoppingBag, ShieldCheck } from 'lucide-react'
import { useCart } from '@/lib/cart'
import { useIsOwner } from '@/lib/hooks'
import { Link, usePath } from '@/lib/router'

function BrandMark() {
  return (
    <svg width="30" height="30" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="var(--accent)" />
      <path d="M7 21.5c0-3 1-6.2 2.8-6.9l3.4-1.4c1-.4 1.7-1.2 2-2.3l.4-1.4c.2-.6 1-.8 1.5-.3l3.6 3.6c1 1 2.4 1.6 3.8 1.6h.5c2.2 0 3.5 1.4 3.5 3.5V22c0 .6-.4 1-1 1H8c-.6 0-1-.4-1-1.5Z" fill="#fff" />
      <path d="M7 24.5h18" stroke="var(--brand)" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  )
}

export function Header() {
  const path = usePath()
  const { count, setOpen } = useCart()
  const isOwner = useIsOwner()

  const navClass = (active: boolean) =>
    `rounded-full px-3.5 py-2 text-sm font-semibold transition-colors ${active ? 'bg-[var(--accent)] text-white' : 'text-[var(--ink-2)] hover:bg-black/5'}`

  return (
    <header className="sticky top-0 z-30 border-b" style={{ borderColor: 'var(--border)', background: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(20px)' }}>
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
        <Link to="/" className="flex items-center gap-2.5">
          <BrandMark />
          <span className="display text-lg font-bold leading-none">
            Footstepz
            <span className="block text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--muted)' }}>
              Global Venture
            </span>
          </span>
        </Link>

        <nav className="ml-3 hidden items-center gap-1 sm:flex" aria-label="Main">
          <Link to="/" className={navClass(path === '/')}>
            Shop
          </Link>
          <Link to="/orders" className={navClass(path === '/orders')}>
            My orders
          </Link>
          {isOwner && (
            <Link to="/admin" className={navClass(path === '/admin')}>
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="size-4" /> Admin
              </span>
            </Link>
          )}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setOpen(true)}
            className="btn-ghost relative !px-3"
            aria-label={`Open cart, ${count} item${count === 1 ? '' : 's'}`}
          >
            <ShoppingBag className="size-5" />
            {count > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full text-[11px] font-bold tabular-nums text-white" style={{ background: 'var(--brand)' }}>
                {count}
              </span>
            )}
          </button>
          <ConnectKitButton />
        </div>
      </div>

      <nav className="mx-auto flex max-w-6xl items-center gap-1 px-4 pb-2 sm:hidden" aria-label="Main mobile">
        <Link to="/" className={navClass(path === '/')}>
          Shop
        </Link>
        <Link to="/orders" className={navClass(path === '/orders')}>
          My orders
        </Link>
        {isOwner && (
          <Link to="/admin" className={navClass(path === '/admin')}>
            Admin
          </Link>
        )}
      </nav>
    </header>
  )
}
