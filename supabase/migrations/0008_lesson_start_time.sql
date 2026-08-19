-- レッスンが受付シフトの時間と実際に重なっているかを判定するために、開始時刻を記録する。
alter table lesson_log_entries add column if not exists start_time time;
