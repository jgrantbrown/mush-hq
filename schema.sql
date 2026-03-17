-- ═══════════════════════════════════════════════════════
-- MUSH HQ — Supabase Schema
-- Run this entire file in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ── PROFILES (extends Supabase auth.users) ──────────────
create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  display_name text not null,
  role text not null default 'viewer' check (role in ('admin', 'viewer')),
  avatar_emoji text default '🎲',
  created_at timestamptz default now()
);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'viewer')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── WEEKS ────────────────────────────────────────────────
create table public.weeks (
  id uuid default uuid_generate_v4() primary key,
  label text not null,                    -- e.g. "Week 12 · 2025 Season"
  season integer not null,               -- 2025
  week_number integer not null,          -- 12
  status text default 'draft' check (status in ('draft', 'live', 'complete')),
  mush_raw_text text,                    -- original pasted pick sheet
  jonathan_assessment text,             -- Claude-generated weekly take
  week_risk text default 'yellow' check (week_risk in ('green','yellow','red')),
  moon_phase text,                       -- e.g. "Waxing Gibbous"
  moon_emoji text default '🌕',
  atmospheric_alert text,               -- rotating sarcastic alert
  mush_wins integer default 0,
  mush_losses integer default 0,
  mush_pushes integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ── PICKS ────────────────────────────────────────────────
create table public.picks (
  id uuid default uuid_generate_v4() primary key,
  week_id uuid references public.weeks(id) on delete cascade,
  sort_order integer default 0,
  mush_team text not null,
  spread numeric(5,1) not null,
  opponent text not null,
  is_lock boolean default false,
  fade_hard boolean default false,
  game_window text default 'sunday' check (game_window in ('thursday','saturday','sunday_early','sunday_late','sunday_night','monday','special')),
  jonathan_comment text,
  result text check (result in ('mush_win','mush_loss','push', null)),
  score text,                            -- e.g. "23-17"
  created_at timestamptz default now()
);

-- ── BONUS BETS ───────────────────────────────────────────
create table public.bonus_bets (
  id uuid default uuid_generate_v4() primary key,
  week_id uuid references public.weeks(id) on delete cascade,
  description text not null,
  bet_type text default 'over_under' check (bet_type in ('over_under','parlay','prop','lunar','atmospheric')),
  jonathan_comment text,
  result text check (result in ('hit','miss','push', null)),
  created_at timestamptz default now()
);

-- ── COMMENTS ─────────────────────────────────────────────
create table public.comments (
  id uuid default uuid_generate_v4() primary key,
  week_id uuid references public.weeks(id) on delete cascade,
  pick_id uuid references public.picks(id) on delete cascade, -- null = week-level comment
  user_id uuid references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz default now()
);

-- ── ROW LEVEL SECURITY ───────────────────────────────────

alter table public.profiles enable row level security;
alter table public.weeks enable row level security;
alter table public.picks enable row level security;
alter table public.bonus_bets enable row level security;
alter table public.comments enable row level security;

-- Profiles: users can read all, edit only own
create policy "profiles_read_all" on public.profiles for select using (auth.role() = 'authenticated');
create policy "profiles_edit_own" on public.profiles for update using (auth.uid() = id);

-- Weeks: all authenticated users can read live/complete weeks; only admin can read drafts + write
create policy "weeks_read_live" on public.weeks for select
  using (
    auth.role() = 'authenticated' and (
      status in ('live', 'complete')
      or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
    )
  );
create policy "weeks_admin_write" on public.weeks for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- Picks: same as weeks
create policy "picks_read" on public.picks for select
  using (
    auth.role() = 'authenticated' and
    exists (
      select 1 from public.weeks w
      where w.id = week_id and (
        w.status in ('live','complete')
        or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
      )
    )
  );
create policy "picks_admin_write" on public.picks for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- Bonus bets
create policy "bonus_read" on public.bonus_bets for select using (auth.role() = 'authenticated');
create policy "bonus_admin_write" on public.bonus_bets for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- Comments: all authenticated can read + insert their own; admin can delete any
create policy "comments_read" on public.comments for select using (auth.role() = 'authenticated');
create policy "comments_insert" on public.comments for insert
  with check (auth.uid() = user_id and auth.role() = 'authenticated');
create policy "comments_delete_own" on public.comments for delete
  using (auth.uid() = user_id);
create policy "comments_admin_delete" on public.comments for delete
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- ── HISTORICAL DATA (pre-seeded) ─────────────────────────

-- Insert historical weeks summary (read-only reference data)
create table public.historical_weeks (
  id serial primary key,
  season integer,
  week_number integer,
  mush_wins integer,
  mush_losses integer,
  mush_pushes integer default 0,
  note text
);

insert into public.historical_weeks (season, week_number, mush_wins, mush_losses, mush_pushes, note) values
(2023,1,5,9,0,'forgot saints pick'),
(2023,2,7,8,1,''),
(2023,3,9,7,0,'Jonathan furious 🤬'),
(2023,4,10,2,1,'DISASTER — mush gets hot'),
(2023,5,4,8,0,'back to form'),
(2023,6,6,8,1,''),
(2023,7,9,4,0,'Jonathan "very angry"'),
(2023,8,7,7,0,'coin flip'),
(2023,14,5,8,0,''),
(2023,18,7,7,0,'coin flip — end of season'),
(2023,19,5,11,0,'PLAYOFFS — finally epic'),
(2024,1,5,6,0,'2-5 early'),
(2024,2,4,11,0,'EPIC 4-11 — "very discouraged"'),
(2024,3,4,11,0,'EPIC again — back to back'),
(2024,5,5,9,0,''),
(2025,1,8,8,0,'coin flip'),
(2025,2,11,5,0,'BEST WEEK EVER 😱'),
(2025,3,8,5,1,'weird stuff happening'),
(2025,4,3,13,0,'1-11 SUNDAY ALONE 🎉 PAYS FOR HAWAII'),
(2025,5,6,6,0,'coin flip'),
(2025,6,5,10,0,''),
(2025,7,7,5,0,'night games his weakness'),
(2025,8,9,4,0,'kills Jonathan'),
(2025,9,3,8,0,'0-8 at halftime'),
(2025,10,5,8,0,''),
(2025,11,5,7,1,''),
(2025,12,4,8,0,''),
(2025,13,5,11,0,'rebound from Thanksgiving 0-4'),
(2025,14,3,9,1,'1-7 early'),
(2025,15,4,10,0,'1-7 at halftime'),
(2025,16,5,11,0,''),
(2025,17,5,9,0,''),
(2025,18,8,8,0,'best week since wk 6');

alter table public.historical_weeks enable row level security;
create policy "hist_read_all" on public.historical_weeks for select using (auth.role() = 'authenticated');

-- ── UPDATED_AT TRIGGER ───────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create trigger weeks_updated_at before update on public.weeks
  for each row execute procedure public.set_updated_at();