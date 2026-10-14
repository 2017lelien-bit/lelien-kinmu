-- 受付の休憩を「開始〜終了の時刻」ではなく「休憩の長さ(分)」で持つ(表示は「休憩1h」「休憩30min」)。
-- 0027で追加した break_start / break_end に入っていた値は、長さに換算して引き継ぐ。
-- 古い列は、公開済みのアプリが参照している間に消すとエラーになるため、ここでは残しておく。
alter table schedule_submissions add column break_minutes integer;
alter table schedule_templates add column break_minutes integer;

update schedule_submissions
set break_minutes = round(extract(epoch from (break_end - break_start)) / 60)
where break_start is not null and break_end is not null;

update schedule_templates
set break_minutes = round(extract(epoch from (break_end - break_start)) / 60)
where break_start is not null and break_end is not null;
