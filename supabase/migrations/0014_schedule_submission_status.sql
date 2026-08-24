-- スタッフが「来月のスケジュール入力が終わった」ことを明示的に提出できるようにし、
-- 管理者が対象月ごとに、誰が提出済み・未提出かを一覧で確認できるようにする。
create table schedule_submission_status (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff_profiles(id) on delete cascade,
  month_start date not null,
  submitted_at timestamptz not null default now(),
  unique (staff_id, month_start)
);

create index schedule_submission_status_month_idx on schedule_submission_status (month_start);

alter table schedule_submission_status enable row level security;

create policy "schedule_submission_status_self_read" on schedule_submission_status for select using (auth.uid() = staff_id);
