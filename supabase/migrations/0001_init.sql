-- Le lien 勤務管理・給与計算システム 初期スキーマ
create extension if not exists "pgcrypto";

-- スタッフ (Supabase Authユーザーに紐づく)
create table staff_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  role text not null default 'staff',              -- 'staff' | 'admin'
  phone text,
  contact_email text,                                -- 明細送付先。未設定ならログインメールを使う
  employment_type text not null default 'hourly',    -- 'hourly'(時給制) | 'contract'(業務委託)
  is_active boolean not null default true,
  -- 時給制スタッフの所得税計算(国税庁「月額表甲欄」の電算機計算特例)に使う
  dependent_count integer not null default 0,        -- 源泉控除対象親族の数
  has_spouse_deduction boolean not null default false, -- 源泉控除対象配偶者の有無
  created_at timestamptz not null default now()
);

-- スタッフごとの支払区分(管理者が設定)。時給制の時給も、業務委託のレッスン単価も
-- 「名前・単位・単価」の1レコードとして扱う(人によって区分の種類・数・単価が異なるため)。
create table pay_categories (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff_profiles(id) on delete cascade,
  name text not null,
  unit_type text not null,                            -- 'hourly'(時間) | 'per_lesson'(回)
  rate integer not null,                               -- 円(時給 or 1回あたりの単価)
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 月ごとの実績(スタッフ本人が自己入力)。区分ごとに時間数 or 回数を記録する。
create table pay_entries (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff_profiles(id) on delete cascade,
  pay_category_id uuid not null references pay_categories(id) on delete cascade,
  period_start date not null,                          -- 対象月の1日
  quantity numeric not null,
  note text,
  updated_at timestamptz not null default now(),
  unique (staff_id, pay_category_id, period_start)
);

-- 給与明細のスナップショット。生成後に単価・税設定が変わっても過去の明細内容は変わらないよう、
-- 計算結果(内訳・各金額)をそのまま保存する。
create table staff_payslips (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff_profiles(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  employment_type text not null,
  breakdown jsonb not null,
  gross_amount integer not null,                        -- 支給額計(区分ごとの合計)
  commute_allowance integer not null default 0,           -- 通勤費(手入力)
  total_gross integer not null,                            -- 総支給額
  taxable_amount integer not null,                          -- 課税対象額
  income_tax integer not null,                               -- 所得税
  resident_tax integer not null default 0,                    -- 住民税(手入力)
  net_amount integer not null,                                 -- 差引支給額
  days_worked integer not null default 0,                       -- 出勤日数(手入力)
  generated_at timestamptz not null default now(),
  sent_at timestamptz,
  sent_to_email text
);

create index pay_categories_staff_idx on pay_categories (staff_id);
create index pay_entries_staff_period_idx on pay_entries (staff_id, period_start);
create index staff_payslips_staff_period_idx on staff_payslips (staff_id, period_start);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger pay_entries_set_updated_at
before update on pay_entries
for each row execute function set_updated_at();

-- RLS: 書き込みはすべてServer Action経由のservice roleクライアントのみ。
-- 読み取りは自分の行のみ許可(proxy.tsでのログイン判定、マイページでの閲覧に使用)。
alter table staff_profiles enable row level security;
alter table pay_categories enable row level security;
alter table pay_entries enable row level security;
alter table staff_payslips enable row level security;

create policy "staff_profiles_self_read" on staff_profiles for select using (auth.uid() = id);
create policy "pay_categories_self_read" on pay_categories for select using (auth.uid() = staff_id);
create policy "pay_entries_self_read" on pay_entries for select using (auth.uid() = staff_id);
create policy "staff_payslips_self_read" on staff_payslips for select using (auth.uid() = staff_id);

-- 上記以外の読み書きはクライアントから直接行わず、すべてNext.jsのServer Action経由で
-- service roleクライアントを使う。そのためここでは上記以外のポリシーを追加しない(デフォルトで拒否される)。
