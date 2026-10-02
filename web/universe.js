/* 阅读宇宙渲染层（?universe 模式）—— 极简单色版，构图导向。
 * 美学参考：小红书 @章绿狮「余页 AFTER PAGES」的阅读宇宙（tmp/xhs-ref/ref-7.jpg）：
 * 纯黑底 + 白色星点 + 宋体细字 + 极暗「xx星系」区域字标 + 唯一英雄星 + 克制彗星。
 * 色彩纪律：单色（白/暖白/冷灰）。
 * 构图原则（v5）：连续、饱满、克制——
 * - 一整片连续星野：黄金角均匀密度螺旋（62√k）+ ±18% 低频正弦起伏，
 *   局部有疏密呼吸感但不出现成片大虚空；星系按书量降序由内向外，
 *   英雄星所在星系钉在原点，相机三分法偏心，星野占满画面约 80%
 * - 邻近星系用极暗细线（alpha 0.026）两两勾连，强化「一整片」的连续感
 * - 星团内部收紧（一簇就是一簇），星点带实心核 + 屏幕半径上限（8.5px），
 *   全景不糊团、深缩放不糊成毛球
 * - 英雄星是「最亮的星」不是探照灯：光晕 40px / alpha 0.5，16px 亮白标签
 * - 标签分级：全景给每个 ≥3 书星系的时长 top1（≥10 书加 top2）+ 全部星系名
 *   小灰字，矩形碰撞避让控密度；放大后按名次逐级浮现
 * - 全景紧凑、局部舒展：星团随缩放散开，深缩放时同星系星之间出现极暗星座连线
 * - 调试机位：?universe&uzoom=N 以初始视点放大 N 倍
 * 数据语义不变：星系 = 39 主题；恒星 = 书（半径=√阅读时长，亮度=笔记密度）；
 * 彗星 = 主题离群书（build_universe.py 标签共现余弦判定）；英雄星 = 阅读时长 top1。
 * 由 index.html 在 ?universe 时加载，调用 initUniverse({onBook, onTheme, onClose})。
 */
'use strict';

function initUniverse(hooks) {
  const U = window.UNIVERSE;
  const cv = document.getElementById('ucv');
  const ctx = cv.getContext('2d');
  const tip = document.getElementById('utip');
  const SERIF = '"Songti SC", "STSong", "SimSun", serif';

  // ---------- 尺度映射 ----------
  const maxRt = Math.max(...U.books.map(b => b.rt), 1);
  const starR = rt => 1.6 + 5.5 * Math.sqrt(rt / maxRt);               // 阅读时长 → 半径
  const starLight = n => 0.45 + 0.55 * Math.min(1, Math.sqrt(n / 40)); // 笔记密度 → 亮度

  // ---------- 确定性随机 ----------
  const RND = (seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647)(20260830);

  // ---------- 世界布局 ----------
  // 星系成员：按笔记密度降序（亮的靠近星系名）
  const members = {};
  U.books.forEach(b => (members[b.theme] = members[b.theme] || []).push(b));
  Object.values(members).forEach(arr => arr.sort((a, b) => b.notes - a.notes));

  // 星系布局（v5）：一整片连续星野——黄金角均匀密度螺旋铺满画面，
  // 半径带低频正弦起伏（局部有疏密呼吸感，但不出现成片大虚空）；
  // 英雄星所在星系钉在原点做锚点，星系按书量降序由内向外排布。
  const GA = 2.399963;
  const heroBook = U.books.reduce((m, b) => (b.rt > m.rt ? b : m), U.books[0]);
  const ordered = [heroBook.theme,
    ...U.themes.map(t => t.name).filter(n => n !== heroBook.theme)];
  const galaxies = ordered.map((name, k) => {
    const t = U.themes.find(t => t.name === name);
    const n = (members[name] || []).length;
    const clusterR = 10 + 4.4 * Math.sqrt(Math.max(0, n - 1));
    if (k === 0) return { ...t, i: k, x: 0, y: 0, clusterR, n };
    const a = k * GA;
    // 均匀密度基准 62√k，叠加 ±18% 低频起伏制造局部疏密
    const r = 62 * Math.sqrt(k) * (1 + 0.18 * Math.sin(k * 0.9 + 1.7));
    return { ...t, i: k, x: Math.cos(a) * r * 1.12, y: Math.sin(a) * r * 0.8,
      clusterR, n };
  });
  const galByName = Object.fromEntries(galaxies.map(g => [g.name, g]));

  // 邻近星系勾连：每个星系连向最近的 2 个邻居（极暗细线，勾出星野的连续感）
  const galLinks = [];
  {
    const seen = new Set();
    for (const g of galaxies) {
      const near = galaxies.filter(o => o !== g)
        .sort((a, b) => Math.hypot(a.x - g.x, a.y - g.y) - Math.hypot(b.x - g.x, b.y - g.y))
        .slice(0, 2);
      for (const o of near) {
        const key = g.i < o.i ? `${g.i}-${o.i}` : `${o.i}-${g.i}`;
        if (!seen.has(key)) { seen.add(key); galLinks.push([g, o]); }
      }
    }
  }

  // 恒星：收紧的星团（一簇就是一簇）+ 时长在星系内的排名（标签分级用）
  const galRtRank = {};
  Object.entries(members).forEach(([name, arr]) => {
    [...arr].sort((a, b) => b.rt - a.rt).forEach((b, i) => { galRtRank[b.id] = i; });
  });
  const stars = U.books.filter(b => !b.comet).map(b => {
    const g = galByName[b.theme];
    const j = members[b.theme].indexOf(b);
    return {
      b, g, orbit: 5 + 5.2 * Math.sqrt(j) + (j * 37 % 5),
      ang: j * GA + RND() * Math.PI * 2,
      speed: (0.015 + 0.02 / (1 + j * 0.3)) * (j % 2 ? 1 : -1),
      r: starR(b.rt), light: starLight(b.notes),
      galRank: galRtRank[b.id] ?? 99,
      twf: 0.5 + RND() * 1.2, twp: RND() * Math.PI * 2,
    };
  });

  // 英雄星：阅读时长 top1 是唯一主角；top2/3 次级强调
  const byRt = [...stars].sort((a, b) => b.b.rt - a.b.rt);
  const hero = byRt[0];
  byRt.forEach((s, i) => { s.rank = i; });

  // 彗星：星野外环轨道，克制
  const outerR = Math.max(...galaxies.map(g => Math.hypot(g.x, g.y))) + 120;
  const comets = U.books.filter(b => b.comet).map((b, i, arr) => ({
    b, orbit: outerR + (i * 131 % 120),
    ang: i / arr.length * Math.PI * 2 + 0.7,
    speed: 0.022 + i * 0.005,
    r: starR(b.rt) * 0.8 + 1.2,
  }));

  // ---------- 离屏精灵（颜色由主题调色板决定，暗色=白点、亮色=墨点） ----------
  function makeDotSprite(rgb) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d');
    const grad = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, `rgba(${rgb},1)`);
    grad.addColorStop(0.18, `rgba(${rgb},0.6)`);
    grad.addColorStop(0.5, `rgba(${rgb},0.08)`);
    grad.addColorStop(1, `rgba(${rgb},0)`);
    x.fillStyle = grad;
    x.fillRect(0, 0, 64, 64);
    return c;
  }
  function makeGlowSprite(coreRgb, rgb) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d');
    const grad = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, `rgba(${coreRgb},0.95)`);
    grad.addColorStop(0.2, `rgba(${rgb},0.40)`);
    grad.addColorStop(0.55, `rgba(${rgb},0.10)`);
    grad.addColorStop(1, `rgba(${rgb},0)`);
    x.fillStyle = grad;
    x.fillRect(0, 0, 128, 128);
    return c;
  }

  // ---------- 主题调色板 ----------
  // 开灯/关灯时 index.html 会广播 themechange 事件；色值真值全部在 index.html 的
  // :root / html[data-theme=light] 里（--uv-* 变量），这里只做读取与拼装。
  function readPalette() {
    const v = (n, fb) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || fb;
    const rgb = v('--uv-rgb', '235,238,245');
    const labelRgb = v('--uv-label-rgb', rgb);
    const glowCoreRgb = v('--uv-glow-core-rgb', '255,246,226');
    const glowRgb = v('--uv-glow-rgb', '255,224,180');
    return {
      bg: v('--uv-bg', '#07080b'),
      star: a => `rgba(${rgb},${a})`,
      label: a => `rgba(${labelRgb},${a})`,
      galaxyLabel: v('--uv-galaxy-label', 'rgba(150,156,168,.42)'),
      hairline: v('--uv-hairline', 'rgba(255,255,255,.026)'),
      constellation: v('--uv-constellation', 'rgba(255,255,255,.05)'),
      core: v('--uv-core', '#fff'),
      hotring: v('--uv-hotring', 'rgba(255,255,255,.75)'),
      hotInk: v('--uv-hot-ink', 'rgba(255,255,255,.98)'),
      heroInk: v('--uv-hero-ink', 'rgba(255,242,222,.96)'),
      comet: v('--uv-comet', 'rgba(255,255,255,.5)'),
      cometInk: v('--uv-comet-ink', 'rgba(232,235,242,.6)'),
      dot: makeDotSprite(rgb),
      glow: makeGlowSprite(glowCoreRgb, glowRgb),
    };
  }
  let P = readPalette();
  document.addEventListener('themechange', () => { P = readPalette(); });

  // 三层视差星空：再降密度和亮度，别和恒星抢
  const LAYERS = [
    { f: 0.25, n: 70, rMax: 0.7, aMax: 0.13 },
    { f: 0.55, n: 30, rMax: 1.0, aMax: 0.22 },
    { f: 1.0, n: 14, rMax: 1.4, aMax: 0.34 },
  ];
  let starfields = [];
  function makeStarfields() {
    starfields = LAYERS.map(L => Array.from({ length: L.n }, () => ({
      x: RND() * (W + 80), y: RND() * (H + 80),
      r: 0.3 + RND() * L.rMax, a0: 0.12 + RND() * L.aMax,
      f: 0.3 + RND() * 1.2, p: RND() * Math.PI * 2,
    })));
  }

  // ---------- 相机 ----------
  const cam = { x: 0, y: 0, s: 1 };
  let W = 0, H = 0, fitScale = 1;
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    W = cv.clientWidth; H = cv.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    makeStarfields();
  }
  function fit() {
    // 包住全部星系（不含彗星轨道，彗星游进画面），留 8% 边距
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const g of galaxies) {
      const m = g.clusterR + 46;
      x0 = Math.min(x0, g.x - m); x1 = Math.max(x1, g.x + m);
      y0 = Math.min(y0, g.y - m); y1 = Math.max(y1, g.y + m);
    }
    cam.s = Math.min(W / ((x1 - x0) * 1.02), H / ((y1 - y0) * 1.02));
    fitScale = cam.s;
    // 星野占满画面约 80%，英雄星所在星系落在画面左 42%、上 46% 处
    cam.x = hero.g.x + 0.08 * W / cam.s;
    cam.y = hero.g.y + 0.04 * H / cam.s;
  }
  resize(); fit();
  // 调试机位：?universe&uzoom=2.5 → 以当前视点放大 N 倍（自查深缩放排版用）
  const zm = location.search.match(/uzoom=([\d.]+)/);
  if (zm) cam.s = fitScale * Math.min(20, +zm[1]);
  window.addEventListener('resize', () => { resize(); });

  const toScreen = (x, y) => [(x - cam.x) * cam.s + W / 2, (y - cam.y) * cam.s + H / 2];
  const toWorld = (sx, sy) => [(sx - W / 2) / cam.s + cam.x, (sy - H / 2) / cam.s + cam.y];
  // 全景紧凑、局部舒展：星团随缩放散开（fit 时 1x，深度缩放时最多 ~3x）
  const spreadF = () => 1 + 2.0 * Math.min(1, Math.max(0, (cam.s / fitScale - 1) / 4));

  // ---------- 交互 ----------
  let hover = null;
  let drag = null, moved = 0;
  let flyTo = null;

  cv.addEventListener('wheel', e => {
    e.preventDefault();
    flyTo = null;
    const [wx, wy] = toWorld(e.clientX, e.clientY);
    cam.s = Math.min(5, Math.max(0.04, cam.s * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
    cam.x = wx - (e.clientX - W / 2) / cam.s;
    cam.y = wy - (e.clientY - H / 2) / cam.s;
  }, { passive: false });

  cv.addEventListener('mousedown', e => { drag = { x: e.clientX, y: e.clientY }; moved = 0; });
  window.addEventListener('mouseup', () => { drag = null; });
  cv.addEventListener('mousemove', e => {
    if (drag) {
      moved += Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y);
      cam.x -= (e.clientX - drag.x) / cam.s;
      cam.y -= (e.clientY - drag.y) / cam.s;
      drag = { x: e.clientX, y: e.clientY };
      flyTo = null;
      return;
    }
    hover = pick(e.clientX, e.clientY);
    cv.style.cursor = hover ? 'pointer' : 'grab';
    if (hover && hover.kind !== 'galaxy') {
      const b = hover.b;
      tip.style.display = 'block';
      tip.style.left = (e.clientX + 14) + 'px';
      tip.style.top = (e.clientY + 10) + 'px';
      tip.textContent = `${b.title}${b.rt ? '｜' + (b.rt / 3600).toFixed(1) + 'h' : ''}${b.notes ? '｜笔记 ' + b.notes : ''}${hover.kind === 'comet' ? '｜离群书' : ''}`;
    } else if (hover) {
      tip.style.display = 'block';
      tip.style.left = (e.clientX + 14) + 'px';
      tip.style.top = (e.clientY + 10) + 'px';
      tip.textContent = `${hover.g.name}星系｜${hover.g.count} 本相关`;
    } else {
      tip.style.display = 'none';
    }
  });
  cv.addEventListener('mouseleave', () => { tip.style.display = 'none'; hover = null; });
  cv.addEventListener('click', e => {
    if (moved > 5) return;
    const hit = pick(e.clientX, e.clientY);
    if (!hit) { hooks.onClose(); return; }
    if (hit.kind === 'galaxy') hooks.onTheme(hit.g);
    else hooks.onBook(hit.b);
  });

  function pick(sx, sy) {
    const [wx, wy] = toWorld(sx, sy);
    let best = null, bestD = Infinity;
    const consider = (kind, x, y, r, payload) => {
      const d = Math.hypot(wx - x, wy - y);
      if (d < Math.max(r, 8 / cam.s) && d < bestD) { bestD = d; best = { kind, ...payload }; }
    };
    for (const s of stars) consider('star', s._x || 0, s._y || 0, s.r + 4, { b: s.b });
    for (const c of comets) consider('comet', c._x || 0, c._y || 0, c.r + 6, { b: c.b });
    for (const g of galaxies) consider('galaxy', g.x, g.y, g.clusterR * spreadF() + 24, { g });
    return best;
  }

  // 搜索：命中提亮 + 强制出标签 + 飞到第一本
  let matches = new Set();
  document.getElementById('usearch').addEventListener('input', ev => {
    const q = ev.target.value.trim();
    matches = new Set(q ? U.books.filter(b => b.title.includes(q)).map(b => b.id) : []);
    const first = U.books.find(b => matches.has(b.id));
    if (first) {
      const s = stars.find(s => s.b === first) || comets.find(c => c.b === first);
      if (s && s._x !== undefined) flyTo = { x: s._x, y: s._y, s: Math.max(cam.s, fitScale * 7) };
    }
  });

  // ---------- 标签：分级显示 + 矩形碰撞避让 ----------
  const overlap = (a, b) =>
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  // ---------- 渲染 ----------
  const labelOrder = [...stars].sort((a, b) => b.b.rt - a.b.rt);
  function draw(t) {
    if (flyTo) {
      cam.x += (flyTo.x - cam.x) * 0.08;
      cam.y += (flyTo.y - cam.y) * 0.08;
      cam.s += (flyTo.s - cam.s) * 0.08;
      if (Math.hypot(flyTo.x - cam.x, flyTo.y - cam.y) < 2) flyTo = null;
    }

    // 纯黑底（亮色主题下为纸白底，配色见 readPalette）
    ctx.fillStyle = P.bg;
    ctx.fillRect(0, 0, W, H);

    // 三层视差星空（稀疏、单色、微闪烁）
    LAYERS.forEach((L, li) => {
      const tw = W + 80, th = H + 80;
      for (const p of starfields[li]) {
        let sx = (p.x - cam.x * cam.s * L.f * 0.35) % tw; if (sx < 0) sx += tw;
        let sy = (p.y - cam.y * cam.s * L.f * 0.35) % th; if (sy < 0) sy += th;
        const a = p.a0 * (0.55 + 0.45 * Math.sin(t * p.f + p.p));
        if (a <= 0.02) continue;
        ctx.fillStyle = P.star(a.toFixed(3));
        ctx.beginPath(); ctx.arc(sx - 40, sy - 40, p.r, 0, 7); ctx.fill();
      }
    });

    const spread = spreadF();
    const zoomRatio = cam.s / fitScale;
    const placed = [];

    // 邻近星系勾连线：极暗极细，把星野连成一片（压到极低，避免在标签上读出划痕）
    ctx.strokeStyle = P.hairline;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    for (const [a, b] of galLinks) {
      const [ax, ay] = toScreen(a.x, a.y);
      const [bx, by] = toScreen(b.x, b.y);
      ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
    }
    ctx.stroke();

    // 星系字标：极暗小灰字「xx星系」，浮在收紧的星团正上方。
    // 全景全部显示，矩形碰撞避让（大的优先，挤不下的让位）
    ctx.textAlign = 'center';
    try { ctx.letterSpacing = '4px'; } catch (_) {}
    for (const g of galaxies) {
      const [sx, sy] = toScreen(g.x, g.y);
      if (sx < -120 || sx > W + 120 || sy < -40 || sy > H + 40) continue;
      const topOff = g.clusterR * spread * 0.78 * cam.s + 16;
      const name = `${g.name}星系`;
      const w = (name.length + 1) * 15;
      const box = { x: sx - w / 2, y: sy - topOff - 14, w, h: 18 };
      if (placed.some(p => overlap(p, box))) continue;
      placed.push(box);
      ctx.font = `11px ${SERIF}`;
      ctx.fillStyle = P.galaxyLabel;
      ctx.fillText(name, sx, sy - topOff);
    }
    try { ctx.letterSpacing = '0px'; } catch (_) {}

    // 更新恒星位置
    for (const s of labelOrder) {
      s.ang += s.speed * 0.016;
      s._x = s.g.x + Math.cos(s.ang) * s.orbit * spread;
      s._y = s.g.y + Math.sin(s.ang) * s.orbit * spread * 0.78;
    }

    // 星座连线：深缩放进某个星系时，同星系星之间极暗极细的线
    if (zoomRatio > 2.4) {
      ctx.strokeStyle = P.constellation;
      ctx.lineWidth = 0.6;
      const byGal = {};
      for (const s of stars) (byGal[s.g.name] = byGal[s.g.name] || []).push(s);
      for (const arr of Object.values(byGal)) {
        const sorted = [...arr].sort((a, b) => a.ang - b.ang);
        ctx.beginPath();
        for (let i = 0; i < sorted.length; i++) {
          const a = sorted[i], b = sorted[(i + 1) % sorted.length];
          const [ax, ay] = toScreen(a._x, a._y);
          const [bx, by] = toScreen(b._x, b._y);
          if (ax < -40 || ax > W + 40 || ay < -40 || ay > H + 40) continue;
          ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
        }
        ctx.stroke();
      }
    }

    // 恒星：白色软光点 + 分级书名标签
    for (const s of labelOrder) {
      const [sx, sy] = toScreen(s._x, s._y);
      if (sx < -60 || sx > W + 60 || sy < -60 || sy > H + 60) continue;
      // 屏幕半径上限：防止深缩放时大星糊成毛球
      const r = Math.min(8.5, Math.max(1.6, s.r * cam.s * 1.5));
      const isHero = s === hero;
      const hot = matches.has(s.b.id) || (hover && hover.b === s.b);
      const twk = 0.85 + 0.15 * Math.sin(t * s.twf + s.twp);
      if (isHero) {
        // 最亮的星，不是探照灯：光晕半径和透明度都克制
        const gs = Math.max(40, r * 10);
        ctx.globalAlpha = 0.5;
        ctx.drawImage(P.glow, sx - gs / 2, sy - gs / 2, gs, gs);
        ctx.globalAlpha = 1;
      }
      const d = r * (isHero ? 5 : 4);
      ctx.globalAlpha = Math.min(1, s.light * twk * (hot ? 1 : 0.92));
      ctx.drawImage(P.dot, sx - d / 2, sy - d / 2, d, d);
      // 实心核：保证低缩放下星点锐利，不糊成一团
      ctx.beginPath(); ctx.arc(sx, sy, Math.max(0.7, r * 0.42), 0, 7); ctx.fillStyle = P.core; ctx.fill();
      ctx.globalAlpha = 1;
      if (hot) {
        ctx.strokeStyle = P.hotring; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(sx, sy, r + 3.5, 0, 7); ctx.stroke();
      }
      // 标签分级：全景给每个 ≥3 书星系的时长 top1（≥10 书的星系加 top2）
      // + 英雄星 + 全局 top3 + 搜索命中，碰撞避让控密度；放大后逐级浮现
      const visible = hot || isHero || s.rank < 3
        || (s.galRank === 0 && s.g.n >= 3)
        || (s.galRank === 1 && s.g.n >= 10)
        || (s.galRank < 2 && zoomRatio > 1.35)
        || zoomRatio > 1.7 + s.galRank * 0.35;
      if (!visible) continue;
      const fs = isHero ? 16 : s.rank < 3 ? 12 : 11;
      const font = `${fs}px ${SERIF}`;
      const w = s.b.title.length * fs + 16;
      const box = { x: sx + r + 5, y: sy - fs * 0.4 - 3, w, h: fs + 10 };
      if (!(hot || isHero) && placed.some(p => overlap(p, box))) continue;
      placed.push(box);
      ctx.font = font;
      ctx.textAlign = 'left';
      ctx.fillStyle = hot ? P.hotInk
        : isHero ? P.heroInk
        : P.label((0.36 + s.light * 0.28).toFixed(2));
      ctx.fillText(s.b.title, box.x, sy + fs * 0.36);
    }

    // 彗星：细白渐隐尾巴 + 小点，克制
    for (const c of comets) {
      c.ang += c.speed * 0.016;
      c._x = Math.cos(c.ang) * c.orbit;
      c._y = Math.sin(c.ang) * c.orbit * 0.74;
      const [sx, sy] = toScreen(c._x, c._y);
      if (sx < -200 || sx > W + 200 || sy < -200 || sy > H + 200) continue;
      const vx = -Math.sin(c.ang), vy = Math.cos(c.ang) * 0.74;
      const vl = Math.hypot(vx, vy);
      const tx = -vx / vl, ty = -vy / vl;
      const len = 110 * cam.s;
      const grad = ctx.createLinearGradient(sx, sy, sx + tx * len, sy + ty * len);
      grad.addColorStop(0, P.comet);
      grad.addColorStop(1, P.star(0));
      ctx.strokeStyle = grad;
      ctx.lineWidth = Math.max(0.8, 1.2 * cam.s);
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(sx, sy);
      ctx.lineTo(sx + tx * len, sy + ty * len); ctx.stroke();
      const r = Math.max(1.6, c.r * cam.s);
      const d = r * 5;
      ctx.globalAlpha = 0.95;
      ctx.drawImage(P.dot, sx - d / 2, sy - d / 2, d, d);
      ctx.globalAlpha = 1;
      const hot = matches.has(c.b.id) || (hover && hover.b === c.b);
      if (hot || cam.s > 0.35) {
        ctx.font = `11px ${SERIF}`;
        ctx.fillStyle = hot ? P.hotInk : P.cometInk;
        ctx.textAlign = 'left';
        ctx.fillText(c.b.title, sx + r + 5, sy + 4);
      }
    }
  }

  let t0 = performance.now();
  (function loop(now) {
    draw((now - t0) / 1000);
    requestAnimationFrame(loop);
  })(t0);

  document.getElementById('ustats').textContent =
    `${U.stats.books} 颗星 · ${U.stats.themes} 个星系 · ${U.stats.comets} 颗彗星 · ${U.stats.totalHours} 小时`;
}
