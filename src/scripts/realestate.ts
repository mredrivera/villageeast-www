import { BarChart, LineChart, ScatterChart } from 'echarts/charts';
import { GridComponent, LegendComponent, MarkLineComponent, TooltipComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import type { Report } from '~/lib/realestate'; // type-only: no data ships in this bundle

echarts.use([BarChart, LineChart, ScatterChart, GridComponent, LegendComponent, MarkLineComponent, TooltipComponent, CanvasRenderer]);

type Payload = {
  velocity: Report['velocity'];
  completeFrom: number;
  lots: number;
  deals: { date: string; price: number; type: 'home' | 'new_build' | 'lot'; waterfront: boolean; name: string; sqft: number | null; pps: number | null; bundle: number }[];
  buildOut: Report['buildOut'];
  cycles: Report['cycles'];
  idleBuckets: Report['idleBuckets'];
};
const data = JSON.parse(document.getElementById('realestate-data')!.textContent!) as Payload;

// Categorical slots 1-3 of the validated palette, in fixed order; color follows the property type.
const COLOR = { home: '#2a78d6', lot: '#eb6834', new_build: '#1baf7a' } as const;
const LABEL = { home: 'Home', new_build: 'New construction', lot: 'Lot' } as const;
const LAND = '#8fb7c0', BUILDINGS = '#0f4c5c';
const INK = '#17262d', MUTED = '#5b7079', GRID = '#e3e9e8', SURFACE = '#ffffff';
const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
const compact = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${n}`);
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const text = { color: INK, fontFamily: 'Inter Variable, system-ui, sans-serif' };
const tooltip = { backgroundColor: SURFACE, borderColor: GRID, textStyle: { ...text, fontSize: 13 }, extraCssText: 'box-shadow:0 6px 20px rgba(11,51,64,.14);border-radius:10px;' };
const axisLabel = { color: MUTED, fontSize: 12 };
const legend = { top: 0, left: 0, itemWidth: 12, itemHeight: 12, icon: 'roundRect', textStyle: { color: INK, fontSize: 12 } };
const chart = (id: string) => echarts.init(document.getElementById(id)!);
const charts: echarts.ECharts[] = [];

// ---- Sales velocity ------------------------------------------------------------------------------
{
  const c = chart('chart-velocity'); charts.push(c);
  const years = data.velocity.map((v) => String(v.year) + (v.partial ? '*' : ''));
  const series = (['home', 'new_build', 'lot'] as const).map((t) => ({
    name: LABEL[t], type: 'bar', stack: 'sales', barMaxWidth: 30,
    itemStyle: { color: COLOR[t], borderColor: SURFACE, borderWidth: 1 },
    emphasis: { disabled: true },
    data: data.velocity.map((v) => ({ value: v[t], itemStyle: { opacity: v.year < data.completeFrom ? 0.4 : 1 } })),
  }));
  c.setOption({
    textStyle: text, legend, grid: { left: 36, right: 12, top: 40, bottom: 28 },
    tooltip: { ...tooltip, trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(15,76,92,0.06)' } },
      formatter: (ps: { dataIndex: number }[]) => {
        const v = data.velocity[ps[0]!.dataIndex]!;
        const rows = (['home', 'new_build', 'lot'] as const).filter((t) => v[t]).map((t) => `<span style="color:${COLOR[t]}">■</span> ${LABEL[t]}: <b>${v[t]}</b>`);
        return [`<b>${v.year}${v.partial ? ' (year to date)' : ''}</b>`, ...rows, `Total: <b>${v.total}</b> sale${v.total === 1 ? '' : 's'} (${v.lotsSold} lots)`,
          v.medianHome ? `Median home: ${money(v.medianHome)}` : '', v.medianLot ? `Median lot: ${money(v.medianLot)}` : '',
          `<span style="color:${MUTED}">Record complete for ${Math.round(v.coverage * 100)}% of lots</span>`].filter(Boolean).join('<br>');
      } },
    xAxis: { type: 'category', data: years, axisTick: { show: false }, axisLine: { lineStyle: { color: GRID } }, axisLabel: { ...axisLabel, interval: 'auto' } },
    yAxis: { type: 'value', minInterval: 1, axisLabel, splitLine: { lineStyle: { color: GRID } } },
    series,
  });
}

// ---- Every sale: price over time ---------------------------------------------------------------
{
  const c = chart('chart-prices'); charts.push(c);
  const series = (['home', 'new_build', 'lot'] as const).flatMap((t) => [true, false].map((wf) => ({
    name: LABEL[t], type: 'scatter', symbol: wf ? 'circle' : 'emptyCircle', symbolSize: 9,
    itemStyle: { color: COLOR[t], borderColor: wf ? SURFACE : COLOR[t], borderWidth: wf ? 1 : 1.6, opacity: 0.9 },
    emphasis: { scale: 1.6 },
    data: data.deals.filter((d) => d.type === t && d.waterfront === wf).map((d) => ({ value: [d.date, d.price], deal: d })),
  })));
  c.setOption({
    textStyle: text, legend: { ...legend, icon: 'circle', data: Object.values(LABEL) }, grid: { left: 56, right: 16, top: 40, bottom: 28 },
    tooltip: { ...tooltip, trigger: 'item', formatter: (p: { data: { deal: Payload['deals'][number] } }) => {
      const d = p.data.deal;
      return [`<b>${esc(d.name)}</b>`, `${LABEL[d.type]}${d.waterfront ? ', waterfront' : ''}`, `${d.date}: <b>${money(d.price)}</b>`,
        d.pps ? `${money(d.pps)} per sq ft (${d.sqft?.toLocaleString('en-US')} sq ft)` : '', d.bundle > 1 ? `Sold with ${d.bundle - 1} adjoining lot(s)` : ''].filter(Boolean).join('<br>');
    } },
    xAxis: { type: 'time', axisLine: { lineStyle: { color: GRID } }, axisLabel, splitLine: { show: false } },
    yAxis: { type: 'log', logBase: 10, min: 1000, axisLabel: { ...axisLabel, formatter: compact }, splitLine: { lineStyle: { color: GRID } } },
    series,
  });
}

// ---- Build-out ---------------------------------------------------------------------------------
{
  const c = chart('chart-buildout'); charts.push(c);
  c.setOption({
    textStyle: text, grid: { left: 40, right: 72, top: 16, bottom: 28 },
    tooltip: { ...tooltip, trigger: 'axis', formatter: (ps: { dataIndex: number }[]) => {
      const b = data.buildOut[ps[0]!.dataIndex]!;
      return `<b>${b.year}</b><br>${b.built} home${b.built === 1 ? '' : 's'} finished<br>${b.homes} of ${data.lots} lots built (${Math.round(b.share * 100)}%)`;
    } },
    xAxis: { type: 'category', data: data.buildOut.map((b) => String(b.year)), boundaryGap: false, axisTick: { show: false }, axisLine: { lineStyle: { color: GRID } }, axisLabel },
    yAxis: { type: 'value', min: 0, max: data.lots, axisLabel, splitLine: { lineStyle: { color: GRID } } },
    series: [{
      name: 'Homes built', type: 'line', showSymbol: false, lineStyle: { width: 2, color: COLOR.home }, itemStyle: { color: COLOR.home },
      areaStyle: { color: 'rgba(42,120,214,0.14)' },
      data: data.buildOut.map((b) => b.homes),
      markLine: { silent: true, symbol: 'none', lineStyle: { color: MUTED, type: 'dashed' }, label: { color: MUTED, formatter: `All ${data.lots} lots`, position: 'end' }, data: [{ yAxis: data.lots }] },
    }],
  });
}

// ---- Assessed value ----------------------------------------------------------------------------
{
  const c = chart('chart-assessed'); charts.push(c);
  const item = (cyc: Payload['cycles'][number], v: number) => ({ value: v, itemStyle: { opacity: cyc.complete ? 1 : 0.4 } });
  c.setOption({
    textStyle: text, legend, grid: { left: 52, right: 12, top: 40, bottom: 28 },
    tooltip: { ...tooltip, trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(15,76,92,0.06)' } }, formatter: (ps: { dataIndex: number }[]) => {
      const y = data.cycles[ps[0]!.dataIndex]!;
      return [`<b>${y.year} reassessment</b>`, `Land: ${money(y.land)}`, `Buildings: ${money(y.buildings)}`, `Total: <b>${money(y.total)}</b>`,
        y.medianHome ? `Median home: ${money(y.medianHome)}` : '', y.medianLot ? `Median vacant lot: ${money(y.medianLot)}` : '',
        y.complete ? '' : `<span style="color:${MUTED}">Partial: ${y.known} of ${data.lots} lots on record</span>`].filter(Boolean).join('<br>');
    } },
    xAxis: { type: 'category', data: data.cycles.map((y) => String(y.year)), axisTick: { show: false }, axisLine: { lineStyle: { color: GRID } }, axisLabel },
    yAxis: { type: 'value', axisLabel: { ...axisLabel, formatter: compact }, splitLine: { lineStyle: { color: GRID } } },
    series: [
      { name: 'Land', type: 'bar', stack: 'v', barMaxWidth: 44, itemStyle: { color: LAND, borderColor: SURFACE, borderWidth: 1 }, data: data.cycles.map((y) => item(y, y.land)) },
      { name: 'Buildings', type: 'bar', stack: 'v', barMaxWidth: 44, itemStyle: { color: BUILDINGS, borderColor: SURFACE, borderWidth: 1, borderRadius: [4, 4, 0, 0] }, data: data.cycles.map((y) => item(y, y.buildings)) },
    ],
  });
}

// ---- Vacant lots by years held -----------------------------------------------------------------
{
  const c = chart('chart-idle'); charts.push(c);
  c.setOption({
    textStyle: text, grid: { left: 96, right: 36, top: 8, bottom: 8 },
    tooltip: { ...tooltip, trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(15,76,92,0.06)' } }, formatter: (ps: { name: string; value: number }[]) => `${ps[0]!.name}: <b>${ps[0]!.value}</b> vacant lots` },
    xAxis: { type: 'value', show: false },
    yAxis: { type: 'category', inverse: true, data: data.idleBuckets.map((b) => b.label), axisTick: { show: false }, axisLine: { show: false }, axisLabel: { color: INK, fontSize: 12.5 } },
    series: [{ type: 'bar', barWidth: 16, itemStyle: { color: COLOR.lot, borderRadius: [0, 4, 4, 0] }, label: { show: true, position: 'right', color: INK, fontSize: 12 }, data: data.idleBuckets.map((b) => b.lots) }],
  });
}

new ResizeObserver(() => charts.forEach((c) => c.resize())).observe(document.body);
