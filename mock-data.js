// 瓜田灯火 — 全国供需模拟数据（种子随机，前后端可复现）
(function () {
  // [名, lon, lat, 供给权重, 需求权重]
  const CITIES = [
    ['潍坊', 119.10, 36.62, 9, 2], ['东明', 115.09, 35.29, 8, 0], ['开封', 114.31, 34.80, 7, 1],
    ['商丘', 115.66, 34.41, 7, 0], ['周口', 114.70, 33.63, 6, 0], ['宿州', 116.98, 33.65, 6, 0],
    ['阜阳', 115.81, 32.89, 5, 1], ['徐州', 117.28, 34.20, 5, 2], ['宿迁', 118.28, 33.96, 5, 0],
    ['东台', 120.31, 32.85, 5, 0], ['邢台', 114.50, 37.07, 4, 0], ['衡水', 115.67, 37.74, 4, 0],
    ['聊城', 115.99, 36.46, 5, 0], ['德州', 116.36, 37.44, 5, 0], ['临沂', 118.35, 35.05, 4, 1],
    ['新乡', 113.93, 35.30, 4, 0], ['邯郸', 114.54, 36.63, 4, 0], ['中卫', 105.19, 37.50, 6, 0],
    ['银川', 106.23, 38.49, 3, 1], ['吐鲁番', 89.19, 42.95, 4, 0], ['昌吉', 87.31, 44.01, 3, 0],
    ['北海', 109.12, 21.48, 4, 0], ['南宁', 108.37, 22.82, 3, 2], ['湛江', 110.36, 21.27, 4, 0],
    ['三亚', 109.51, 18.25, 3, 0], ['乐东', 109.17, 18.75, 3, 0], ['万宁', 110.39, 18.80, 3, 0],
    ['大兴', 116.34, 39.73, 3, 0], ['庆阳', 107.64, 35.71, 3, 0],
    ['北京', 116.40, 39.90, 0, 9], ['上海', 121.47, 31.23, 0, 9], ['广州', 113.26, 23.13, 0, 7],
    ['深圳', 114.06, 22.55, 0, 7], ['杭州', 120.15, 30.29, 0, 5], ['南京', 118.80, 32.06, 0, 5],
    ['武汉', 114.31, 30.59, 0, 5], ['成都', 104.07, 30.57, 0, 5], ['重庆', 106.55, 29.56, 0, 4],
    ['西安', 108.94, 34.34, 0, 4], ['长沙', 112.94, 28.23, 0, 3], ['沈阳', 123.43, 41.80, 0, 3],
    ['哈尔滨', 126.53, 45.80, 0, 2], ['天津', 117.20, 39.08, 0, 4], ['青岛', 120.38, 36.07, 0, 3],
    ['苏州', 120.59, 31.30, 0, 3], ['宁波', 121.55, 29.87, 0, 2], ['昆明', 102.83, 24.88, 0, 2],
    ['贵阳', 106.63, 26.65, 0, 2], ['福州', 119.30, 26.08, 0, 2], ['厦门', 118.09, 24.48, 0, 2],
    ['兰州', 103.83, 36.06, 0, 2], ['太原', 112.55, 37.87, 0, 2], ['合肥', 117.23, 31.82, 0, 3],
    ['南昌', 115.86, 28.68, 0, 2], ['郑州', 113.63, 34.75, 1, 4], ['石家庄', 114.51, 38.04, 1, 3],
  ];
  const VARIETIES = ['麒麟', '8424', '黑美人', '甜王', '硒砂瓜', '特小凤'];
  const SURNAMES = '张王李赵刘陈杨黄周吴徐孙马朱胡郭何高罗郑'.split('');
  const SUFFIX = ['师傅', '家的瓜田', '家庭农场', '合作社', '师傅', '家的瓜田'];
  const STORE_NAMES = ['鲜丰水果', '果多美', '四季果园', '百果园', '甜心果铺', '果真好'];
  const FACTORY_NAMES = ['果汁厂', '罐头厂', '食品加工厂', '饮品厂'];

  let seed = 20260723;
  function rnd() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }
  function pick(a) { return a[Math.floor(rnd() * a.length)]; }
  function range(lo, hi) { return lo + rnd() * (hi - lo); }

  const supplies = [], demands = [];
  let sid = 0, did = 0;
  CITIES.forEach(([city, lon, lat, sw, dw]) => {
    for (let i = 0; i < sw * 1.6; i++) {
      const v = pick(VARIETIES);
      supplies.push({
        id: 's' + (sid++), kind: 'supply', city,
        lon: lon + range(-0.9, 0.9), lat: lat + range(-0.7, 0.7),
        name: pick(SURNAMES) + pick(SUFFIX), variety: city === '中卫' || city === '银川' ? '硒砂瓜' : v,
        tons: Math.round(range(3, 80)), daysLeft: Math.round(range(1, 14)),
        phone: '1' + pick(['39', '58', '86', '52']) + '****' + Math.floor(range(1000, 9999)),
        priceWish: rnd() < 0.5 ? (range(0.4, 1.4)).toFixed(1) : null,
      });
    }
    for (let i = 0; i < dw * 1.4; i++) {
      const t = rnd() < 0.45 ? 'store' : rnd() < 0.5 ? 'individual' : 'factory';
      demands.push({
        id: 'd' + (did++), kind: 'demand', type: t, city,
        lon: lon + range(-0.55, 0.55), lat: lat + range(-0.45, 0.45),
        name: t === 'individual' ? pick(SURNAMES) + (rnd() < 0.5 ? '女士' : '先生')
          : t === 'store' ? city + pick(STORE_NAMES) : city + pick(FACTORY_NAMES),
        tons: t === 'individual' ? +(range(0.05, 0.5)).toFixed(2) : t === 'store' ? Math.round(range(2, 20)) : Math.round(range(50, 400)),
        radiusKm: t === 'individual' ? Math.round(range(40, 90)) : t === 'store' ? Math.round(range(100, 260)) : Math.round(range(260, 620)),
        phone: '1' + pick(['37', '50', '88', '99']) + '****' + Math.floor(range(1000, 9999)),
      });
    }
  });

  function distKm(a, b) {
    const R = 6371, dLa = (b.lat - a.lat) * Math.PI / 180, dLo = (b.lon - a.lon) * Math.PI / 180;
    const h = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLo / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  // 潜在匹配：每个需求点 → 半径内最近的若干供给
  const links = [];
  demands.forEach(d => {
    const cands = supplies.map(s => ({ s, km: distKm(d, s) }))
      .filter(x => x.km <= d.radiusKm).sort((a, b) => a.km - b.km)
      .slice(0, d.type === 'factory' ? 6 : d.type === 'store' ? 4 : 2);
    cands.forEach(({ s, km }) => links.push({ s: s.id, d: d.id, km: Math.round(km), deal: false }));
  });
  // 已成交：抽 ~7%
  links.forEach(l => { if (rnd() < 0.07) l.deal = true; });

  const sIndex = {}, dIndex = {};
  supplies.forEach(s => sIndex[s.id] = s); demands.forEach(d => dIndex[d.id] = d);
  window.GTDATA = {
    supplies, demands, links, sIndex, dIndex, distKm,
    labelCities: CITIES.filter(c => c[3] >= 4 || c[4] >= 4).map(([name, lon, lat]) => ({ name, lon, lat })),
  };
})();
