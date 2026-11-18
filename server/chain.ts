import { createPublicClient, getAddress, http, isAddress, type Address, type Hex } from 'viem'
import { arcTestnet } from 'viem/chains'
import { requireChain } from '../src/onchain-facts'

const CHAIN_KEY = 'Arc_Testnet'

function resolveRpcUrl() {
  const direct = process.env['RPC_URL_' + CHAIN_KEY]
  if (direct) return direct
  const proxyChains = (process.env.RPC_PROXY_CHAINS || '').split(',')
  if (process.env.RPC_PROXY_BASE_URL && process.env.RPC_PROXY_TOKEN && proxyChains.includes(CHAIN_KEY)) {
    return `${process.env.RPC_PROXY_BASE_URL}/api/rpc/${CHAIN_KEY}?_rpc_token=${process.env.RPC_PROXY_TOKEN}`
  }
  return requireChain(arcTestnet.id).rpcUrls[0]
}

const escrowEnv = process.env.VITE_ESCROW_ADDRESS
if (!escrowEnv || !isAddress(escrowEnv)) throw new Error('VITE_ESCROW_ADDRESS is missing or invalid')
export const ESCROW_ADDRESS = getAddress(escrowEnv)

export const escrowAbi = [
  {
    type: 'function',
    name: 'orders',
    stateMutability: 'view',
    inputs: [
      { name: 'buyer', type: 'address' },
      { name: 'orderId', type: 'bytes32' },
    ],
    outputs: [
      { name: 'buyer', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'paidAt', type: 'uint64' },
      { name: 'status', type: 'uint8' },
    ],
  },
] as const

export const client = createPublicClient({ chain: arcTestnet, transport: http(resolveRpcUrl()) })

/** On-chain status codes: 0 None, 1 Paid, 2 Shipped, 3 Refunded. */
export async function readOnchainOrder(buyer: string, orderId: string) {
  const [, amount, , status] = await client.readContract({
    address: ESCROW_ADDRESS,
    abi: escrowAbi,
    functionName: 'orders',
    args: [buyer as Address, orderId as Hex],
  })
  return { amount, status: Number(status) }
}
