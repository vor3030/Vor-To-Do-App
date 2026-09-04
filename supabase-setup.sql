-- =====================================================================
-- Vor-To-Do — Supabase setup
-- Run this ONCE in: Supabase Dashboard → SQL Editor → New query → Run
-- =====================================================================

-- Tasks table: one row per task, owned by the signed-in user
create table if not exists public.tasks (
    id           uuid primary key default gen_random_uuid(),
    user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
    text         text not null,
    due_date     date,
    due_time     time,
    priority     text not null default 'medium' check (priority in ('low', 'medium', 'high')),
    category     text not null default 'personal' check (category in ('personal', 'work', 'shopping', 'health', 'other')),
    completed    boolean not null default false,
    completed_at timestamptz,
    created_at   timestamptz not null default now(),
    sort_order   integer not null default 0
);

-- Row Level Security: every user can ONLY touch their own rows.
-- This is what makes the anon key safe to expose in the browser.
alter table public.tasks enable row level security;

drop policy if exists "Users can manage their own tasks" on public.tasks;
create policy "Users can manage their own tasks"
    on public.tasks
    for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

-- Fast loading per user
create index if not exists tasks_user_sort_idx on public.tasks (user_id, sort_order);
