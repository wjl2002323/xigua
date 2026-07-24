# 瓜田灯火 · Supabase 后端上线步骤

`schema.sql` 是一整份可重复执行的迁移，在 Supabase SQL Editor 里一次性跑完即可。以下是从零到能收发数据的完整步骤。

## 1. 新建项目

前往 [supabase.com](https://supabase.com) 新建一个项目，**区域选 Singapore**（离国内用户最近，延迟最低）。记下设置的数据库密码（后续一般用不到，但建议存起来）。

## 2. 执行 schema.sql

项目建好后进入左侧 **SQL Editor**，新建一个查询，把 `schema.sql` 整个文件粘贴进去。

**执行前请通读一遍**（文件顶部也有同样的提醒）：确认表结构、触发器、RLS 策略符合预期后再点 Run。这一份建的是 `profiles` / `supplies` / `demands` / `links` 四张表，以及配套的自动建档触发器、距离计算函数、匹配函数、RLS 策略。

## 3. 关闭邮箱确认

进入 **Authentication → Providers → Email**，把 **Confirm email** 关掉。

原因：本项目登录用的是「手机号 + 密码」，手机号会被拼成一个伪邮箱 `{11位手机号}@guatian.app` 传给 Supabase Auth 走邮箱注册流程 —— 但这个邮箱地址是假的、收不到任何确认信。不关掉 Confirm email 的话，用户会卡在「请查收邮件确认」这一步，永远进不去。

## 4. 拿 API Key，填进前端配置

进入项目 **Settings → API**，复制：
- **Project URL**
- **anon public** key

把这两项填进仓库根目录 `config.js` 里的 `GT_CONFIG`（如果 `config.js` 还不存在，需要先创建，参考 `vendor/supabase.min.js` 的引入方式初始化 Supabase client）。

## 5. 关于 Key 的安全性 —— 务必读一遍

- **anon public key** 是设计给客户端用的，可以放心写进前端代码 / 仓库。它本身不是"通行证"，真正的访问控制全部由第 2 步建的 **RLS（Row Level Security）策略**兜底：地图数据公开只读，发布数据必须登录，`user_id` 由数据库触发器服务端盖章，前端传什么都不算数。
- **service_role key**（在同一个 Settings → API 页面）拥有绕过 RLS 的超级权限，**绝对不能**出现在前端代码、仓库、或任何客户端可见的地方。如果后续需要写后台脚本 / Edge Function 之类需要 service_role 的场景，钥匙只能放在服务端环境变量里。

## 6. 登录模型一句话说明

当前是 V1：手机号 + 密码登录，实现方式是把手机号伪装成邮箱 `{手机号}@guatian.app` 交给 Supabase 内置的邮箱+密码认证（省了自建一套手机号认证系统）。`profiles` 表通过触发器在用户注册时自动从这个伪邮箱里把手机号解析出来存好。

V2 可以换成真实短信验证码（OTP）登录，届时 `stamp_user_id` / RLS / `profiles` 建档逻辑基本不用动，只需要换 Auth 的注册 / 登录方式。
