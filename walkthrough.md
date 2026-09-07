# Migration Report: AceCore Runtime to Vercel (`https://acedmtracker.vercel.app`)

## Executive Summary

AceCore's runtime has been migrated from Cloudflare Workers / OpenNext to the existing Vercel project powering **`https://acedmtracker.vercel.app`**.

- **Authoritative Production URL**: **`https://acedmtracker.vercel.app`**
- **Vercel Production Deployment ID**: `dpl_AXqnA4dS2kuw2VWQ7BsGEZdvKeFy`
- **Canonical Pushed Git Commit**: `fe5f1f7e02582846caea5ffecbe84d31e97c11f7` (Branch: `main`)
- **Neon PostgreSQL**: Authoritative production database retained without schema modifications.
- **Cloudflare R2**: Authoritative object storage retained with S3-compatible signed URLs.
- **Rollback Environment**: **`https://acecore.ace-tracker.workers.dev`** remains operational (HTTP 200 verified).

---

## 1. Existing Vercel Project Audit (`acedmtracker`)

- **Vercel Project ID**: `prj_qVQAI1KfOdGWup2r1urbK9Z0cifG`
- **Project Name in Vercel**: `acecore`
- **Deployment Name**: `acedmtracker`
- **Owner / Team**: `kumarahaari-3080` (`team_v5ebZuOkP3gA3rcPop4WsRat`)
- **Primary Production Domain**: **`https://acedmtracker.vercel.app`**
- **Framework Preset**: `Next.js` (native `next build`)
- **Build Command**: `null` (defaults to Next.js native `next build`)
- **Output Directory**: `null` (defaults to `.next`)
- **Node.js Version**: `24.x`
- **Linked GitHub Repository**: `https://github.com/kumarahaari-coder/acedmtracker` (branch: `main`)
- **No Project Duplication**: Reused the exact existing project; no new `.vercel.app` domain or project was created.

---

## 2. Cloudflare & OpenNext Dependency Audit

- **Runtime Invariant**: AceCore contains **0 references** to `getCloudflareContext`, custom worker bindings, or Cloudflare-specific runtime APIs. All database calls use `@neondatabase/serverless` HTTP driver and all asset operations use `@aws-sdk/client-s3`.
- **OpenNext Build Boundary**: `@opennextjs/cloudflare`, `open-next.config.ts`, and `wrangler.jsonc` were preserved in `devDependencies` solely to allow immediate zero-downtime rollback to `https://acecore.ace-tracker.workers.dev`.
- **Native Next.js Build**: Executing native `next build` on Vercel compiles in **19.7 seconds**, generating 14/14 static pages and tracing serverless functions in 842ms without OpenNext.

---

## 3. Files Modified & Committed

1. **`lib/db/index.ts`**:
   - Added application safety guard: Vercel Preview environments (`VERCEL_ENV=preview`) are strictly forbidden from connecting to the production Neon endpoint (`ep-dry-forest-azifaoyz`).
2. **`tests/production/architectural-guards.test.ts`**:
   - Added automated regression test verifying that any preview environment attempting to connect to production Neon immediately throws an explicit safety error.
3. **`.gitignore`**:
   - Added `.env*` and verified `.vercel` is ignored to guarantee zero local secrets or deployment artifacts are tracked by Git.

---

## 4. Environment Variable Inventory & Mapping

In accordance with strict security standards, no plaintext secret values are printed below.

| Variable | Classification | Vercel Target | Configuration Status | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `DATABASE_URL` | Server Secret | Preview | **configured** | Staging Neon Branch Connection |
| `DATABASE_URL` | Server Secret | Production | **configured** | Production Neon Branch Connection |
| `DATABASE_URL_UNPOOLED` | Server Secret | Preview | **configured** | Staging Neon Direct Connection |
| `DATABASE_URL_UNPOOLED` | Server Secret | Production | **configured** | Production Neon Direct Connection |
| `AUTH_SECRET` | Server Secret | Preview & Production | **configured** | Auth.js v5 JWT Encryption Key |
| `AUTH_URL` | Server Variable | Production | **configured** (`https://acedmtracker.vercel.app`) | Canonical Authentication URL |
| `NEXT_PUBLIC_APP_URL` | Browser-Safe | Production | **configured** (`https://acedmtracker.vercel.app`) | Client Application Base URL |
| `AUTH_GOOGLE_ID` | OAuth Client ID | Preview & Production | **configured** | Google OAuth Client ID |
| `AUTH_GOOGLE_SECRET` | Server Secret | Preview & Production | **configured** | Google OAuth Client Secret |
| `R2_BUCKET_NAME` | Server Variable | Preview & Production | **configured** (`acecore-vault-production`) | R2 Storage Vault Bucket |
| `R2_ACCOUNT_ID` | Server Variable | Preview & Production | **configured** | Cloudflare R2 Account Identifier |
| `R2_ACCESS_KEY_ID` | Server Secret | Preview & Production | **configured** | S3-compatible Access Key ID |
| `R2_SECRET_ACCESS_KEY` | Server Secret | Preview & Production | **configured** | S3-compatible Secret Access Key |
| `ACECORE_ENV` | Server Variable | Preview | **configured** (`staging`) | Staging Environment Flag |
| `ACECORE_ENV` | Server Variable | Production | **configured** (`production`) | Production Environment Flag |

---

## 5. Preview Environment Verification (Staging Isolation)

- **Preview Deployment ID**: `dpl_A4PRWSL4zPFKuYjEv7F2GaPkCs9S`
- **Preview URL**: `https://acecore-ekok5i2jl-kumarahaari-3080s-projects.vercel.app`
- **Database Used**: Staging Neon (`ep-red-waterfall-azbw2scy`)
- **Safety Guard Active**: Verified that Preview cannot connect to production Neon.
- **Preview Route Acceptance**: 10 out of 10 routes tested returned **HTTP 200**.
- **Staging Lifecycle Mutation Test**: Successfully tested deliverable creation, stage transition to `in_review`, and deletion with 0 orphan records in staging database. Tested R2 upload, HEAD, and deletion probe with 0 orphan files.

---

## 6. Canonical Git Traceability

- All local commits (32 commits total) were pushed to GitHub `origin/main`.
- **Pushed Commit SHA**: `fe5f1f7e02582846caea5ffecbe84d31e97c11f7`
- Vercel's production deployment was triggered directly from this canonical Git commit.

---

## 7. Production Deployment & Live Verification

- **Production Target**: **`https://acedmtracker.vercel.app`**
- **Deployment ID**: `dpl_AXqnA4dS2kuw2VWQ7BsGEZdvKeFy`
- **Status**: `● Ready`
- **Google OAuth Callback**: `https://acedmtracker.vercel.app/api/auth/callback/google`

### Authenticated Route Acceptance (15 / 15 Passed)

| Route | Status | Response Latency | HTML Payload Size |
| :--- | :---: | :---: | :---: |
| Dashboard (`/`) | **HTTP 200** | 1,125 ms | 20,379 bytes |
| Performance Overview (`/performance`) | **HTTP 200** | 614 ms | 14,169 bytes |
| Performance (Designer filter) | **HTTP 200** | 136 ms | 14,169 bytes |
| Performance (CraftXSpaces filter) | **HTTP 200** | 362 ms | 14,169 bytes |
| Performance (Designer + CraftXSpaces) | **HTTP 200** | 160 ms | 14,169 bytes |
| Performance Team (`/performance/team`) | **HTTP 200** | 565 ms | 18,187 bytes |
| Performance Projects (`/performance/projects`) | **HTTP 200** | 589 ms | 16,857 bytes |
| Performance Effort (`/performance/effort`) | **HTTP 200** | 576 ms | 18,983 bytes |
| Projects Directory (`/projects`) | **HTTP 200** | 643 ms | 16,583 bytes |
| CraftXSpaces Project Overview | **HTTP 200** | 704 ms | 23,643 bytes |
| Calendar View (`/calendar`) | **HTTP 200** | 576 ms | 17,194 bytes |
| Approvals Queue (`/approvals`) | **HTTP 200** | 808 ms | 17,033 bytes |
| Team Directory (`/team`) | **HTTP 200** | 575 ms | 17,354 bytes |
| Team Member Detail (Susmitha) | **HTTP 200** | 403 ms | 14,779 bytes |
| Client Portal Root (`/portal`) | **HTTP 200** | 774 ms | 15,368 bytes |

---

## 8. Rollback Procedure

If any issue arises on Vercel production:
1. **Cloudflare Worker Rollback Target**:
   - `https://acecore.ace-tracker.workers.dev` is fully operational and continuously connected to the authoritative production Neon database and Cloudflare R2 vault.
2. **Google OAuth Preserved**:
   - Both redirect URIs remain authorized:
     - `https://acecore.ace-tracker.workers.dev/api/auth/callback/google`
     - `https://acedmtracker.vercel.app/api/auth/callback/google`
3. **No Database Migration Required**:
   - Both runtimes use the exact same PostgreSQL schema and DTO contracts. Traffic can be directed back to `https://acecore.ace-tracker.workers.dev` immediately with zero data migration or state loss.
