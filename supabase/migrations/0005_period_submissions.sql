-- スタッフが「この期間の入力は終わりました」と管理者に知らせるための提出記録。
-- 提出されると管理画面にバッジ通知が出る。acknowledged_atは、管理者がその期間の明細を
-- 作成した時点(=確定した時点)で自動的にセットされ、バッジから消える。
create table period_submissions (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff_profiles(id) on delete cascade,
  period_start date not null,
  submitted_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  unique (staff_id, period_start)
);

alter table period_submissions enable row level security;

create policy "period_submissions_self_read" on period_submissions for select using (auth.uid() = staff_id);
