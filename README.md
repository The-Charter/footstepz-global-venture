# Footstepz Global Venture

An online footwear shop. The owner uploads footwear (photo, name, price, category, sizes), customers pick a pair and size, and pay in USDC on Arc Testnet. Payments are held in an escrow contract until the owner marks the order shipped, or refunds it.

Built with [Arc Studio](https://studio.arc.io)

## Tech stack

- React, Vite, TypeScript, Tailwind CSS
- wagmi, viem, ConnectKit (wallet connection)
- Bun API server with Postgres (run through Docker)
- Solidity escrow contract (Foundry) on Arc Testnet

## Development

Prerequisites: Bun, Docker, Foundry.

```bash
bun install
bun run db:up        # start Postgres
bun run server       # start the API on port 3001
bun run seed         # optional: add sample listings
bun run dev          # start the web app (proxies /api to the server)
```

Other commands:

```bash
bun run check            # lint and typecheck
bun run contracts:build  # compile contracts
bun run contracts:test   # run contract tests
```

### Environment variables

- `DATABASE_URL`: Postgres connection string (local Docker, Render Postgres or Supabase). For Supabase on Render use the Session pooler string, because the direct connection is IPv6 only.
- `OWNER_ADDRESS`: the shop owner wallet. Only this wallet can sign in to the admin page.
- `SESSION_SECRET`: random secret used to protect admin sessions.
- `PORT` or `API_PORT`: port for the API server (defaults to 3001).
- `CORS_ORIGINS`: comma-separated web app URLs allowed to call the API when it is hosted separately (for example your Netlify URL).
- `VITE_ESCROW_ADDRESS`: address of the deployed escrow contract (public).
- `VITE_API_BASE_URL`: public URL of the API for the deployed web app. Leave unset locally.
- `RPC_URL_Arc_Testnet`: optional custom RPC for the server. Falls back to the public Arc Testnet RPC.
- `RPC_PROXY_BASE_URL`, `RPC_PROXY_TOKEN`, `RPC_PROXY_CHAINS`: optional. Provisioned by Arc Studio; not needed elsewhere.

## Deploying

The web app and the API deploy separately.

1. **API on Render:** New > Blueprint, pick this repository. `render.yaml` creates the API (Docker) and a Postgres database. Set `OWNER_ADDRESS` and `CORS_ORIGINS` (your Netlify URL) when prompted.
2. **Web app on Netlify:** import this repository. `netlify.toml` holds the build settings. Add the environment variable `VITE_API_BASE_URL` set to your Render API URL, then redeploy.
3. Open `/admin` on the deployed site with the owner wallet to add footwear.

## Using the shop

- Customers connect a wallet on Arc Testnet and need test USDC (also used for network fees).
- The owner opens `/admin` with the owner wallet, signs in with a free message, then manages listings and orders.
