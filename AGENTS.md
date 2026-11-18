# Footstepz Global Venture

> Built with Arc Studio - money-powered apps in minutes

Project memory for future agents and humans.

## What This App Does

Footwear shop. The owner (a single wallet) uploads listings; customers add pairs and sizes to a cart and pay in USDC on Arc Testnet into an escrow contract. The owner marks an order shipped (USDC released to the owner wallet) or refunds it (USDC returns to the buyer). A buyer can claim a refund themselves if the order is still unshipped after 14 days.

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS, wagmi v2, viem, ConnectKit, Sonner, framer-motion
- API: Bun server in `server/` (port 3001), proxied by Vite at `/api` (the proxy strips the prefix)
- Database: Postgres 18 in Docker (`compose.yaml`, named volume `pgdata`). Start with `bun run db:up`
- Contracts: Solidity 0.8.28 + Foundry. `contracts/FootstepzEscrow.sol`, tests in `contracts/test/`
- Chain: Arc Testnet (5042002). USDC is `0x3600000000000000000000000000000000000000` (6 decimals) and also the gas token

## Deployed contracts

- FootstepzEscrow (Arc Testnet): `0x0d2B503AcB7D6Da115aB7b06B977911405Cf7E2D`, owner is the shop owner wallet (`OWNER_ADDRESS` in `.env`). Orders are keyed per buyer: `orders[buyer][orderId]`, so `markShipped` and `refund` take the buyer address.

## Key Files

- `server/index.ts` routes; `server/auth.ts` owner wallet signature login (bearer session in `admin_sessions`); `server/chain.ts` on-chain reads; `server/db.ts` schema; `server/seed.ts` sample listings
- `src/lib/api.ts` API client; `src/lib/escrow.ts` contract ABI and addresses; `src/lib/cart.tsx` cart
- `src/components/` storefront; `src/components/admin/` owner area (`/admin`)
- The server computes order totals from database prices and trusts the escrow contract as the source of truth for payment status (`/orders/:id/sync`).

## Notes

- `.env` holds `OWNER_PRIVATE_KEY` for the generated owner wallet (testnet only). It is gitignored; never print or commit it. Import it into a wallet to use `/admin`.
- Restart the Vite dev server after changing `.env` or `vite.config.ts`. Start it with `bun run dev --host 0.0.0.0`.
- Run the API with `bun run server` (reads `.env` automatically).
- Delivery details are only returned by admin routes, never by the buyer order list.

## Deployment

- Web app: Netlify (`netlify.toml`, SPA redirect, build with npm). Needs `VITE_API_BASE_URL` (Render API URL) set in the Netlify UI.
- API: Render Blueprint (`render.yaml`) with `Dockerfile` (Bun) and free Postgres. Needs `OWNER_ADDRESS` and `CORS_ORIGINS`.
- The client builds API URLs with `apiUrl()` / `API_BASE` in `src/lib/api.ts`; the server returns image paths without the `/api` prefix.

## Share links

- `getShareBase`, `buildShareLink` and `installShareSync` live in `src/lib/share.ts`; keep the `installShareSync()` call in `src/main.tsx`.
- Never put a secret in a URL path or query. Navigate inside the app with relative links.

## To Run

```bash
bun install
bun run db:up
bun run server
bun run dev --host 0.0.0.0
```
