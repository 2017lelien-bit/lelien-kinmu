create table correction_requests (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff_profiles(id) on delete cascade,
  entry_type text not null,
  entry_date date not null,
  note text not null,
  requested_at timestamptz not null default now(),
  resolved_at timestamptz
);
alter table correction_requests enable row level security;
create policy correction_requests_self_read on correction_requests for select using (auth.uid() = staff_id);
