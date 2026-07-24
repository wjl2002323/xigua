// 构建全国县级中心点数据集 vendor/counties.json
// 源：阿里 DataV GeoAtlas areas_v3（国内源，公开）。一次性构建。
const BASE = 'https://geo.datav.aliyun.com/areas_v3/bound/';
const MUNI = new Set([110000, 120000, 310000, 500000]); // 直辖市：省级文件直接给区
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getJson(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return await r.json();
    } catch (e) { /* retry */ }
    await sleep(300 * (i + 1));
  }
  return null;
}

const centerOf = f => {
  if (f.properties.center && Array.isArray(f.properties.center)) return f.properties.center;
  if (f.properties.centroid && Array.isArray(f.properties.centroid)) return f.properties.centroid;
  return null;
};

const out = [];
const prov = await getJson(BASE + '100000_full.json');
if (!prov) { console.error('FATAL: province list fetch failed'); process.exit(1); }

for (const pf of prov.features) {
  const padc = pf.properties.adcode, pname = pf.properties.name;
  if (!padc || padc === '100000_JD') continue;
  const pj = await getJson(`${BASE}${padc}_full.json`);
  if (!pj) { console.error('skip province', pname); continue; }
  if (MUNI.has(+padc)) {
    for (const df of pj.features) {
      const c = centerOf(df);
      if (c && df.properties.name) out.push({ n: df.properties.name, p: pname, c: +df.properties.adcode, lon: +c[0].toFixed(4), lat: +c[1].toFixed(4) });
    }
    continue;
  }
  for (const cf of pj.features) {
    const cadc = cf.properties.adcode, cname = cf.properties.name;
    if (!cadc) continue;
    const cj = await getJson(`${BASE}${cadc}_full.json`);
    if (!cj || !cj.features || !cj.features.length) {
      const c = centerOf(cf); // 直筒子市/无下级：市即县
      if (c && cname) out.push({ n: cname, p: pname, c: +cadc, lon: +c[0].toFixed(4), lat: +c[1].toFixed(4) });
      continue;
    }
    let n = 0;
    for (const df of cj.features) {
      const c = centerOf(df);
      if (c && df.properties.name) { out.push({ n: df.properties.name, p: `${pname}${cname}`, c: +df.properties.adcode, lon: +c[0].toFixed(4), lat: +c[1].toFixed(4) }); n++; }
    }
    if (!n) { const c = centerOf(cf); if (c && cname) out.push({ n: cname, p: pname, c: +cadc, lon: +c[0].toFixed(4), lat: +c[1].toFixed(4) }); }
    await sleep(60);
  }
  console.error(pname, 'done, total', out.length);
}

const fs = await import('fs');
fs.writeFileSync(process.argv[2] || 'counties.json', JSON.stringify(out));
console.error('WROTE', out.length, 'counties');
