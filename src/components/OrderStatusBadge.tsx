import type { OrderStatus } from '@/lib/api'

const LABELS: Record<OrderStatus, { text: string; color: string; bg: string }> = {
  pending: { text: 'Awaiting payment', color: '#6b6580', bg: 'rgba(107,101,128,0.12)' },
  paid: { text: 'Paid, in escrow', color: '#1061a6', bg: 'rgba(16,97,166,0.12)' },
  shipped: { text: 'Shipped', color: '#1a8047', bg: 'rgba(26,128,71,0.12)' },
  refunded: { text: 'Refunded', color: '#ba2b4c', bg: 'rgba(186,43,76,0.1)' },
}

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const l = LABELS[status]
  return (
    <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold" style={{ color: l.color, background: l.bg }}>
      {l.text}
    </span>
  )
}
