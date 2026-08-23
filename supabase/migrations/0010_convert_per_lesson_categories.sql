-- 「今期の合計回数」を1つの数字で手入力する方式(pay_categories/pay_entries、unit_type='per_lesson')は、
-- 日付ごとの履歴が残らず、都度手計算で合計を入力し直す必要があり分かりづらいという指摘のため、
-- 松岡さん・杉田さんと同じ「日付ごとに入力→自動集計」の方式(pay_rate_rules/lesson_log_entries)に統一する。
-- 対象: 久郷真弓子, 斎藤ラケル好真, 鈴木　愛, 相原真由美(フロアクラスのみ。Le lien受付は維持), 飛川真弓, 齋藤里絵

-- 鈴木さんの今期の実際の回数(本人確認済み: 8/21に1回、8/23に2回で合計3回)に、移行前に補正しておく。
update pay_entries
set quantity = 3
where staff_id = (select id from staff_profiles where name = '鈴木　愛')
  and period_start = '2026-08-16';

do $$
declare
  v_staff_id uuid;
  v_category record;
  v_qty numeric;
  i int;
begin
  for v_staff_id in
    select id from staff_profiles
    where name in ('久郷真弓子', '斎藤ラケル好真', '鈴木　愛', '相原真由美', '飛川真弓', '齋藤里絵')
  loop
    for v_category in
      select * from pay_categories where staff_id = v_staff_id and unit_type = 'per_lesson'
    loop
      select coalesce(quantity, 0) into v_qty
        from pay_entries
        where staff_id = v_staff_id and pay_category_id = v_category.id and period_start = '2026-08-16';
      v_qty := coalesce(v_qty, 0);

      insert into pay_rate_rules (staff_id, label, lesson_name, duration_minutes, min_headcount, max_headcount, rate)
      values (v_staff_id, v_category.name, v_category.name, null, null, null, v_category.rate);

      for i in 1..v_qty loop
        insert into lesson_log_entries (staff_id, entry_date, lesson_name, duration_minutes, headcount, approved, note)
        values (v_staff_id, '2026-08-23', v_category.name, 60, 1, true, '旧方式(今期合計回数入力)からの繰越分');
      end loop;

      -- pay_categoriesを削除すると、紐づくpay_entriesも連動して削除される(on delete cascade)。
      delete from pay_categories where id = v_category.id;
    end loop;
  end loop;
end $$;
