/* ===========================================================
 * LabGraph — custom.js
 * 범용 커스텀 플로터: 다중 계열, 엑셀 붙여넣기 파서, 오차막대, 추세선
 * =========================================================== */
(function () {
  'use strict';
  const LG = (window.LabGraph = window.LabGraph || {});

  const DASH = [[], [6, 3], [2, 3], [8, 3, 2, 3], [1, 2]];
  const DEFAULT_TEXT = 'x, 계열 A, 계열 B\n0, 1.2, 0.4\n1, 2.5, 0.9\n2, 3.1, 1.7\n3, 4.0, 2.2\n4, 4.6, 3.1\n5, 5.2, 3.8';

  const PRESETS = {
    linear: { title: '선형 관계 (y = ax + b)', type: 'line', xname: 'x', xunit: '', yname: 'y', yunit: '', header: 'x, y = 2x + 1', f: (x) => 2 * x + 1, xs: [0, 1, 2, 3, 4, 5, 6, 7, 8] },
    quadratic: { title: '이차함수 곡선 (y = ax²)', type: 'line', xname: 'x', xunit: '', yname: 'y', yunit: '', header: 'x, y = 0.5x²', f: (x) => 0.5 * x * x, xs: [-4, -3, -2, -1, 0, 1, 2, 3, 4] },
    exponential: { title: '지수 성장 곡선', type: 'line', xname: 't', xunit: '', yname: 'N', yunit: '', header: 't, N = e^(0.5t)', f: (x) => Math.exp(0.5 * x), xs: [0, 1, 2, 3, 4, 5, 6, 7, 8] },
    logdecay: { title: '로그 감쇄 곡선', type: 'line', xname: 't', xunit: '', yname: 'A', yunit: '', header: 't, A = 10·e^(-0.4t)', f: (x) => 10 * Math.exp(-0.4 * x), xs: [0, 1, 2, 3, 4, 5, 6, 8, 10, 12] },
  };

  const Custom = {
    inited: false, rendered: false, chart: null, chartType: null,
    parsed: { headers: [], rows: [] },

    // 엑셀/구글시트 붙여넣기 파서 (탭·콤마·세미콜론 모두 지원, 헤더 자동 인식)
    parse(text) {
      const lines = text.split(/\r?\n/).map(l => l.replace(/\s+$/, '')).filter(l => l.trim() !== '');
      if (!lines.length) return { headers: [], rows: [] };
      const split = (l) => l.split(/[\t,;]/).map(s => s.trim());
      const first = split(lines[0]);
      const hasHeader = isNaN(parseFloat(first[0])) || first.slice(1).some(c => c !== '' && isNaN(parseFloat(c)));
      let headers, dataLines;
      if (hasHeader) { headers = first; dataLines = lines.slice(1); }
      else { headers = first.map((_, i) => (i === 0 ? 'X' : '계열 ' + i)); dataLines = lines; }
      const rows = [];
      for (const l of dataLines) {
        const cells = split(l).map(c => parseFloat(c));
        if (cells.length >= 2 && !isNaN(cells[0])) rows.push(cells);
      }
      return { headers, rows };
    },

    buildChart(type) {
      if (this.chart) { this.chart.destroy(); this.chart = null; }
      const baseType = type === 'bar' ? 'bar' : (type === 'scatter' ? 'scatter' : 'line');
      const xType = type === 'bar' ? 'category' : 'linear';
      const p = LG.preset();
      this.chart = new Chart(document.getElementById('chart-custom-main').getContext('2d'), {
        type: baseType,
        data: { datasets: [] },
        options: {
          responsive: true, maintainAspectRatio: false, animation: false,
          plugins: {
            legend: { display: false, position: p.legendPos, labels: { usePointStyle: true, boxWidth: 18, font: { size: 11 }, color: '#78716c' } },
            title: { display: false, text: '', color: '#1a1a1a', font: { family: 'Spectral, serif', size: 15, weight: '600' }, padding: { bottom: 10 } },
            tooltip: { backgroundColor: '#1a1a1a', padding: 8, displayColors: false },
          },
          scales: {
            x: { type: xType, title: { display: true, text: 'X', font: { size: 11, weight: '500' } }, grid: { color: p.gridColor, display: p.grid }, ticks: { font: { size: 10 } } },
            y: { title: { display: true, text: 'Y', font: { size: 11, weight: '500' } }, grid: { color: p.gridColor, display: p.grid }, ticks: { font: { size: 10 } } },
          },
        },
      });
      this.chartType = type;
    },

    // 표준편차 (오차막대 자동 산출용 — 계열 전체 SD)
    stdev(arr) {
      const v = arr.filter(x => !isNaN(x));
      if (v.length < 2) return 0;
      const m = v.reduce((s, x) => s + x, 0) / v.length;
      return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1));
    },

    clearCharts() {
      if (!this.chart) return;
      this.chart.data.datasets = [];
      if (this.chart.data.labels) this.chart.data.labels = [];
      this.chart.update('none');
      document.getElementById('cu-fitbox').classList.add('hidden');
    },
    update() {
      if (!this.inited) return;
      if (!this.rendered) { this.clearCharts(); return; }
      const type = document.getElementById('cu-type').value;
      if (type !== this.chartType) this.buildChart(type);
      const p = LG.preset();

      const xname = document.getElementById('cu-xname').value.trim();
      const xunit = document.getElementById('cu-xunit').value.trim();
      const yname = document.getElementById('cu-yname').value.trim();
      const yunit = document.getElementById('cu-yunit').value.trim();
      const title = document.getElementById('cu-title').value.trim();
      const showErr = document.getElementById('cu-errbar').checked;
      const errMode = document.getElementById('cu-errmode').value; // 'sd' | 'column'
      const showFit = document.getElementById('cu-fit-on').checked;
      const fitModel = document.getElementById('cu-fit').value;

      const { headers, rows } = this.parsed;
      const ncol = rows.reduce((m, r) => Math.max(m, r.length), 0);
      // 오차 컬럼 모드: 마지막 열을 오차로 사용 (X, Y, err)
      const errFromColumn = (errMode === 'column' && ncol >= 3);
      const nY = errFromColumn ? 1 : Math.max(0, ncol - 1);

      const datasets = [];
      const palette = p.palette;
      let firstSeriesPts = null;
      for (let s = 0; s < nY; s++) {
        const color = palette[s % palette.length];
        const name = headers[s + 1] || ('계열 ' + (s + 1));
        const ptStyle = p.pointStyles[s % p.pointStyles.length];
        if (type === 'bar') {
          datasets.push({ label: name, data: rows.map(r => r[s + 1]), backgroundColor: color + 'cc', borderColor: color, borderWidth: 1, barPercentage: 0.9, categoryPercentage: 0.8 });
        } else {
          const seriesPts = rows.map(r => ({ x: r[0], y: r[s + 1] }));
          if (s === 0) firstSeriesPts = seriesPts.filter(pt => !isNaN(pt.y));
          const ds = {
            type: type === 'scatter' ? 'scatter' : 'line', _isScatter: type === 'scatter', label: name,
            data: seriesPts,
            borderColor: color, backgroundColor: color, borderWidth: p.lineWidth,
            borderDash: type === 'line' ? DASH[s % DASH.length] : [],
            pointRadius: type === 'scatter' ? p.pointRadius : 0,
            pointStyle: ptStyle,
            pointBackgroundColor: type === 'scatter' ? '#ffffff' : color, pointBorderColor: color, pointBorderWidth: 1.5,
            tension: 0, fill: false, showLine: type !== 'scatter',
          };
          // 오차막대 데이터 연결
          if (showErr) {
            if (errFromColumn) {
              ds._errorBars = rows.map(r => ({ x: r[0], y: r[1], e: r[2] }));
            } else {
              const sd = this.stdev(rows.map(r => r[s + 1]));
              ds._errorBars = seriesPts.map(pt => ({ x: pt.x, y: pt.y, e: sd }));
            }
          } else ds._errorBars = [];
          datasets.push(ds);
        }
      }

      // 추세선 (첫 계열 기준, line/scatter에서만)
      if (showFit && type !== 'bar' && firstSeriesPts && firstSeriesPts.length >= 2) {
        const res = LG.util.regression.fit(fitModel, firstSeriesPts);
        if (res) {
          const xs = firstSeriesPts.map(pt => pt.x);
          const curve = LG.util.sampleCurve(res.fn, Math.min(...xs), Math.max(...xs), fitModel === 'linear' ? 1 : 120);
          datasets.push({
            type: 'line', label: `추세선 · ${res.eq} (R²=${res.r2.toFixed(4)})`,
            data: curve, borderColor: '#1a1a1a', borderWidth: 1.4, borderDash: [4, 3],
            pointRadius: 0, tension: 0, fill: false,
          });
          this.setFitBox(res);
        }
      } else {
        document.getElementById('cu-fitbox').classList.add('hidden');
      }

      this.chart.data.datasets = datasets;
      if (type === 'bar') this.chart.data.labels = rows.map(r => String(r[0]));

      this.chart.options.scales.x.title.text = xname + (xunit ? ` (${xunit})` : '');
      this.chart.options.scales.y.title.text = yname + (yunit ? ` (${yunit})` : '');
      this.chart.options.plugins.legend.display = datasets.length > 1;
      this.chart.options.plugins.legend.position = p.legendPos;
      this.chart.options.plugins.title.display = !!title;
      this.chart.options.plugins.title.text = title;
      this.chart.options.plugins.title.font.family = p.font;
      document.getElementById('cu-heading').textContent = title || '커스텀 그래프';
      this.chart.update('none');
    },
    setFitBox(res) {
      const box = document.getElementById('cu-fitbox');
      box.classList.remove('hidden');
      box.innerHTML = `<div class="font-sans text-[0.6rem] text-stone-400 uppercase tracking-wider mb-1">추세선</div>` +
        `<div class="font-mono text-sm text-ink leading-snug">${res.eq}</div>` +
        `<div class="font-mono text-sm text-ink leading-snug">R² = ${res.r2.toFixed(4)}</div>`;
    },

    applyPreset(key) {
      const dataEl = document.getElementById('cu-data');
      if (key === 'custom' || !PRESETS[key]) {
        dataEl.value = DEFAULT_TEXT;
      } else {
        const pr = PRESETS[key];
        const round = (v) => Math.abs(v) >= 100 ? v.toFixed(1) : v.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
        dataEl.value = [pr.header, ...pr.xs.map(x => `${x}, ${round(pr.f(x))}`)].join('\n');
        document.getElementById('cu-title').value = pr.title;
        document.getElementById('cu-type').value = pr.type;
        document.getElementById('cu-xname').value = pr.xname;
        document.getElementById('cu-xunit').value = pr.xunit;
        document.getElementById('cu-yname').value = pr.yname;
        document.getElementById('cu-yunit').value = pr.yunit;
      }
      this.parsed = this.parse(dataEl.value);
      this.update(); // rendered=false면 빈 차트 유지 (사용자가 "데이터 적용"을 눌러야 그려짐)
    },

    applyTheme() { if (this.chart) { this.buildChart(document.getElementById('cu-type').value); this.update(); } },
    refresh() { if (this.chart) this.chart.update('none'); },

    init() {
      ['cu-xname', 'cu-xunit', 'cu-yname', 'cu-yunit', 'cu-title'].forEach(id =>
        document.getElementById(id).addEventListener('input', () => { if (this.rendered) this.update(); }));
      document.getElementById('cu-type').addEventListener('change', () => { if (this.rendered) this.update(); });
      document.getElementById('cu-fit').addEventListener('change', () => { if (this.rendered) this.update(); });
      document.getElementById('cu-fit-on').addEventListener('change', () => { if (this.rendered) this.update(); });
      document.getElementById('cu-errbar').addEventListener('change', () => { if (this.rendered) this.update(); });
      document.getElementById('cu-errmode').addEventListener('change', () => { if (this.rendered) this.update(); });
      document.getElementById('cu-preset').addEventListener('change', (e) => this.applyPreset(e.target.value));
      document.getElementById('cu-apply').addEventListener('click', () => {
        this.parsed = this.parse(document.getElementById('cu-data').value);
        document.getElementById('cu-preset').value = 'custom';
        this.rendered = true; this.update();
      });
      // 엑셀 붙여넣기 최적화: paste 이벤트에서 즉시 파싱·렌더 (탭 구조 보존)
      document.getElementById('cu-data').addEventListener('paste', (e) => {
        const txt = (e.clipboardData || window.clipboardData).getData('text');
        if (txt) {
          e.preventDefault();
          const el = document.getElementById('cu-data');
          // 커서 위치에 삽입(혹은 전체 교체) — 스프레드시트 통째 붙여넣기 시 전체 교체가 자연스러움
          el.value = txt;
          this.parsed = this.parse(txt);
          document.getElementById('cu-preset').value = 'custom';
          this.rendered = true; this.update();
        }
      });

      this.parsed = this.parse(document.getElementById('cu-data').value);
      this.buildChart(document.getElementById('cu-type').value);
      this.inited = true; this.update();
      requestAnimationFrame(() => { this.chart && this.chart.resize(); });

      LG.exporters.custom = () => ({ charts: [this.chart], name: 'custom_graph' });
    },
    ensure() { if (this.inited) { this.chart.resize(); this.update(); } },
    reset() {
      document.getElementById('cu-preset').value = 'custom';
      document.getElementById('cu-data').value = DEFAULT_TEXT;
      document.getElementById('cu-title').value = '';
      document.getElementById('cu-type').value = 'line';
      document.getElementById('cu-xname').value = '시간'; document.getElementById('cu-xunit').value = 's';
      document.getElementById('cu-yname').value = '전압'; document.getElementById('cu-yunit').value = 'V';
      document.getElementById('cu-errbar').checked = false;
      document.getElementById('cu-fit-on').checked = false;
      this.rendered = false;
      this.parsed = this.parse(DEFAULT_TEXT); this.update();
    },
  };

  LG.Custom = Custom;
})();
