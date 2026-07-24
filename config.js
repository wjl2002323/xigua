// 瓜田灯火 · 云端配置（可选）
// 接入 Supabase：把下面 null 换成 { url: 'https://xxxx.supabase.co', anonKey: 'eyJ...' }
// anon key 是可公开的客户端钥匙（安全靠 RLS）；service_role 密钥绝不能放这里。
// 步骤详见 supabase/README.md。保持 null 则数据只存本机浏览器（localStorage）。
window.GT_CONFIG = null;
