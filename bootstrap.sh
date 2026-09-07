#!/usr/bin/env bash
# bootstrap.sh — run once after clone
set -euo pipefail

echo "🚀 Bootstrapping ASR Huddle..."

# 1. Install deps
pnpm install

# 2. Husky
pnpm husky install

# 3. Start local stack
docker compose up -d

# 4. Wait for healthchecks
echo "⏳ Waiting for Postgres & Redis..."
until docker compose exec -T postgres pg_isready -U huddle -d asr_huddle >/dev/null 2>&1; do sleep 1; done
until docker compose exec -T redis redis-cli ping >/dev/null 2>&1; do sleep 1; done

echo "✅ Local stack ready."
echo ""
echo "Next steps:"
echo "  1. Open GitHub → Projects → 'ASR Huddle V1' → verify board"
echo "  2. Pick an M0 issue (e.g., M0-01) → move to 'In Progress'"
echo "  3. Start coding!"
echo ""
echo "Useful commands:"
echo "  pnpm dev              # start all dev servers (after M0-01/07)"
echo "  pnpm lint             # lint all packages"
echo "  pnpm typecheck        # typecheck all packages"
echo "  pnpm test             # run tests"
echo "  pnpm db:migrate       # run migrations (after backend has prisma/drizzle)"
