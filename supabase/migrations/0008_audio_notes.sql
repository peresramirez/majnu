-- Majnu: a voice note in a gift (issue #38, docs/plan.md "Voice",
-- docs/features/audio-note.md).
--
-- The sender records up to two minutes; POST /api/letters/<id>/audio stores
-- the file in the private `audio-notes` bucket and one row here. The recipient
-- taps "Tap to hear" on /l/<slug>, and GET /l/<slug>/audio streams the file
-- from our own domain. A letter has at most one note; a new recording replaces
-- the old one.
--
-- Access model, as for the other tables (0001_init.sql):
-- * The bucket is private and has no policies on storage.objects, so neither
--   `anon` nor `authenticated` can list, read or write a file. Only server code
--   with the service-role key (lib/audio/store.ts) touches it.
-- * Row-level security is on for every table here. Owners can read their own
--   notes (My gifts, the owner preview) and their own upload counts. There are
--   no policies and no grants for `anon`. Every write is server code with the
--   service-role key, after it has checked that the session owns the letter.
--
-- Deleting files. Supabase's Storage API must delete a file: deleting the row
-- in storage.objects with SQL leaves the file orphaned in the bucket. So when a
-- note row goes (deleted on its own, or with its letter or its owner's
-- account, through the cascades) or its file is replaced, a trigger records
-- the old file's path in audio_note_deletions. Server code then deletes those
-- files through the Storage API and clears the queue (purgeDeletedAudio() in
-- lib/audio/store.ts, run on every upload and removal). A deleted note is
-- unreachable at once, because /l/<slug>/audio reads the row; the file itself
-- goes on the next purge.

-- ---------------------------------------------------------------------------
-- The bucket
-- ---------------------------------------------------------------------------

-- Private, 5 MB per file (lib/audio/rules.ts, MAX_AUDIO_NOTE_BYTES), and only
-- the four formats browsers record or play everywhere. The route checks both
-- before uploading; the bucket's limits are the backstop.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('audio-notes', 'audio-notes', false, 5242880, array['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- letter_audio_notes: the one note of a letter
-- ---------------------------------------------------------------------------

create table public.letter_audio_notes (
  id uuid primary key default gen_random_uuid(),
  -- One note per letter (the unique constraint below), gone with the letter.
  letter_id uuid not null references public.letters (id) on delete cascade,
  -- The letter's owner, set by server code from the letter row it checked. The
  -- read policy uses it, so My gifts can list a user's notes through an index.
  owner_id uuid not null references auth.users (id) on delete cascade,
  -- `<letter id>/<random uuid>.<ext>` in the audio-notes bucket. Every upload
  -- gets a new random name, so a replaced file never shadows the new one in a
  -- browser cache, and the name doubles as the ETag.
  storage_path text not null check (
    storage_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webm|m4a|ogg|mp3)$'
  ),
  mime_type text not null check (mime_type in ('audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg')),
  size_bytes integer not null check (size_bytes between 1 and 5242880),
  -- Seconds, as the sender's browser measured them: at most two minutes, plus
  -- a little for the browser's clock. Browsers often cannot tell the length of
  -- a recorded webm file, so the player uses this.
  duration_seconds numeric(6, 2) not null check (duration_seconds > 0 and duration_seconds <= 125),
  -- What was said, from the transcription, for screen readers. Optional: a
  -- note is saved without it when transcription fails or is unavailable.
  caption text check (caption is null or char_length(caption) between 1 and 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Also serves the lookups by letter (the public route, the owner routes) and
  -- the cascade from letters.
  constraint letter_audio_notes_one_per_letter unique (letter_id),
  constraint letter_audio_notes_storage_path_key unique (storage_path)
);

comment on table public.letter_audio_notes is 'The voice note of a letter, one at most. The file is in the private audio-notes bucket. Written only by server code.';

-- The read policy and My gifts look notes up by owner.
create index letter_audio_notes_owner_id_idx on public.letter_audio_notes (owner_id);

alter table public.letter_audio_notes enable row level security;

create policy "Owners can read their own audio notes"
  on public.letter_audio_notes for select
  to authenticated
  using ((select auth.uid()) = owner_id);

-- Table privileges, set explicitly so they hold whether or not the project
-- exposes new tables to the Data API automatically.
revoke all on table public.letter_audio_notes from anon, authenticated;
grant select on table public.letter_audio_notes to authenticated;
grant select, insert, update, delete on table public.letter_audio_notes to service_role;

create trigger letter_audio_notes_set_updated_at
  before update on public.letter_audio_notes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- audio_note_deletions: files to delete through the Storage API
-- ---------------------------------------------------------------------------

create table public.audio_note_deletions (
  storage_path text primary key,
  queued_at timestamptz not null default now()
);

comment on table public.audio_note_deletions is 'Paths of audio-note files whose row was deleted or replaced. Server code deletes the files through the Storage API, then the row.';

alter table public.audio_note_deletions enable row level security;

-- Server only: no policies, no grants for the API roles.
revoke all on table public.audio_note_deletions from anon, authenticated;
grant select, insert, update, delete on table public.audio_note_deletions to service_role;

-- Records the old file of a note that was deleted or got a new file.
--
-- SECURITY DEFINER so the queue row is written whichever role deleted the note:
-- the service role, the table owner running a cascade from letters, or Supabase
-- Auth deleting an account. It only ever inserts the old path into the queue.
-- Execute is revoked from the API roles; the trigger still fires.
create function public.queue_audio_note_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' or new.storage_path is distinct from old.storage_path then
    insert into public.audio_note_deletions (storage_path)
    values (old.storage_path)
    on conflict (storage_path) do nothing;
  end if;
  return null;
end;
$$;

revoke execute on function public.queue_audio_note_deletion() from public, anon, authenticated;

create trigger letter_audio_notes_queue_deletion
  after delete or update of storage_path on public.letter_audio_notes
  for each row execute function public.queue_audio_note_deletion();

-- ---------------------------------------------------------------------------
-- audio_note_uploads: the per-user daily cap
-- ---------------------------------------------------------------------------

-- One row per accepted upload, for the daily cap. A replaced note keeps one
-- row in letter_audio_notes, so uploads are counted here instead. No audio,
-- no text. Rows older than seven days are deleted on the next claim.
create table public.audio_note_uploads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.audio_note_uploads is 'One row per voice-note upload, for the daily limit. Written only by server code.';

-- The per-user count (and the RLS policy) look rows up by user and day.
create index audio_note_uploads_user_id_created_at_idx on public.audio_note_uploads (user_id, created_at desc);
-- The clean-up looks rows up by time alone.
create index audio_note_uploads_created_at_idx on public.audio_note_uploads (created_at);

alter table public.audio_note_uploads enable row level security;

create policy "Users can read their own audio note uploads"
  on public.audio_note_uploads for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- A browser that could delete its rows could reset its own limit, so
-- `authenticated` can only read.
revoke all on table public.audio_note_uploads from anon, authenticated;
grant select on table public.audio_note_uploads to authenticated;
grant select, insert, update, delete on table public.audio_note_uploads to service_role;

-- Returns one row: the new row's id when the upload may go ahead, or the
-- refusal 'user_count' when the user has uploaded p_max_per_user notes today
-- (UTC). The limit is a parameter so it lives in one place (lib/audio/rules.ts);
-- only service_role can call this, so it is never a value a browser sent.
--
-- A transaction-level advisory lock per user makes concurrent claims by one
-- user run one after the other, so a burst of parallel uploads cannot all pass
-- the count. A failed upload deletes its row again (lib/audio/store.ts).
create function public.claim_audio_note_upload(p_user_id uuid, p_max_per_user integer)
returns table (claim_id uuid, refusal text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_day_start timestamptz := date_trunc('day', now(), 'UTC');
  v_count integer;
  v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('audio_note_uploads:' || p_user_id::text, 0));

  delete from public.audio_note_uploads t
  where t.created_at < v_day_start - interval '7 days';

  select count(*)
    into v_count
  from public.audio_note_uploads t
  where t.user_id = p_user_id
    and t.created_at >= v_day_start;

  if v_count >= p_max_per_user then
    return query select null::uuid, 'user_count'::text;
    return;
  end if;

  insert into public.audio_note_uploads (user_id)
  values (p_user_id)
  returning id into v_id;

  return query select v_id, null::text;
end;
$$;

comment on function public.claim_audio_note_upload(uuid, integer) is
  'Checks the daily voice-note upload limit (UTC) and inserts a row when the upload may go ahead. Server only (service_role).';

-- New functions in public are executable by everyone by default.
revoke execute on function public.claim_audio_note_upload(uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_audio_note_upload(uuid, integer) to service_role;
