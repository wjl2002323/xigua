// 瓜田灯火 · 数据层抽象（GTAPI）
// 目的：页面只认 GTAPI.loadPosts() / GTAPI.savePost()，不关心数据存在本机还是云端。
// 今天 GT_CONFIG 为 null → mode === 'local'，行为与之前直接读写 localStorage 完全一致。
// 等 config.js 填入 Supabase 项目信息后，mode 会自动切到 'supabase'，页面代码不用再改。
(function () {
  'use strict';

  var LOCAL_KEY = 'GT_USER_POSTS';
  var cfg = window.GT_CONFIG;
  var isSupabase = !!(cfg && cfg.url && cfg.anonKey);
  var mode = isSupabase ? 'supabase' : 'local';
  var client = null; // 仅 supabase 模式下才会被赋值

  function loadScriptOnce(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('加载失败: ' + src)); };
      document.head.appendChild(s);
    });
  }

  // ---- ready：local 立即可用；supabase 需先注入 SDK 再建 client ----
  var ready;
  if (!isSupabase) {
    ready = Promise.resolve();
  } else {
    // ⚠️ R3b 接通 Supabase 后才会执行，未经实测
    ready = loadScriptOnce('vendor/supabase.min.js').then(function () {
      client = window.supabase.createClient(cfg.url, cfg.anonKey);
    }).catch(function (e) {
      console.error('[GTAPI] supabase 初始化失败，云端功能不可用', e);
    });
  }

  // ---- local 分支：与旧实现逐字一致 ----
  function loadLocal() {
    try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]'); }
    catch (e) { return []; }
  }
  function saveLocal(post) {
    try {
      var list = loadLocal();
      list.push(post);
      localStorage.setItem(LOCAL_KEY, JSON.stringify(list));
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: 'local-storage-error' };
    }
  }

  // ⚠️ R3b 接通 Supabase 后才会执行，未经实测 —— snake_case 行 → app 的 post 形状
  function rowToPost(row, kind, myUserId) {
    return {
      id: row.id, kind: kind, name: row.name, city: row.city,
      lon: row.lon, lat: row.lat, variety: row.variety, tons: row.tons,
      daysLeft: row.days_left, priceWish: row.price_wish, type: row.type,
      radiusKm: row.radius_km, phone: row.phone, createdAt: row.created_at,
      mine: !!(myUserId && row.user_id === myUserId)
    };
  }

  // ⚠️ R3b 接通 Supabase 后才会执行，未经实测
  function loadSupabase() {
    return ready.then(function () {
      if (!client) return [];
      return client.auth.getSession().then(function (sres) {
        var session = sres && sres.data && sres.data.session;
        var myUserId = session && session.user && session.user.id;
        return Promise.all([
          client.from('supplies').select('*').eq('active', true),
          client.from('demands').select('*').eq('active', true)
        ]).then(function (res) {
          var supplies = ((res[0] && res[0].data) || []).map(function (r) { return rowToPost(r, 'supply', myUserId); });
          var demands = ((res[1] && res[1].data) || []).map(function (r) { return rowToPost(r, 'demand', myUserId); });
          return supplies.concat(demands);
        });
      });
    }).catch(function (e) {
      console.error('[GTAPI] loadPosts(supabase) 失败', e);
      return [];
    });
  }

  // ⚠️ R3b 接通 Supabase 后才会执行，未经实测 —— 真正的登录流程留给 R3b
  function saveSupabase(post) {
    return ready.then(function () {
      if (!client) return { ok: false, reason: 'auth-required' };
      return client.auth.getSession().then(function (sres) {
        var session = sres && sres.data && sres.data.session;
        if (!session) return { ok: false, reason: 'auth-required' };
        var table = post.kind === 'supply' ? 'supplies' : 'demands';
        var row = {
          name: post.name, city: post.city, lon: post.lon, lat: post.lat,
          variety: post.variety, tons: post.tons, days_left: post.daysLeft,
          price_wish: post.priceWish, type: post.type, radius_km: post.radiusKm,
          phone: post.phone
        };
        return client.from(table).insert(row).then(function (r) {
          if (r && r.error) return { ok: false, reason: r.error.message || 'insert-failed' };
          return { ok: true };
        });
      });
    }).catch(function (e) {
      return { ok: false, reason: (e && e.message) || 'supabase-error' };
    });
  }

  function loadPosts() {
    return mode === 'supabase' ? loadSupabase() : Promise.resolve(loadLocal());
  }
  function savePost(post) {
    return mode === 'supabase' ? saveSupabase(post) : Promise.resolve(saveLocal(post));
  }

  window.GTAPI = { mode: mode, ready: ready, loadPosts: loadPosts, savePost: savePost };
})();
