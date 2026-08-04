---
name: pre-prod-check
description: Pre-production safety review for vibetrip-web. Use when the user asks "can I deploy?", "is this safe to ship?", "review before prod" or similar. Walks through the specific risks this codebase tends to ship by accident: leaked TEMP guards, env var exposure, RLS bypass, broken sharing.
---

# Pre-production safety check

Run this skill before any deploy that goes beyond "trivial UI tweak". It catches the recurring foot-guns of this repo.

## Output

A short verdict at the end:

- ✅ **Safe to deploy** — no blocking issues found.
- ⚠️ **Deploy with caveats** — non-blocking issues, list them.
- 🛑 **Hold deploy** — at least one blocker; list and propose the minimal fix.

Keep prose tight. Cite file:line for every issue.

## Checklist

Run these in order. Stop and report on the first 🛑 you find — don't keep diagnosing past a hard stop.

### 1. `/api/trip/plan` guest gate is enabled

Open `src/app/api/trip/plan/route.ts`. Both blocks must be active code (not commented out):

- The `guestAlreadyUsed` 402 short-circuit (around lines 42-56).
- The `headers.append("Set-Cookie", GUEST_COOKIE_HEADER)` on `isGuest` (toward the bottom).

A `// TEMP:` comment near either block is the canary that this got disabled for testing and never re-enabled. **Without these, anyone on the internet can loop on the endpoint and burn your LLM quota.**

### 2. Public route allowlists are sane

`src/proxy.ts` has `PUBLIC_PAGES` and `PUBLIC_API` arrays. Anything in there is reachable without a session.

- Are there entries that look unintentional ("/admin", "/debug", custom paths from tests)?
- Are necessary public routes there? Today: `/` (landing), `/login`, `/shared`, `/api/trip/config`, `/api/auth/me`, `/api/trip/plan`. If `/shared` is missing, anonymous visitors of share links get redirected to login.

### 3. No secrets in client-bound code

```bash
grep -rn "process\.env\." src --include="*.ts" --include="*.tsx" | grep -v "/server/" | grep -v "/api/" | grep -v "/lib/supabase/" | grep -v "proxy.ts"
```

Any hit must be `NEXT_PUBLIC_*`. Anything else is a leak: those values get bundled into the JS shipped to browsers.

Also confirm `src/server/env.ts` starts with `import "server-only";`. Without that line, importing it from a Client Component would expose `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` in the bundle.

### 4. No `.env*` accidentally in git

```bash
git ls-files | grep -E "^\.env" 
```

Only `.env.example` should appear. Anything else (`.env`, `.env.local`, `.env.production`) is a credential leak. If found, blocker.

### 5. Supabase SQL changes are applied

If `supabase/sharing.sql` (or any new `supabase/*.sql`) changed in this branch:

- The user must run the new SQL block in the Supabase SQL editor before/at deploy. There's no migrations runner.
- `SECURITY DEFINER` functions on the `public` schema must `SET search_path = public` (search-path injection prevention).
- Any function meant for guests must be `GRANT EXECUTE ... TO anon, authenticated`. Functions touching `auth.uid()` for ownership must NOT include `anon` in the grant.
- Returns must NOT include `user_id` for guest-readable rows.

### 6. RLS is intact

The `trips` table policies must remain `auth.uid() = user_id`. If a migration in this branch alters policies, double-check it doesn't accidentally widen access. The "shared trips" feature works by routing through SECURITY DEFINER RPCs — never by relaxing RLS.

### 7. Build + typecheck + tests pass

```bash
npm run typecheck && npm run test && npm run build
```

All three green. The build catches things `tsc` doesn't (server/client boundary errors, dynamic-import quirks, missing env vars at build time).

### 8. Locale matrix not regressed

If `messages/*.json` or `src/i18n/routing.ts` changed:

- All locales in `routing.locales` have a matching `messages/<loc>.json`.
- All `messages/*.json` have the same key set as `messages/es.json` (drift causes runtime crashes only on the missing-key locale).

Quick check: `jq -S 'keys' messages/es.json` vs each other locale.

### 9. Shared link domain matches AASA

If you're shipping to a new host (or first-time deploy):

- `public/.well-known/apple-app-site-association` lists `appIDs` and a path pattern that matches the share URL shape (`/*/shared/*`).
- The host must serve the file as `application/json` without redirects (Apple's CDN doesn't follow them). Verified by `next.config.mjs` headers; don't remove that block.
- If the user changed the iOS bundle ID, update `appIDs` accordingly.

### 10. Recent diff sanity

```bash
git log --oneline origin/main..HEAD   # commits about to ship
git diff origin/main..HEAD --stat
```

Skim for:

- `console.log` left in hot paths (orchestrator, agentLoop). The structured `[scope id]` ones are fine; ad-hoc dumps aren't.
- `@ts-ignore` / `@ts-expect-error` added without a comment.
- `// TODO`, `// FIXME`, `// TEMP` introduced this branch.
- Tests skipped via `it.skip`/`describe.skip`.

## Tone

Be short. Don't restate the checklist in your reply unless something failed — just give the verdict and the failing items with file:line. The user knows what the checklist is.
