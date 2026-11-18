# Footstepz API (Bun). Build context is the repository root.
FROM oven/bun:1.3-alpine
WORKDIR /app

# Install only what the API needs.
COPY server/package.json ./package.json
RUN bun install --production

# Server code plus the two shared modules it imports from the web app.
COPY server ./server
COPY src/onchain-facts.ts src/onchain-money.ts ./src/
RUN echo '{"compilerOptions":{"baseUrl":".","paths":{"@/*":["./src/*"]}}}' > tsconfig.json

ENV NODE_ENV=production
EXPOSE 3001
CMD ["bun", "run", "server/index.ts"]
