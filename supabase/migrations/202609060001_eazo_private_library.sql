-- New-project baseline. Apply only after project/region/plan authorization.
begin;
create table public.books (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  local_book_id text not null check (length(local_book_id) between 1 and 200),
  title text not null check (length(title) between 1 and 1000),
  format text not null check (format in ('txt','pdf')),
  metadata jsonb not null default '{}' check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  unique (owner_id, local_book_id), unique (id, owner_id)
);
create table public.book_sources (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null,
  owner_id uuid not null,
  file_hash text not null check (length(file_hash) between 1 and 200),
  extraction_version text not null check (length(extraction_version) between 1 and 160),
  source_object text not null,
  original_object text,
  manifest jsonb not null default '{}' check (jsonb_typeof(manifest) = 'object'),
  created_at timestamptz not null default now(),
  foreign key (book_id, owner_id) references public.books(id, owner_id),
  unique (book_id, file_hash, extraction_version), unique (id, book_id, owner_id),
  check (source_object = owner_id::text || '/' || book_id::text || '/' || id::text || '/source.txt'),
  check (original_object is null or original_object = owner_id::text || '/' || book_id::text || '/' || id::text || '/original.pdf')
);
-- Immutable revisions preserve concurrent device saves; no silent last-write-wins.
create table public.reading_snapshots (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null, source_id uuid not null, owner_id uuid not null,
  checkpoint_id text not null check (length(checkpoint_id) between 1 and 200),
  device_id uuid not null, payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now(),
  foreign key (source_id, book_id, owner_id) references public.book_sources(id, book_id, owner_id)
);
create index reading_snapshots_lookup on public.reading_snapshots(owner_id, book_id, checkpoint_id, created_at desc);
create table public.reading_events (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null, source_id uuid not null, owner_id uuid not null,
  device_id uuid not null, local_event_id text not null,
  kind text not null check (kind in ('selection','footprint')),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now(),
  foreign key (source_id, book_id, owner_id) references public.book_sources(id, book_id, owner_id),
  unique (owner_id, device_id, kind, local_event_id)
);
create index reading_events_lookup on public.reading_events(owner_id, book_id, created_at);
-- Only trusted application/worker credentials write jobs and verified graph versions.
create table public.analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null, source_id uuid not null, owner_id uuid not null,
  idempotency_key text not null check (length(idempotency_key) between 1 and 200),
  pipeline_version text not null, model text not null,
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed','cancelled')),
  attempt integer not null default 0 check (attempt >= 0),
  lease_token uuid, lease_expires_at timestamptz,
  execution_name text, progress jsonb not null default '{}', error_code text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key (source_id, book_id, owner_id) references public.book_sources(id, book_id, owner_id),
  unique (owner_id, idempotency_key), unique (id, source_id, book_id, owner_id)
);
create index analysis_jobs_poll on public.analysis_jobs(owner_id, book_id, created_at desc);
create index analysis_jobs_dispatch on public.analysis_jobs(status, lease_expires_at);
create table public.graph_versions (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null, source_id uuid not null, owner_id uuid not null, job_id uuid not null,
  graph_version text not null, output_token uuid not null, manifest_object text not null, manifest_sha256 text not null check (manifest_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  foreign key (job_id, source_id, book_id, owner_id) references public.analysis_jobs(id, source_id, book_id, owner_id),
  unique (job_id), unique (book_id, graph_version),
  check (manifest_object = owner_id::text || '/' || book_id::text || '/' || job_id::text || '/' || output_token::text || '/manifest.json')
);
-- Explicit grants avoid depending on hosted-project default privileges.
do $$
declare t text;
begin
  foreach t in array array['books','book_sources','reading_snapshots','reading_events','analysis_jobs','graph_versions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('create policy owner_read on public.%I for select to authenticated using ((select auth.uid()) = owner_id)', t);
  end loop;
  foreach t in array array['books','book_sources','reading_snapshots','reading_events'] loop
    execute format('grant insert on public.%I to authenticated', t);
    execute format('create policy owner_insert on public.%I for insert to authenticated with check ((select auth.uid()) = owner_id)', t);
  end loop;
end $$;
grant update (title, metadata) on public.books to authenticated;
create policy owner_update on public.books for update to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
-- No client deletes/overwrites of sources, snapshots, events, jobs or graph output.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types) values
 ('eazo-sources','eazo-sources',false,52428800,array['text/plain','application/pdf']),
 ('eazo-analysis','eazo-analysis',false,52428800,array['application/json']);
create policy eazo_source_read on storage.objects for select to authenticated using (
 bucket_id = 'eazo-sources' and exists (
   select 1 from public.book_sources s where s.owner_id = (select auth.uid())
   and (name = s.source_object or name = s.original_object)
 ));
create policy eazo_source_insert on storage.objects for insert to authenticated with check (
 bucket_id = 'eazo-sources' and exists (
   select 1 from public.book_sources s where s.owner_id = (select auth.uid())
   and (name = s.source_object or name = s.original_object)
 ));
create policy eazo_analysis_read on storage.objects for select to authenticated using (
 bucket_id = 'eazo-analysis' and exists (
   select 1 from public.graph_versions g where g.owner_id = (select auth.uid())
   and name in (g.manifest_object,
     g.owner_id::text || '/' || g.book_id::text || '/' || g.job_id::text || '/' || g.output_token::text || '/graph.json',
     g.owner_id::text || '/' || g.book_id::text || '/' || g.job_id::text || '/' || g.output_token::text || '/hierarchy.json')
 ));
commit;
