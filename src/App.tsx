import { CartProvider } from '@/lib/cart'
import { usePath } from '@/lib/router'
import { CartDrawer } from '@/components/CartDrawer'
import { Header } from '@/components/Header'
import { Hero } from '@/components/Hero'
import { MyOrders } from '@/components/MyOrders'
import { ProductGrid } from '@/components/ProductGrid'
import { AdminPage } from '@/components/admin/AdminPage'

function Footer() {
  return (
    <footer className="border-t py-8 text-center text-xs" style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}>
      <p>Footstepz Global Venture. Payments in USDC on Arc Testnet, held in escrow until your order ships.</p>
    </footer>
  )
}

export default function App() {
  const path = usePath()

  return (
    <CartProvider>
      <div className="min-h-dvh">
        <Header />
        {path === '/admin' ? (
          <AdminPage />
        ) : path === '/orders' ? (
          <MyOrders />
        ) : (
          <>
            <Hero />
            <ProductGrid />
          </>
        )}
        <Footer />
        <CartDrawer />
      </div>
    </CartProvider>
  )
}
