-- 瓜田灯火 schema v1 · 在 Supabase SQL Editor 整体执行 · 执行前请通读
--
-- 覆盖：profiles / supplies / demands / links 四张表
--       手机号伪邮箱登录（{11位手机号}@guatian.app）配套的 profiles 自动建档
--       user_id 服务端强制盖章（BEFORE INSERT 触发器，前端传什么都不算数）
--       确定性 $0 匹配（haversine 距离 + 半径 + 上限，见 match_demand / match_supply）
--       RLS：地图公开只读，发布需登录，links 只能走 security definer 通道写入
--
-- 幂等性说明：表 / 索引 / 函数可重复执行；触发器 / 策略用 DROP IF EXISTS 后重建
-- 做到「重复执行不报错」，但本迁移不做「跨版本自动迁移」，仅适合全新项目一次性建库。

-- ============================================================
-- 0. 扩展
-- ============================================================
-- gen_random_uuid() 自 PG13 起已内置于核心，这里仍显式启用 pgcrypto 以防目标
-- 实例版本更旧 / 内置函数被移除，属防御性写法，无副作用。
create extension if not exists pgcrypto;

-- ============================================================
-- 1. 表
-- ============================================================

-- 用户档案：与 auth.users 一对一，phone 是登录用手机号（去掉伪邮箱后缀后的明文）
create table if not exists public.profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  phone        text not null unique check (phone ~ '^1\d{10}$'),
  display_name text,
  created_at   timestamptz not null default now()
);

-- 供给（瓜农挂瓜）
create table if not exists public.supplies (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id),
  name        text not null,
  city        text not null,              -- 县名
  county_code int,
  lon         double precision not null,
  lat         double precision not null,
  variety     text not null,
  tons        numeric not null check (tons > 0),
  days_left   int not null default 7 check (days_left >= 0),  -- 售卖窗口，每日递减任务见 HANDOFF 待办 5
  price_wish  numeric,
  phone       text not null,
  status      text not null default 'active' check (status in ('active', 'expired', 'closed')),
  created_at  timestamptz not null default now()
);

-- 需求（个人 / 水果店 / 工厂收瓜）
create table if not exists public.demands (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id),
  name        text not null,
  city        text not null,              -- 县名
  county_code int,
  lon         double precision not null,
  lat         double precision not null,
  type        text not null check (type in ('individual', 'store', 'factory')),
  tons        numeric not null check (tons > 0),
  radius_km   int not null check (radius_km between 10 and 1000),  -- 收货半径，前端按 type 给缺省值
  phone       text not null,
  status      text not null default 'active' check (status in ('active', 'closed')),
  created_at  timestamptz not null default now()
);

-- 匹配连线：暗线（潜在匹配，服务端算）/ 亮线（deal=true，用户标记）
create table if not exists public.links (
  id          bigint generated always as identity primary key,
  supply_id   uuid not null references public.supplies(id) on delete cascade,
  demand_id   uuid not null references public.demands(id) on delete cascade,
  km          int not null,
  score       numeric,  -- score 加权（品种/量级/紧迫度）V2-R4 填充
  deal        boolean not null default false,
  deal_at     timestamptz,
  unique (supply_id, demand_id)  -- 幂等防刷：同一对供需只允许一条连线
);

-- ============================================================
-- 2. 索引
-- ============================================================
create index if not exists idx_supplies_status  on public.supplies (status);
create index if not exists idx_demands_status   on public.demands (status);
create index if not exists idx_links_demand_id  on public.links (demand_id);
create index if not exists idx_links_supply_id  on public.links (supply_id);
create index if not exists idx_supplies_lon_lat on public.supplies (lon, lat);
create index if not exists idx_demands_lon_lat  on public.demands (lon, lat);

-- ============================================================
-- 3. user_id 服务端盖章触发器（强制，不信任客户端传入的 user_id）
-- ============================================================
create or replace function public.stamp_user_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.user_id := auth.uid();
  return new;
end
$$;

drop trigger if exists trg_supplies_stamp_user on public.supplies;
create trigger trg_supplies_stamp_user
  before insert on public.supplies
  for each row execute function public.stamp_user_id();

drop trigger if exists trg_demands_stamp_user on public.demands;
create trigger trg_demands_stamp_user
  before insert on public.demands
  for each row execute function public.stamp_user_id();

-- ============================================================
-- 4. 注册自动建档：auth.users 新增一行 → profiles 补一行
--    手机号从伪邮箱 {11位手机号}@guatian.app 的 @ 前半段提取
--    用异常兜底：邮箱格式不符（如未来接入真实邮箱登录）也不能挡注册流程
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    insert into public.profiles (user_id, phone)
    values (new.id, split_part(new.email, '@', 1));
  exception when others then
    -- 手机号格式校验失败 / 已存在等情况：吞掉异常，不阻断 auth.users 的插入
    null;
  end;
  return new;
end
$$;

drop trigger if exists trg_auth_user_created on auth.users;
create trigger trg_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- 5. 距离函数：haversine，单位公里
-- ============================================================
create or replace function public.dist_km(
  lon1 float8, lat1 float8, lon2 float8, lat2 float8
)
returns float8
language sql
immutable
set search_path = public
as $$
  select 6371 * 2 * asin(
    sqrt(
      power(sin(radians(lat2 - lat1) / 2), 2)
      + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lon2 - lon1) / 2), 2)
    )
  );
$$;

-- ============================================================
-- 6. 确定性匹配（$0，无外部服务）
--    score 暂不计算，留空见字段注释
-- ============================================================

-- 新增需求 → 从现有 active 供给里挑半径内最近的，按类型封顶
create or replace function public.match_demand(d_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_demand public.demands%rowtype;
  v_cap    int;
begin
  select * into v_demand from public.demands where id = d_id;
  if not found then
    return;
  end if;

  v_cap := case v_demand.type
    when 'factory'    then 6
    when 'store'      then 4
    when 'individual' then 2
    else 2
  end;

  insert into public.links (supply_id, demand_id, km)
  select sub.id, v_demand.id, round(sub.km)::int
  from (
    select sp.id, public.dist_km(sp.lon, sp.lat, v_demand.lon, v_demand.lat) as km
    from public.supplies sp
    where sp.status = 'active'
  ) sub
  where sub.km <= v_demand.radius_km
  order by sub.km asc
  limit v_cap
  on conflict (supply_id, demand_id) do nothing;
end
$$;

-- 新增供给 → 从现有 active 需求里挑半径覆盖到自己的，总量封顶 8（不分类型）
create or replace function public.match_supply(s_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supply public.supplies%rowtype;
begin
  select * into v_supply from public.supplies where id = s_id;
  if not found then
    return;
  end if;

  insert into public.links (supply_id, demand_id, km)
  select v_supply.id, sub.id, round(sub.km)::int
  from (
    select d.id,
           public.dist_km(v_supply.lon, v_supply.lat, d.lon, d.lat) as km,
           d.radius_km
    from public.demands d
    where d.status = 'active'
  ) sub
  where sub.km <= sub.radius_km
  order by sub.km asc
  limit 8
  on conflict (supply_id, demand_id) do nothing;
end
$$;

-- 触发器包装：AFTER INSERT 触发器不能直接带参数调用目标函数，用薄包装转发 new.id
create or replace function public.trg_match_demand()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.match_demand(new.id);
  return new;
end
$$;

create or replace function public.trg_match_supply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.match_supply(new.id);
  return new;
end
$$;

drop trigger if exists trg_demands_after_insert on public.demands;
create trigger trg_demands_after_insert
  after insert on public.demands
  for each row execute function public.trg_match_demand();

drop trigger if exists trg_supplies_after_insert on public.supplies;
create trigger trg_supplies_after_insert
  after insert on public.supplies
  for each row execute function public.trg_match_supply();

-- ============================================================
-- 7. 标记已成交：供需任一方本人可标，幂等（重复调用不覆盖已有 deal_at）
-- ============================================================
create or replace function public.mark_deal(p_supply uuid, p_demand uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated boolean;
begin
  -- 权限：调用者必须是这条连线里供给或需求任一方的所有者
  if not exists (
    select 1 from public.supplies s where s.id = p_supply and s.user_id = auth.uid()
    union all
    select 1 from public.demands d where d.id = p_demand and d.user_id = auth.uid()
  ) then
    return false;
  end if;

  update public.links
     set deal = true,
         deal_at = coalesce(deal_at, now())
   where supply_id = p_supply and demand_id = p_demand
  returning true into v_updated;

  return coalesce(v_updated, false);
end
$$;

-- ============================================================
-- 8. RLS
-- ============================================================
alter table public.profiles enable row level security;
alter table public.supplies enable row level security;
alter table public.demands  enable row level security;
alter table public.links    enable row level security;

-- profiles：只能看 / 改自己；无 insert 策略 —— 建档只走上面的 security definer 触发器
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (user_id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- supplies：地图公共只读；登录用户可发布；只能改自己的；下架走 status，不给 DELETE 策略
drop policy if exists supplies_select_public on public.supplies;
create policy supplies_select_public on public.supplies
  for select using (true);

drop policy if exists supplies_insert_authenticated on public.supplies;
create policy supplies_insert_authenticated on public.supplies
  for insert with check (auth.uid() is not null);

drop policy if exists supplies_update_own on public.supplies;
create policy supplies_update_own on public.supplies
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- demands：同上
drop policy if exists demands_select_public on public.demands;
create policy demands_select_public on public.demands
  for select using (true);

drop policy if exists demands_insert_authenticated on public.demands;
create policy demands_insert_authenticated on public.demands
  for insert with check (auth.uid() is not null);

drop policy if exists demands_update_own on public.demands;
create policy demands_update_own on public.demands
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- links：公共只读；无 insert / update 策略 —— 只能走 match_demand / match_supply 触发器
-- 和 mark_deal() RPC（均为 security definer，绕过 RLS）
drop policy if exists links_select_public on public.links;
create policy links_select_public on public.links
  for select using (true);
