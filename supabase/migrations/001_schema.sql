-- Global Net schema for Supabase (mirrors server/db.js).
-- All access goes through the "api" Edge Function, which connects as the
-- database owner. RLS is on with no policies, so the public anon key cannot
-- read or write any table directly.
create extension if not exists pgcrypto;

create or replace function gn_now() returns text language sql stable as
$$ select to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS') $$;

create table if not exists settings (key text primary key, value text not null);

create table if not exists plans (
  id bigserial primary key,
  segment text not null check (segment in ('home','business')),
  type text not null,
  name text not null,
  speed integer, channels integer, price numeric(8,2), badge text,
  featured integer not null default 0,
  features text not null default '[]',
  sort integer not null default 0,
  active integer not null default 1
);
create table if not exists services (
  id bigserial primary key, segment text not null, icon text not null default 'wifi',
  title text not null, text text not null, image text,
  sort integer not null default 0, active integer not null default 1
);
create table if not exists promotions (
  id bigserial primary key, title text not null, text text not null, image text,
  valid_until text, sort integer not null default 0, active integer not null default 1
);
create table if not exists news (
  id bigserial primary key, title text not null, excerpt text not null default '', body text not null default '',
  image text, published_at text not null, active integer not null default 1
);
create table if not exists faq (
  id bigserial primary key, question text not null, answer text not null,
  sort integer not null default 0, active integer not null default 1
);
create table if not exists coverage (
  id bigserial primary key, area text not null,
  status text not null default 'available' check (status in ('available','soon','planned')),
  note text not null default '', sort integer not null default 0, active integer not null default 1
);
create table if not exists requests (
  id bigserial primary key,
  code text not null unique,
  type text not null check (type in ('signup','business','support','callback')),
  segment text not null default 'home',
  name text not null, company text not null default '', phone text not null, email text not null default '',
  address text not null default '', plan text not null default '', topic text not null default '', message text not null default '',
  status text not null default 'new' check (status in ('new','in_progress','scheduled','done','cancelled')),
  scheduled_for text not null default '', notes text not null default '',
  created_at text not null default gn_now(), updated_at text not null default gn_now()
);
create index if not exists requests_status_idx on requests(status);
create table if not exists request_events (
  id bigserial primary key,
  request_id bigint not null references requests(id) on delete cascade,
  status text not null, public_note text not null default '', author text not null default '',
  created_at text not null default gn_now()
);
create table if not exists admins (
  id bigserial primary key, username text not null unique, name text not null default '',
  pass_hash text not null, created_at text not null default gn_now()
);
create table if not exists sessions (
  token text primary key, admin_id bigint not null references admins(id) on delete cascade,
  expires_at bigint not null
);

do $$ declare t text; begin
  foreach t in array array['settings','plans','services','promotions','news','faq','coverage','requests','request_events','admins','sessions'] loop
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on %I from anon, authenticated', t);
  end loop;
end $$;
alter function public.gn_now() set search_path = '';
