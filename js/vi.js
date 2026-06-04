/* ===========================================================
 * LabGraph — vi.js
 * V-I 특성곡선 + 회귀(선형/2차/지수/로그) + 다이오드 반로그 Shockley 피팅
 * =========================================================== */
(function () {
  'use strict';
  const LG = (window.LabGraph = window.LabGraph || {});
  const VT = 0.02585;

  const VI = {
    inited: false, preset: 'resistor', fitModel: 'linear', chart: null, rendered: false,
    data: {
      resistor: [{ v: 0, i: 0.2 }, { v: 1, i: 6.5 }, { v: 2, i: 13.6 }, { v: 3, i: 19.8 }, { v: 4, i: 27.1 }, { v: 5, i: 33.0 }],
      diode: [{ v: 0.30, i: 0.0007 }, { v: 0.45, i: 0.015 }, { v: 0.55, i: 0.14 }, { v: 0.60, i: 0.39 },
        { v: 0.65, i: 1.20 }, { v: 0.70, i: 3.35 }, { v: 0.72, i: 5.40 }, { v: 0.74, i: 8.0 }, { v: 0.76, i: 12.8 }, { v: 0.78, i: 18.9 }],
    },
    DESC: {
      resistor: '옴 법칙 V = IR. 측정점을 회귀하여 기울기에서 저항을 산출합니다.',
      diode: 'Shockley 특성. 약 0.7V 부근에서 급상승하며, 반로그(ln I–V) 회귀로 이상계수 n을 산출합니다.',
    },
    cur() { return this.data[this.preset]; },
    fmtR(R) { if (!isFinite(R)) return '∞ Ω'; return R >= 1000 ? (R / 1000).toFixed(2) + ' kΩ' : R.toFixed(1) + ' Ω'; },
    setBox(lines) {
      document.getElementById('vi-box').innerHTML =
        `<div class="font-sans text-[0.6rem] text-stone-400 uppercase tracking-wider mb-1">회귀 결과</div>` +
        lines.map(l => `<div class="font-mono text-sm text-ink leading-snug">${l}</div>`).join('');
    },

    initChart() {
      this.chart = new Chart(document.getElementById('chart-vi-main').getContext('2d'), {
        type: 'scatter',
        data: { datasets: [
          { label: '측정 데이터', _isScatter: true, data: [], pointRadius: 4, pointHoverRadius: 5, pointBackgroundColor: '#ffffff', pointBorderColor: '#1a1a1a', pointBorderWidth: 1.5, showLine: false },
          { label: '추세선', type: 'line', data: [], borderColor: '#1a1a1a', borderWidth: 1.8, pointRadius: 0, tension: 0, fill: false },
        ] },
        options: {
          responsive: true, maintainAspectRatio: false, animation: false,
          plugins: {
            legend: { display: true, position: 'bottom', labels: { boxWidth: 18, font: { size: 11 }, color: '#78716c', usePointStyle: true } },
            tooltip: { backgroundColor: '#1a1a1a', padding: 8, displayColors: false,
              callbacks: { title: (it) => `V = ${(+it[0].parsed.x).toFixed(3)} V`, label: (it) => `I = ${(+it.parsed.y).toFixed(3)} mA` } },
          },
          scales: {
            x: { type: 'linear', min: 0, title: { display: true, text: '전압 V (V)', font: { size: 10 } }, grid: { color: '#f0efed' }, ticks: { font: { size: 10 } } },
            y: { min: 0, title: { display: true, text: '전류 I (mA)', font: { size: 10 } }, grid: { color: '#f0efed' }, ticks: { font: { size: 10 } } },
          },
        },
      });
    },

    clearCharts() {
      if (!this.chart) return;
      this.chart.data.datasets.forEach(ds => { ds.data = []; });
      this.chart.options.scales.x.max = undefined; this.chart.options.scales.y.suggestedMax = undefined;
      this.chart.update('none');
      document.getElementById('vi-box').innerHTML = '';
    },
    update() {
      if (!this.inited) return;
      if (!this.rendered) { this.clearCharts(); return; }
      const valid = this.cur().filter(d => !isNaN(d.v) && !isNaN(d.i));
      const pts = valid.map(d => ({ x: d.v, y: d.i }));
      this.chart.data.datasets[0].data = pts;

      if (this.preset === 'resistor') {
        // 사용자가 선택한 회귀 모델 적용
        const res = LG.util.regression.fit(this.fitModel, pts);
        let curve = [];
        if (res) {
          const xs = pts.map(p => p.x);
          const x0 = Math.min(0, ...xs), x1 = Math.max(...xs);
          curve = LG.util.sampleCurve(res.fn, x0, x1, this.fitModel === 'linear' ? 1 : 120);
          const box = [res.eq, `R² = ${res.r2.toFixed(4)}`];
          if (this.fitModel === 'linear') {
            const R = res.coef.a !== 0 ? 1000 / res.coef.a : Infinity;
            box.unshift(`R = ${this.fmtR(R)}`);
          }
          this.setBox(box);
        } else this.setBox(['데이터 부족']);
        this.chart.data.datasets[1].label = '추세선 (' + this.fitLabel() + ')';
        this.chart.data.datasets[1].data = curve;
      } else {
        // 다이오드: 반로그 Shockley
        const log = pts.filter(p => p.y > 0).map(p => ({ x: p.x, y: Math.log(p.y * 1e-3) }));
        const reg = LG.util.regression.linear(log);
        let curve = [];
        if (reg) {
          const x1 = Math.max(...pts.map(p => p.x));
          const maxI = Math.max(...pts.map(p => p.y), 1);
          const N = 140;
          for (let k = 0; k <= N; k++) {
            const V = x1 * k / N;
            let I = Math.exp(reg.coef.b + reg.coef.a * V) * 1e3;
            if (I > maxI * 1.25) I = maxI * 1.25;
            curve.push({ x: V, y: I });
          }
          const n = 1 / (reg.coef.a * VT);
          const Von = (Math.log(1e-3) - reg.coef.b) / reg.coef.a;
          const r2 = LG.util.rSquared(log, reg.fn);
          this.setBox([`n = ${n.toFixed(2)}`, `V_on ≈ ${Von.toFixed(3)} V`, `R² = ${r2.toFixed(4)}`]);
        } else this.setBox(['데이터 부족']);
        this.chart.data.datasets[1].label = '피팅 곡선 (Shockley)';
        this.chart.data.datasets[1].data = curve;
      }
      const xs = valid.map(d => d.v), ys = valid.map(d => d.i);
      this.chart.options.scales.x.max = xs.length ? Math.max(...xs) * 1.05 : 5;
      this.chart.options.scales.x.min = Math.min(0, ...(xs.length ? xs : [0]));
      this.chart.options.scales.y.suggestedMax = ys.length ? Math.max(...ys) * 1.1 : 10;
      this.chart.update('none');
    },
    fitLabel() {
      return { linear: '선형', quadratic: '2차', exponential: '지수', logarithmic: '로그' }[this.fitModel] || '선형';
    },

    renderGrid() {
      const el = document.getElementById('vi-table');
      el.innerHTML = `<div class="grid grid-cols-[1fr_1fr_auto] gap-1.5 text-[0.7rem] text-stone-400 px-1"><span>전압 V (V)</span><span>전류 I (mA)</span><span></span></div>` +
        this.cur().map((d, i) => `<div class="grid grid-cols-[1fr_1fr_auto] gap-1.5 items-center">
          <input type="number" step="0.01" class="field-input !mt-0" data-row="${i}" data-field="v" value="${isNaN(d.v) ? '' : d.v}">
          <input type="number" step="0.01" class="field-input !mt-0" data-row="${i}" data-field="i" value="${isNaN(d.i) ? '' : d.i}">
          <button class="text-stone-400 hover:text-stone-700 px-1" data-action="vi-del" data-row="${i}" title="행 삭제"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
        </div>`).join('');
      LG.util.drawIcons();
    },

    setPreset(preset) {
      this.preset = preset;
      document.querySelectorAll('.vi-preset').forEach(b => {
        const on = b.dataset.preset === preset;
        b.classList.toggle('bg-white', on); b.classList.toggle('text-ink', on);
        b.classList.toggle('shadow-sm', on); b.classList.toggle('text-stone-500', !on);
      });
      document.getElementById('vi-desc').textContent = this.DESC[preset];
      // 회귀 모델 선택칸은 저항(옴성)일 때만 의미가 있음
      document.getElementById('vi-fit-wrap').classList.toggle('hidden', preset !== 'resistor');
      this.rendered = false; // 소자 전환 시 빈 차트 → 적용/생성 버튼으로 렌더
      this.renderGrid(); this.update();
    },

    applyTheme(p) { if (this.chart) { LG.styleChart(this.chart, p); this.update(); } },
    refresh() { if (this.chart) this.chart.update('none'); },

    init() {
      document.querySelectorAll('.vi-preset').forEach(b => b.addEventListener('click', () => this.setPreset(b.dataset.preset)));
      const fit = document.getElementById('vi-fit');
      if (fit) fit.addEventListener('change', (e) => { this.fitModel = e.target.value; if (this.rendered) this.update(); });
      const t = document.getElementById('vi-table');
      t.addEventListener('input', (e) => {
        const el = e.target; if (el.dataset.field == null) return;
        const i = +el.dataset.row; const d = this.cur()[i]; if (!d) return;
        d[el.dataset.field] = parseFloat(el.value); if (this.rendered) this.update();
      });
      t.addEventListener('click', (e) => {
        const b = e.target.closest('[data-action="vi-del"]'); if (!b) return;
        this.cur().splice(+b.dataset.row, 1); this.renderGrid(); if (this.rendered) this.update();
      });
      document.getElementById('vi-add-row').addEventListener('click', () => { this.cur().push({ v: NaN, i: NaN }); this.renderGrid(); });
      document.getElementById('vi-generate').addEventListener('click', () => { this.rendered = true; this.update(); });
      document.getElementById('vi-csv-apply').addEventListener('click', () => {
        const text = document.getElementById('vi-csv').value.trim(); if (!text) return;
        const rows = [];
        text.split(/\r?\n/).forEach(line => {
          const p = line.split(/[,\t; ]+/).map(s => s.trim()).filter(s => s !== '');
          if (p.length >= 2) { const v = parseFloat(p[0]), i = parseFloat(p[1]); if (!isNaN(v) && !isNaN(i)) rows.push({ v, i }); }
        });
        if (rows.length) { this.data[this.preset] = rows; this.rendered = true; this.renderGrid(); this.update(); }
      });

      this.initChart(); this.inited = true; this.setPreset('resistor');
      requestAnimationFrame(() => { this.chart && this.chart.resize(); });

      LG.exporters.vi = () => ({ charts: [this.chart], name: 'vi_curve' });
    },
    ensure() { if (this.inited) { this.chart.resize(); this.update(); } },
    reset() {
      this.data.resistor = [{ v: 0, i: 0.2 }, { v: 1, i: 6.5 }, { v: 2, i: 13.6 }, { v: 3, i: 19.8 }, { v: 4, i: 27.1 }, { v: 5, i: 33.0 }];
      this.data.diode = [{ v: 0.30, i: 0.0007 }, { v: 0.45, i: 0.015 }, { v: 0.55, i: 0.14 }, { v: 0.60, i: 0.39 }, { v: 0.65, i: 1.20 }, { v: 0.70, i: 3.35 }, { v: 0.72, i: 5.40 }, { v: 0.74, i: 8.0 }, { v: 0.76, i: 12.8 }, { v: 0.78, i: 18.9 }];
      this.fitModel = 'linear';
      const fit = document.getElementById('vi-fit'); if (fit) fit.value = 'linear';
      this.setPreset('resistor');
    },
  };

  LG.VI = VI;
})();
