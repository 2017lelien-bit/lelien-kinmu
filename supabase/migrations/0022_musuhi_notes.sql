create table musuhi_notes (
  entry_date date primary key,
  is_closed_override boolean,
  updated_at timestamptz not null default now()
);
alter table musuhi_notes enable row level security;
create policy musuhi_notes_read on musuhi_notes for select using (true);
