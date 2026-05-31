/* ===========================================================
 * LabGraph — titration.js
 * 산-염기 적정: 전하 균형 이분법 pH 계산, 1차 미분, 중화점 검출
 * =========================================================== */
(function () {
  'use strict';
  const LG = (window.LabGraph = window.LabGraph || {});
  const Kw = 1e-14;
  const KIND_KO = { strong_acid: '강산', weak_acid: '약산', strong_base: '강염기', weak_base: '약염기' };

  const Titration = {
    inited: false, mode: 'sim', showDeriv: false,
    phChart: null, derivChart: null,
    analyte: { kind: 'weak_acid', name: 'CH₃COOH', conc: 0.1, vol: 25, n: 1, pK: 4.76 },
    titrant: { kind: 'strong_base', name: 'NaOH', conc: 0.1, vol: 50, n: 1, pK: 0 },
    exp: [],

    defaultsExp() {
      return [{ v: 0, pH: 2.87 }, { v: 5, pH: 4.14 }, { v: 10, pH: 4.57 }, { v: 12.5, pH: 4.74 },
        { v: 20, pH: 5.35 }, { v: 24, pH: 6.13 }, { v: 24.9, pH: 7.0 }, { v: 25, pH: 8.72 },
        { v: 25.1, pH: 10.0 }, { v: 26, pH: 11.0 }, { v: 30, pH: 11.75 }, { v: 40, pH: 12.2 }];
    },

    /* ---- 화학 ---- */
    toComponent(sub, volML, VtotL) {
      const C = sub.conc * (volML / 1000) / VtotL;
      if (!(C > 0)) return null;
      const n = (sub.n > 0) ? sub.n : 1;
      if (sub.kind === 'strong_acid') return { role: 'sa', charge: n * C };
      if (sub.kind === 'strong_base') return { role: 'sb', charge: n * C };
      if (sub.kind === 'weak_acid') return { role: 'wa', C: n * C, Ka: Math.pow(10, -sub.pK) };
      if (sub.kind === 'weak_base') return { role: 'wb', C: n * C, Ka: Math.pow(10, sub.pK - 14) };
      return null;
    },
    solvePH(comps) {
      const f = (pH) => {
        const h = Math.pow(10, -pH);
        let pos = h, neg = Kw / h;
        for (const c of comps) {
          if (c.role === 'sa') neg += c.charge;
          else if (c.role === 'sb') pos += c.charge;
          else if (c.role === 'wa') neg += c.C * c.Ka / (c.Ka + h);
          else if (c.role === 'wb') pos += c.C * h / (h + c.Ka);
        }
        return pos - neg;
      };
      let lo = -2, hi = 16;
      for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (f(m) > 0) lo = m; else hi = m; }
      return (lo + hi) / 2;
    },
    simulate() {
      const Va = this.analyte.vol, Vmax = this.titrant.vol;
      if (!(Va > 0) || !(Vmax > 0)) return [];
      const N = 400, pts = [];
      for (let k = 0; k <= N; k++) {
        const Vb = Vmax * k / N;
        const VtotL = (Va + Vb) / 1000;
        const comps = [this.toComponent(this.analyte, Va, VtotL), this.toComponent(this.titrant, Vb, VtotL)].filter(Boolean);
        pts.push({ x: Vb, y: this.solvePH(comps) });
      }
      return pts;
    },
    findEquivalence(pts) {
      if (pts.length < 3) return null;
      const deriv = []; let best = -1, idx = -1;
      for (let i = 1; i < pts.length; i++) {
        const dV = pts[i].x - pts[i - 1].x;
        const d = dV !== 0 ? (pts[i].y - pts[i - 1].y) / dV : 0;
        deriv.push({ x: (pts[i].x + pts[i - 1].x) / 2, y: d });
        if (Math.abs(d) > best) { best = Math.abs(d); idx = i; }
      }
      if (idx < 1) return { deriv, Veq: null, pHeq: null };
      return { deriv, Veq: (pts[idx].x + pts[idx - 1].x) / 2, pHeq: (pts[idx].y + pts[idx - 1].y) / 2 };
    },
    points() {
      if (this.mode === 'sim') return this.simulate();
      return this.exp.filter(d => !isNaN(d.v) && !isNaN(d.pH)).map(d => ({ x: d.v, y: d.pH })).sort((a, b) => a.x - b.x);
    },

    /* ---- 중화점 마커 플러그인 ---- */
    roundRect(ctx, x, y, w, h, r) {
      if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); return; }
      ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    },
    equivPlugin() {
      const self = this;
      return {
        id: 'equiv',
        afterDraw(chart) {
          const eq = chart.$equivalence; if (!eq || eq.Veq == null) return;
          const { ctx, chartArea, scales } = chart;
          const x = scales.x.getPixelForValue(eq.Veq);
          if (x < chartArea.left || x > chartArea.right) return;
          ctx.save();
          ctx.setLineDash([5, 4]); ctx.lineWidth = 1.2; ctx.strokeStyle = '#1a1a1a';
          ctx.beginPath(); ctx.moveTo(x, chartArea.top); ctx.lineTo(x, chartArea.bottom); ctx.stroke();
          ctx.setLineDash([]);
          if (eq.pHeq != null) {
            const y = scales.y.getPixelForValue(eq.pHeq);
            ctx.beginPath(); ctx.arc(x, y, 4, 0, 2 * Math.PI); ctx.fillStyle = '#1a1a1a'; ctx.fill();
            ctx.lineWidth = 1.5; ctx.strokeStyle = '#fff'; ctx.stroke();
          }
          const label = eq.label || '';
          ctx.font = '600 11px "IBM Plex Sans KR", sans-serif';
          const padX = 7, h = 19, tw = ctx.measureText(label).width;
          let bx = x + 8; const by = chartArea.top + 6;
          if (bx + tw + padX * 2 > chartArea.right) bx = x - 8 - (tw + padX * 2);
          ctx.fillStyle = '#1a1a1a'; self.roundRect(ctx, bx, by, tw + padX * 2, h, 6); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.fillText(label, bx + padX, by + h / 2 + 0.5);
          ctx.restore();
        },
      };
    },

    initCharts() {
      const plugin = this.equivPlugin();
      this.phChart = new Chart(document.getElementById('chart-ph').getContext('2d'), {
        type: 'line',
        data: { datasets: [{ data: [], borderColor: '#1a1a1a', borderWidth: 1.8, pointRadius: 0, pointBackgroundColor: '#1a1a1a', tension: 0, fill: false }] },
        options: {
          responsive: true, maintainAspectRatio: false, animation: false,
          plugins: { legend: { display: false }, tooltip: { backgroundColor: '#1a1a1a', padding: 8, displayColors: false,
            callbacks: { title: (it) => `V = ${(+it[0].parsed.x).toFixed(2)} mL`, label: (it) => `pH = ${(+it.parsed.y).toFixed(2)}` } } },
          scales: {
            x: { type: 'linear', min: 0, title: { display: true, text: '적정액 부피 V (mL)', font: { size: 10 } }, grid: { color: '#f0efed' }, ticks: { font: { size: 10 } } },
            y: { min: 0, max: 14, title: { display: true, text: 'pH', font: { size: 10 } }, grid: { color: (c) => (c.tick.value === 7 ? '#d6d3d1' : '#f0efed') }, ticks: { stepSize: 2, font: { size: 10 } } },
          },
        },
        plugins: [plugin],
      });
      this.derivChart = new Chart(document.getElementById('chart-deriv').getContext('2d'), {
        type: 'line',
        data: { datasets: [{ data: [], borderColor: '#57534e', borderWidth: 1.6, pointRadius: 0, tension: 0, fill: false }] },
        options: {
          responsive: true, maintainAspectRatio: false, animation: false,
          plugins: { legend: { display: false }, tooltip: { backgroundColor: '#1a1a1a', padding: 8, displayColors: false,
            callbacks: { title: (it) => `V = ${(+it[0].parsed.x).toFixed(2)} mL`, label: (it) => `d(pH)/dV = ${(+it.parsed.y).toFixed(3)}` } } },
          scales: {
            x: { type: 'linear', min: 0, title: { display: true, text: '적정액 부피 V (mL)', font: { size: 10 } }, grid: { color: '#f0efed' }, ticks: { font: { size: 10 } } },
            y: { title: { display: true, text: 'd(pH)/dV', font: { size: 10 } }, grid: { color: '#f0efed' }, ticks: { font: { size: 10 } } },
          },
        },
        plugins: [plugin],
      });
    },

    update() {
      if (!this.inited) return;
      const pts = this.points();
      const xmax = pts.length ? Math.max(...pts.map(p => p.x)) : 10;
      const eq = this.findEquivalence(pts);
      this.phChart.data.datasets[0].data = pts;
      this.phChart.data.datasets[0].pointRadius = (this.mode === 'exp') ? 3 : 0;
      this.phChart.options.scales.x.max = xmax > 0 ? xmax : 10;
      this.phChart.$equivalence = (eq && eq.Veq != null) ? { Veq: eq.Veq, pHeq: eq.pHeq, label: `중화점 ${eq.Veq.toFixed(1)} mL · pH ${eq.pHeq.toFixed(2)}` } : null;
      this.phChart.update('none');
      this.derivChart.data.datasets[0].data = eq ? eq.deriv : [];
      this.derivChart.options.scales.x.max = xmax > 0 ? xmax : 10;
      this.derivChart.$equivalence = (eq && eq.Veq != null) ? { Veq: eq.Veq, pHeq: null, label: `극대 ${eq.Veq.toFixed(1)} mL` } : null;
      this.derivChart.update('none');
      this.renderSummary(eq);
    },

    /* ---- 사이드바 UI ---- */
    subFields(role, sub, title, volLabel) {
      const kinds = [['strong_acid', '강산'], ['weak_acid', '약산'], ['strong_base', '강염기'], ['weak_base', '약염기']];
      const opts = kinds.map(([v, l]) => `<option value="${v}" ${sub.kind === v ? 'selected' : ''}>${l}</option>`).join('');
      let pk = '';
      if (sub.kind === 'weak_acid') pk = `<label class="block"><span class="field-label">pKa</span><input type="number" step="0.01" class="field-input" data-sub="${role}" data-field="pK" value="${sub.pK}"></label>`;
      if (sub.kind === 'weak_base') pk = `<label class="block"><span class="field-label">pKb</span><input type="number" step="0.01" class="field-input" data-sub="${role}" data-field="pK" value="${sub.pK}"></label>`;
      return `<div class="border border-stone-200 rounded-md p-3 space-y-3 bg-stone-50/40">
        <p class="section-label">${title}</p>
        <label class="block"><span class="field-label">성질</span><select class="field-input" data-sub="${role}" data-field="kind">${opts}</select></label>
        <label class="block"><span class="field-label">이름</span><input type="text" class="field-input" data-sub="${role}" data-field="name" value="${sub.name}"></label>
        <div class="grid grid-cols-2 gap-2">
          <label class="block"><span class="field-label">농도 (M)</span><input type="number" step="0.01" min="0" class="field-input" data-sub="${role}" data-field="conc" value="${sub.conc}"></label>
          <label class="block"><span class="field-label">${volLabel}</span><input type="number" step="0.1" min="0" class="field-input" data-sub="${role}" data-field="vol" value="${sub.vol}"></label>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <label class="block"><span class="field-label">가수 (n)</span><input type="number" step="1" min="1" class="field-input" data-sub="${role}" data-field="n" value="${sub.n}"></label>
          ${pk || '<span></span>'}
        </div></div>`;
    },
    renderSim() {
      document.getElementById('sim-inputs').innerHTML =
        this.subFields('analyte', this.analyte, '피적정액 (비커)', '부피 (mL)') +
        '<div class="flex justify-center text-stone-300"><i data-lucide="arrow-down" class="w-4 h-4"></i></div>' +
        this.subFields('titrant', this.titrant, '적정액 (뷰렛)', '최대 적정량 (mL)');
      LG.util.drawIcons();
    },
    renderExp() {
      const el = document.getElementById('exp-table');
      el.innerHTML = `<div class="grid grid-cols-[1fr_1fr_auto] gap-1.5 text-[0.7rem] text-stone-400 px-1"><span>부피 (mL)</span><span>pH</span><span></span></div>` +
        this.exp.map((d, i) => `<div class="grid grid-cols-[1fr_1fr_auto] gap-1.5 items-center">
          <input type="number" step="0.1" class="field-input !mt-0" data-row="${i}" data-field="v" value="${isNaN(d.v) ? '' : d.v}">
          <input type="number" step="0.01" class="field-input !mt-0" data-row="${i}" data-field="pH" value="${isNaN(d.pH) ? '' : d.pH}">
          <button class="text-stone-400 hover:text-stone-700 px-1" data-action="del-row" data-row="${i}"><i data-lucide="x" class="w-3.5 h-3.5"></i></button>
        </div>`).join('');
      LG.util.drawIcons();
    },
    renderSummary(eq) {
      const el = document.getElementById('titr-summary');
      if (this.mode === 'exp') {
        const n = this.exp.filter(d => !isNaN(d.v) && !isNaN(d.pH)).length;
        const det = (eq && eq.Veq != null) ? ` · 검출 중화점 <span class="font-mono">${eq.Veq.toFixed(1)} mL (pH ${eq.pHeq.toFixed(2)})</span>` : '';
        el.innerHTML = `<div class="border border-stone-200 rounded-lg p-4 text-sm"><p class="section-label mb-2">실험 데이터 요약</p>
          <p class="text-stone-600">측정점 <span class="font-mono">${n}</span>개${det}</p>
          <p class="text-xs text-stone-400 mt-2">미분 토글을 켜면 변곡점(미분 극대)을 확인할 수 있습니다.</p></div>`;
        return;
      }
      const a = this.analyte, t = this.titrant;
      const veq = (t.conc > 0 && t.n > 0) ? (a.n * a.conc * a.vol) / (t.n * t.conc) : null;
      let note = '';
      if (eq && eq.pHeq != null) {
        if (eq.pHeq > 7.5) note = '당량점이 염기성 영역 → 생성염(약산의 짝염기) 가수분해 영향.';
        else if (eq.pHeq < 6.5) note = '당량점이 산성 영역 → 생성염(약염기의 짝산) 가수분해 영향.';
        else note = '당량점이 중성(pH≈7) 부근 → 강산–강염기 중화 특성.';
      }
      el.innerHTML = `<div class="border border-stone-200 rounded-lg overflow-hidden">
        <div class="px-4 py-2.5 bg-stone-50 border-b border-stone-100 flex items-center gap-2"><i data-lucide="beaker" class="w-4 h-4 text-stone-500"></i><span class="text-sm font-medium">적정 요약</span></div>
        <div class="p-4 space-y-2.5 text-sm">
          <div class="flex justify-between gap-3"><span class="text-stone-500">피적정액 (비커)</span><span class="font-medium text-right">${a.name} · ${a.n}가 ${KIND_KO[a.kind]}</span></div>
          <div class="flex justify-between gap-3"><span class="text-stone-500">적정액 (뷰렛)</span><span class="font-medium text-right">${t.name} · ${t.n}가 ${KIND_KO[t.kind]}</span></div>
          <div class="flex justify-between gap-3"><span class="text-stone-500">조합</span><span class="font-medium">${KIND_KO[a.kind]}–${KIND_KO[t.kind]} 적정</span></div>
          <div class="h-px bg-stone-100 my-1"></div>
          <div class="flex justify-between gap-3"><span class="text-stone-500">당량점 (이론)</span><span class="font-mono">${veq != null ? veq.toFixed(2) + ' mL' : '—'}</span></div>
          <div class="flex justify-between gap-3"><span class="text-stone-500">중화점 (검출)</span><span class="font-mono">${eq && eq.Veq != null ? eq.Veq.toFixed(1) + ' mL · pH ' + eq.pHeq.toFixed(2) : '—'}</span></div>
          ${note ? `<p class="text-xs text-stone-400 pt-1">${note}</p>` : ''}
        </div></div>`;
      LG.util.drawIcons();
    },
    setMode(mode) {
      this.mode = mode;
      document.querySelectorAll('.titr-mode').forEach(b => {
        const on = b.dataset.mode === mode;
        b.classList.toggle('bg-white', on); b.classList.toggle('text-ink', on);
        b.classList.toggle('shadow-sm', on); b.classList.toggle('text-stone-500', !on);
      });
      document.getElementById('sim-panel').classList.toggle('hidden', mode !== 'sim');
      document.getElementById('exp-panel').classList.toggle('hidden', mode !== 'exp');
      this.update();
    },
    applyCSV() {
      const text = document.getElementById('csv-input').value.trim(); if (!text) return;
      const rows = [];
      text.split(/\r?\n/).forEach(line => {
        const p = line.split(/[,\t; ]+/).map(s => s.trim()).filter(s => s !== '');
        if (p.length >= 2) { const v = parseFloat(p[0]), pH = parseFloat(p[1]); if (!isNaN(v) && !isNaN(pH)) rows.push({ v, pH }); }
      });
      if (rows.length) { this.exp = rows; this.renderExp(); this.update(); }
    },

    applyTheme(p) {
      if (!this.phChart) return;
      [this.phChart, this.derivChart].forEach(ch => LG.styleChart(ch, p, { pointStyles: false }));
      this.update();
    },
    refresh() { if (this.phChart) { this.phChart.update('none'); this.derivChart.update('none'); } },

    init() {
      this.exp = this.defaultsExp();
      const simInputs = document.getElementById('sim-inputs');
      simInputs.addEventListener('input', (e) => {
        const el = e.target, role = el.dataset.sub, field = el.dataset.field;
        if (!role || !field || field === 'kind') return;
        const sub = (role === 'analyte') ? this.analyte : this.titrant;
        sub[field] = (el.type === 'number') ? parseFloat(el.value) : el.value;
        this.update();
      });
      simInputs.addEventListener('change', (e) => {
        const el = e.target; if (el.dataset.field !== 'kind') return;
        const sub = (el.dataset.sub === 'analyte') ? this.analyte : this.titrant;
        sub.kind = el.value;
        if ((sub.kind === 'weak_acid' || sub.kind === 'weak_base') && !(sub.pK > 0)) sub.pK = (sub.kind === 'weak_acid') ? 4.76 : 4.75;
        this.renderSim(); this.update();
      });
      const expTable = document.getElementById('exp-table');
      expTable.addEventListener('input', (e) => {
        const el = e.target; if (el.dataset.field == null) return;
        const i = +el.dataset.row; if (!this.exp[i]) return;
        this.exp[i][el.dataset.field] = parseFloat(el.value); this.update();
      });
      expTable.addEventListener('click', (e) => {
        const b = e.target.closest('[data-action="del-row"]'); if (!b) return;
        this.exp.splice(+b.dataset.row, 1); this.renderExp(); this.update();
      });
      document.getElementById('add-row').addEventListener('click', () => { this.exp.push({ v: NaN, pH: NaN }); this.renderExp(); });
      document.getElementById('csv-apply').addEventListener('click', () => this.applyCSV());
      document.querySelectorAll('.titr-mode').forEach(btn => btn.addEventListener('click', () => this.setMode(btn.dataset.mode)));

      const dt = document.getElementById('deriv-toggle');
      dt.addEventListener('click', () => {
        this.showDeriv = !this.showDeriv;
        dt.setAttribute('aria-checked', this.showDeriv ? 'true' : 'false');
        dt.classList.toggle('bg-ink', this.showDeriv); dt.classList.toggle('bg-stone-200', !this.showDeriv);
        dt.querySelector('span').classList.toggle('translate-x-5', this.showDeriv);
        document.getElementById('deriv-wrap').classList.toggle('hidden', !this.showDeriv);
        if (this.showDeriv) { this.update(); this.derivChart.resize(); }
      });

      this.initCharts(); this.renderSim(); this.renderExp(); this.setMode('sim');
      this.inited = true; this.update();
      requestAnimationFrame(() => { [this.phChart, this.derivChart].forEach(c => c && c.resize()); this.update(); });

      LG.exporters.titration = () => ({ charts: this.showDeriv ? [this.phChart, this.derivChart] : [this.phChart], name: 'titration_curve' });
    },
    ensure() {
      if (this.inited) { [this.phChart, this.derivChart].forEach(c => c && c.resize()); this.update(); }
    },
    reset() {
      Object.assign(this.analyte, { kind: 'weak_acid', name: 'CH₃COOH', conc: 0.1, vol: 25, n: 1, pK: 4.76 });
      Object.assign(this.titrant, { kind: 'strong_base', name: 'NaOH', conc: 0.1, vol: 50, n: 1, pK: 0 });
      this.exp = this.defaultsExp();
      this.renderSim(); this.renderExp(); this.setMode('sim');
    },
  };

  LG.Titration = Titration;
})();
