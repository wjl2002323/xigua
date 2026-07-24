-- 瓜田灯火 · 照片功能增量迁移（V2-R3b）
-- ⚠️ 在 Supabase SQL Editor 整体执行。执行前请通读。
-- 内容：supplies 加 photo_url 列 + 公开读的 photos 存储桶 + 登录用户可上传。

alter table public.supplies add column if not exists photo_url text;

-- 存储桶：公开读（地图上所有人都能看瓜田照片）
insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do nothing;

-- 存储策略：任何人可读 photos 桶；登录用户可上传；只能覆盖/删除自己路径下的文件
drop policy if exists "photos_public_read" on storage.objects;
create policy "photos_public_read" on storage.objects
  for select using (bucket_id = 'photos');

drop policy if exists "photos_auth_insert" on storage.objects;
create policy "photos_auth_insert" on storage.objects
  for insert with check (bucket_id = 'photos' and auth.uid() is not null);

drop policy if exists "photos_owner_update" on storage.objects;
create policy "photos_owner_update" on storage.objects
  for update using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "photos_owner_delete" on storage.objects;
create policy "photos_owner_delete" on storage.objects
  for delete using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
