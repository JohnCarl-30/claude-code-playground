-- Sign-in and progress sync for CCDV-F Study Lab.
-- Each signed-in user has one row holding their study progress as JSON. Row-level
-- security lets a user read and change only their own row; signed-out visitors get nothing.

create table public.progress (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  -- Progress is a few kilobytes; this stops anyone using the table as free storage.
  constraint progress_size check (pg_column_size(data) < 262144)
);

alter table public.progress enable row level security;
revoke all on table public.progress from anon, authenticated;
grant select, insert, update, delete on table public.progress to authenticated;

create policy "Users read their own progress" on public.progress
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users add their own progress" on public.progress
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users update their own progress" on public.progress
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users delete their own progress" on public.progress
  for delete to authenticated using ((select auth.uid()) = user_id);

-- The database sets the time of each save, so devices with wrong clocks can't confuse syncing.
create function public.touch_progress() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger progress_touch before insert or update on public.progress
  for each row execute function public.touch_progress();

-- "Delete my account": removes the signed-in user, and their progress row with it.
create function public.delete_my_account() returns void
language sql security definer set search_path = ''
as $$
  delete from auth.users where id = (select auth.uid());
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
