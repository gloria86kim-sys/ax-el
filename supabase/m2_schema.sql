-- 미션 02 「내 수업을 다시 쓰다」 데이터 스키마
-- 실행 전 준비: Supabase 대시보드 > Authentication > Sign In / Providers 에서
--               "Allow anonymous sign-ins"를 켜 주세요.
-- 실행: SQL Editor에 전체를 붙여 넣고, 아래 'CHANGE-OP-CODE'를 운영자 코드로 바꾼 뒤 Run
-- 기존 ws 테이블과 미션 데이터는 건드리지 않습니다.

-- 1) 운영자 코드
alter table public.ws_config add column if not exists op_code text;
update public.ws_config set op_code = 'CHANGE-OP-CODE' where id = 1;

-- 2) 운영자 목록과 판별 함수
create table if not exists public.m2_ops (uid uuid primary key, at timestamptz default now());
alter table public.m2_ops enable row level security;

create or replace function public.m2_is_op() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.m2_ops where uid = auth.uid())
$$;

create or replace function public.m2_claim_op(code text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return false; end if;
  if code is null or code <> (select op_code from public.ws_config where id = 1) then return false; end if;
  insert into public.m2_ops(uid) values (auth.uid()) on conflict do nothing;
  return true;
end $$;
grant execute on function public.m2_claim_op(text) to authenticated;
grant execute on function public.m2_is_op() to authenticated, anon;

-- 3) 교수별 진단 (본인과 운영자만 읽음)
create table if not exists public.m2_diag (
  uid uuid primary key default auth.uid(),
  team text, name text, status text,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.m2_diag enable row level security;
grant select, insert, update on public.m2_diag to authenticated;
drop policy if exists m2_diag_own on public.m2_diag;
drop policy if exists m2_diag_op on public.m2_diag;
create policy m2_diag_own on public.m2_diag for all to authenticated
  using (uid = auth.uid()) with check (uid = auth.uid() and public.ws_code_ok());
create policy m2_diag_op on public.m2_diag for select to authenticated using (public.m2_is_op());

-- 4) 교수가 공유한 익명 사례 (본인과 운영자만 읽음)
create table if not exists public.m2_shares (
  id uuid primary key default gen_random_uuid(),
  uid uuid not null default auth.uid(),
  kind text not null check (kind in ('brief','guide')),
  ver int not null, item_key text not null,
  payload jsonb not null,
  at timestamptz default now(),
  unique (uid, kind, ver, item_key)
);
alter table public.m2_shares enable row level security;
grant select, insert, delete on public.m2_shares to authenticated;
drop policy if exists m2_sh_own on public.m2_shares;
drop policy if exists m2_sh_op on public.m2_shares;
create policy m2_sh_own on public.m2_shares for all to authenticated
  using (uid = auth.uid()) with check (uid = auth.uid() and public.ws_code_ok());
create policy m2_sh_op on public.m2_shares for select to authenticated using (public.m2_is_op());

-- 5) 진단 기준 (모두 읽기, 운영자만 쓰기)
create table if not exists public.m2_criteria (id text primary key, data jsonb not null, updated_at timestamptz default now());
alter table public.m2_criteria enable row level security;
grant select on public.m2_criteria to anon, authenticated;
grant insert, update, delete on public.m2_criteria to authenticated;
drop policy if exists m2_cr_read on public.m2_criteria;
drop policy if exists m2_cr_write on public.m2_criteria;
create policy m2_cr_read on public.m2_criteria for select to anon, authenticated using (true);
create policy m2_cr_write on public.m2_criteria for all to authenticated using (public.m2_is_op()) with check (public.m2_is_op());

-- 6) 참가자 명단 (운영자만)
create table if not exists public.m2_roster (id uuid primary key default gen_random_uuid(), name text not null, team text not null);
alter table public.m2_roster enable row level security;
grant select, insert, update, delete on public.m2_roster to authenticated;
drop policy if exists m2_ro_op on public.m2_roster;
create policy m2_ro_op on public.m2_roster for all to authenticated using (public.m2_is_op()) with check (public.m2_is_op());

-- 7) 공개 브리핑 (모두 읽기, 운영자만 쓰기). 고정한 익명 집계와 승인한 사례만 들어감
create table if not exists public.m2_public (id text primary key, data jsonb not null, updated_at timestamptz default now());
alter table public.m2_public enable row level security;
grant select on public.m2_public to anon, authenticated;
grant insert, update, delete on public.m2_public to authenticated;
drop policy if exists m2_pub_read on public.m2_public;
drop policy if exists m2_pub_write on public.m2_public;
create policy m2_pub_read on public.m2_public for select to anon, authenticated using (true);
create policy m2_pub_write on public.m2_public for all to authenticated using (public.m2_is_op()) with check (public.m2_is_op());

-- 8) 가이드북 후보 (운영자만). 같은 확정 버전 중복 저장 방지
create table if not exists public.m2_guide (
  key text primary key, data jsonb not null, at timestamptz default now()
);
alter table public.m2_guide enable row level security;
grant select, insert, delete on public.m2_guide to authenticated;
drop policy if exists m2_gd_op on public.m2_guide;
create policy m2_gd_op on public.m2_guide for all to authenticated using (public.m2_is_op()) with check (public.m2_is_op());

-- 리허설 데이터 초기화가 필요할 때만:
-- truncate public.m2_diag, public.m2_shares, public.m2_public, public.m2_guide;
