-- 最低賃金の改定などで、時給区分の単価を「特定の日から」切り替えられるようにする。
-- next_rate/next_rate_effective_fromの両方が設定されている場合、その日以降の勤務分だけ
-- next_rateが適用され、それより前の勤務分は従来通りrateが適用される(給与計算側で日付ごとに振り分ける)。
alter table pay_categories add column if not exists next_rate integer;
alter table pay_categories add column if not exists next_rate_effective_from date;
