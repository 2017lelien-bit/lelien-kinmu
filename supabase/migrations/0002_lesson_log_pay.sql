-- 給与実績の入力方法を追加する(既存のpay_categories/pay_entriesと併用できる)。
-- 区分方式(既存): 管理者が名前付き区分(単価入り)を用意し、スタッフは区分ごとの回数/時間を入力する。
--   時給の受付業務など、店舗によって時給が違う場合は区分を店舗ごとに分けて登録すればよい。
-- レッスン実績方式(新規): 人数によって単価が変わるなど、単価をスタッフに見せたくない場合に使う。
--   スタッフは日付・レッスン名・時間・参加人数という「事実」だけを入力し、
--   どの単価に該当するかはpay_rate_rulesと突き合わせてシステムが自動判定する。
-- 1人のスタッフが両方(例: 時給の受付 + 業務委託のレッスン)を併用してもよい。
-- (pay_input_methodというカラムは初期実装の名残でDBに残っているが、アプリ側では参照しない)
alter table staff_profiles add column if not exists pay_input_method text not null default 'category';

-- 単価ルール(管理者のみが編集・閲覧する。スタッフの自己申告画面には出さない)。
-- lesson_nameが設定されていれば「その名前のレッスンなら人数を問わず定額」という意味(例: フラダンス、研修)。
-- lesson_nameが空なら「時間・人数の範囲で単価が決まる」通常クラス用のルールを表す。
create table pay_rate_rules (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff_profiles(id) on delete cascade,
  label text not null,                      -- 管理画面でルールを識別するための名前(スタッフには見せない)
  lesson_name text,                          -- 一致した場合に定額適用するレッスン名(null可)
  duration_minutes integer,                  -- 一致すべき時間(null可 = 時間を問わない)
  min_headcount integer,                     -- 一致すべき人数の下限(null可)
  max_headcount integer,                     -- 一致すべき人数の上限(null可)
  rate integer not null,                     -- 円(1レッスンあたり)
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- スタッフ本人が自己入力する、実際に担当したレッスンの記録(単価・金額は含まない)。
create table lesson_log_entries (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff_profiles(id) on delete cascade,
  entry_date date not null,
  lesson_name text not null,
  duration_minutes integer not null,
  headcount integer not null,
  note text,
  created_at timestamptz not null default now()
);

create index pay_rate_rules_staff_idx on pay_rate_rules (staff_id);
create index lesson_log_entries_staff_date_idx on lesson_log_entries (staff_id, entry_date);

alter table pay_rate_rules enable row level security;
alter table lesson_log_entries enable row level security;

-- 単価ルールはスタッフ本人にも見せない(見せたくないという要件のため、self-read policyを追加しない)。
-- 読み取りはServer Action(管理者チェック済み)経由のservice roleクライアントのみ。
create policy "lesson_log_entries_self_read" on lesson_log_entries for select using (auth.uid() = staff_id);
