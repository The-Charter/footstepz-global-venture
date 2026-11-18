import { ArrowDown, Lock, PackageCheck, Wallet } from 'lucide-react'
import { TokenUSDC } from '@web3icons/react'

const steps = [
  { icon: Wallet, title: 'Pay in USDC', text: 'Your payment goes into an escrow contract, not to us.' },
  { icon: PackageCheck, title: 'We ship your pair', text: 'Funds are released to Footstepz only after we mark it shipped.' },
  { icon: Lock, title: 'Refund protection', text: 'If we never ship, you can claim your USDC back after 14 days.' },
]

export function Hero() {
  return (
    <section className="mx-auto grid max-w-6xl gap-6 px-4 pb-6 pt-8 md:grid-cols-[1.15fr_1fr] md:items-center md:pt-12">
      <div>
        <p className="mb-3 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em]" style={{ background: 'var(--surface-muted)', color: 'var(--ink-2)' }}>
          <TokenUSDC variant="branded" size={16} /> Pay with USDC on Arc
        </p>
        <h1 className="display text-balance text-5xl font-bold leading-[1.02] md:text-6xl">Footwear for every step.</h1>
        <p className="mt-4 max-w-[52ch] text-pretty text-base" style={{ color: 'var(--muted)' }}>
          Pick your pair, choose your size and pay in USDC. Your money stays safe in escrow until your order ships.
        </p>
        <a href="#shop" className="btn-primary mt-6">
          Shop footwear <ArrowDown className="size-4" />
        </a>
      </div>

      <ol className="glass grid gap-1 rounded-3xl p-3">
        {steps.map(({ icon: Icon, title, text }, i) => (
          <li key={title} className="flex items-start gap-3 rounded-2xl p-3" style={{ background: i === 1 ? 'var(--surface-muted)' : 'transparent' }}>
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl" style={{ background: 'var(--accent)', color: '#fff' }}>
              <Icon className="size-[18px]" />
            </span>
            <span>
              <span className="display block text-base font-semibold">{title}</span>
              <span className="block text-sm" style={{ color: 'var(--muted)' }}>
                {text}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}
