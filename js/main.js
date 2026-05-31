/* ===========================================================
 * LabGraph — main.js
 * 전역 상태, 탭 전환, 논문 프리셋, 종합 다운로드(PNG/SVG/PDF), 공용 유틸
 * 네임스페이스: window.LabGraph
 * =========================================================== */
(function () {
  'use strict';

  const LG = (window.LabGraph = window.LabGraph || {});

  /* ---------- 공용 유틸 ---------- */
  LG.util = {
    drawIcons() {
      try {
        if (typeof lucide !== 'undefined' && lucide && typeof lucide.createIcons === 'function') {
          lucide.createIcons();
        }
      } catch (e) { /* 아이콘 실패는 무시 */ }
    },
    // 회귀 모델 모음 (vi.js / custom.js 공용)
    regression: {
      linear(pts) {
        const N = pts.length; if (N < 2) return null;
        let sx = 0, sy = 0, sxy = 0, sxx = 0;
        for (const p of pts) { sx += p.x; sy += p.y; sxy += p.x * p.y; sxx += p.x * p.x; }
        const d = N * sxx - sx * sx; if (Math.abs(d) < 1e-12) return null;
        const a = (N * sxy - sx * sy) / d, b = (sy - a * sx) / N;
        return { type: 'linear', coef: { a, b }, fn: (x) => a * x + b,
          eq: `y = ${a.toFixed(4)}x ${b >= 0 ? '+' : '−'} ${Math.abs(b).toFixed(4)}` };
      },
      quadratic(pts) {
        const N = pts.length; if (N < 3) return null;
        let S0 = N, S1 = 0, S2 = 0, S3 = 0, S4 = 0, T0 = 0, T1 = 0, T2 = 0;
        for (const p of pts) { const x = p.x, y = p.y, x2 = x * x; S1 += x; S2 += x2; S3 += x2 * x; S4 += x2 * x2; T0 += y; T1 += x * y; T2 += x2 * y; }
        const M = [[S0, S1, S2, T0], [S1, S2, S3, T1], [S2, S3, S4, T2]];
        for (let i = 0; i < 3; i++) {
          let piv = i; for (let r = i + 1; r < 3; r++) if (Math.abs(M[r][i]) > Math.abs(M[piv][i])) piv = r;
          [M[i], M[piv]] = [M[piv], M[i]];
          if (Math.abs(M[i][i]) < 1e-12) return null;
          for (let r = 0; r < 3; r++) { if (r === i) continue; const f = M[r][i] / M[i][i]; for (let cc = i; cc < 4; cc++) M[r][cc] -= f * M[i][cc]; }
        }
        const c = M[0][3] / M[0][0], b = M[1][3] / M[1][1], a = M[2][3] / M[2][2];
        return { type: 'quadratic', coef: { a, b, c }, fn: (x) => a * x * x + b * x + c,
          eq: `y = ${a.toFixed(4)}x² ${b >= 0 ? '+' : '−'} ${Math.abs(b).toFixed(4)}x ${c >= 0 ? '+' : '−'} ${Math.abs(c).toFixed(4)}` };
      },
      exponential(pts) { // y = a e^(bx)
        const f = pts.filter(p => p.y > 0).map(p => ({ x: p.x, y: Math.log(p.y) }));
        const r = LG.util.regression.linear(f); if (!r) return null;
        const a = Math.exp(r.coef.b), b = r.coef.a;
        return { type: 'exponential', coef: { a, b }, fn: (x) => a * Math.exp(b * x),
          eq: `y = ${a.toFixed(4)}·e^(${b.toFixed(4)}x)` };
      },
      logarithmic(pts) { // y = a ln(x) + b
        const f = pts.filter(p => p.x > 0).map(p => ({ x: Math.log(p.x), y: p.y }));
        const r = LG.util.regression.linear(f); if (!r) return null;
        const a = r.coef.a, b = r.coef.b;
        return { type: 'logarithmic', coef: { a, b }, fn: (x) => a * Math.log(x) + b,
          eq: `y = ${a.toFixed(4)}·ln(x) ${b >= 0 ? '+' : '−'} ${Math.abs(b).toFixed(4)}` };
      },
      fit(model, pts) {
        const m = LG.util.regression[model];
        if (!m) return null;
        const res = m(pts);
        if (!res) return null;
        res.r2 = LG.util.rSquared(pts, res.fn);
        return res;
      },
    },
    rSquared(pts, fn) {
      const ys = pts.map(p => p.y);
      if (!ys.length) return 0;
      const m = ys.reduce((s, v) => s + v, 0) / ys.length;
      let sr = 0, st = 0;
      for (const p of pts) { const f = fn(p.x); if (isNaN(f)) continue; sr += (p.y - f) ** 2; st += (p.y - m) ** 2; }
      return st > 0 ? 1 - sr / st : 1;
    },
    // 곡선 샘플링 (추세선 그리기용)
    sampleCurve(fn, xmin, xmax, n = 120) {
      const out = [];
      for (let k = 0; k <= n; k++) {
        const x = xmin + (xmax - xmin) * k / n;
        const y = fn(x);
        if (isFinite(y)) out.push({ x, y });
      }
      return out;
    },
  };

  /* ---------- 차트 전역 설정 + 흰배경 플러그인 ---------- */
  Chart.defaults.font.family = '"IBM Plex Sans KR", "IBM Plex Sans", "Apple SD Gothic Neo", sans-serif';
  Chart.defaults.font.size = 11;
  Chart.defaults.color = '#a8a29e';
  Chart.defaults.layout = { padding: { top: 12, right: 18, bottom: 8, left: 8 } };

  const whiteBgPlugin = {
    id: 'whiteBg',
    beforeDraw(chart) {
      const { ctx, width, height } = chart;
      ctx.save();
      ctx.globalCompositeOperation = 'destination-over';
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    },
  };
  Chart.register(whiteBgPlugin);

  // 오차막대 플러그인 (커스텀 그래프용). 데이터셋에 errorBars:[{x,y,e}] 가 있으면 캡 달린 수직선 렌더.
  const errorBarPlugin = {
    id: 'errorBars',
    afterDatasetsDraw(chart) {
      const { ctx, scales } = chart;
      chart.data.datasets.forEach((ds) => {
        if (!ds._errorBars || !ds._errorBars.length) return;
        ctx.save();
        ctx.strokeStyle = ds.borderColor || '#1a1a1a';
        ctx.lineWidth = 1.2;
        const cap = 4;
        ds._errorBars.forEach((eb) => {
          if (eb.e == null || isNaN(eb.e) || eb.e === 0) return;
          const x = scales.x.getPixelForValue(eb.x);
          const yTop = scales.y.getPixelForValue(eb.y + eb.e);
          const yBot = scales.y.getPixelForValue(eb.y - eb.e);
          ctx.beginPath();
          ctx.moveTo(x, yTop); ctx.lineTo(x, yBot);
          ctx.moveTo(x - cap, yTop); ctx.lineTo(x + cap, yTop);
          ctx.moveTo(x - cap, yBot); ctx.lineTo(x + cap, yBot);
          ctx.stroke();
        });
        ctx.restore();
      });
    },
  };
  Chart.register(errorBarPlugin);
  LG.plugins = { whiteBgPlugin, errorBarPlugin };

  /* ---------- COLOR 팔레트 (프리셋별 갱신) ---------- */
  LG.COLOR = { s: '#1a1a1a', v: '#44403c', a: '#57534e' };
  LG.palette = ['#1a1a1a', '#57534e', '#a8a29e', '#78716c', '#c4c0bb'];

  /* ---------- 논문 스타일 프리셋 ---------- */
  const PRESETS = {
    report: {
      label: '학부 레포트',
      font: '"IBM Plex Sans KR", "IBM Plex Sans", "Apple SD Gothic Neo", sans-serif',
      lineWidth: 1.8, pointRadius: 4, gridColor: '#f0efed', grid: true, legendPos: 'bottom',
      palette: ['#1a1a1a', '#57534e', '#a8a29e', '#78716c', '#c4c0bb'],
      pointStyles: ['circle', 'rect', 'triangle', 'rectRot', 'cross'],
    },
    nature: {
      label: 'Nature',
      font: 'Spectral, "Times New Roman", serif',
      lineWidth: 1.2, pointRadius: 3, gridColor: '#f3f3f1', grid: false, legendPos: 'top',
      palette: ['#0b1f3a', '#e64b35', '#4dbbd5', '#00a087', '#3c5488'],
      pointStyles: ['circle', 'circle', 'circle', 'circle', 'circle'],
    },
    ieee: {
      label: 'IEEE',
      font: 'Helvetica, Arial, sans-serif',
      lineWidth: 2.4, pointRadius: 5, gridColor: '#d6d3d1', grid: true, legendPos: 'top',
      palette: ['#000000', '#404040', '#808080', '#000000', '#404040'],
      pointStyles: ['circle', 'rect', 'triangle', 'rectRot', 'cross'],
    },
  };
  LG.currentPreset = 'report';
  LG.preset = () => PRESETS[LG.currentPreset];

  LG.applyPreset = function (key) {
    if (!PRESETS[key]) return;
    LG.currentPreset = key;
    const p = PRESETS[key];
    // Chart.js 전역 기본값 갱신
    Chart.defaults.font.family = p.font;
    LG.palette = p.palette.slice();
    LG.COLOR = { s: p.palette[0], v: p.palette[1], a: p.palette[2] };
    // body 테마 클래스
    document.body.classList.remove('theme-report', 'theme-nature', 'theme-ieee');
    document.body.classList.add('theme-' + key);
    // 칩 활성표시
    document.querySelectorAll('[data-preset-style]').forEach(b => {
      b.classList.toggle('active', b.dataset.presetStyle === key);
    });
    // 각 모듈에 재렌더 요청
    ['Motion', 'Titration', 'VI', 'Custom'].forEach(mod => {
      if (LG[mod] && typeof LG[mod].applyTheme === 'function') LG[mod].applyTheme(p);
    });
  };

  // 차트 인스턴스에 프리셋 적용하는 헬퍼 (각 모듈에서 호출)
  LG.styleChart = function (chart, p, opts) {
    opts = opts || {};
    p = p || LG.preset();
    chart.data.datasets.forEach((ds, i) => {
      if (ds.type === 'scatter' || ds._isScatter) {
        ds.pointRadius = p.pointRadius;
        if (opts.pointStyles !== false) ds.pointStyle = p.pointStyles[i % p.pointStyles.length];
      } else if (ds.type === 'bar') {
        // bar 유지
      } else {
        ds.borderWidth = p.lineWidth;
      }
    });
    if (chart.options.scales) {
      Object.values(chart.options.scales).forEach(sc => {
        if (sc.grid) sc.grid.display = p.grid;
        if (sc.grid && p.grid) sc.grid.color = p.gridColor;
      });
    }
    if (chart.options.plugins && chart.options.plugins.legend) {
      chart.options.plugins.legend.position = p.legendPos;
    }
  };

  /* ---------- 탭 전환 ---------- */
  const TAB_META = {
    custom:    { title: '커스텀',       subtitle: '사용자 정의 데이터 시각화 · 추세선 · 오차막대' },
    motion:    { title: '운동 그래프',  subtitle: '시간에 따른 변위·속도·가속도 및 2차원 궤적' },
    titration: { title: '산-염기 적정', subtitle: '적정 부피에 따른 pH 변화 곡선과 중화점' },
    vi:        { title: 'V-I 그래프',   subtitle: '전압-전류 특성 및 회귀 분석' },
  };
  LG.currentTab = 'custom';

  LG.switchTab = function (tabId) {
    document.querySelectorAll('[data-tab]').forEach((t) => {
      const a = t.dataset.tab === tabId;
      t.classList.toggle('tab-active', a);
      t.setAttribute('aria-selected', a ? 'true' : 'false');
    });
    document.querySelectorAll('[data-panel-sidebar]').forEach((pl) => pl.classList.toggle('hidden', pl.dataset.panelSidebar !== tabId));
    document.querySelectorAll('[data-panel-main]').forEach((pl) => {
      const a = pl.dataset.panelMain === tabId;
      pl.classList.toggle('hidden', !a);
      if (a) { pl.classList.remove('panel-enter'); void pl.offsetWidth; pl.classList.add('panel-enter'); }
    });
    const meta = TAB_META[tabId];
    if (meta) {
      document.getElementById('main-title').textContent = meta.title;
      document.getElementById('main-subtitle').textContent = meta.subtitle;
    }
    LG.currentTab = tabId;
    if (tabId === 'motion' && LG.Motion) LG.Motion.ensure();
    if (tabId === 'titration' && LG.Titration) LG.Titration.ensure();
    if (tabId === 'vi' && LG.VI) LG.VI.ensure();
    if (tabId === 'custom' && LG.Custom) LG.Custom.ensure();
  };

  /* ---------- 종합 다운로드 (PNG / SVG / PDF) ---------- */
  // 각 모듈은 LG.exporters[tab] = () => ({ charts:[...], name:'...' }) 형태로 등록
  LG.exporters = {};
  LG.getActiveExport = function () {
    const f = LG.exporters[LG.currentTab];
    return f ? f() : { charts: [], name: 'graph' };
  };

  function triggerDownload(url, filename) {
    const a = document.createElement('a'); a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
  }
  function chartToHiRes(chart, scale) {
    const prev = chart.options.devicePixelRatio;
    chart.options.devicePixelRatio = scale;
    chart.resize(); chart.draw();
    const src = chart.canvas;
    const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(src, 0, 0);
    chart.options.devicePixelRatio = prev; chart.resize();
    return c;
  }
  function composePNG(charts, scale) {
    const cs = charts.filter(Boolean).map(ch => chartToHiRes(ch, scale));
    if (!cs.length) return null;
    const W = Math.max(...cs.map(c => c.width));
    const gap = 28 * scale;
    const H = cs.reduce((s, c) => s + c.height, 0) + gap * (cs.length - 1);
    const out = document.createElement('canvas'); out.width = W; out.height = H;
    const ctx = out.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
    let y = 0;
    for (const c of cs) { ctx.drawImage(c, Math.round((W - c.width) / 2), y); y += c.height + gap; }
    return out;
  }

  // SVG: 각 차트를 <image>(고해상도 PNG 데이터)로 감싼 벡터 컨테이너 SVG로 출력.
  // (Chart.js는 캔버스 기반이므로, 무손실 확대가 가능한 SVG 래퍼에 고해상도 래스터를 임베드)
  function buildSVG(charts, scale) {
    const cs = charts.filter(Boolean).map(ch => chartToHiRes(ch, scale));
    if (!cs.length) return null;
    const W = Math.max(...cs.map(c => c.width));
    const gap = 28 * scale;
    const H = cs.reduce((s, c) => s + c.height, 0) + gap * (cs.length - 1);
    let body = '', y = 0;
    for (const c of cs) {
      const x = Math.round((W - c.width) / 2);
      body += `<image x="${x}" y="${y}" width="${c.width}" height="${c.height}" href="${c.toDataURL('image/png')}"/>`;
      y += c.height + gap;
    }
    return `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
      `<rect width="100%" height="100%" fill="#ffffff"/>${body}</svg>`;
  }

  LG.export = function (format, filename) {
    const { charts } = LG.getActiveExport();
    if (!charts.filter(Boolean).length) return;
    const scale = 3;
    if (format === 'png') {
      const out = composePNG(charts, scale);
      if (out) triggerDownload(out.toDataURL('image/png'), filename.replace(/\.[a-z]+$/i, '') + '.png');
    } else if (format === 'svg') {
      const svg = buildSVG(charts, scale);
      if (svg) {
        const blob = new Blob([svg], { type: 'image/svg+xml' });
        triggerDownload(URL.createObjectURL(blob), filename.replace(/\.[a-z]+$/i, '') + '.svg');
      }
    } else if (format === 'pdf') {
      const out = composePNG(charts, scale);
      if (!out) return;
      const img = out.toDataURL('image/png');
      if (typeof window.jspdf === 'undefined') { alert('PDF 라이브러리를 불러오지 못했습니다.'); return; }
      const { jsPDF } = window.jspdf;
      const pxToMm = 25.4 / (96 * scale); // 백킹 스케일 보정
      const wMm = out.width * pxToMm, hMm = out.height * pxToMm;
      const pdf = new jsPDF({ orientation: wMm > hMm ? 'landscape' : 'portrait', unit: 'mm', format: [wMm, hMm] });
      pdf.addImage(img, 'PNG', 0, 0, wMm, hMm);
      pdf.save(filename.replace(/\.[a-z]+$/i, '') + '.pdf');
    }
  };

  /* ---------- 다운로드 모달 ---------- */
  function openDownloadDialog() {
    const ex = LG.getActiveExport();
    if (!ex.charts.filter(Boolean).length) return;
    const overlay = document.getElementById('dl-overlay');
    const input = document.getElementById('dl-filename');
    input.value = ex.name;
    overlay.classList.remove('hidden'); overlay.classList.add('flex');
    setTimeout(() => { input.focus(); input.select(); }, 0);

    let fmt = 'png';
    const fmtBtns = overlay.querySelectorAll('[data-fmt]');
    fmtBtns.forEach(b => b.classList.toggle('active', b.dataset.fmt === 'png'));

    const close = () => {
      overlay.classList.add('hidden'); overlay.classList.remove('flex');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', close);
      input.removeEventListener('keydown', onKey);
      overlay.removeEventListener('click', onBackdrop);
      fmtBtns.forEach(b => b.removeEventListener('click', onFmt));
    };
    const onFmt = (e) => { fmt = e.currentTarget.dataset.fmt; fmtBtns.forEach(b => b.classList.toggle('active', b === e.currentTarget)); };
    const onOk = () => {
      let fn = (input.value || ex.name).trim().replace(/[\\/:*?"<>|]/g, '_');
      if (!fn) fn = ex.name;
      close();
      LG.export(fmt, fn);
    };
    const onKey = (e) => { if (e.key === 'Enter') onOk(); else if (e.key === 'Escape') close(); };
    const onBackdrop = (e) => { if (e.target === overlay) close(); };
    const okBtn = document.getElementById('dl-ok');
    const cancelBtn = document.getElementById('dl-cancel');
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', close);
    input.addEventListener('keydown', onKey);
    overlay.addEventListener('click', onBackdrop);
    fmtBtns.forEach(b => b.addEventListener('click', onFmt));
  }

  /* ---------- 초기 부트스트랩 ---------- */
  LG.init = function () {
    // 탭 클릭
    document.querySelectorAll('[data-tab]').forEach((t) => t.addEventListener('click', () => LG.switchTab(t.dataset.tab)));
    // 프리셋 칩
    document.querySelectorAll('[data-preset-style]').forEach((b) => b.addEventListener('click', () => LG.applyPreset(b.dataset.presetStyle)));
    // 다운로드 / 초기화
    document.getElementById('btn-download').addEventListener('click', openDownloadDialog);
    document.getElementById('btn-reset').addEventListener('click', () => {
      const mod = { motion: 'Motion', titration: 'Titration', vi: 'VI', custom: 'Custom' }[LG.currentTab];
      if (mod && LG[mod] && LG[mod].reset) LG[mod].reset();
    });

    // 각 모듈 초기화
    if (LG.Motion) LG.Motion.init();
    if (LG.Titration) LG.Titration.init();
    if (LG.VI) LG.VI.init();
    if (LG.Custom) LG.Custom.init();

    LG.applyPreset('report');
    LG.switchTab('custom');
    LG.util.drawIcons();

    // 폰트 로드 후 전 차트 갱신
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        ['Motion', 'Titration', 'VI', 'Custom'].forEach(m => { if (LG[m] && LG[m].refresh) LG[m].refresh(); });
      });
    }
  };

  document.addEventListener('DOMContentLoaded', LG.init);
})();
