export interface Product {
  id: number
  name: string
  category: string
  priceRaw: string
  price: string
  sizes: string[]
  imageUrl: string | null
}

export type OrderStatus = 'pending' | 'paid' | 'shipped' | 'refunded'

export interface OrderItem {
  productId: number
  name: string
  size: string
  qty: number
  unitRaw: string
}

export interface Delivery {
  fullName: string
  phone: string
  address: string
  city: string
  country: string
  notes?: string
}

export interface Order {
  id: string
  buyer: string
  items: OrderItem[]
  totalRaw: string
  total: string
  status: OrderStatus
  paidTx: string | null
  finalTx: string | null
  createdAt: string
  delivery?: Delivery
}

/** Backend base URL. Defaults to the same-origin `/api` proxy; set VITE_API_BASE_URL when the API is hosted elsewhere. */
export const API_BASE = ((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api').replace(/\/+$/, '')

/** Turns a server-relative path such as `/products/1/image` into a full URL. */
export function apiUrl(path: string | null): string | null {
  if (!path) return null
  return `${API_BASE}${path.replace(/^\/api(?=\/)/, '')}`
}

const TOKEN_KEY = 'footstepz.admin.token'

export const adminToken = {
  get: () => sessionStorage.getItem(TOKEN_KEY),
  set: (t: string) => sessionStorage.setItem(TOKEN_KEY, t),
  clear: () => sessionStorage.removeItem(TOKEN_KEY),
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

async function request<T>(path: string, init: RequestInit = {}, admin = false): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body && !(init.body instanceof FormData)) headers.set('content-type', 'application/json')
  if (admin) {
    const token = adminToken.get()
    if (token) headers.set('authorization', `Bearer ${token}`)
  }
  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, { ...init, headers })
  } catch {
    throw new ApiError(0, 'Cannot reach the shop server. Please try again.')
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'Request failed')
  return data as T
}

export const api = {
  config: () => request<{ owner: string; escrow: string }>('/config'),
  products: () => request<{ products: Product[] }>('/products').then((r) => r.products.map((p) => ({ ...p, imageUrl: apiUrl(p.imageUrl) }))),
  createOrder: (body: { buyer: string; items: { productId: number; size: string; qty: number }[]; delivery: Delivery }) =>
    request<{ orderId: string; totalRaw: string; total: string; escrow: string }>('/orders', { method: 'POST', body: JSON.stringify(body) }),
  syncOrder: (id: string, txHash?: string) =>
    request<{ order: Order; mismatch: boolean }>(`/orders/${id}/sync`, { method: 'POST', body: JSON.stringify({ txHash }) }),
  myOrders: (buyer: string) => request<{ orders: Order[] }>(`/orders?buyer=${buyer}`).then((r) => r.orders),

  adminNonce: () => request<{ nonce: string; message: string }>('/admin/nonce', { method: 'POST' }),
  adminLogin: (body: { address: string; nonce: string; signature: string }) =>
    request<{ token: string; expiresAt: string }>('/admin/login', { method: 'POST', body: JSON.stringify(body) }),
  adminSession: () => request<{ admin: boolean; owner: string }>('/admin/session', {}, true),
  adminLogout: () => request<{ ok: boolean }>('/admin/logout', { method: 'POST' }, true),
  adminOrders: () => request<{ orders: Order[] }>('/admin/orders', {}, true).then((r) => r.orders),
  adminSyncOrder: (id: string, txHash?: string) =>
    request<{ order: Order }>(`/admin/orders/${id}/sync`, { method: 'POST', body: JSON.stringify({ txHash }) }, true),
  saveProduct: (form: FormData, id?: number) =>
    request<{ product: Product }>(id ? `/admin/products/${id}` : '/admin/products', { method: id ? 'PUT' : 'POST', body: form }, true),
  deleteProduct: (id: number) => request<{ ok: boolean }>(`/admin/products/${id}`, { method: 'DELETE' }, true),
}
