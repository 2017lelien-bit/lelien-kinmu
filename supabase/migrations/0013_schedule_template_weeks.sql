-- 「毎週」ではなく「第2・第4火曜日だけ」のような固定パターンにも対応する。
-- null(または空配列)なら今まで通り毎週その曜日に適用する。
alter table schedule_templates add column if not exists weeks_of_month integer[];
