-- Тэмдэглэл аппын өгөгдлийн сан
-- journal_entries: хэрэглэгч бүрийн өдрийн тэмдэглэлүүд
-- Supabase SQL Editor дотор ажиллуулна.

begin;

create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  entry_date date not null,
  title text not null default '',
  content text not null default '',
  mood text not null default '',
  tags text[] not null default '{}',
  color text not null default 'Номин',
  font text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, entry_date)
);

-- updated_at-ыг автоматаар шинэчлэх trigger
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists journal_entries_updated on public.journal_entries;
create trigger journal_entries_updated
  before update on public.journal_entries
  for each row execute function public.set_updated_at();

-- Row Level Security: хэрэглэгч зөвхөн өөрийн тэмдэглэлээ л харна
alter table public.journal_entries enable row level security;

revoke all on public.journal_entries from anon;
grant select, insert, update, delete on public.journal_entries to authenticated;

drop policy if exists je_read on public.journal_entries;
drop policy if exists je_insert on public.journal_entries;
drop policy if exists je_update on public.journal_entries;
drop policy if exists je_delete on public.journal_entries;

create policy je_read on public.journal_entries for select to authenticated
  using (user_id = (select auth.uid()));
create policy je_insert on public.journal_entries for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy je_update on public.journal_entries for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy je_delete on public.journal_entries for delete to authenticated
  using (user_id = (select auth.uid()));

commit;
