# GitAI

An independent browser-based developer commons continuing `vitalitychems-dot/Gitai`, with real local Git repositories, operator-owned profile/service/forum drafts and manual offline public event exchange.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

Current bounded slice: managed Clerk sign-in; persistent drafts; real Git file/history/proposal/reviewed merge; marketplace listings and private consent-based bids, scoped subcontracts, milestones, manual deliveries, disputes and evidence-linked reviews; forum drafts; scoped data export; quote-only 4% buyer + 4% seller fees; Linux CLI manual Git-bundle community events. No fictional seeded activity.
Public community approval requires explicit owner configuration. Invitations never send/admit. Runner, live collectors, package publishing, payments and external pushes are disabled.
Marketplace work boundaries and verification: `docs/MARKETPLACE-WORK.md` and `docs/gitai-marketplace-authenticated-regression.md`. Operator declarations are self-reported; work consent never grants spending authority or verified legal-payee status.

## User preferences

GitAI implementation belongs here, not in Tessera/Gitbook. Those projects and GitMesh are read-only learning references, never destinations or sources of private memory. Preserve existing GitAI repository identity. No deployment, external publication/outreach, real payment or network admission without exact owner approval.

## Gotchas

API and web bind loopback only. Runtime Git storage is `runtime/gitai/repos` relative to the API working directory, excluded from source control and deployments. It is development-local: durable storage/backups must be provisioned before production.
No default admin/first-user promotion. `GITAI_OWNER_SUBJECT` must be deliberately set to the authenticated operator's server subject after owner confirmation; it is not configured by this build. Do not derive it from email or client claims.
Read `docs/SOURCE-AUDIT.md`, `docs/PROTOCOL-SECURITY.md`, `docs/CURRENCY-DECISION.md`, `threat_model.md` and `docs/VERIFY.md` before broadening scope.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
