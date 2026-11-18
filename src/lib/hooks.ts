import { useQuery } from '@tanstack/react-query'
import { useAccount } from 'wagmi'
import { api } from './api'

export function useProducts() {
  return useQuery({ queryKey: ['products'], queryFn: api.products, refetchInterval: 30_000 })
}

export function useShopConfig() {
  return useQuery({ queryKey: ['config'], queryFn: api.config, staleTime: Infinity })
}

/** True when the connected wallet is the shop owner wallet. */
export function useIsOwner() {
  const { address } = useAccount()
  const { data } = useShopConfig()
  return Boolean(address && data && address.toLowerCase() === data.owner.toLowerCase())
}
