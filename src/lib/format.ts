import { formatUsdc } from '@/onchain-money'

/** Formats a raw 6-decimal USDC amount as "45.00". */
export function money(raw: bigint | string): string {
  const exact = formatUsdc(typeof raw === 'bigint' ? raw : BigInt(raw))
  const [whole, frac = ''] = exact.split('.')
  const withCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${withCommas}.${frac.padEnd(2, '0')}`
}

export const shortAddress = (addr: string) => `${addr.slice(0, 6)}…${addr.slice(-4)}`

export function parseOnchainError(error: unknown): string | null {
  const e = error as { code?: number; message?: string; shortMessage?: string } | null
  const message = `${e?.shortMessage ?? ''} ${e?.message ?? ''}`.toLowerCase()
  if (e?.code === 4001 || message.includes('user rejected') || message.includes('user denied')) return null
  if (message.includes('insufficient funds') || message.includes('exceeds balance') || message.includes('transfer amount exceeds')) {
    return 'Insufficient USDC balance. Add test USDC and try again.'
  }
  if (message.includes('orderalreadyexists') || message.includes('already exists')) return 'This order was already paid.'
  if (message.includes('reverted')) return 'The transaction was rejected by the contract. Please try again.'
  if (message.includes('network') || message.includes('timeout') || message.includes('fetch')) {
    return 'Network issue. Check your connection and try again.'
  }
  return 'Something went wrong. Please try again.'
}
