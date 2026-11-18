## Implementation Plan: Footstepz Global Venture

### Summary
A footwear storefront for Footstepz Global Venture. Only the owner wallet can upload and manage listings. Customers browse, pick a size, add pairs to a cart, and pay in USDC on Arc Testnet. The USDC is held in an escrow contract until the owner marks the order shipped (funds go to the owner) or refunds it (funds go back to the buyer).

### Architecture
- **Blockchain:** Arc Testnet (chain ID 5042002), USDC `0x3600000000000000000000000000000000000000` (6 decimals). USDC is also the gas token. Testnet only.
- **Contract:** `FootstepzEscrow.sol` (Solidity 0.8.28, OpenZeppelin SafeERC20, ReentrancyGuard, Ownable2Step).
  - `constructor(owner, usdc)`: owner is the user's own wallet address (passed explicitly, NOT the platform deployer wallet).
  - `createOrder(bytes32 orderId, uint256 amount)`: pulls USDC from buyer after approve, stores buyer/amount/timestamp, emits `OrderPaid`.
  - `markShipped(orderId)` (owner): releases funds to owner, emits `OrderShipped`.
  - `refund(orderId)` (owner): returns funds to buyer, emits `OrderRefunded`.
  - `claimRefund(orderId)` (buyer): only if still unshipped after a 14 day window.
  - States: None, Paid, Shipped, Refunded. Settle once only. Reject zero amount and duplicate order IDs.
  - Balanced security review before deploy; deploy to Arc Testnet with the user's wallet as owner.
- **Backend and database:**
  - Small Bun API server (`server/index.ts`) alongside Vite, `/api` proxied.
  - Postgres in Docker with a named volume. Connection via `.env` only.
  - Tables: `products` (name, price_usdc, category, sizes, image bytes and type), `orders` (order_id, buyer, items snapshot, total, delivery details, status, tx hashes), `admin_sessions`.
  - Admin auth: wallet signs a login message; server verifies with viem against `OWNER_ADDRESS`; short-lived httpOnly session cookie. All write endpoints require it.
  - Server computes order totals from DB prices (never trusts browser totals).
  - After payment, server reads the `OrderPaid` event from the receipt and checks orderId, buyer and amount before marking Paid.
  - Image uploads: JPEG/PNG/WebP, max 2 MB, validated server-side.
- **Frontend:** React, Tailwind, wagmi, viem, ConnectKit, `@/onchain-facts` and `@/onchain-money`. Arc frontend design guidance (read the frontend-design skill before writing UI).
  - Shop home: hero, category filter chips, product grid.
  - Product modal: photo, price, size picker.
  - Cart drawer.
  - Checkout: delivery name/phone/address, approve then pay, chain check, faucet reminder, explorer link.
  - My orders: status per order, claim-refund when eligible.
  - `/admin`: locked until owner wallet connects and signs. Product upload/edit/delete (photo, name, price, category, sizes) and orders table with delivery details plus Mark shipped / Refund buttons that send the contract tx then record it.
- **Wallet:** ConnectKit with injected wallets (existing `src/config.ts`), Arc Testnet.

### Files to Create/Modify
1. `contracts/FootstepzEscrow.sol`: escrow contract.
2. `contracts/test/FootstepzEscrow.t.sol`: Foundry tests (pay, ship, refund, timeout claim, double settlement, access control).
3. `compose.yaml`: Postgres service with named volume and healthcheck.
4. `.env`: add `DATABASE_URL`, `OWNER_ADDRESS`, `SESSION_SECRET`, `VITE_ESCROW_ADDRESS` (only VITE_ values are public).
5. `package.json`: add `server` and `dev:all` scripts and any needed deps.
6. `vite.config.ts`: add `/api` proxy to the API server.
7. `server/index.ts`: routes for products, orders, admin auth.
8. `server/db.ts`: connection, schema, queries.
9. `server/auth.ts`: signature login, session cookie, admin guard.
10. `server/chain.ts`: viem client verifying paid/shipped/refunded events from receipts.
11. `src/lib/escrow.ts`: escrow ABI, address, USDC approve helpers.
12. `src/lib/api.ts`: typed fetch client.
13. `src/lib/cart.tsx`: cart state (product, size, qty) persisted in localStorage.
14. `src/App.tsx`: layout, path routing (`/`, `/orders`, `/admin`), providers.
15. `src/components/Header.tsx`: brand, cart button, wallet button, Admin link for owner only.
16. `src/components/Hero.tsx`, `src/components/ProductGrid.tsx`: hero, category filter, product cards.
17. `src/components/ProductModal.tsx`: size selection, add to cart.
18. `src/components/CartDrawer.tsx`, `src/components/Checkout.tsx`: cart, delivery form, approve-then-pay flow.
19. `src/components/MyOrders.tsx`: buyer order history and claim refund.
20. `src/components/admin/AdminGate.tsx`: owner-wallet check and sign-in.
21. `src/components/admin/ProductForm.tsx`, `src/components/admin/ProductList.tsx`: upload, edit, delete.
22. `src/components/admin/OrdersTable.tsx`: orders with delivery details, Mark shipped, Refund.
23. `AGENTS.md`: app description, stack, run instructions.

### Build Sequence
1. Get the owner wallet address from the user (becomes `OWNER_ADDRESS` and contract owner). Never invent one.
2. Write the escrow contract, run the security review, fix findings, write and run unit tests.
3. Deploy `FootstepzEscrow` to Arc Testnet with the user's wallet as owner; set `VITE_ESCROW_ADDRESS`.
4. Start Postgres via Docker Compose, wire `DATABASE_URL`, create schema.
5. Build the API server: products CRUD with image upload, public listing and image endpoint, order creation with server-computed totals, payment verification, admin sign-in and guard.
6. Add the Vite `/api` proxy and dev scripts so frontend and API run together.
7. Build the storefront: header, hero, grid with category filter, product modal, cart.
8. Build checkout: delivery form, chain check, USDC approve, `createOrder`, server confirmation, success state, explorer link. Add My orders and claim refund.
9. Build admin: wallet gate with signed login, product forms, orders table with Mark shipped and Refund wired to the contract and recorded on the server.
10. Seed 3 to 4 sample listings with placeholder images (deletable from admin).
11. Run lint, typecheck and a full manual pass of the flow in the preview. Update `AGENTS.md`.

### Done When
- [ ] Escrow contract deployed on Arc Testnet with the user's wallet as owner.
- [ ] Visitors see all listings (photo, name, price, category, sizes); category filter works.
- [ ] Listings persist across refresh and are the same for every visitor.
- [ ] `/admin` is unavailable to other wallets; only the owner can sign in, upload, edit, delete.
- [ ] Admin API routes reject requests without a valid owner session.
- [ ] A customer can add a pair in a chosen size, enter delivery details, approve USDC and pay into escrow.
- [ ] Order shows Paid only after the server verifies the on-chain payment against the server-computed total.
- [ ] Owner can mark shipped and USDC lands in the owner wallet.
- [ ] Owner can refund and USDC returns to the buyer.
- [ ] Buyer can claim a refund after the timeout if unshipped.
- [ ] Testnet faucet reminder shown, wrong network rejected, explorer links shown.
- [ ] Lint and typecheck pass.

## Ready to build?
