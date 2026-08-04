# vibetrip

AI-agent trip planner. The user describes destinations, dates and travel companions; the system delivers a day-by-day itinerary with real places, accommodation, an interactive map and a ready-to-use plan — all streamed live, in a couple of minutes.

Sister repos:
- **`vibetrip-web`** *(this repo)* — Next.js: agent orchestrator, authentication, persistence and web UI.
- **`vibetrip-ios`** — native SwiftUI client consuming the same endpoints.

---

## What it does

1. **Magic-link authentication** (Supabase Auth, no passwords). SSR session so the navbar doesn't flash on load.
2. Enter up to **5 chained destinations** with their dates and budget.
3. Add **travelers** with their preferences: interests, dietary restrictions, pace, free-form notes.
4. The system chains four specialized agents:
   - **Consensus** *(pure function)*: crosses shared interests, restrictions, pace conflicts and the group profile.
   - **Itinerary** *(agent with tools)*: 5-6 activities per day using **real** places from OpenStreetMap. Each activity carries a concrete description, a non-obvious tip, transport from the previous activity and a rain plan B.
   - **Accommodation** *(agent with tools)*: 3 real options (central hotel / apartment / hostel) with a direct Booking.com link.
   - **Budget** *(pure function)*: sums the itinerary's activity costs; no invented prices.
5. **Interactive result**: tabs for the detailed itinerary, a map colored by day, accommodation, budget and group consensus.
6. **Saved trips** at `/trips`: list, detail, delete (multi-select). Supabase RLS guarantees each user only sees their own.
7. **Trip sharing**: generates a public link (`/<locale>/shared/<token>`); anyone can open it without an account, and signed-in visitors can save a **copy** to their own list. The owner can revoke the link.
8. **Travel-assistant chat** at `/chat`: free conversation with an LLM scoped to travel and tourism. Persists conversation history in Supabase, knows your saved trips (it can answer *"what trips do I have?"*) and can focus a conversation on a specific trip from its detail page (answering about days, activities, accommodation, budget). Asked to "build me an itinerary", it redirects to the planner — which does that job properly.
9. **PDF export** (jsPDF, no server round-trip): cover, day-by-day itinerary, accommodation and budget mirroring the web layout. For taking the plan offline or on paper.
10. **Bring your own key (BYOK)**: a navbar selector lets you use your own OpenAI or Anthropic key instead of the default model. The key is validated with a test call before saving, lives only in the browser's `localStorage` and travels over HTTPS on each request — it is never persisted server-side.
11. **Guest mode**: anyone can generate 1 trip without signing up (HttpOnly cookie). The free model caps the trip at 4 days; with your own key there is no cap and the free trial isn't consumed.
12. **Actionable LLM errors**: invalid key, model retired by the provider, and quota limits distinguishing the transient per-minute one from the daily one — including how long until the model frees up, extracted from the provider's response.
13. **Internationalized into 6 languages** (`es`, `en`, `fr`, `de`, `it`, `pt`) via `next-intl` with a `[locale]` segment. Light/dark mode, map included.

---

## Stack

| Layer | Technology |
|---|---|
| Framework | **Next.js 16** (App Router, Server Components, Server Actions) |
| Language | Strict **TypeScript** |
| UI | **Tailwind CSS** + in-house components, light/dark mode |
| Auth + DB | **Supabase** (Postgres + RLS + Auth + magic links) |
| Supabase client | `@supabase/ssr` (cookies in RSC) + `@supabase/supabase-js` (Bearer on mobile) |
| Agents | ReAct loop with tool calling — OpenAI-compatible and Anthropic SDK support |
| Places data | **OpenStreetMap** / Nominatim *(no API key, no cost)* |
| Map | **Leaflet** + `react-leaflet`, CARTO light/dark tiles following the theme |
| Validation | **Zod** *(schemas shared across client/server/mobile)* |
| Streaming | **Server-Sent Events (SSE)** |
| i18n | **next-intl** v4 with localized routing |
| PDF | **jsPDF** |
| Tests | **Vitest** *(unit + optional "live" tests against the real LLM)* |

React 19, RSC and Server Actions: the creation form, the saved-trips page and the trip detail are Server Components that query Supabase with the user's cookie-bound session. The interactive UI (streamed planning, map, tabs) lives in separate Client Components.

---

## Architecture

```
Web / iOS client
  │  POST /api/trip/plan  (SSE stream)
  ▼
API Route (Next.js) → orchestrator (async generator)
  │
  ├─ Consensus (pure, instant)
  │
  └─ For each destination, sequentially:
       ├─ Itinerary agent
       ├─ Accommodation agent
       └─ Budget (pure, sums the itinerary)

On "done": INSERT into `trips` (only with a session).
```

**Consensus and budget are pure functions**: no LLM, deterministic logic. Cuts ~10-30 s of latency per trip and removes the variance/cost of two unnecessary calls.

**Itinerary and accommodation run sequentially**, across destinations too. Running them in parallel saved ~30-40% wall time, but free tiers with per-minute limits (Mistral at 1 req/s, Groq with capped bursts) returned guaranteed 429s with both agents firing searches at once. Sequential keeps the run inside the limits at the cost of total time.

**SSE connection**: the client receives typed events (`agent: running/done`, `tool_call`, `data`, `done`) and paints the progress cards live. The server sends heartbeats every 10 s so no client with a strict timeout (iOS `URLSession` with `timeoutIntervalForRequest`) drops the connection during an LLM backoff.

---

## How the AI is integrated

The planner is not one monolithic prompt. It is an **orchestration of specialized agents**, each with a concrete goal, scoped tools and an output validated with Zod before it reaches the client.

### 1. Pure function vs. agent

First principle: **don't use an LLM where deterministic code does the job**.

- **Consensus** and **budget** are pure TypeScript functions. Intersecting group interests is a set problem, not an AI problem. The budget is a sum. Each runs in milliseconds.
- **Itinerary** and **accommodation** do need an LLM: they require creativity (which activity fits the morning in neighborhood X, which central hotel suits this group) **anchored to real data** (which places actually exist).

Result: the plan's cost and latency concentrate only where the LLM adds value.

### 2. ReAct loop with tool calling

`src/server/llm/agentLoop.ts` implements an OpenAI-compatible ReAct loop (with Anthropic SDK support too):

```
iter 1: tool_choice="required" → forces the first search_places call
iter 2: the model decides what to search next, or produces the final JSON
iter 3-N: relaxes to tool_choice="auto", until final JSON or the iteration cap
```

**Loop guarantees:**

- **`tool_choice="required"` on the first turn**: many models with prior knowledge of the destination (Gemini 2.0 Flash, GPT-4o) skip tools and generate from memory. Forcing the first call removes that shortcut and anchors the output in real places.
- **Tool-call cap** (`maxToolCalls`): prevents unbounded searching and closes the per-agent cost.
- **Deduplication**: repeated queries return `{ error: "duplicate_call" }` without spending tool budget or tokens re-consuming the same result.
- **Post-parse validator with ONE correction**: if names don't appear in the OSM results or descriptions break the schema, one corrective iteration — then accept what's there. Avoids infinite loops over cosmetic details.
- **`null` tolerance**: optional fields accept `null` besides the empty string (Gemini emits it often).
- **`exhaustedMessagePushed`**: the "no searches left" notice is injected exactly once, to avoid breaking the user/assistant alternation some chat templates require.
- **`tool_use_failed` recovery**: when a provider rejects a malformed tool call, the same iteration retries with `tool_choice="auto"` or forces the model to emit the final JSON with the data it already has, without aborting the agent.

### 3. The tool: `search_places` (OpenStreetMap)

`src/server/tools/searchPlaces.ts` queries Nominatim. It is the **only** external tool: the agent can look at OpenStreetMap and nothing else — no free browsing.

Three layers of geographic filtering keep results where they belong:

1. **City → country + bounding box pre-resolution**: one Nominatim request with just the city name returns `country_code` and centroid. Cached per process.
2. **`countrycodes` + `viewbox` + `bounded=1`** on every search: Nominatim filters server-side.
3. **Post-fetch Haversine filter**: anything farther than 30 km from the centroid is dropped. Covers the real case of "Marrakech" returning places in Essaouira (same country, outside the city).

### 4. Deterministic coordinate enrichment

The agent returns activities with real names (`"Mosteiro dos Jerónimos"`, not `"a beautiful monastery"`). The server matches those names against the `knownPlaces` cache populated during the agent's own tool calls and attaches `lat`/`lon`. The map only shows points with a real match; paraphrases the model added without searching stay in the activity list but off the map.

This prevents the model from inventing coordinates — something even GPT-4o and Claude Sonnet do routinely, planting phantom hotels in the middle of the sea.

### 5. SSE streaming of orchestrator events

The orchestrator is an `async function*`. Each pipeline state emits a typed event:

```ts
{ type: "agent",       agent: "itinerary",     status: "running"  }
{ type: "tool_call",   agent: "itinerary",     tool: "search_places", input: {...} }
{ type: "tool_result", agent: "itinerary",     tool: "search_places", ok: true }
{ type: "data",        agent: "itinerary",     payload: {...} }
{ type: "agent",       agent: "itinerary",     status: "done"     }
{ type: "data",        agent: "budget",        payload: {...} }
{ type: "done",        result: {...} }
```

The client (web + iOS) paints them live: shimmer cards while an agent thinks, green ticks when it finishes, the query it is searching right now inside its tool. The first card appears in milliseconds, not at the end.

### 6. LLM providers

```
LLM_PROVIDER=openai-compatible  → any compatible API (Groq, OpenRouter, Cerebras, LM Studio, Ollama…)
LLM_PROVIDER=anthropic          → Claude via its own SDK
```

**Loop requirement**: the model must support tool calling in the API. Known to work: Llama 3.3 70B, Qwen 2.5 72B, Gemini 2.0 Flash, GPT-4o, Claude Sonnet/Opus. Small models (<7B) tend to fail at producing the final structured JSON.

**Tested on free production tiers:**
- **Groq** — `llama-3.3-70b-versatile`, 100k tokens/day, no card. Excellent speed.
- **Cerebras** — `llama-3.3-70b`, 1M tokens/day, no card.
- **OpenRouter** — `google/gemini-2.0-flash-001`, depends on balance.

### 7. BYOK — the user brings their own model

The navbar selector stores `{provider, model, apiKey}` in `localStorage` and attaches it as an optional `llm` field in the body of `/api/trip/plan` and `/api/chat`. The server builds a per-request `LlmConfig`; without the field (e.g. the iOS client, or a user with no key) it falls back to the server's default model.

- The key is **validated before saving** (`POST /api/llm/validate`, a 1-token test call) to distinguish invalid key / nonexistent model / provider down.
- A guest with their own key **skips the 1-trip limit** and the day cap: they pay for their own LLM and don't consume the server's quota.
- The key is never logged or persisted server-side; it travels in the body over HTTPS and in the SDK's headers.

### 8. Provider errors, classified

`llmErrorCode()` maps SDK failures to stable codes the UI turns into actionable per-language messages: `byok_invalid_key` (401/403), `model_unavailable` (404 — the provider retired the model), `model_rate_limited` (per-minute limit, transient) and `model_quota` (daily limit). The last two also carry how many seconds remain until the limit clears — read from the `retry-after` header or parsed out of the error body ("try again in 1h5m43s") — and the banner renders it as "the free model frees up in ~1 h 20 min" instead of a blind "try again".

---

## Authentication

No passwords: Supabase Auth **magic links**.

1. The user types their email at `/login`; a Server Action calls `signInWithOtp` with `emailRedirectTo` pointing at `/auth/callback?next=<destination>`.
2. The email link returns to `/auth/callback`, which exchanges the code for a session (`exchangeCodeForSession`) and redirects to the original `next` — so the "wanted to share → login → back to sharing" flow never loses its thread.
3. The session lives in **HttpOnly cookies** the middleware (`src/proxy.ts`) refreshes on every request. Protected pages redirect to `/login?next=…` without a session; `/`, `/login` and `/shared/*` are public.
4. The **iOS client uses the same endpoints** with `Authorization: Bearer <jwt>` instead of a cookie. `createSupabaseAuthedClient` accepts both transports, and RLS policies see the same `auth.uid()` either way.

**Guest mode**: `/api/trip/plan` allows generating 1 trip without an account, gated by an HttpOnly cookie (`vt_guest_used`). It is the server LLM's only defense against anonymous abuse — with a BYOK key the limit doesn't apply.

---

## Trip sharing

When a trip's owner hits "Share" on `/trips/<id>`:

1. **Server action** `shareTripAction(id)` invokes the Postgres RPC `share_trip(uuid)` (`SECURITY DEFINER`, idempotent). If the trip already had a token it is reused; otherwise a new UUID is minted and persisted in `trips.share_token`.
2. The client composes `https://<host>/<locale>/shared/<token>` and fires `navigator.share` (mobile) or falls back to the clipboard.
3. Any visitor of that URL — signed in or not — lands on `/[locale]/shared/[token]`, which reads the trip via the `get_shared_trip(uuid)` RPC and renders with the same `ResultsPage` the owner uses. Table RLS is **never relaxed**: reads go through the `SECURITY DEFINER` function, never through `SELECT * FROM trips`.
4. A **signed-in** visitor gets a "Save to my trips" CTA that inserts a **copy** of the trip as their own row (with their `user_id`). Otherwise the CTA redirects to `/login?next=/shared/<token>` and returns after authenticating.
5. The owner can **stop sharing** from the detail page: `revoke_share(uuid)` clears the `share_token` and the link goes dead.

The full SQL lives in `supabase/sharing.sql` (run once in the Supabase SQL editor).

---

## Travel-assistant chat

A second AI surface, separate from the orchestrator: a **conversational assistant** scoped to travel, tourism and planning. Lives at `/chat` (web) and is consumed by the iOS client through the same endpoints.

### Behavior

- **Scoped by system prompt**: politely refuses anything outside travel (math, code, personal advice, etc.). Edge cases explicitly in scope: visas, currency, weather, cultural etiquette, jet lag, insurance, sustainable travel.
- **Knows your trips**: each turn injects a compact summary of your last 10 trips (destinations, dates, travelers) into the system prompt. You can ask *"what trips do I have?"* or *"how many days until Rome?"*.
- **Trip-focused mode**: from `/trips/<id>` a button opens `/chat?trip=<id>`. The conversation is bound to that trip in the DB and each turn injects its full plan (consensus, day-by-day itinerary, accommodation, budget). Useful for *"what did I have on day 2 in Lisbon?"* or *"what do I do if it rains at the viewpoint?"*.
- **Does not generate new itineraries**. That's the planner's job. When the user asks *"build me a 7-day plan for Mexico"*, the handler **cuts before the LLM** with a multi-language regex and returns a fixed message redirecting to the home form. Zero cost, zero hallucinations, 100% guarantee — the chat model (tool-less passthrough) would invent places and do a worse job than the orchestrator.

### Persistence

`chat_sessions` and `chat_messages` tables with per-owner RLS (SQL in `supabase/chat.sql`). The server is the source of truth for history: the client sends only `{ sessionId?, tripId?, content }` per turn; the server rebuilds context from the DB. The LLM prompt is capped at the last 30 turns — older ones remain readable in the UI but stay out of the model.

### Streaming

The client receives SSE with `session` (conversation id, first of all), `delta` (model tokens), `done` or `error` events. Same plumbing as `/api/trip/plan` (2 KB initial padding and 10 s heartbeat to defend the stream against iOS Safari's buffer and intermediate proxy timeouts).

### REST API for iOS

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/chat` | Create or continue a conversation. Body `{ sessionId?, tripId?, content }`. SSE response. |
| `GET` | `/api/chat/sessions` | The user's list, `updatedAt` desc. |
| `GET` | `/api/chat/sessions/{id}` | Session + messages. RLS makes non-owners see 404. |
| `DELETE` | `/api/chat/sessions/{id}` | Deletes; the cascade drags the messages. |

All require `Authorization: Bearer <jwt>` (the web cookie also works through the same handler).

---

## Map

"Map 📍" tab on the results page, hidden when there are no coordinates:

- CARTO tiles over OpenStreetMap data (free, no API key), with a light/dark pair following the site theme — including CSS overrides for Leaflet's own chrome (tooltips, zoom, attribution), which ships hardcoded white
- `CircleMarker` colored per day (8-color rotating palette)
- Hover tooltip: `D{n} · HH:MM · name`
- Auto-fit to the loaded points
- Dynamic legend with color dots
- **Golden-angle spiral jitter** when two activities share exact coordinates, so the Day 2 marker doesn't cover Day 1's

`react-leaflet` is loaded with `next/dynamic({ ssr: false })` because Leaflet needs `window` at import time.

---

## Persistence and RLS

`trips` table in Supabase (minimal schema):

```sql
create table trips (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade default auth.uid(),
  destinations jsonb not null,
  members      jsonb not null,
  result       jsonb not null,
  share_token  uuid unique,                        -- added by sharing.sql
  created_at   timestamptz not null default now()
);

alter table trips enable row level security;

create policy "users select own trips" on trips for select using (auth.uid() = user_id);
create policy "users insert own trips" on trips for insert with check (auth.uid() = user_id);
create policy "users delete own trips" on trips for delete using (auth.uid() = user_id);

create index trips_user_created_idx on trips (user_id, created_at desc);
create index trips_share_token_idx  on trips (share_token) where share_token is not null;
```

`user_id default auth.uid()` lets the client (web or iOS) insert without knowing its own UUID.

For sharing, three `SECURITY DEFINER` functions live in `supabase/sharing.sql`:
- `share_trip(uuid) returns uuid` — owner only, idempotent, mints/returns the token.
- `revoke_share(uuid) returns void` — owner only, clears the token.
- `get_shared_trip(uuid) returns table (...)` — open to `anon` and `authenticated`, returns the public fields without `user_id`.

---

## Setup

```bash
git clone https://github.com/aitorsola/vibetrip.git
cd vibetrip
npm install
cp .env.example .env.local   # edit it
npm run dev
# http://localhost:3000
```

### `.env.local`

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# LLM provider (pick one)
LLM_PROVIDER=openai-compatible
OPENAI_API_KEY=gsk_...
OPENAI_BASE_URL=https://api.groq.com/openai/v1
OPENAI_MODEL=llama-3.3-70b-versatile

# Booking affiliate (optional)
BOOKING_AFFILIATE_ID=YOUR_ID
NEXT_PUBLIC_BOOKING_AFFILIATE_ID=YOUR_ID

# Per-agent token caps. The loop resends the whole conversation each turn, so
# prompt + max_tokens must fit inside the provider's per-minute limit
# (Groq free tier: 12k TPM for llama-3.3-70b).
ITINERARY_MAX_TOKENS=5000
ACCOMMODATION_MAX_TOKENS=2000
```

### Supabase setup

1. Create a project at supabase.com.
2. **Authentication → URL Configuration**:
   - Site URL: `http://localhost:3000` (in production, the real host).
   - Redirect URLs: `http://localhost:3000/auth/callback`, `https://<your-host>/auth/callback`.
   - For the iOS app, also add `vibetrip://login-callback` and `vibetrip-dev://login-callback`.
3. **Authentication → Providers**: enable **Email** (magic links).
4. **SQL Editor**:
   - Run the `create table trips ...` block above.
   - Run `supabase/sharing.sql` to add the sharing system.
   - Run `supabase/chat.sql` to create the chat tables (`chat_sessions`, `chat_messages`) with RLS and the optional `trip_id` column that binds conversations to a trip.

---

## Structure

```
src/
├── app/
│   ├── [locale]/
│   │   ├── layout.tsx                       # SSR of user for the Navbar (no flash)
│   │   ├── page.tsx                         # server: reads user → mode → HomeClient
│   │   ├── HomeClient.tsx                   # FSM create / generating / results
│   │   ├── login/                           # magic link + LoginForm
│   │   ├── trips/                           # /trips list + /trips/[id] detail
│   │   │   ├── actions.ts                   # delete + share + revoke (server actions)
│   │   │   └── [id]/
│   │   │       └── TripDetail.tsx           # detail + ShareControls
│   │   ├── shared/[token]/                  # public shared-trip route
│   │   │   ├── page.tsx                     # server: get_shared_trip RPC
│   │   │   ├── SharedTripClient.tsx         # "Save to my trips" CTA
│   │   │   └── actions.ts                   # saveSharedTripAction
│   │   └── chat/                            # /chat list + /chat/[id] detail
│   │       ├── layout.tsx                   # sidebar with sessions + RSC
│   │       ├── page.tsx                     # welcome + reads ?trip=
│   │       ├── [id]/page.tsx                # loads session + messages
│   │       ├── ChatSidebar.tsx              # client: list + delete + ✈️ badge
│   │       ├── ChatThread.tsx               # client: render + SSE consumer
│   │       └── actions.ts                   # deleteSessionAction
│   ├── auth/{callback,logout}/              # OAuth-style code exchange + signOut
│   └── api/
│       ├── trip/{plan,config}/route.ts      # SSE stream + provider info
│       ├── llm/validate/route.ts            # BYOK key validation (1-token call)
│       ├── auth/me/route.ts                 # currentUser for the Navbar
│       └── chat/
│           ├── route.ts                     # POST chat with SSE + anti-itinerary regex
│           └── sessions/
│               ├── route.ts                 # GET session list (iOS)
│               └── [id]/route.ts            # GET detail / DELETE
├── proxy.ts                                  # middleware: session refresh + /login redirect
├── i18n/
│   ├── routing.ts                           # next-intl: locales, defaultLocale, navigation
│   └── request.ts
├── lib/
│   ├── supabase/{client,server,middleware}.ts
│   └── sse{,Client}.ts
├── server/
│   ├── env.ts
│   ├── orchestrator.ts                      # async generator: yields SSE events
│   ├── chat.ts                              # streaming LLM passthrough (no tools)
│   ├── chatContext.ts                       # builds trips summary + focused trip
│   ├── llm/
│   │   ├── agentLoop.ts                     # ReAct with tool calling
│   │   ├── config.ts                        # per-request LlmConfig (BYOK) + defaults
│   │   ├── validate.ts                      # key validation behind /api/llm/validate
│   │   └── index.ts                         # provider routing + error classification
│   ├── agents/
│   │   ├── consensus.ts                     # pure function
│   │   ├── itinerary.ts                     # agent + coordinate enrichment
│   │   ├── accommodation.ts                 # agent
│   │   ├── budget.ts                        # pure function
│   │   ├── shared.ts                        # shared prompts/utilities
│   │   └── validators.ts                    # post-parse semantic checks
│   ├── tools/
│   │   ├── searchPlaces.ts                  # Nominatim + 3 filter layers
│   │   └── types.ts
│   └── claude/jsonParser.ts                 # truncated-JSON repairer
├── domain/                                   # shared Zod schemas
│   └── (trip, consensus, itinerary, accommodation, budget, plan, booking, countries, chat, llm)
├── features/
│   ├── create-trip/                         # multi-destination + multi-traveler form
│   ├── generating/                          # progress cards + live tool activity
│   ├── results/                             # tabs: itinerary / map / accommodation / budget / group
│   │   └── MapView.client.tsx               # Leaflet, dynamic import without SSR
│   └── export-pdf/exportPlan.ts
├── hooks/useTripPlanner.ts                   # useReducer; SSE consumer
└── ui/                                       # Button, Card, ConfirmDialog, Navbar…

messages/                                     # next-intl: 6 languages
└── {es,en,fr,de,it,pt}.json

supabase/
├── sharing.sql                               # ALTER + 3 RPCs for trip sharing
└── chat.sql                                  # chat_sessions + chat_messages + RLS

tests/
├── jsonParser.test.ts
├── bookingUrl.test.ts
├── llmErrorCode.test.ts                     # error classification + retry-after
├── resilientSchemas.test.ts                 # LLM quirks the schemas tolerate
├── itinerary-validators.test.ts
├── accommodation-validators.test.ts
├── itinerary-agent.live.test.ts             # RUN_LIVE=1 vitest …
└── accommodation-agent.live.test.ts
```

---

## Tests

```bash
npm run typecheck   # tsc --noEmit
npm run test        # vitest (live tests skipped by default)
npm run lint        # eslint
npm run build       # next build (smoke check)
```

**Live tests** call the real LLM and OSM. Enable with `RUN_LIVE=1 npm run test`. On Groq they take <1 min each.

---

## Known limitations

- **No rate limiting**: neither per IP nor per user. Production would need Upstash Redis or similar.
- **Booking is a deeplink** targeting the hotel name + dates; the (paid) reservations API is not integrated.
- **The budget excludes flights, meals and local transport**: there is no reliable free price source. Only the sum of the itinerary's activities is shown.
- **Accommodation uses OpenStreetMap**: many B&Bs and small guesthouses are on OSM but not on Booking, so the deeplink may not resolve to the exact property. The UI says so.
- **The agent loop requires tool-calling models**: small models without function calling won't work.
- **No guest → user merge**: if a guest generates a trip and then signs up, that first trip is not retroactively attached to their account. Guest mode on `/api/trip/plan` is limited to 1 trip per browser (cookie `vt_guest_used`).
- **The chat does not generate itineraries**: asked for one, it redirects to the planner. Deliberate — the chat is a tool-less passthrough and would do a worse job than the orchestrator. The rule doesn't apply when the conversation is focused on an existing trip.

---

## Roadmap

What would make the most sense to build next, in order:

1. **PWA / offline mode** — the user opens the plan with no data, in another country. Where they perceive the most value.
2. **Trip variants** — one click → "relaxed / intense / foodie version" with a different prompt.
3. **Google / Apple Calendar sync** — export each activity to your calendar.
4. **Group collaboration** — several users edit the same trip, vote on activities.
5. **Universal Links + AASA** — so `https://vibetrip.app/shared/<token>` opens the iOS app automatically when installed (today it opens the web).

---

## License

MIT — see [LICENSE](LICENSE).
