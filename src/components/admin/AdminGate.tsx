import { useState, type ReactNode } from 'react'
import { ConnectKitButton } from 'connectkit'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, LockKeyhole, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { useAccount, useSignMessage } from 'wagmi'
import { adminToken, api, ApiError } from '@/lib/api'
import { useShopConfig } from '@/lib/hooks'
import { parseOnchainError, shortAddress } from '@/lib/format'

function Notice({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="glass mx-auto mt-10 max-w-md rounded-3xl p-8 text-center">
      <div className="mx-auto flex size-12 items-center justify-center rounded-2xl" style={{ background: 'var(--surface-muted)' }}>
        {icon}
      </div>
      <h1 className="display mt-4 text-2xl font-bold">{title}</h1>
      <div className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>
        {children}
      </div>
    </div>
  )
}

export function AdminGate({ children }: { children: ReactNode }) {
  const { address, isConnected } = useAccount()
  const { data: shop } = useShopConfig()
  const { signMessageAsync } = useSignMessage()
  const qc = useQueryClient()
  const [signing, setSigning] = useState(false)

  const isOwner = Boolean(address && shop && address.toLowerCase() === shop.owner.toLowerCase())

  const { data: session, isLoading } = useQuery({
    queryKey: ['admin-session', address],
    queryFn: () => api.adminSession().catch(() => ({ admin: false, owner: '' })),
    enabled: isOwner,
  })

  async function signIn() {
    if (!address) return
    setSigning(true)
    try {
      const { nonce, message } = await api.adminNonce()
      const signature = await signMessageAsync({ message })
      const { token } = await api.adminLogin({ address, nonce, signature })
      adminToken.set(token)
      await qc.invalidateQueries({ queryKey: ['admin-session'] })
      toast.success('Signed in as shop owner')
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : parseOnchainError(err)
      if (msg) toast.error(msg)
    } finally {
      setSigning(false)
    }
  }

  if (!isConnected) {
    return (
      <Notice icon={<LockKeyhole className="size-6" />} title="Owner area">
        <p>Connect the shop owner wallet to manage footwear and orders.</p>
        <div className="mt-4 flex justify-center">
          <ConnectKitButton />
        </div>
      </Notice>
    )
  }

  if (!shop) {
    return (
      <Notice icon={<Loader2 className="size-6 animate-spin" />} title="Checking wallet">
        One moment.
      </Notice>
    )
  }

  if (!isOwner) {
    return (
      <Notice icon={<LockKeyhole className="size-6" />} title="Owner wallet only">
        <p>
          This area is limited to the shop owner wallet. You are connected as <span className="mono">{shortAddress(address as string)}</span>.
        </p>
        <div className="mt-4 flex justify-center">
          <ConnectKitButton />
        </div>
      </Notice>
    )
  }

  if (isLoading) {
    return (
      <Notice icon={<Loader2 className="size-6 animate-spin" />} title="Checking session">
        One moment.
      </Notice>
    )
  }

  if (!session?.admin) {
    return (
      <Notice icon={<ShieldCheck className="size-6" />} title="Sign in as owner">
        <p>Sign a free message with your wallet to unlock uploads and order management. No transaction is sent.</p>
        <button className="btn-primary mt-5 w-full" onClick={() => void signIn()} disabled={signing}>
          {signing ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Waiting for signature…
            </>
          ) : (
            'Sign in'
          )}
        </button>
      </Notice>
    )
  }

  return <>{children}</>
}
