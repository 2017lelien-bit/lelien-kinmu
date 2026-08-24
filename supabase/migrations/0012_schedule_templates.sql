-- 「休み希望(NG日)」は時刻を伴わないため、start_timeの必須制約を外す。
alter table schedule_submissions alter column start_time drop not null;

-- スタッフが担当できるレッスンの一覧(スケジュール提出時の選択肢用)。
create table staff_lesson_options (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff_profiles(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- 毎週固定のスケジュールパターン。「今月に反映する」で対象月にまとめて登録できる。
create table schedule_templates (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff_profiles(id) on delete cascade,
  day_of_week integer not null,        -- 0=日曜〜6=土曜
  kind text not null,                  -- 'reception' | 'lesson'
  start_time time not null,
  end_time time,                       -- 受付のみ使用
  lesson_name text,                    -- レッスンのみ使用
  note text,
  created_at timestamptz not null default now()
);

create index staff_lesson_options_staff_idx on staff_lesson_options (staff_id);
create index schedule_templates_staff_idx on schedule_templates (staff_id);

alter table staff_lesson_options enable row level security;
alter table schedule_templates enable row level security;

create policy "staff_lesson_options_self_read" on staff_lesson_options for select using (auth.uid() = staff_id);
create policy "schedule_templates_self_read" on schedule_templates for select using (auth.uid() = staff_id);
