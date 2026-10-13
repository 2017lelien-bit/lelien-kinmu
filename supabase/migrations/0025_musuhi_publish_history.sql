-- むすひ予約サイトへの反映を「確認してから反映」にし、間違えたときに取り消せるようにする。
-- 反映する直前の予約サイト側の状態(変更される日だけ)をここに保存しておき、取り消すときに元へ戻す。
create table musuhi_publish_history (
  id uuid primary key default gen_random_uuid(),
  published_at timestamptz not null default now(),
  month_start date not null,
  changed_days integer not null,
  snapshot jsonb not null,
  undone_at timestamptz
);

alter table musuhi_publish_history enable row level security;
