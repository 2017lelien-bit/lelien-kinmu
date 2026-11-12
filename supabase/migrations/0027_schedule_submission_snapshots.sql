-- スタッフが「提出する」を押した時点のスケジュール(候補)の内容を、そのまま残しておく。
-- 管理者が組み立ての途中で時間や担当を直しても、スタッフが最初に出した内容を後から見られるようにする。
create table schedule_submission_snapshots (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff_profiles(id) on delete cascade,
  month_start date not null,
  submitted_at timestamptz not null default now(),
  note text,
  entries jsonb not null,
  created_at timestamptz not null default now()
);

create index schedule_submission_snapshots_idx on schedule_submission_snapshots (month_start, staff_id, submitted_at);
alter table schedule_submission_snapshots enable row level security;
