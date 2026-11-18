import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, Loader2, MapPin, PackageCheck, Phone, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAccount, useConfig, useSwitchChain, useWriteContract } from 'wagmi'
import { waitForTransactionReceipt } from 'wagmi/actions'
import { api, ApiError, type Order } from '@/lib/api'
import { CHAIN_ID, ESCROW_ADDRESS, escrowAbi, txUrl } from '@/lib/escrow'
import { money, parseOnchainError, shortAddress } from '@/lib/format'
import { OrderStatusBadge } from '../OrderStatusBadge'

function OrderCard({ order }: { order: Order }) {
  const { chainId } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const { writeContractAsync } = useWriteContract()
  const config = useConfig()
  const qc = useQueryClient()
  const [busy, setBusy] = useState<'ship' | 'refund' | null>(null)
  const [confirmRefund, setConfirmRefund] = useState(false)

  async function settle(kind: 'ship' | 'refund') {
    setBusy(kind)
    try {
      if (chainId !== CHAIN_ID) await switchChainAsync({ chainId: CHAIN_ID })
      const hash = await writeContractAsync({
        address: ESCROW_ADDRESS,
        abi: escrowAbi,
        functionName: kind === 'ship' ? 'markShipped' : 'refund',
        args: [order.buyer as `0x${string}`, order.id as `0x${string}`],
        chainId: CHAIN_ID,
      })
      await waitForTransactionReceipt(config, { hash, chainId: CHAIN_ID })
      await api.adminSyncOrder(order.id, hash)
      await qc.invalidateQueries({ queryKey: ['admin-orders'] })
      toast.success(kind === 'ship' ? 'Marked as shipped. USDC released to your wallet.' : 'Order refunded. USDC returned to the buyer.')
    } catch (err) {
      const message = err instanceof ApiError ? err.message : parseOnchainError(err)
      if (message) toast.error(message)
    } finally {
      setBusy(null)
      setConfirmRefund(false)
    }
  }

  const d = order.delivery
  return (
    <li className="glass rounded-3xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="mono text-xs" style={{ color: 'var(--subtle)' }}>
          #{order.id.slice(2, 10)} · {new Date(order.createdAt).toLocaleString()}
        </span>
        <OrderStatusBadge status={order.status} />
      </div>

      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <div>
          <ul className="space-y-1.5">
            {order.items.map((it) => (
              <li key={`${it.productId}-${it.size}`} className="flex justify-between gap-3 text-sm">
                <span>
                  {it.qty} × {it.name} <span style={{ color: 'var(--muted)' }}>(size {it.size})</span>
                </span>
                <span className="tabular-nums">{money(BigInt(it.unitRaw) * BigInt(it.qty))}</span>
              </li>
            ))}
          </ul>
          <p className="display mt-3 text-xl font-bold tabular-nums">{money(order.totalRaw)} USDC</p>
          <p className="mono mt-1 text-xs" style={{ color: 'var(--muted)' }}>
            Buyer {shortAddress(order.buyer)}
          </p>
        </div>

        {d && (
          <div className="rounded-2xl p-3 text-sm" style={{ background: 'var(--surface-muted)' }}>
            <p className="font-semibold">{d.fullName}</p>
            <p className="mt-1 flex items-start gap-1.5" style={{ color: 'var(--ink-2)' }}>
              <MapPin className="mt-0.5 size-4 shrink-0" />
              <span>
                {d.address}, {d.city}, {d.country}
              </span>
            </p>
            <p className="mt-1 flex items-center gap-1.5" style={{ color: 'var(--ink-2)' }}>
              <Phone className="size-4 shrink-0" /> {d.phone}
            </p>
            {d.notes && (
              <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                Note: {d.notes}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {order.status === 'paid' &&
          (confirmRefund ? (
            <>
              <span className="text-sm">Return {money(order.totalRaw)} USDC to the buyer?</span>
              <button className="btn-ghost" disabled={busy !== null} onClick={() => setConfirmRefund(false)}>
                Cancel
              </button>
              <button className="btn-primary !min-h-[44px]" style={{ background: 'var(--danger)' }} disabled={busy !== null} onClick={() => void settle('refund')}>
                {busy === 'refund' && <Loader2 className="size-4 animate-spin" />} Confirm refund
              </button>
            </>
          ) : (
            <>
              <button className="btn-primary !min-h-[44px]" disabled={busy !== null} onClick={() => void settle('ship')}>
                {busy === 'ship' ? <Loader2 className="size-4 animate-spin" /> : <PackageCheck className="size-4" />} Mark shipped
              </button>
              <button className="btn-ghost" disabled={busy !== null} onClick={() => setConfirmRefund(true)}>
                <Undo2 className="size-4" /> Refund
              </button>
            </>
          ))}
        <span className="ml-auto flex gap-3 text-xs font-semibold" style={{ color: 'var(--accent-hover)' }}>
          {order.paidTx && (
            <a href={txUrl(order.paidTx)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1">
              Payment <ExternalLink className="size-3" />
            </a>
          )}
          {order.finalTx && (
            <a href={txUrl(order.finalTx)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1">
              {order.status === 'shipped' ? 'Release' : 'Refund'} <ExternalLink className="size-3" />
            </a>
          )}
        </span>
      </div>
    </li>
  )
}

export function OrdersTable() {
  const { data: orders, isLoading, isError } = useQuery({ queryKey: ['admin-orders'], queryFn: api.adminOrders, refetchInterval: 20_000 })

  if (isLoading) return <div className="glass h-40 animate-pulse rounded-3xl" aria-busy="true" />
  if (isError) return <p className="glass rounded-3xl p-8 text-center text-sm">Could not load orders. Sign in again and retry.</p>
  if (!orders || orders.length === 0) {
    return (
      <div className="glass rounded-3xl p-10 text-center">
        <p className="display text-lg font-semibold">No paid orders yet</p>
        <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
          Orders appear here once a customer pays into escrow.
        </p>
      </div>
    )
  }
  return (
    <ul className="space-y-3">
      {orders.map((o) => (
        <OrderCard key={o.id} order={o} />
      ))}
    </ul>
  )
}
