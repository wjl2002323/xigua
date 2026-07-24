// 瓜田灯火 · 数据层抽象（GTAPI）
// 目的：页面只认 GTAPI.loadPosts() / GTAPI.savePost()，不关心数据存在本机还是云端。
// GT_CONFIG 为 null → mode === 'local'，行为与之前直接读写 localStorage 完全一致。
// GT_CONFIG 填入 Supabase 项目信息后，mode 自动切到 'supabase'：
//   认证用手机号+密码，内部映射成 `${phone}@guatian.app` 的假邮箱登录 Supabase Auth。
(function () {
  'use strict';

  var LOCAL_KEY = 'GT_USER_POSTS';
  var PHOTO_BUCKET = 'photos';
  var cfg = window.GT_CONFIG;
  var isSupabase = !!(cfg && cfg.url && cfg.anonKey);
  var mode = isSupabase ? 'supabase' : 'local';
  var client = null; // 仅 supabase 模式下才会被赋值
  var cachedUserId = null; // supabase 会话 user.id 缓存，由 onAuthStateChange 维护

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
    ready = loadScriptOnce('vendor/supabase.min.js').then(function () {
      client = window.supabase.createClient(cfg.url, cfg.anonKey);
      // 订阅即触发一次当前会话状态，currentUserId() 因此在 ready 之后即可用。
      client.auth.onAuthStateChange(function (_event, session) {
        cachedUserId = (session && session.user && session.user.id) || null;
      });
    }).catch(function (e) {
      console.error('[GTAPI] supabase 初始化失败，云端功能不可用', e);
    });
  }

  function phoneEmail(phone) { return phone + '@guatian.app'; }

  // ---- local 分支：与旧实现逐字一致（photoBlob 无法 JSON 序列化，写入前剥离）----
  function loadLocal() {
    try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]'); }
    catch (e) { return []; }
  }
  function saveLocal(post) {
    try {
      if (post && post.photoBlob) { delete post.photoBlob; }
      var list = loadLocal();
      list.push(post);
      localStorage.setItem(LOCAL_KEY, JSON.stringify(list));
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: 'local-storage-error' };
    }
  }

  // ---- supabase：snake_case 行 → app 的 post 形状 ----
  function rowToPost(row, kind) {
    return {
      id: row.id, kind: kind, name: row.name, city: row.city,
      lon: row.lon, lat: row.lat, variety: row.variety, tons: Number(row.tons),
      daysLeft: row.days_left, priceWish: row.price_wish, type: row.type,
      radiusKm: row.radius_km, phone: row.phone, photo: row.photo_url || undefined,
      daysValid: row.days_valid,
      createdAt: row.created_at, mine: row.user_id === currentUserId()
    };
  }

  function loadSupabase() {
    return ready.then(function () {
      if (!client) return [];
      return Promise.all([
        client.from('supplies').select('*').eq('status', 'active'),
        client.from('demands').select('*').eq('status', 'active')
      ]).then(function (res) {
        var r0 = res[0], r1 = res[1];
        if ((r0 && r0.error) || (r1 && r1.error)) return [];
        var supplies = ((r0 && r0.data) || []).map(function (r) { return rowToPost(r, 'supply'); });
        var demands = ((r1 && r1.data) || []).map(function (r) { return rowToPost(r, 'demand'); });
        // 过期点位（超过发布者设定期限）从地图消失，但不删库存 —— 仅在读取时过滤
        var now = Date.now(), DAY = 86400000;
        supplies = supplies.filter(function (p) { if (!p.createdAt || !p.daysLeft) return true; return (new Date(p.createdAt).getTime() + p.daysLeft * DAY) > now; });
        demands = demands.filter(function (p) { if (!p.createdAt) return true; var dv = p.daysValid || 14; return (new Date(p.createdAt).getTime() + dv * DAY) > now; });
        return supplies.concat(demands);
      });
    }).catch(function (e) {
      console.error('[GTAPI] loadPosts(supabase) 失败', e);
      return [];
    });
  }

  function uploadPhoto(userId, blob) {
    var path = userId + '/' + Date.now() + '.jpg';
    return client.storage.from(PHOTO_BUCKET)
      .upload(path, blob, { contentType: 'image/jpeg', upsert: false })
      .then(function (r) {
        if (r && r.error) return null;
        var pub = client.storage.from(PHOTO_BUCKET).getPublicUrl(path);
        return (pub && pub.data && pub.data.publicUrl) || null;
      })
      .catch(function () { return null; });
  }

  function buildRow(post, countyCode, photoUrl) {
    if (post.kind === 'supply') {
      var row = {
        name: post.name, city: post.city, county_code: countyCode,
        lon: post.lon, lat: post.lat, variety: post.variety, tons: post.tons,
        days_left: post.daysLeft, price_wish: post.priceWish ? Number(post.priceWish) : null,
        phone: post.phone
      };
      // photo_url 列由 migration-photos.sql 增加；仅在真的有照片时携带，
      // 未跑迁移的库也能正常发布（照片功能自然降级）
      if (photoUrl) row.photo_url = photoUrl;
      return row;
    }
    var demandRow = {
      name: post.name, type: post.type, city: post.city, county_code: countyCode,
      lon: post.lon, lat: post.lat, tons: post.tons, radius_km: post.radiusKm,
      phone: post.phone
    };
    // days_valid 列由对应 migration 增加；仅在真的有设定时携带，
    // 未跑迁移的库也能正常发布（有效期功能自然降级）
    if (post.daysValid) demandRow.days_valid = post.daysValid;
    return demandRow;
  }

  function saveSupabase(post) {
    return ready.then(function () {
      if (!client) return { ok: false, reason: 'auth-required' };
      return client.auth.getSession().then(function (sres) {
        var session = sres && sres.data && sres.data.session;
        if (!session) return { ok: false, reason: 'auth-required' };
        var userId = session.user && session.user.id;
        var photoWarn = null;
        var photoUrlP = post.photoBlob
          ? uploadPhoto(userId, post.photoBlob).then(function (url) {
              if (!url) photoWarn = 'photo-failed';
              return url;
            })
          : Promise.resolve(null);
        return photoUrlP.then(function (photoUrl) {
          var table = post.kind === 'supply' ? 'supplies' : 'demands';
          var countyCode = (post.county && post.county.c) || null;
          var row = buildRow(post, countyCode, photoUrl);
          return client.from(table).insert(row).then(function (r) {
            if (r && r.error) {
              var errMsg = r.error.message || '';
              // days_valid 列可能尚未跑 migration；命中该报错时剥离字段重试一次，
              // 不让整条发布因为一个可选列失败
              if (/days_valid/.test(errMsg) && row.days_valid) {
                delete row.days_valid;
                return client.from(table).insert(row).then(function (r2) {
                  if (r2 && r2.error) return { ok: false, reason: r2.error.message || 'insert-failed' };
                  var result2 = { ok: true, warn: 'days-valid-skipped' };
                  return result2;
                });
              }
              return { ok: false, reason: errMsg || 'insert-failed' };
            }
            var result = { ok: true };
            if (photoWarn) result.warn = photoWarn;
            return result;
          });
        });
      });
    }).catch(function (e) {
      return { ok: false, reason: (e && e.message) || 'supabase-error' };
    });
  }

  // ---- 认证：手机号+密码 → 假邮箱登录 Supabase Auth（先登录，失败再注册）----
  function ensureAuth(phone, password) {
    if (mode !== 'supabase') return Promise.resolve({ ok: true });
    var email = phoneEmail(phone);
    return ready.then(function () {
      if (!client) return { ok: false, reason: 'supabase-unavailable' };
      return client.auth.getSession().then(function (sres) {
        var session = sres && sres.data && sres.data.session;
        if (session && session.user && session.user.email === email) {
          return { ok: true };
        }
        return (session ? client.auth.signOut() : Promise.resolve()).then(function () {
          return client.auth.signInWithPassword({ email: email, password: password }).then(function (r) {
            if (r && !r.error) return { ok: true };
            return client.auth.signUp({ email: email, password: password }).then(function (r2) {
              if (r2 && !r2.error && r2.data && r2.data.user) {
                // 部分配置下 signUp 不随带 session —— 立即补一次密码登录确保会话就位
                if (r2.data.session) return { ok: true, reason: 'registered' };
                return client.auth.signInWithPassword({ email: email, password: password }).then(function (r3) {
                  if (r3 && !r3.error) return { ok: true, reason: 'registered' };
                  return { ok: false, reason: 'signup-no-session' };
                });
              }
              var msg = (r2 && r2.error && r2.error.message) || '';
              if (/already registered|already exists/i.test(msg)) {
                return { ok: false, reason: 'wrong-password' };
              }
              return { ok: false, reason: msg.slice(0, 60) || 'signup-failed' };
            });
          });
        });
      });
    }).catch(function (e) {
      return { ok: false, reason: (e && e.message) || 'auth-error' };
    });
  }

  function currentUserId() {
    return mode === 'supabase' ? cachedUserId : null;
  }

  function loadPosts() {
    return mode === 'supabase' ? loadSupabase() : Promise.resolve(loadLocal());
  }
  function savePost(post) {
    return mode === 'supabase' ? saveSupabase(post) : Promise.resolve(saveLocal(post));
  }

  // ---- links：供需匹配连线（km/score/是否成交）----
  function rowToLink(row) {
    return {
      s: row.supply_id, d: row.demand_id, km: row.km,
      score: row.score != null ? Number(row.score) : undefined,
      deal: !!row.deal, dealAt: row.deal_at || undefined, cloud: true
    };
  }

  function loadLinksSupabase() {
    return ready.then(function () {
      if (!client) return [];
      return client.from('links').select('supply_id,demand_id,km,score,deal,deal_at').then(function (r) {
        if (r && r.error) return [];
        return ((r && r.data) || []).map(rowToLink);
      });
    }).catch(function (e) {
      console.error('[GTAPI] loadLinks(supabase) 失败', e);
      return [];
    });
  }

  function loadLinks() {
    return mode === 'supabase' ? loadLinksSupabase() : Promise.resolve([]);
  }

  function markDealSupabase(supplyId, demandId) {
    return ready.then(function () {
      if (!client) return { ok: false, reason: 'auth-required' };
      return client.auth.getSession().then(function (sres) {
        var session = sres && sres.data && sres.data.session;
        if (!session) return { ok: false, reason: 'auth-required' };
        return client.rpc('mark_deal', { p_supply: supplyId, p_demand: demandId }).then(function (r) {
          if (r && r.error) return { ok: false, reason: (r.error.message || 'rpc-failed').slice(0, 60) };
          if (r && r.data === true) return { ok: true };
          return { ok: false, reason: 'not-owner' };
        });
      });
    }).catch(function (e) {
      return { ok: false, reason: (e && e.message) || 'supabase-error' };
    });
  }

  function markDeal(supplyId, demandId) {
    return mode === 'supabase' ? markDealSupabase(supplyId, demandId) : Promise.resolve({ ok: true });
  }

  // ---- 会话探针：登录门用它判断「7 天内免登录」是否还成立 ----
  function getSession() {
    if (mode !== 'supabase') return Promise.resolve(null);
    return ready.then(function () {
      if (!client) return null;
      return client.auth.getSession().then(function (r) {
        return (r && r.data && r.data.session) || null;
      });
    }).catch(function () { return null; });
  }

  window.GTAPI = {
    mode: mode, ready: ready,
    loadPosts: loadPosts, savePost: savePost,
    ensureAuth: ensureAuth, currentUserId: currentUserId,
    loadLinks: loadLinks, markDeal: markDeal,
    getSession: getSession
  };
})();
