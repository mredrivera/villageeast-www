import { BarChart, LineChart, SankeyChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import type { FinanceYear, Line } from '~/data/finance'; // type-only: erased at build, so no data ships in this bundle

echarts.use([BarChart, LineChart, SankeyChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

type Payload = { years: FinanceYear[]; reserve: { year: number; startBalance: number; projected: boolean }[]; categories: string[] };
const data = JSON.parse(document.getElementById('finance-data')!.textContent!) as Payload;

// Categorical colors follow the entity (category), in a fixed order, and never change with filters.
const COLOR: Record<string, string> = { Administration: '#2a78d6', Clubhouse: '#eb6834', Pool: '#1baf7a', Grounds: '#eda100', Roads: '#e87ba4', 'Capital projects': '#008300' };
const INCOME = '#0f4c5c';
const INK = '#17262d', MUTED = '#5b7079', GRID = '#e3e9e8', SURFACE = '#ffffff';
const money = (n: number) => (n < 0 ? '-' : '') + '$' + Math.abs(Math.round(n)).toLocaleString('en-US');
const compact = (n: number) => '$' + (Math.abs(n) >= 1000 ? Math.round(n / 1000) + 'k' : String(n));
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const total = (lines: Line[], f: (l: Line) => boolean = () => true) => lines.filter(f).reduce((t, l) => t + l.amount, 0);
const byYear = new Map(data.years.map((y) => [y.year, y]));
const text = { color: INK, fontFamily: 'Inter Variable, system-ui, sans-serif' };
const tooltip = { backgroundColor: SURFACE, borderColor: GRID, textStyle: { ...text, fontSize: 13 }, extraCssText: 'box-shadow:0 6px 20px rgba(11,51,64,.14);border-radius:10px;' };
const axisLabel = { color: MUTED, fontSize: 12 };

let year = data.years[data.years.length - 1]!.year;
let withCapital = false;

const charts = Object.fromEntries(['flow', 'trend', 'net', 'budget', 'reserve'].map((id) => [id, echarts.init(document.getElementById(`chart-${id}`)!)]));
new ResizeObserver(() => Object.values(charts).forEach((c) => c.resize())).observe(document.body);

function summary(y: FinanceYear) {
  const income = total(y.income);
  const operating = total(y.expenses, (l) => !l.capital);
  const capitalInOps = total(y.expenses, (l) => !!l.capital);
  const capital = Math.max(capitalInOps, y.capital.reduce((t, c) => t + c.actual, 0));
  return { income, operating, capital, net: income - operating };
}

function renderKpis() {
  const y = byYear.get(year)!;
  const s = summary(y);
  const prev = byYear.get(year - 1);
  const p = prev ? summary(prev) : null;
  const tile = (label: string, value: number, before: number | null, goodWhenUp: boolean, hint = '') => {
    let delta = '';
    if (before !== null && before !== 0) {
      const pct = ((value - before) / Math.abs(before)) * 100;
      const up = pct >= 0;
      delta = `<div class="kpi-delta ${up === goodWhenUp ? 'up' : 'down'}">${up ? '▲' : '▼'} ${Math.abs(pct).toFixed(0)}% vs ${year - 1}</div>`;
    }
    return `<div class="kpi"><div class="kpi-label">${esc(label)}</div><div class="kpi-value">${money(value)}</div>${delta}${hint ? `<div class="small muted">${esc(hint)}</div>` : ''}</div>`;
  };
  document.getElementById('kpis')!.innerHTML =
    tile('Total income', s.income, p?.income ?? null, true) +
    tile('Operating spending', s.operating, p?.operating ?? null, false) +
    tile('Operating surplus', s.net, null, true, 'Available for reserves and projects') +
    tile('Capital projects', s.capital, null, false, s.capital ? 'Funded from reserves' : 'None recorded');
  document.getElementById('year-source')!.textContent = `Source: ${y.source} (${y.basis})`;
  const note = document.getElementById('year-note')!;
  note.hidden = !y.note;
  note.textContent = y.note ?? '';
  for (const id of ['flow-year', 'budget-year', 'table-year']) document.getElementById(id)!.textContent = String(year);
}

function renderFlow() {
  const y = byYear.get(year)!;
  const s = summary(y);
  const hub = 'Village East';
  const nodes: { name: string; itemStyle: { color: string }; label?: object }[] = [{ name: hub, itemStyle: { color: INCOME } }];
  const links: { source: string; target: string; value: number }[] = [];
  const incomeCats = [...new Set(y.income.map((l) => l.category))];
  for (const c of incomeCats) {
    const v = total(y.income, (l) => l.category === c);
    if (v <= 0) continue;
    nodes.push({ name: c, itemStyle: { color: '#5d9aa6' } });
    links.push({ source: c, target: hub, value: v });
  }
  const capitalInOps = total(y.expenses, (l) => !!l.capital);
  const spend = s.operating + capitalInOps;
  if (spend > s.income) {
    nodes.push({ name: 'Drawn from reserves', itemStyle: { color: '#9aa8ad' } });
    links.push({ source: 'Drawn from reserves', target: hub, value: spend - s.income });
  }
  for (const c of data.categories) {
    const lines = y.expenses.filter((l) => l.category === c && !l.capital && l.amount > 0);
    const v = total(lines);
    if (v <= 0) continue;
    nodes.push({ name: c, itemStyle: { color: COLOR[c]! } });
    links.push({ source: hub, target: c, value: v });
    // Third column: the biggest items; the long tail folds into "Other".
    const big = lines.filter((l) => l.amount >= 1500).sort((a, b) => b.amount - a.amount).slice(0, 3);
    const rest = v - total(big);
    for (const l of big) {
      const name = `${c}: ${l.line}`;
      nodes.push({ name, itemStyle: { color: COLOR[c]! } });
      links.push({ source: c, target: name, value: l.amount });
    }
    if (rest > 0 && big.length) {
      const name = `${c}: other`;
      nodes.push({ name, itemStyle: { color: COLOR[c]! } });
      links.push({ source: c, target: name, value: rest });
    }
  }
  if (capitalInOps > 0) {
    nodes.push({ name: 'Capital projects', itemStyle: { color: COLOR['Capital projects']! } });
    links.push({ source: hub, target: 'Capital projects', value: capitalInOps });
    for (const l of y.expenses.filter((x) => x.capital)) {
      const name = l.line.replace(' (capital project)', '');
      nodes.push({ name, itemStyle: { color: COLOR['Capital projects']! } });
      links.push({ source: 'Capital projects', target: name, value: l.amount });
    }
  }
  if (s.income > spend) {
    nodes.push({ name: 'Surplus to reserves', itemStyle: { color: '#9aa8ad' } });
    links.push({ source: hub, target: 'Surplus to reserves', value: s.income - spend });
  }
  const narrow = window.innerWidth < 720;
  charts.flow!.setOption({
    tooltip: { ...tooltip, trigger: 'item', formatter: (p: { dataType: string; name: string; value: number; data: { source: string; target: string } }) =>
      p.dataType === 'edge' ? `${esc(p.data.source)} → ${esc(p.data.target.replace(/^.*?: /, ''))}<br><b>${money(p.value)}</b>` : `${esc(p.name.replace(/^.*?: /, ''))}<br><b>${money(p.value)}</b>` },
    series: [{
      type: 'sankey', left: 8, right: narrow ? 120 : 250, top: 12, bottom: 12, nodeWidth: 14, nodeGap: 10, draggable: false,
      emphasis: { focus: 'adjacency' },
      lineStyle: { color: 'gradient', opacity: 0.32, curveness: 0.5 },
      itemStyle: { borderWidth: 0, borderRadius: 3 },
      label: { ...text, fontSize: narrow ? 11 : 12.5, formatter: (p: { name: string; value: number }) => `${p.name.replace(/^.*?: /, '')}  ${compact(p.value)}`, overflow: 'truncate', width: narrow ? 112 : 240 },
      data: nodes, links,
    }],
  }, true);
}

function renderTrend() {
  const years = data.years.map((y) => String(y.year));
  const cats = withCapital ? [...data.categories, 'Capital projects'] : data.categories;
  charts.trend!.setOption({
    textStyle: text,
    grid: { left: 52, right: 12, top: 64, bottom: 28 },
    legend: { top: 0, left: 0, itemWidth: 12, itemHeight: 12, icon: 'roundRect', textStyle: { color: INK, fontSize: 12 } },
    tooltip: { ...tooltip, trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(15,76,92,0.06)' } }, valueFormatter: (v: number) => money(v) },
    xAxis: { type: 'category', data: years, axisTick: { show: false }, axisLine: { lineStyle: { color: GRID } }, axisLabel },
    yAxis: { type: 'value', axisLabel: { ...axisLabel, formatter: compact }, splitLine: { lineStyle: { color: GRID } } },
    series: cats.map((c) => ({
      name: c, type: 'bar', stack: 'spend', barMaxWidth: 46,
      itemStyle: { color: COLOR[c], borderColor: SURFACE, borderWidth: 1 },
      emphasis: { focus: 'series' },
      data: data.years.map((y) => c === 'Capital projects'
        ? Math.max(total(y.expenses, (l) => !!l.capital), y.capital.reduce((t, x) => t + x.actual, 0))
        : total(y.expenses, (l) => l.category === c && !l.capital)),
    })),
  }, true);
}

function renderNet() {
  const years = data.years.map((y) => String(y.year));
  const sums = data.years.map(summary);
  const line = (name: string, color: string, values: number[]) => ({
    name, type: 'line', data: values, symbol: 'circle', symbolSize: 8, lineStyle: { width: 2, color }, itemStyle: { color, borderColor: SURFACE, borderWidth: 2 },
    emphasis: { focus: 'series' },
  });
  charts.net!.setOption({
    textStyle: text,
    grid: { left: 52, right: 20, top: 64, bottom: 28 },
    legend: { top: 0, left: 0, itemWidth: 14, textStyle: { color: INK, fontSize: 12 } },
    tooltip: { ...tooltip, trigger: 'axis', valueFormatter: (v: number) => money(v) },
    xAxis: { type: 'category', data: years, boundaryGap: false, axisTick: { show: false }, axisLine: { lineStyle: { color: GRID } }, axisLabel },
    yAxis: { type: 'value', min: 0, axisLabel: { ...axisLabel, formatter: compact }, splitLine: { lineStyle: { color: GRID } } },
    series: [
      line('Income', '#2a78d6', sums.map((s) => s.income)),
      line('Operating spending', '#eb6834', sums.map((s) => s.operating)),
      line('With capital projects', '#1baf7a', sums.map((s) => s.operating + s.capital)),
    ],
  }, true);
}

function renderBudget() {
  const y = byYear.get(year)!;
  const el = document.getElementById('chart-budget')!;
  const empty = document.getElementById('budget-empty')!;
  el.hidden = !y.budget;
  empty.hidden = !!y.budget;
  if (!y.budget) return;
  const cats = [...data.categories].reverse();
  charts.budget!.resize();
  charts.budget!.setOption({
    textStyle: text,
    grid: { left: 104, right: 56, top: 34, bottom: 8 },
    legend: { top: 0, left: 0, itemWidth: 12, itemHeight: 12, icon: 'roundRect', textStyle: { color: INK, fontSize: 12 } },
    tooltip: { ...tooltip, trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(15,76,92,0.06)' } }, valueFormatter: (v: number) => money(v) },
    xAxis: { type: 'value', axisLabel: { show: false }, splitLine: { show: false } },
    yAxis: { type: 'category', data: cats, axisTick: { show: false }, axisLine: { show: false }, axisLabel: { color: INK, fontSize: 12.5 } },
    series: [
      { name: 'Budget', type: 'bar', barWidth: 10, barGap: '20%', itemStyle: { color: '#b8c4c8', borderRadius: [0, 4, 4, 0] }, data: cats.map((c) => y.budget!.expenses[c] ?? 0) },
      { name: 'Actual', type: 'bar', barWidth: 10, itemStyle: { color: INCOME, borderRadius: [0, 4, 4, 0] }, label: { show: true, position: 'right', color: INK, fontSize: 12, formatter: (p: { value: number }) => compact(p.value) }, data: cats.map((c) => total(y.expenses, (l) => l.category === c && !l.capital)) },
    ],
  }, true);
}

function renderReserve() {
  const r = data.reserve;
  const firstProjected = r.findIndex((x) => x.projected);
  charts.reserve!.setOption({
    textStyle: text,
    grid: { left: 52, right: 16, top: 34, bottom: 28 },
    legend: { top: 0, left: 0, itemWidth: 14, textStyle: { color: INK, fontSize: 12 } },
    tooltip: { ...tooltip, trigger: 'axis', valueFormatter: (v: number | string) => (typeof v === 'number' ? money(v) : '') },
    xAxis: { type: 'category', data: r.map((x) => String(x.year)), boundaryGap: false, axisTick: { show: false }, axisLine: { lineStyle: { color: GRID } }, axisLabel },
    yAxis: { type: 'value', min: 0, axisLabel: { ...axisLabel, formatter: compact }, splitLine: { lineStyle: { color: GRID } } },
    series: [
      { name: 'Actual', type: 'line', symbol: 'circle', symbolSize: 8, lineStyle: { width: 2, color: INCOME }, itemStyle: { color: INCOME, borderColor: SURFACE, borderWidth: 2 }, areaStyle: { color: 'rgba(15,76,92,0.08)' }, data: r.map((x, i) => (i < firstProjected ? x.startBalance : '-')) },
      { name: 'Planned', type: 'line', symbol: 'emptyCircle', symbolSize: 8, lineStyle: { width: 2, type: 'dashed', color: INCOME }, itemStyle: { color: INCOME }, data: r.map((x, i) => (i >= firstProjected - 1 ? x.startBalance : '-')) },
    ],
  }, true);
}

function renderTable() {
  const y = byYear.get(year)!;
  const prev = byYear.get(year - 1);
  const body = document.querySelector('#detail-table tbody')!;
  const rows: string[] = [];
  const section = (title: string, lines: Line[], prevLines: Line[] | undefined) => {
    rows.push(`<tr><th colspan="2" scope="rowgroup">${esc(title)}</th><th class="num">${money(total(lines))}</th><th class="num">${prevLines ? money(total(prevLines)) : ''}</th><th></th></tr>`);
    for (const l of lines) {
      const before = prevLines?.find((p) => p.category === l.category && p.line === l.line)?.amount;
      const change = before === undefined ? '' : `<span class="${l.amount - before > 0 ? 'down' : 'up'}">${l.amount - before >= 0 ? '+' : '-'}${money(Math.abs(l.amount - before))}</span>`;
      rows.push(`<tr><td>${esc(l.category)}</td><td>${esc(l.line)}</td><td class="num">${money(l.amount)}</td><td class="num">${before === undefined ? '—' : money(before)}</td><td class="num">${change}</td></tr>`);
    }
  };
  section('Income', y.income, prev?.income);
  section('Spending', y.expenses, prev?.expenses);
  body.innerHTML = rows.join('');
}

function renderYear() { renderKpis(); renderFlow(); renderBudget(); renderTable(); }

const press = (group: HTMLElement, btn: HTMLElement) => group.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
document.getElementById('year-picker')!.addEventListener('click', (ev) => {
  const btn = (ev.target as HTMLElement).closest('button');
  if (!btn) return;
  year = Number(btn.dataset.year);
  press(ev.currentTarget as HTMLElement, btn);
  renderYear();
});
document.getElementById('capital-toggle')!.addEventListener('click', (ev) => {
  const btn = (ev.target as HTMLElement).closest('button');
  if (!btn) return;
  withCapital = btn.dataset.capital === '1';
  press(ev.currentTarget as HTMLElement, btn);
  renderTrend();
});
// Clicking a bar in the trend chart jumps to that year.
charts.trend!.on('click', (p) => {
  const btn = document.querySelector<HTMLElement>(`#year-picker button[data-year="${p.name}"]`);
  btn?.click();
});

renderYear(); renderTrend(); renderNet(); renderReserve();
