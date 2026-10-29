-- 弁護士限定の相談閲覧ページ
-- 方針：
--  ・相談者の名前・連絡先はこのデータベースに入れない（管理者が伏せてから登録する）
--  ・閲覧できるのは、管理者が身元を確認した弁護士だけ
--  ・相談者が「弁護士に見せてよい」と同意した相談だけを登録する
--  ・閲覧に課金を必要とするかどうかは settings.tips_require_subscription で切り替える（初期値：不要）

create table public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.settings (
  id int primary key default 1 check (id = 1),
  tips_require_subscription boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.settings (id) values (1);

create table public.lawyers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null check (char_length(full_name) between 1 and 100),
  bar_number text not null check (bar_number ~ '^[0-9]{4,6}$'),
  bar_association text not null check (char_length(bar_association) between 1 and 50),
  office text not null check (char_length(office) between 1 and 200),
  office_phone text not null check (char_length(office_phone) between 6 and 30),
  status text not null default 'pending' check (status in ('pending','verified','rejected','suspended')),
  verified_at timestamptz,
  verified_by uuid references auth.users(id),
  admin_note text,
  subscription_status text not null default 'none' check (subscription_status in ('none','active','past_due','canceled')),
  stripe_customer_id text,
  stripe_subscription_id text,
  agreed_terms_at timestamptz not null,
  created_at timestamptz not null default now()
);
create unique index lawyers_bar_number_key on public.lawyers (bar_number) where status <> 'rejected';

create table public.tips (
  id bigint generated always as identity primary key,
  ref_code text unique,                     -- Googleフォームの受付と照合するための番号（相談者の情報ではない）
  kind text not null check (kind in ('会社ー会社','会社ー個人')),
  category text not null,                   -- トラブルの種類
  region text,                              -- 大まかな地域
  period text,                              -- 大まかな時期（例：2026年夏）
  title text not null check (char_length(title) <= 120),
  summary text not null,                    -- 一覧に出す短い要約
  details text not null,                    -- 名前・連絡先を伏せた詳しい内容
  counterparty_name text,                   -- 相手方の社名（未確認）
  documents text,                           -- 相談者の手元にある資料の種類
  verification text not null default 'unverified' check (verification in ('unverified','documents_seen','tier_b')),
  counterparty_response text,               -- 相手方の回答（あれば）
  counterparty_responded_on date,
  consent_lawyer_view boolean not null check (consent_lawyer_view),   -- 同意がないものは登録できない
  consent_recorded_on date not null,
  redaction_checked boolean not null check (redaction_checked),       -- 相談者が分かる情報を伏せたか
  status text not null default 'open' check (status in ('open','closed')),
  published boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tip_interests (
  tip_id bigint not null references public.tips(id) on delete cascade,
  lawyer_id uuid not null references public.lawyers(user_id) on delete cascade,
  message text check (char_length(message) <= 1000),
  forwarded_at timestamptz,                 -- 管理者が相談者に伝えた日時
  created_at timestamptz not null default now(),
  primary key (tip_id, lawyer_id)
);

create table public.view_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  tip_id bigint not null references public.tips(id) on delete cascade,
  viewed_at timestamptz not null default now()
);

-- 判定用の関数
create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

create function public.can_view_tips() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.lawyers l, public.settings s
    where l.user_id = auth.uid() and l.status = 'verified'
      and (not s.tips_require_subscription or l.subscription_status = 'active')
  );
$$;

-- 弁護士の登録申請（状態は必ず「確認待ち」から始まる）
create function public.register_lawyer(p_full_name text, p_bar_number text, p_bar_association text, p_office text, p_office_phone text)
returns void language plpgsql security definer set search_path = public as $$
declare v_email text;
begin
  if auth.uid() is null then raise exception 'ログインしてください'; end if;
  select email into v_email from auth.users where id = auth.uid();
  insert into public.lawyers (user_id, email, full_name, bar_number, bar_association, office, office_phone, agreed_terms_at)
  values (auth.uid(), v_email, trim(p_full_name), trim(p_bar_number), trim(p_bar_association), trim(p_office), trim(p_office_phone), now())
  on conflict (user_id) do update set
    full_name = excluded.full_name, bar_number = excluded.bar_number, bar_association = excluded.bar_association,
    office = excluded.office, office_phone = excluded.office_phone, agreed_terms_at = now(),
    status = 'pending', verified_at = null, verified_by = null
  where public.lawyers.status in ('pending','rejected');
end; $$;

-- 一覧（詳しい内容は含めない）
create function public.list_tips()
returns table (id bigint, kind text, category text, region text, period text, title text, summary text,
               verification text, has_response boolean, status text, created_at timestamptz, interested boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.can_view_tips() then raise exception 'not_allowed'; end if;
  return query
    select t.id, t.kind, t.category, t.region, t.period, t.title, t.summary, t.verification,
           t.counterparty_response is not null, t.status, t.created_at,
           exists (select 1 from public.tip_interests i where i.tip_id = t.id and i.lawyer_id = auth.uid())
    from public.tips t where t.published order by t.created_at desc;
end; $$;

-- 詳しい内容（見た記録を残す）
create function public.view_tip(p_id bigint)
returns setof public.tips
language plpgsql security definer set search_path = public as $$
begin
  if not public.can_view_tips() then raise exception 'not_allowed'; end if;
  if not exists (select 1 from public.tips where id = p_id and published) then raise exception 'not_found'; end if;
  insert into public.view_log (user_id, tip_id) values (auth.uid(), p_id);
  return query select * from public.tips where id = p_id;
end; $$;

-- 「対応できます」と手を挙げる（相談者への連絡は管理者が行い、相談者が選ぶ）
create function public.express_interest(p_tip_id bigint, p_message text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_view_tips() then raise exception 'not_allowed'; end if;
  if not exists (select 1 from public.tips where id = p_tip_id and published and status = 'open') then raise exception 'not_found'; end if;
  insert into public.tip_interests (tip_id, lawyer_id, message) values (p_tip_id, auth.uid(), left(p_message, 1000))
  on conflict (tip_id, lawyer_id) do update set message = excluded.message;
end; $$;

create function public.withdraw_interest(p_tip_id bigint)
returns void language sql security definer set search_path = public as $$
  delete from public.tip_interests where tip_id = p_tip_id and lawyer_id = auth.uid() and forwarded_at is null;
$$;

-- 権限：直接の読み書きは管理者だけ。弁護士は上の関数を通す
alter table public.admins enable row level security;
alter table public.settings enable row level security;
alter table public.lawyers enable row level security;
alter table public.tips enable row level security;
alter table public.tip_interests enable row level security;
alter table public.view_log enable row level security;

create policy admins_self on public.admins for select to authenticated using (user_id = auth.uid());
create policy settings_read on public.settings for select to authenticated using (true);
create policy settings_admin on public.settings for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy lawyers_read on public.lawyers for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy lawyers_admin on public.lawyers for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy tips_admin on public.tips for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy interests_read on public.tip_interests for select to authenticated using (lawyer_id = auth.uid() or public.is_admin());
create policy interests_admin on public.tip_interests for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy view_log_admin on public.view_log for select to authenticated using (public.is_admin());

revoke all on public.admins, public.settings, public.lawyers, public.tips, public.tip_interests, public.view_log from anon;
revoke insert, delete on public.lawyers, public.tip_interests, public.view_log, public.settings, public.admins from authenticated;
revoke update on public.admins, public.view_log from authenticated;

revoke execute on all functions in schema public from public, anon;
grant execute on function public.is_admin(), public.can_view_tips(), public.register_lawyer(text,text,text,text,text),
  public.list_tips(), public.view_tip(bigint), public.express_interest(bigint,text), public.withdraw_interest(bigint) to authenticated;

create function public.touch_updated_at() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;
create trigger tips_touch before update on public.tips for each row execute function public.touch_updated_at();
