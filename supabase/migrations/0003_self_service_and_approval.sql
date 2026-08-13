-- スタッフが初回登録時に自分で入力できる項目を追加する(住所)。
alter table staff_profiles add column if not exists address text;

-- 管理者がレッスン実績(参加人数など)を確認・承認できるようにする。
alter table lesson_log_entries add column if not exists approved boolean not null default false;
