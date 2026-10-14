-- 受付シフトの休憩時間(任意)。スケジュール提出・毎週固定パターン・スケジュール組み立てで使う。
alter table schedule_submissions add column break_start time;
alter table schedule_submissions add column break_end time;
alter table schedule_templates add column break_start time;
alter table schedule_templates add column break_end time;
