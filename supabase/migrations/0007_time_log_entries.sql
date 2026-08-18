-- パート・時給スタッフが「何時から何時、休憩は何時から何時」を入力し、
-- 労働時間を自動計算できるようにする(支払区分の実績(時間)に自動反映される)。
create table time_log_entries (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff_profiles(id) on delete cascade,
  pay_category_id uuid not null references pay_categories(id) on delete cascade,
  entry_date date not null,
  start_time time not null,
  end_time time not null,
  break_start time,
  break_end time,
  note text,
  created_at timestamptz not null default now()
);

create index time_log_entries_staff_category_date_idx on time_log_entries (staff_id, pay_category_id, entry_date);

alter table time_log_entries enable row level security;

create policy "time_log_entries_self_read" on time_log_entries for select using (auth.uid() = staff_id);
