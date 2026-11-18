import { useMemo, useState } from 'react'
import { ConnectKitButton } from 'connectkit'
import { ArrowLeft, CheckCircle2, ExternalLink, Loader2, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { useAccount, useConfig, useReadContract, useSwitchChain, useWriteContract } from 'wagmi'
import { readContract, waitForTransactionReceipt } from 'wagmi/actions'
import { api, ApiError, type Delivery } from '@/lib/api'
import { useCart } from '@/lib/cart'
import { CHAIN_ID, CHAIN_NAME, ESCROW_ADDRESS, USDC_ADDRESS, erc20Abi, escrowAbi, txUrl } from '@/lib/escrow'
import { money, parseOnchainError } from '@/lib/format'
import { navigate } from '@/lib/router'

type Phase = 'idle' | 'creating' | 'approving' | 'paying' | 'confirming' | 'recording' | 'done'

const PHASE_LABEL: Record<Phase, string> = {
  idle: '',
  creating: 'Preparing your order…',
  approving: 'Confirm the USDC allowance in your wallet…',
  paying: 'Confirm the payment in your wallet…',
  confirming: 'Waiting for the network to confirm…',
  recording: 'Recording your order…',
  done: '',
}

const emptyDelivery: Delivery = { fullName: '', phone: '', address: '', city: '', country: '', notes: '' }

export function Checkout({ onBack, onClose }: { onBack: () => void; onClose: () => void }) {
  const { lines, totalRaw, clear } = useCart()
  const { address, isConnected, chainId } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const { writeContractAsync } = useWriteContract()
  const config = useConfig()

  const [delivery, setDelivery] = useState<Delivery>(emptyDelivery)
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<{ id: string; totalRaw: string } | null>(null)
  const [paidTx, setPaidTx] = useState<string | null>(null)
  const [paidTotal, setPaidTotal] = useState<bigint>(0n)

  const { data: balance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: Boolean(address), refetchInterval: 8_000 },
  })

  const wrongChain = isConnected && chainId !== CHAIN_ID
  const busy = phase !== 'idle' && phase !== 'done'
  const formValid = useMemo(
    () => Boolean(delivery.fullName.trim() && delivery.phone.trim() && delivery.address.trim() && delivery.city.trim() && delivery.country.trim()),
    [delivery],
  )
  const insufficient = balance !== undefined && balance < totalRaw

  const set = (key: keyof Delivery) => (e: { target: { value: string } }) => setDelivery((d) => ({ ...d, [key]: e.target.value }))

  async function pay() {
    if (!address) return
    setError(null)
    try {
      if (chainId !== CHAIN_ID) await switchChainAsync({ chainId: CHAIN_ID })

      let order = pending && pending.totalRaw === totalRaw.toString() ? pending : null
      if (order) {
        // A previous attempt may have paid already; the contract is the source of truth.
        const synced = await api.syncOrder(order.id)
        if (synced.order.status === 'paid') {
          finish(synced.order.paidTx, totalRaw)
          return
        }
      } else {
        setPhase('creating')
        const created = await api.createOrder({
          buyer: address,
          items: lines.map((l) => ({ productId: l.productId, size: l.size, qty: l.qty })),
          delivery,
        })
        if (created.totalRaw !== totalRaw.toString()) {
          throw new ApiError(409, 'Prices changed since you added these items. Review your cart and try again.')
        }
        order = { id: created.orderId, totalRaw: created.totalRaw }
        setPending(order)
      }

      const amount = BigInt(order.totalRaw)
      const allowance = await readContract(config, {
        address: USDC_ADDRESS,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [address, ESCROW_ADDRESS],
        chainId: CHAIN_ID,
      })
      if (allowance < amount) {
        setPhase('approving')
        const approveHash = await writeContractAsync({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'approve', args: [ESCROW_ADDRESS, amount], chainId: CHAIN_ID })
        setPhase('confirming')
        await waitForTransactionReceipt(config, { hash: approveHash, chainId: CHAIN_ID })
      }

      setPhase('paying')
      const payHash = await writeContractAsync({
        address: ESCROW_ADDRESS,
        abi: escrowAbi,
        functionName: 'createOrder',
        args: [order.id as `0x${string}`, amount],
        chainId: CHAIN_ID,
      })
      setPhase('confirming')
      await waitForTransactionReceipt(config, { hash: payHash, chainId: CHAIN_ID })

      setPhase('recording')
      const result = await api.syncOrder(order.id, payHash)
      if (result.order.status !== 'paid') throw new ApiError(500, 'Payment confirmed, but the shop could not record it yet. Open My orders to refresh.')
      finish(payHash, amount)
    } catch (err) {
      setPhase('idle')
      const message = err instanceof ApiError ? err.message : parseOnchainError(err)
      if (message) setError(message)
    }
  }

  function finish(tx: string | null, amount: bigint) {
    setPaidTx(tx)
    setPaidTotal(amount)
    setPending(null)
    clear()
    setPhase('done')
    toast.success('Payment received. Your order is in escrow.')
  }

  if (phase === 'done') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <CheckCircle2 className="size-14" style={{ color: 'var(--success)' }} />
        <h3 className="display text-2xl font-bold">Order placed</h3>
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          {money(paidTotal)} USDC is held in escrow and will be released to Footstepz once your order ships.
        </p>
        {paidTx && (
          <a href={txUrl(paidTx)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold" style={{ color: 'var(--accent-hover)' }}>
            View payment on explorer <ExternalLink className="size-3.5" />
          </a>
        )}
        <button
          className="btn-primary mt-4"
          onClick={() => {
            onClose()
            navigate('/orders')
          }}
        >
          View my orders
        </button>
      </div>
    )
  }

  return (
    <>
      <div className="flex-1 space-y-4 overflow-y-auto px-5 pb-4">
        <button onClick={onBack} disabled={busy} className="inline-flex items-center gap-1 text-sm font-semibold disabled:opacity-40" style={{ color: 'var(--muted)' }}>
          <ArrowLeft className="size-4" /> Back to cart
        </button>

        <fieldset disabled={busy} className="space-y-3">
          <legend className="display mb-1 text-lg font-semibold">Delivery details</legend>
          <input className="field" placeholder="Full name" autoComplete="name" value={delivery.fullName} onChange={set('fullName')} maxLength={80} />
          <input className="field" placeholder="Phone number" autoComplete="tel" inputMode="tel" value={delivery.phone} onChange={set('phone')} maxLength={30} />
          <input className="field" placeholder="Street address" autoComplete="street-address" value={delivery.address} onChange={set('address')} maxLength={200} />
          <div className="grid grid-cols-2 gap-3">
            <input className="field" placeholder="City" autoComplete="address-level2" value={delivery.city} onChange={set('city')} maxLength={80} />
            <input className="field" placeholder="Country" autoComplete="country-name" value={delivery.country} onChange={set('country')} maxLength={80} />
          </div>
          <textarea className="field" placeholder="Notes for delivery (optional)" value={delivery.notes} onChange={set('notes')} maxLength={300} />
        </fieldset>

        <div className="rounded-2xl p-4" style={{ background: 'var(--surface-muted)' }}>
          <div className="flex items-baseline justify-between">
            <span className="text-sm" style={{ color: 'var(--muted)' }}>
              Total to pay
            </span>
            <span className="display text-2xl font-bold tabular-nums">{money(totalRaw)} USDC</span>
          </div>
          <div className="mt-2 flex items-baseline justify-between text-xs" style={{ color: 'var(--muted)' }}>
            <span>Your balance on {CHAIN_NAME}</span>
            <span className="tabular-nums">{balance !== undefined ? `${money(balance)} USDC` : isConnected ? '…' : 'Connect wallet'}</span>
          </div>
          <p className="mt-3 flex items-start gap-2 text-xs" style={{ color: 'var(--muted)' }}>
            <ShieldCheck className="mt-0.5 size-4 shrink-0" style={{ color: 'var(--success)' }} />
            Your payment is held by the escrow contract. Network fees are paid in USDC too, so keep a little extra.
          </p>
        </div>

        {insufficient && (
          <p className="rounded-xl p-3 text-sm" style={{ background: 'rgba(186,43,76,0.08)', color: 'var(--danger)' }} role="alert">
            Not enough USDC. Use <strong>Get test USDC</strong> in the Arc Studio sidebar to add some.
          </p>
        )}
        {error && (
          <p className="rounded-xl p-3 text-sm" style={{ background: 'rgba(186,43,76,0.08)', color: 'var(--danger)' }} role="alert">
            {error}
          </p>
        )}
      </div>

      <div className="border-t px-5 pb-6 pt-4" style={{ borderColor: 'var(--border)' }}>
        {!isConnected ? (
          <ConnectKitButton.Custom>
            {({ show }) => (
              <button className="btn-primary w-full" onClick={show}>
                Connect wallet to pay
              </button>
            )}
          </ConnectKitButton.Custom>
        ) : wrongChain ? (
          <button className="btn-primary w-full" onClick={() => void switchChainAsync({ chainId: CHAIN_ID }).catch(() => undefined)}>
            Switch to {CHAIN_NAME}
          </button>
        ) : (
          <button className="btn-primary w-full" disabled={busy || !formValid || insufficient || lines.length === 0} onClick={() => void pay()}>
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" /> {PHASE_LABEL[phase]}
              </>
            ) : !formValid ? (
              'Fill in delivery details'
            ) : (
              `Pay ${money(totalRaw)} USDC`
            )}
          </button>
        )}
      </div>
    </>
  )
}
