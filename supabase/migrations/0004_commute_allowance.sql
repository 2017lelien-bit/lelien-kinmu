-- 通勤費(非課税)をスタッフごとに自動計算できるようにする。
-- 'none'   : 今まで通り、明細作成のたびに手入力
-- 'fixed'  : 毎月同じ金額(定期代など)
-- 'per_day': 出勤日数 × 単価
alter table staff_profiles add column if not exists commute_type text not null default 'none';
alter table staff_profiles add column if not exists commute_amount integer not null default 0;
