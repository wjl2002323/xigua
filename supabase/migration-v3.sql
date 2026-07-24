-- 瓜田灯火 · V3 增量迁移（用户反馈轮）
-- ⚠️ 在 Supabase SQL Editor 整体执行。执行前请通读。
-- 内容：需求有效期列 + 意见反馈表（管理员 = 手机号 18030600146）

-- 1. 需求也有期限（天）；供给已有 days_left
alter table public.demands add column if not exists days_valid int not null default 14
  check (days_valid between 1 and 60);

-- 2. 意见反馈表
create table if not exists public.feedbacks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  phone text,
  content text not null check (char_length(content) between 1 and 2000),
  handled boolean not null default false,
  created_at timestamptz not null default now()
);

-- 盖章：user_id 与 phone 由服务端填，不信客户端
create or replace function public.stamp_feedback()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.user_id := auth.uid();
  select p.phone into new.phone from public.profiles p where p.user_id = auth.uid();
  return new;
end
$$;
drop trigger if exists feedbacks_stamp on public.feedbacks;
create trigger feedbacks_stamp before insert on public.feedbacks
  for each row execute function public.stamp_feedback();

-- 管理员判定：主测试账号手机号
create or replace function public.is_admin()
returns boolean
language sql stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.phone = '18030600146'
  )
$$;

alter table public.feedbacks enable row level security;

drop policy if exists feedbacks_insert_auth on public.feedbacks;
create policy feedbacks_insert_auth on public.feedbacks
  for insert with check (auth.uid() is not null);

drop policy if exists feedbacks_select_own_or_admin on public.feedbacks;
create policy feedbacks_select_own_or_admin on public.feedbacks
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists feedbacks_update_admin on public.feedbacks;
create policy feedbacks_update_admin on public.feedbacks
  for update using (public.is_admin());
