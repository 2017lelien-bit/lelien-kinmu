-- スケジュール作成画面(カレンダー)で使う、短い表示名(例: "Miho", "Michi")。
-- 未設定なら通常のスタッフ名を使う。
alter table staff_profiles add column if not exists schedule_display_name text;
