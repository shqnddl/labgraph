/* ===========================================================
 * LabGraph — motion.js
 * 운동학 계산 + s-t / v-t / a-t / y-x 차트, 포물선 프리셋 토글
 * =========================================================== */
(function () {
  'use strict';
  const LG = (window.LabGraph = window.LabGraph || {});
  const EPS = 1e-9;

  const Motion = {
    charts: null,
    inited: false,
    rendered: false,
    segCounter: 2,
    presetOn: false,
    segments: [],
    TYPE_OPTS: [{ value: 'rest', label: '정지' }, { value: 'uniform', label: '등속' }, { value: 'accel', label: '등가속도' }],

    defaults() {
      return [
        { id: 1, type: 'accel', duration: 3, v0: 0, a: 2 },
        { id: 2, type: 'uniform', duration: 2, v0: 6, a: 0 },
      ];
    },
    projectile() {
      const g = 9.8;
      return [
        { id: 1, type: 'accel', duration: 1, v0: 19.6, a: -g },
        { id: 2, type: 'accel', duration: 1, v0: 9.8, a: -g },
        { id: 3, type: 'accel', duration: 1, v0: 0, a: -g },
        { id: 4, type: 'accel', duration: 1, v0: -9.8, a: -g },
      ];
    },

    /* ---- 운동학 ---- */
    compute(segments) {
      let t0 = 0, s0 = 0; const segs = [];
      for (const seg of segments) {
        const dur = Math.max(0, isNaN(seg.duration) ? 0 : seg.duration);
        let v0, a;
        if (seg.type === 'rest') { v0 = 0; a = 0; }
        else if (seg.type === 'uniform') { v0 = seg.v0; a = 0; }
        else { v0 = seg.v0; a = seg.a; }
        const tStart = t0, tEnd = t0 + dur, sStart = s0, sEnd = s0 + v0 * dur + 0.5 * a * dur * dur;
        segs.push({ tStart, tEnd, dur, v0, a, sStart, sEnd, vStart: v0, vEnd: v0 + a * dur });
        t0 = tEnd; s0 = sEnd;
      }
      return segs;
    },
    buildPosition(segs) {
      const data = [];
      for (const sg of segs) {
        const N = Math.abs(sg.a) > EPS ? 24 : 1;
        for (let k = 0; k <= N; k++) {
          if (k === 0 && data.length > 0) continue;
          const tau = sg.dur * k / N;
          data.push({ x: sg.tStart + tau, y: sg.sStart + sg.v0 * tau + 0.5 * sg.a * tau * tau });
        }
      }
      return data;
    },
    buildPiecewise(segs, valStart, valEnd) {
      const line = [], dots = [];
      for (let i = 0; i < segs.length; i++) {
        const sg = segs[i];
        if (i > 0) {
          const prev = segs[i - 1];
          if (Math.abs(valEnd(prev) - valStart(sg)) > EPS) {
            line.push({ x: prev.tEnd, y: null });
            dots.push({ x: prev.tEnd, y: valEnd(prev), open: true });
            dots.push({ x: sg.tStart, y: valStart(sg), open: false });
          }
        }
        line.push({ x: sg.tStart, y: valStart(sg) });
        line.push({ x: sg.tEnd, y: valEnd(sg) });
      }
      return { line, dots };
    },
    buildTrajectory(segs, vx0) {
      return this.buildPosition(segs).map(p => ({ x: vx0 * p.x, y: p.y }));
    },

    /* ---- Chart.js ---- */
    makeChart(canvasId, lineColor, yTitle, xTitle) {
      return new Chart(document.getElementById(canvasId).getContext('2d'), {
        type: 'line',
        data: { datasets: [
          { data: [], borderColor: lineColor, borderWidth: 1.8, pointRadius: 0, tension: 0, spanGaps: false, fill: false },
          { type: 'scatter', _isScatter: true, data: [], pointRadius: 4, pointHoverRadius: 4, pointBorderWidth: 1.5, pointBackgroundColor: [], pointBorderColor: lineColor, showLine: false },
        ] },
        options: {
          responsive: true, maintainAspectRatio: false, animation: false,
          plugins: { legend: { display: false }, tooltip: { backgroundColor: '#1a1a1a', padding: 8, displayColors: false,
            callbacks: { title: (it) => `${xTitle} = ${(+it[0].parsed.x).toFixed(2)}`, label: (it) => `${yTitle} = ${(+it.parsed.y).toFixed(2)}` } } },
          scales: {
            x: { type: 'linear', min: 0, title: { display: true, text: xTitle, font: { size: 10 } }, grid: { color: '#f0efed' }, ticks: { font: { size: 10 }, maxTicksLimit: 11 } },
            y: { title: { display: true, text: yTitle, font: { size: 10 } }, grid: { color: (c) => (c.tick.value === 0 ? '#d6d3d1' : '#f0efed') }, ticks: { font: { size: 10 } } },
          },
        },
      });
    },
    initCharts() {
      const C = LG.COLOR;
      this.charts = {
        st: this.makeChart('chart-st', C.s, 's (m)', 't (s)'),
        vt: this.makeChart('chart-vt', C.v, 'v (m/s)', 't (s)'),
        at: this.makeChart('chart-at', C.a, 'a (m/s²)', 't (s)'),
        yx: this.makeChart('chart-yx', C.s, 'y (m)', 'x (m)'),
      };
    },
    applyPiecewise(chart, part, lineColor) {
      chart.data.datasets[0].data = part.line;
      chart.data.datasets[1].data = part.dots.map(d => ({ x: d.x, y: d.y }));
      chart.data.datasets[1].pointBackgroundColor = part.dots.map(d => (d.open ? '#ffffff' : lineColor));
    },
    setYRange(ch) {
      const ys = [];
      ch.data.datasets.forEach(ds => ds.data.forEach(pt => { const y = (pt && typeof pt === 'object') ? pt.y : pt; if (y != null && !isNaN(y)) ys.push(y); }));
      let lo = ys.length ? Math.min(...ys) : 0, hi = ys.length ? Math.max(...ys) : 0;
      if (hi - lo < 1e-6) { lo -= 1; hi += 1; } else { const pad = (hi - lo) * 0.1; lo -= pad; hi += pad; }
      ch.options.scales.y.suggestedMin = lo; ch.options.scales.y.suggestedMax = hi;
    },
    clearCharts() {
      const c = this.charts; if (!c) return;
      Object.values(c).forEach((ch) => {
        ch.data.datasets.forEach(ds => { ds.data = []; if (ds.pointBackgroundColor) ds.pointBackgroundColor = []; });
        ch.options.scales.x.max = undefined;
        ch.options.scales.y.suggestedMin = undefined; ch.options.scales.y.suggestedMax = undefined;
        ch.update('none');
      });
    },
    update() {
      const c = this.charts; if (!c) return;
      if (!this.rendered) { this.clearCharts(); return; }
      const segs = this.compute(this.segments);
      const total = segs.length ? segs[segs.length - 1].tEnd : 0;
      const tMax = total > 0 ? total : 1;
      const C = LG.COLOR;
      c.st.data.datasets[0].data = this.buildPosition(segs); c.st.data.datasets[1].data = [];
      this.applyPiecewise(c.vt, this.buildPiecewise(segs, s => s.vStart, s => s.vEnd), C.v);
      this.applyPiecewise(c.at, this.buildPiecewise(segs, s => s.a, s => s.a), C.a);
      [c.st, c.vt, c.at].forEach((ch) => { ch.options.scales.x.max = tMax; this.setYRange(ch); ch.update('none'); });

      let vx0 = parseFloat(document.getElementById('motion-vx0').value); if (isNaN(vx0)) vx0 = 0;
      const traj = this.buildTrajectory(segs, vx0);
      c.yx.data.datasets[0].data = traj;
      const dots = [], bg = [];
      if (traj.length) { dots.push(traj[0]); bg.push(C.s); dots.push(traj[traj.length - 1]); bg.push('#ffffff'); }
      c.yx.data.datasets[1].data = dots.map(d => ({ x: d.x, y: d.y }));
      c.yx.data.datasets[1].pointBackgroundColor = bg;
      const xs = traj.map(p => p.x);
      c.yx.options.scales.x.max = xs.length ? Math.max(...xs) * 1.05 || 1 : 1;
      this.setYRange(c.yx); c.yx.update('none');
    },

    /* ---- 사이드바 UI ---- */
    renderSegments() {
      const list = document.getElementById('segment-list');
      list.innerHTML = this.segments.map((seg, i) => {
        const options = this.TYPE_OPTS.map(o => `<option value="${o.value}" ${seg.type === o.value ? 'selected' : ''}>${o.label}</option>`).join('');
        const v0Field = (seg.type === 'uniform' || seg.type === 'accel') ? `
          <label class="block"><span class="field-label">초기 속도 v₀ (m/s)</span>
            <input type="number" step="0.1" class="field-input" data-field="v0" data-seg-id="${seg.id}" value="${seg.v0}"></label>` : '';
        const aField = (seg.type === 'accel') ? `
          <label class="block"><span class="field-label">가속도 a (m/s²)</span>
            <input type="number" step="0.1" class="field-input" data-field="a" data-seg-id="${seg.id}" value="${seg.a}"></label>` : '';
        return `
          <div class="border border-stone-200 rounded-md p-3 space-y-3 bg-stone-50/40" data-seg-id="${seg.id}">
            <div class="flex items-center justify-between">
              <span class="text-xs font-medium text-stone-700">구간 ${i + 1}</span>
              <button class="text-stone-400 hover:text-stone-700 transition" data-action="delete" data-seg-id="${seg.id}" title="구간 삭제"><i data-lucide="x" class="w-3.5 h-3.5"></i></button>
            </div>
            <label class="block"><span class="field-label">운동 상태</span><select class="field-input" data-field="type" data-seg-id="${seg.id}">${options}</select></label>
            <label class="block"><span class="field-label">시간 (초)</span><input type="number" step="0.1" min="0" class="field-input" data-field="duration" data-seg-id="${seg.id}" value="${seg.duration}"></label>
            ${v0Field}${aField}
          </div>`;
      }).join('');
      LG.util.drawIcons();
    },
    updatePresetButton() {
      const btn = document.getElementById('motion-preset');
      if (this.presetOn) {
        btn.innerHTML = '<i data-lucide="rotate-ccw" class="w-4 h-4"></i> 원래 상태로 되돌리기';
        btn.classList.add('bg-stone-100', 'border-stone-400'); btn.classList.remove('border-stone-300');
      } else {
        btn.innerHTML = '<i data-lucide="sparkles" class="w-4 h-4"></i> 포물선 운동 프리셋 적용';
        btn.classList.remove('bg-stone-100', 'border-stone-400'); btn.classList.add('border-stone-300');
      }
      LG.util.drawIcons();
    },
    clearPresetIfManual() { if (this.presetOn) { this.presetOn = false; this.updatePresetButton(); } },

    // 구간 데이터 붙여넣기 파서: "타입, 시간, v0, a" (한 줄당 한 구간)
    parseSegments(text) {
      const TYPE_MAP = {
        '정지': 'rest', 'rest': 'rest',
        '등속': 'uniform', 'uniform': 'uniform',
        '등가속도': 'accel', '등가속': 'accel', 'accel': 'accel', 'acceleration': 'accel',
      };
      const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l !== '');
      const segs = []; let id = 0;
      for (const line of lines) {
        const p = line.split(/[\t,;]/).map(s => s.trim()).filter(s => s !== '');
        if (p.length < 2) continue;
        const type = TYPE_MAP[p[0].toLowerCase()] || TYPE_MAP[p[0]];
        if (!type) continue; // 타입 인식 실패(헤더 등)는 건너뜀
        const duration = parseFloat(p[1]); if (isNaN(duration)) continue;
        let v0 = parseFloat(p[2]); if (isNaN(v0)) v0 = 0;
        let a = parseFloat(p[3]); if (isNaN(a)) a = 0;
        if (type === 'rest') { v0 = 0; a = 0; }
        if (type === 'uniform') { a = 0; }
        segs.push({ id: ++id, type, duration, v0, a });
      }
      return segs;
    },
    applyCSV() {
      const text = document.getElementById('motion-csv').value.trim();
      if (!text) return;
      const segs = this.parseSegments(text);
      if (!segs.length) return;
      this.segments = segs;
      this.segCounter = segs.length;
      this.presetOn = false; this.updatePresetButton();
      this.rendered = true;
      this.renderSegments(); this.update();
    },

    /* ---- 프리셋 테마(스타일) 적용 ---- */
    applyTheme(p) {
      if (!this.charts) return;
      const C = LG.COLOR;
      const map = { st: C.s, vt: C.v, at: C.a, yx: C.s };
      Object.entries(this.charts).forEach(([k, ch]) => {
        ch.data.datasets[0].borderColor = map[k];
        ch.data.datasets[1].pointBorderColor = map[k];
        LG.styleChart(ch, p, { pointStyles: false });
      });
      this.update();
    },
    refresh() { if (this.charts) Object.values(this.charts).forEach(c => c.update('none')); },

    /* ---- 초기화/바인딩 ---- */
    init() {
      this.segments = this.defaults();
      const list = document.getElementById('segment-list');
      list.addEventListener('input', (e) => {
        const el = e.target, field = el.dataset.field;
        if (!field || field === 'type') return;
        const seg = this.segments.find(s => s.id === +el.dataset.segId); if (!seg) return;
        let v = parseFloat(el.value); if (isNaN(v)) v = 0;
        seg[field] = v; this.clearPresetIfManual(); this.update();
      });
      list.addEventListener('change', (e) => {
        const el = e.target; if (el.dataset.field !== 'type') return;
        const seg = this.segments.find(s => s.id === +el.dataset.segId); if (!seg) return;
        seg.type = el.value; this.clearPresetIfManual(); this.renderSegments(); this.update();
      });
      list.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action="delete"]'); if (!btn) return;
        this.segments = this.segments.filter(s => s.id !== +btn.dataset.segId);
        this.clearPresetIfManual(); this.renderSegments(); this.update();
      });
      document.getElementById('add-segment').addEventListener('click', () => {
        this.segCounter++; this.segments.push({ id: this.segCounter, type: 'uniform', duration: 2, v0: 0, a: 0 });
        this.clearPresetIfManual(); this.renderSegments(); this.update();
        list.scrollTop = list.scrollHeight;
      });
      document.getElementById('motion-preset').addEventListener('click', () => {
        if (!this.presetOn) { this.segments = this.projectile(); this.segCounter = 4; this.presetOn = true; }
        else { this.segments = this.defaults(); this.segCounter = 2; this.presetOn = false; }
        this.rendered = true;
        this.updatePresetButton(); this.renderSegments(); this.update();
      });
      document.getElementById('motion-generate').addEventListener('click', () => {
        this.rendered = true; this.update();
      });
      document.getElementById('motion-vx0').addEventListener('input', () => { if (this.rendered) this.update(); });
      document.getElementById('motion-csv-apply').addEventListener('click', () => this.applyCSV());
      // 엑셀 통째 붙여넣기 시 즉시 적용
      document.getElementById('motion-csv').addEventListener('paste', (e) => {
        const txt = (e.clipboardData || window.clipboardData).getData('text');
        if (txt) { e.preventDefault(); const el = document.getElementById('motion-csv'); el.value = txt; this.applyCSV(); }
      });

      this.initCharts();
      this.updatePresetButton();
      this.renderSegments();
      this.update();

      LG.exporters.motion = () => ({ charts: [this.charts.st, this.charts.vt, this.charts.at, this.charts.yx], name: 'motion_graphs' });
    },
    ensure() {
      if (this.charts) { Object.values(this.charts).forEach(c => c.resize()); this.update(); }
    },
    reset() {
      this.segments = this.defaults(); this.segCounter = 2; this.presetOn = false;
      this.rendered = false;
      document.getElementById('motion-vx0').value = '5';
      document.getElementById('motion-csv').value = '';
      this.updatePresetButton(); this.renderSegments(); this.update();
    },
  };

  LG.Motion = Motion;
})();
