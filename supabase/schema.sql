create extension if not exists pgcrypto;

do $$ begin
  create type trace_category as enum ('emotion', 'confession', 'soundscape');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type trace_theme as enum (
    'hope', 'joy', 'fear', 'sadness', 'closure', 'anger',
    'longing', 'guilt', 'regret', 'pretence', 'secret', 'avoidance',
    'conversation', 'nature', 'traffic', 'music', 'city_life', 'soundscape'
  );
exception
  when duplicate_object then null;
end $$;

alter type trace_category add value if not exists 'soundscape';
alter type trace_theme add value if not exists 'longing';
alter type trace_theme add value if not exists 'guilt';
alter type trace_theme add value if not exists 'regret';
alter type trace_theme add value if not exists 'pretence';
alter type trace_theme add value if not exists 'secret';
alter type trace_theme add value if not exists 'avoidance';
alter type trace_theme add value if not exists 'conversation';
alter type trace_theme add value if not exists 'nature';
alter type trace_theme add value if not exists 'traffic';
alter type trace_theme add value if not exists 'music';
alter type trace_theme add value if not exists 'city_life';
alter type trace_theme add value if not exists 'soundscape';

do $$ begin
  create type trace_status as enum ('pending', 'approved', 'rejected');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type trace_retention_unit as enum ('hour', 'day', 'week', 'month', 'year', 'decade', 'century', 'millennium', 'epoch');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.traces (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (char_length(display_name) between 1 and 80),
  category trace_category not null default 'emotion',
  theme trace_theme not null,
  prompt text not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  location_label text,
  audio_path text not null,
  mime_type text not null default 'audio/webm',
  file_size_bytes integer not null default 0 check (file_size_bytes >= 0),
  audio_format text,
  duration_seconds integer not null default 0 check (duration_seconds between 0 and 61),
  retention_quantity integer not null default 1 check (retention_quantity between 1 and 99),
  retention_unit trace_retention_unit not null default 'epoch',
  expires_at timestamptz,
  status trace_status not null default 'pending',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by text,
  constraint traces_category_theme_check check (
    (category = 'emotion' and theme::text in ('hope', 'joy', 'fear', 'sadness', 'closure', 'anger'))
    or
    (category = 'confession' and theme::text in ('longing', 'guilt', 'regret', 'pretence', 'secret', 'avoidance'))
    or
    (category = 'soundscape' and theme::text in ('conversation', 'nature', 'traffic', 'music', 'city_life', 'soundscape'))
  ),
  constraint traces_retention_expiry_check check (
    (retention_unit = 'epoch' and expires_at is null)
    or
    (retention_unit <> 'epoch' and expires_at is not null)
  )
);

alter table public.traces add column if not exists category trace_category not null default 'emotion';
alter table public.traces add column if not exists mime_type text not null default 'audio/webm';
alter table public.traces add column if not exists file_size_bytes integer not null default 0 check (file_size_bytes >= 0);
alter table public.traces add column if not exists audio_format text;
alter table public.traces add column if not exists retention_quantity integer not null default 1 check (retention_quantity between 1 and 99);
alter table public.traces add column if not exists retention_unit trace_retention_unit not null default 'epoch';
alter table public.traces add column if not exists expires_at timestamptz;

alter table public.traces drop constraint if exists traces_category_theme_check;
alter table public.traces add constraint traces_category_theme_check check (
  (category = 'emotion' and theme::text in ('hope', 'joy', 'fear', 'sadness', 'closure', 'anger'))
  or
  (category = 'confession' and theme::text in ('longing', 'guilt', 'regret', 'pretence', 'secret', 'avoidance'))
  or
  (category = 'soundscape' and theme::text in ('conversation', 'nature', 'traffic', 'music', 'city_life', 'soundscape'))
);

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'traces_retention_expiry_check'
  ) then
    alter table public.traces add constraint traces_retention_expiry_check check (
      (retention_unit = 'epoch' and expires_at is null)
      or
      (retention_unit <> 'epoch' and expires_at is not null)
    );
  end if;
end $$;

drop index if exists traces_public_browse_idx;
create index if not exists traces_public_browse_idx on public.traces (status, category, theme, created_at desc);
create index if not exists traces_public_expiry_idx on public.traces (status, expires_at);

alter table public.traces enable row level security;

drop policy if exists "approved traces are publicly readable" on public.traces;
create policy "approved traces are publicly readable"
on public.traces
for select
using (status = 'approved');

-- Writes and moderation are performed by Next.js API routes with the service role key.
-- Keep the trace-audio bucket private. The app creates short-lived signed URLs only for approved traces or allowlisted admins.
