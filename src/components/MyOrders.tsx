import { ConnectKitButton } from 'connectkit'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, Loader2, PackageOpen } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useAccount, useConfig, useReadContract, useSwitchChain, useWriteContract } from 'wagmi'
import { waitForTransactionReceipt } from 'wagmi/actions'
import { api, ApiError, type Order } from '@/lib/api'
import { CHAIN_ID, CHAIN_NAME, ESCROW_ADDRESS, escrowAbi, txUrl } from '@/lib/escrow'
import { money, parseOnchainError } from '@/lib/format'
import { OrderStatusBadge } from './OrderStatusBadge'

function ClaimRefund({ order }: { order: Order }) {
  const { address, chainId } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const { writeContractAsync } = useWriteContract()
  const config = useConfig()
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [now] = useState(() => Date.now())

  const { data: onchain } = useReadContract({
    address: ESCROW_ADDRESS,
    abi: escrowAbi,
    functionName: 'orders',
    args: [order.buyer as `0x${string}`, order.id as `0x${string}`],
    chainId: CHAIN_ID,
  })
  const { data: timeout } = useReadContract({ address: ESCROW_ADDRESS, abi: escrowAbi, functionName: 'REFUND_TIMEOUT', chainId: CHAIN_ID })

  if (!onchain || timeout === undefined || onchain[3] !== 1) return null
  const availableAt = Number(onchain[2]) + Number(timeout)
  const ready = now / 1000 >= availableAt
  const when = new Date(availableAt * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

  async function claim() {
    if (!address) return
    setBusy(true)
    try {
      if (chainId !== CHAIN_ID) await switchChainAsync({ chainId: CHAIN_ID })
      const hash = await writeContractAsync({ address: ESCROW_ADDRESS, abi: escrowAbi, functionName: 'claimRefund', args: [order.id as `0x${string}`], chainId: CHAIN_ID })
      await waitForTransactionReceipt(config, { hash, chainId: CHAIN_ID })
      await api.syncOrder(order.id, hash)
      await qc.invalidateQueries({ queryKey: ['my-orders'] })
      toast.success('Refund claimed. Your USDC is back in your wallet.')
    } catch (err) {
      const message = err instanceof ApiError ? err.message : parseOnchainError(err)
      if (message) toast.error(message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl p-3 text-xs" style={{ background: 'var(--surface-muted)', color: 'var(--muted)' }}>
      <span>{ready ? 'Not shipped yet? You can claim your USDC back.' : `Not shipped by ${when}? You can claim your USDC back.`}</span>
      <button className="btn-ghost !min-h-[40px]" disabled={!ready || busy} onClick={() => void claim()}>
        {busy && <Loader2 className="size-4 animate-spin" />} Claim refund
      </button>
    </div>
  )
}

export function MyOrders() {
  const { address, isConnected } = useAccount()
  const { data: orders, isLoading, isError } = useQuery({
    queryKey: ['my-orders', address],
    queryFn: () => api.myOrders(address as string),
    enabled: Boolean(address),
    refetchInterval: 20_000,
  })

  return (
    <main className="mx-auto max-w-3xl px-4 pb-24 pt-8">
      <h1 className="display text-4xl font-bold">My orders</h1>
      <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
        Orders paid from your connected wallet on {CHAIN_NAME}.
      </p>

      {!isConnected ? (
        <div className="glass mt-6 rounded-3xl p-8 text-center">
          <p className="display text-xl font-semibold">Connect your wallet to see your orders</p>
          <div className="mt-4 flex justify-center">
            <ConnectKitButton />
          </div>
        </div>
      ) : isLoading ? (
        <div className="glass mt-6 animate-pulse rounded-3xl p-10" aria-busy="true" />
      ) : isError ? (
        <p className="glass mt-6 rounded-3xl p-8 text-center text-sm">We could not load your orders. Please refresh.</p>
      ) : !orders || orders.length === 0 ? (
        <div className="glass mt-6 rounded-3xl p-10 text-center">
          <PackageOpen className="mx-auto size-8" style={{ color: 'var(--subtle)' }} />
          <p className="display mt-3 text-xl font-semibold">No orders yet</p>
          <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
            Paid orders will show up here.
          </p>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {orders.map((o) => (
            <li key={o.id} className="glass rounded-3xl p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="mono text-xs" style={{ color: 'var(--subtle)' }}>
                  #{o.id.slice(2, 10)} · {new Date(o.createdAt).toLocaleDateString()}
                </span>
                <OrderStatusBadge status={o.status} />
              </div>
              <ul className="mt-3 space-y-1.5">
                {o.items.map((it) => (
                  <li key={`${it.productId}-${it.size}`} className="flex justify-between text-sm">
                    <span>
                      {it.qty} × {it.name} <span style={{ color: 'var(--muted)' }}>(size {it.size})</span>
                    </span>
                    <span className="tabular-nums">{money(BigInt(it.unitRaw) * BigInt(it.qty))}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex items-center justify-between border-t pt-3" style={{ borderColor: 'var(--border)' }}>
                <span className="display text-lg font-bold tabular-nums">{money(o.totalRaw)} USDC</span>
                <span className="flex gap-3 text-xs font-semibold" style={{ color: 'var(--accent-hover)' }}>
                  {o.paidTx && (
                    <a href={txUrl(o.paidTx)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1">
                      Payment <ExternalLink className="size-3" />
                    </a>
                  )}
                  {o.finalTx && (
                    <a href={txUrl(o.finalTx)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1">
                      {o.status === 'shipped' ? 'Release' : 'Refund'} <ExternalLink className="size-3" />
                    </a>
                  )}
                </span>
              </div>
              {o.status === 'paid' && <ClaimRefund order={o} />}
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
