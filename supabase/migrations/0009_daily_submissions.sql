-- 提出は「今期(締め期間)まとめて1回」ではなく「その日の勤務ごと」に行う運用に変更したため、
-- period_start(締め期間の開始日)ではなく、実際に提出した日を記録する列名に変える。
alter table period_submissions rename column period_start to submission_date;
