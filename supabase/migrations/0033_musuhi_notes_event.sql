-- むすひのカレンダーにも、イベントなどのメモ(文字色・帯色・お客様用に出さない)を書けるようにする。
alter table musuhi_notes add column if not exists note text;
alter table musuhi_notes add column if not exists color text;
alter table musuhi_notes add column if not exists bg_color text;
alter table musuhi_notes add column if not exists hide_on_customer boolean not null default false;
