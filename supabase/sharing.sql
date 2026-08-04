-- VibeTrip — trip sharing
--
-- Run this once in the Supabase SQL editor (Dashboard → SQL).
-- Adds a share-token column to `trips` and three RPCs:
--   • share_trip(trip_id)       — owner only; idempotent; returns the token.
--   • revoke_share(trip_id)     — owner only; clears the token.
--   • get_shared_trip(token)    — anonymous-readable; returns the trip data
--                                 minus user_id. Backs the "Viaje compartido"
--                                 screen on iOS.
--
-- The existing RLS policy on `trips` (auth.uid() = user_id) is left intact;
-- access for share recipients goes through the SECURITY DEFINER RPC, never
-- through the table directly.

-- ------------------------------------------------------------------ schema
ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS share_token UUID UNIQUE;

CREATE INDEX IF NOT EXISTS trips_share_token_idx
  ON public.trips (share_token)
  WHERE share_token IS NOT NULL;

-- ------------------------------------------------------------------ share_trip
CREATE OR REPLACE FUNCTION public.share_trip(trip_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing UUID;
BEGIN
  -- Owner check + fetch existing token in one go.
  SELECT share_token INTO existing
    FROM trips
   WHERE id = trip_id AND user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'trip not found or not owned by caller'
      USING ERRCODE = 'P0001';
  END IF;

  -- Idempotent: reuse the existing token; mint one only if absent.
  IF existing IS NULL THEN
    UPDATE trips SET share_token = gen_random_uuid()
     WHERE id = trip_id AND user_id = auth.uid()
     RETURNING share_token INTO existing;
  END IF;

  RETURN existing;
END;
$$;

REVOKE ALL ON FUNCTION public.share_trip(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.share_trip(UUID) TO authenticated;

-- ------------------------------------------------------------------ revoke_share
CREATE OR REPLACE FUNCTION public.revoke_share(trip_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE trips SET share_token = NULL
   WHERE id = trip_id AND user_id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_share(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_share(UUID) TO authenticated;

-- ------------------------------------------------------------------ get_shared_trip
-- Returns one row by token, or zero rows when revoked / unknown. The
-- result purposefully omits `user_id` so anonymous callers never learn
-- the owner's UID.
CREATE OR REPLACE FUNCTION public.get_shared_trip(token UUID)
RETURNS TABLE (
  id UUID,
  created_at TIMESTAMPTZ,
  destinations JSONB,
  members JSONB,
  result JSONB
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id, t.created_at, t.destinations, t.members, t.result
    FROM public.trips t
   WHERE t.share_token = token
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_shared_trip(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shared_trip(UUID) TO anon, authenticated;
