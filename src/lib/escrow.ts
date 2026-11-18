import { erc20Abi, getAddress, isAddress } from 'viem'
import { arcTestnet } from 'viem/chains'
import { buildTxExplorerUrl, getUsdc, requireChain } from '@/onchain-facts'

export const CHAIN_ID = arcTestnet.id
export const CHAIN_NAME = requireChain(CHAIN_ID).name

const envAddress = import.meta.env.VITE_ESCROW_ADDRESS as string | undefined
if (!envAddress || !isAddress(envAddress)) {
  throw new Error('VITE_ESCROW_ADDRESS is missing or invalid. Restart the dev server after changing .env.')
}
export const ESCROW_ADDRESS = getAddress(envAddress)

const usdc = getUsdc(CHAIN_ID)
if (!usdc) throw new Error(`USDC is not available on chain ${CHAIN_ID}`)
export const USDC_ADDRESS = usdc.address as `0x${string}`

export const txUrl = (hash: string) => buildTxExplorerUrl(CHAIN_ID, hash)

export { erc20Abi }

export const escrowAbi = [
  {
    type: 'function',
    name: 'createOrder',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'orderId', type: 'bytes32' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'markShipped',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'buyer', type: 'address' },
      { name: 'orderId', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'refund',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'buyer', type: 'address' },
      { name: 'orderId', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'claimRefund',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'orderId', type: 'bytes32' }],
    outputs: [],
  },
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
  {
    type: 'function',
    name: 'REFUND_TIMEOUT',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const
