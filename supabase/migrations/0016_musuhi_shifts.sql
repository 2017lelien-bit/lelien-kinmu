-- むすひ(姉妹店)の受付シフト。給与計算の「むすひ」区分とは別に、
-- 「誰が・いつ・何時から何時まで」むすひの受付に入るかを、管理者が直接組み立てるための表。
-- Le lienの予約・顧客データとは無関係で、あくまでスタッフのシフト管理のみ。
create table musuhi_shifts (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff_profiles(id) on delete cascade,
  entry_date date not null,
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now()
);

create index musuhi_shifts_entry_date_idx on musuhi_shifts (entry_date);

alter table musuhi_shifts enable row level security;

-- 書き込みはService Role経由のServer Action(管理者のみ)から行う。
-- 本人が自分のシフトを確認できるように、閲覧だけは許可しておく。
create policy musuhi_shifts_self_read on musuhi_shifts
  for select
  using (auth.uid() = staff_id);
