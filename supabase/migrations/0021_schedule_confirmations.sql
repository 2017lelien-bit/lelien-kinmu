create table schedule_confirmations (
  staff_id uuid not null references staff_profiles(id) on delete cascade,
  month_start date not null,
  confirmed_at timestamptz not null default now(),
  primary key (staff_id, month_start)
);
alter table schedule_confirmations enable row level security;
create policy schedule_confirmations_self_read on schedule_confirmations for select using (auth.uid() = staff_id);
