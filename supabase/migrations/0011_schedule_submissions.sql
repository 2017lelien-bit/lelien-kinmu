-- 来月のスケジュール(受付シフト・レッスン)を、スタッフが前もって提出できるようにする。
-- 管理者が1件ごとに内容を確認し、確定した実際の月間カレンダー作りに使う。
create table schedule_submissions (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff_profiles(id) on delete cascade,
  entry_date date not null,
  kind text not null,                  -- 'reception'(受付) | 'lesson'(レッスン)
  start_time time not null,
  end_time time,                       -- 受付のみ使用
  lesson_name text,                    -- レッスンのみ使用
  note text,
  confirmed boolean not null default false,
  created_at timestamptz not null default now()
);

create index schedule_submissions_date_idx on schedule_submissions (entry_date);
create index schedule_submissions_staff_idx on schedule_submissions (staff_id);

alter table schedule_submissions enable row level security;

create policy "schedule_submissions_self_read" on schedule_submissions for select using (auth.uid() = staff_id);
