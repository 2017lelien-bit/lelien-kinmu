-- 管理者の携帯にプッシュ通知(アプリを開いていなくても届くアラート)を送るための購読情報。
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff_profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table push_subscriptions enable row level security;

create policy "push_subscriptions_self_read" on push_subscriptions for select using (auth.uid() = staff_id);
