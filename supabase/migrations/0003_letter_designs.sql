-- Majnu: one-off custom designs made in a Daytona sandbox ("designed for you").
--
-- A sender asks for a custom look; a job (lib/daytona/redesign.ts) runs Claude
-- Code in a sandbox, which writes one self-contained HTML page from the
-- letter's content. The job validates the page and stores it here, and
-- /l/<slug>/design serves the newest row for a letter. See docs/plan.md,
-- "Daytona redesign".
--
-- Access model, as for letters (0001_init.sql):
-- * Row-level security is on. There are no policies and no grants for `anon`.
-- * Owners can read the designs of their own letters.
-- * Rows are written only by server code with the service-role key: the page
--   is served from our domain, so a browser must never be able to put HTML
--   here. There is no insert, update or delete policy for `authenticated`.

create table public.letter_designs (
  id uuid primary key default gen_random_uuid(),
  letter_id uuid not null references public.letters (id) on delete cascade,
  -- The validated page. The job rejects anything over 500 KB before it gets
  -- here; the check is the backstop.
  html text not null check (octet_length(html) between 1 and 512000),
  -- What the sender asked for, kept so a design can be traced back to it.
  request text not null check (char_length(request) between 1 and 2000),
  created_at timestamptz not null default now()
);

comment on table public.letter_designs is 'Custom HTML pages made for a letter in a Daytona sandbox. Written only by server code; /l/<slug>/design serves the newest.';

-- The public route reads the newest design of one letter, and the RLS policy
-- and the cascade from letters look rows up by letter_id. Because letter_id
-- leads, this index serves all three.
create index letter_designs_letter_id_created_at_idx on public.letter_designs (letter_id, created_at desc);

alter table public.letter_designs enable row level security;

create policy "Owners can read designs of their own letters"
  on public.letter_designs for select
  to authenticated
  using (
    exists (
      select 1 from public.letters l
      where l.id = letter_designs.letter_id
        and l.owner_id = (select auth.uid())
    )
  );

-- Table privileges, set explicitly so they hold whether or not the project
-- exposes new tables to the Data API automatically.
revoke all on table public.letter_designs from anon, authenticated;
grant select on table public.letter_designs to authenticated;
grant select, insert, update, delete on table public.letter_designs to service_role;
