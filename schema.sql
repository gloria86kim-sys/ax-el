-- SAVE DKU 워크숍 데이터 스키마
-- Supabase 대시보드 > SQL Editor 에서 한 번 실행함

create table if not exists public.ws (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- 워크숍 입장 코드 (아래 'CHANGE-ME'를 실제 코드로 바꿔서 실행)
create table if not exists public.ws_config (
  id int primary key default 1,
  code text not null
);
insert into public.ws_config (id, code) values (1, 'CHANGE-ME')
  on conflict (id) do update set code = excluded.code;

alter table public.ws enable row level security;
alter table public.ws_config enable row level security;  -- 정책 없음: 브라우저에서 코드 조회 불가

create or replace function public.ws_code_ok() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (current_setting('request.headers', true)::json ->> 'x-ws-code')
      = (select code from public.ws_config where id = 1),
    false)
$$;

drop policy if exists ws_read on public.ws;
drop policy if exists ws_insert on public.ws;
drop policy if exists ws_update on public.ws;
create policy ws_read   on public.ws for select to anon, authenticated using (true);
create policy ws_insert on public.ws for insert to anon, authenticated with check (public.ws_code_ok());
create policy ws_update on public.ws for update to anon, authenticated using (public.ws_code_ok()) with check (public.ws_code_ok());
-- 삭제 정책 없음: 브라우저에서 데이터 삭제 불가

-- 실시간 동기화
do $$ begin
  alter publication supabase_realtime add table public.ws;
exception when duplicate_object then null; end $$;

-- 리허설 후 데이터 초기화가 필요하면 아래 한 줄만 실행
-- truncate public.ws;
