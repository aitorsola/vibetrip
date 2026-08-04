-- VibeTrip — chat persistence
--
-- Run this once in the Supabase SQL editor. Adds two tables:
--   • chat_sessions — top-level conversations (one per chat thread).
--   • chat_messages — turns within a session, ordered by created_at.
--
-- RLS limits everything to the row owner (`auth.uid() = user_id`).
-- The chat endpoint uses the cookie-bound or bearer-token Supabase client,
-- so policies enforce isolation without any extra checks in app code.

-- ------------------------------------------------------------------ schema
create table if not exists public.chat_sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade default auth.uid(),
  title       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.chat_sessions(id) on delete cascade,
  role        text not null check (role in ('user', 'assistant')),
  content     text not null,
  created_at  timestamptz not null default now()
);

create index if not exists chat_messages_session_created_idx
  on public.chat_messages (session_id, created_at);
create index if not exists chat_sessions_user_updated_idx
  on public.chat_sessions (user_id, updated_at desc);

-- ------------------------------------------------------------------ RLS
alter table public.chat_sessions enable row level security;
alter table public.chat_messages enable row level security;

-- Sessions: a single all-commands policy keyed on ownership.
drop policy if exists "users own sessions" on public.chat_sessions;
create policy "users own sessions" on public.chat_sessions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Messages: ownership delegated to the parent session. Selecting/inserting/
-- deleting a message requires owning the session it belongs to.
drop policy if exists "users own messages" on public.chat_messages;
create policy "users own messages" on public.chat_messages
  for all
  using (
    exists (
      select 1 from public.chat_sessions s
      where s.id = chat_messages.session_id and s.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.chat_sessions s
      where s.id = chat_messages.session_id and s.user_id = auth.uid()
    )
  );

-- ------------------------------------------------------------------ trip focus
-- Sessions can be bound to a specific trip. When set, the chat handler
-- injects that trip's full plan into the system prompt so the assistant
-- can answer detailed questions about it. Deleting the trip clears the
-- focus but keeps the conversation.
alter table public.chat_sessions
  add column if not exists trip_id uuid
    references public.trips(id) on delete set null;

create index if not exists chat_sessions_trip_idx
  on public.chat_sessions (trip_id)
  where trip_id is not null;
