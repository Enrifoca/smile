import * as echarts from 'echarts'

export type ChartType = 'bar' | 'line' | 'area' | 'pie' | 'doughnut' | 'horizontalBar'

export interface ChartDataRow {
  [key: string]: unknown
}

export interface ChartRenderOptions {
  type: ChartType
  data: ChartDataRow[]
  title?: string
  xAxisLabel?: string
  yAxisLabel?: string
  unit?: string
  colors?: string[]
  legend?: boolean
  dataLabels?: boolean
  gridLines?: boolean
  stacked?: boolean
  smooth?: boolean
  /** Force a logarithmic value axis. */
  logScale?: boolean
  /** ECharts option overrides applied last. */
  overrides?: Record<string, unknown>
}

const DEFAULT_COLORS = [
  '#2563eb', // blue-600
  '#dc2626', // red-600
  '#16a34a', // green-600
  '#9333ea', // purple-600
  '#ea580c', // orange-600
  '#0891b2', // cyan-600
  '#db2777', // pink-600
  '#65a30d', // lime-600
  '#4f46e5', // indigo-600
  '#ca8a04', // yellow-600
  '#0d9488', // teal-600
  '#7c3aed', // violet-600
]

const AXIS_TEXT_COLOR = '#374151'
const GRID_COLOR = '#e5e7eb'

function isNumeric(value: unknown): boolean {
  if (typeof value === 'number') return true
  if (typeof value !== 'string') return false
  const normalized = value.replace(/[$,%\s]/g, '')
  return normalized !== '' && !Number.isNaN(Number(normalized))
}

function parseNumeric(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value !== 'string') return 0
  const normalized = value.replace(/[$,%\s]/g, '').replace(/,/g, '')
  const n = Number(normalized)
  return Number.isFinite(n) ? n : 0
}

function detectUnit(seriesValues: unknown[]): string | undefined {
  if (seriesValues.length === 0) return undefined
  const first = String(seriesValues[0])
  if (first.includes('%')) return '%'
  if (first.includes('$')) return '$'
  return undefined
}

function formatValue(value: number, unit?: string): string {
  if (unit === '%') return `${value}%`
  if (unit === '$') return `$${value.toLocaleString()}`
  return value.toLocaleString()
}

function inferKeys(data: ChartDataRow[]): { labelKey: string; seriesKeys: string[] } {
  const keys = data.length > 0 ? Object.keys(data[0]) : []
  const labelKey = keys[0] || 'label'
  const numericKeys = keys.slice(1).filter(key => data.some(row => isNumeric(row[key])))
  const seriesKeys = numericKeys.length > 0 ? numericKeys : keys.slice(1).length > 0 ? keys.slice(1) : ['value']
  return { labelKey, seriesKeys }
}

export interface ChartValidationResult {
  valid: boolean
  error?: string
  /** Data after cleaning/aggregation; use this for rendering when valid. */
  data?: ChartDataRow[]
  /** True when duplicate labels were combined by summing numeric values. */
  aggregated?: boolean
}

const MAX_CATEGORIES = 30
const MIN_ROWS = 2

/**
 * Combine rows that share the same category label by summing their numeric series.
 * Preserves the first-occurrence order of labels.
 */
function aggregateRowsByLabel(
  data: ChartDataRow[],
  labelKey: string,
  seriesKeys: string[],
): { rows: ChartDataRow[]; aggregated: boolean } {
  const seen = new Map<string, ChartDataRow>()
  let aggregated = false

  for (const row of data) {
    const label = String(row[labelKey])
    const existing = seen.get(label)
    if (!existing) {
      seen.set(label, { ...row })
      continue
    }

    aggregated = true
    for (const key of seriesKeys) {
      existing[key] = parseNumeric(existing[key]) + parseNumeric(row[key])
    }
  }

  return { rows: Array.from(seen.values()), aggregated }
}

/**
 * Validate that chart data is meaningful and renderable.
 * Returns an error message when the data looks fabricated, malformed, or unsuitable.
 * Duplicate category labels are combined by summing their numeric values.
 */
export function validateChartData(type: ChartType, data: ChartDataRow[]): ChartValidationResult {
  if (!Array.isArray(data) || data.length < MIN_ROWS) {
    return { valid: false, error: `Chart needs at least ${MIN_ROWS} data rows.` }
  }

  if (data.length > MAX_CATEGORIES && (type === 'pie' || type === 'doughnut')) {
    return { valid: false, error: `Pie/doughnut charts should have at most ${MAX_CATEGORIES} slices.` }
  }

  if (data.length > MAX_CATEGORIES && (type === 'bar' || type === 'horizontalBar')) {
    return { valid: false, error: `Too many categories (${data.length}). Use at most ${MAX_CATEGORIES} or summarize the data first.` }
  }

  const keys = data.length > 0 ? Object.keys(data[0]) : []
  if (keys.length < 2) {
    return { valid: false, error: 'Chart data must have at least two columns: a label column and one or more numeric columns.' }
  }

  const { labelKey, seriesKeys } = inferKeys(data)
  if (seriesKeys.length === 0) {
    return { valid: false, error: 'Chart data has no numeric columns. Provide numbers for the value axis.' }
  }

  const { rows: aggregatedData, aggregated } = aggregateRowsByLabel(data, labelKey, seriesKeys)

  const labels = aggregatedData.map(row => String(row[labelKey]))
  const emptyLabels = labels.some(label => !label || label.trim() === '')
  if (emptyLabels) {
    return { valid: false, error: 'Chart data has empty labels.' }
  }

  let allZero = true
  let valueCount = 0
  for (const row of aggregatedData) {
    for (const key of seriesKeys) {
      const value = parseNumeric(row[key])
      valueCount++
      if (value !== 0) allZero = false
    }
  }

  if (allZero && valueCount > 0) {
    return { valid: false, error: 'All chart values are zero. There is nothing meaningful to visualize.' }
  }

  return { valid: true, data: aggregatedData, aggregated }
}

function sanitizeRows(data: ChartDataRow[]): ChartDataRow[] {
  // Remove rows that have no usable label or values.
  return data.filter(row => Object.values(row).some(v => v !== undefined && v !== null && v !== ''))
}

function allValuesPositive(data: ChartDataRow[], seriesKeys: string[]): boolean {
  for (const row of data) {
    for (const key of seriesKeys) {
      const value = parseNumeric(row[key])
      if (value <= 0) return false
    }
  }
  return true
}

function shouldUseLogScale(
  data: ChartDataRow[],
  seriesKeys: string[],
  explicitLogScale?: boolean,
): boolean {
  if (explicitLogScale === true) return true
  if (explicitLogScale === false) return false
  // Auto-detect: enable log scale when the max/min ratio is very large.
  if (!allValuesPositive(data, seriesKeys)) return false
  let min = Infinity
  let max = -Infinity
  for (const row of data) {
    for (const key of seriesKeys) {
      const value = parseNumeric(row[key])
      if (value > 0) {
        min = Math.min(min, value)
        max = Math.max(max, value)
      }
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === 0) return false
  return max / min > 100
}

export function buildChartOption(options: ChartRenderOptions): echarts.EChartsCoreOption {
  const {
    type,
    data: rawData,
    title,
    xAxisLabel,
    yAxisLabel,
    unit,
    colors = DEFAULT_COLORS,
    legend = true,
    dataLabels = true,
    gridLines = true,
    stacked = false,
    smooth = type === 'line' || type === 'area',
    overrides = {},
  } = options

  const data = sanitizeRows(rawData)
  const { labelKey, seriesKeys } = inferKeys(data)

  const baseTitle = title
    ? {
        text: title,
        left: 'center',
        top: 16,
        textStyle: { fontSize: 18, fontWeight: 600, color: '#111827' },
      }
    : undefined

  const commonGrid = {
    left: 72,
    right: 40,
    top: title ? 64 : 32,
    bottom: 72,
    containLabel: false,
  }

  const tooltipFormatter = (params: unknown) => {
    const arr = Array.isArray(params) ? params : [params]
    if (!arr.length) return ''
    const first = arr[0] as { name?: string; axisValue?: string }
    const header = first.name ?? first.axisValue ?? ''
    const rows = arr
      .map((p: unknown) => {
        const item = p as { seriesName?: string; value?: number; marker?: string }
        return `${item.marker ?? ''} ${item.seriesName ?? ''}: <strong>${formatValue(Number(item.value ?? 0), unit)}</strong>`
      })
      .join('<br/>')
    return `${header}<br/>${rows}`
  }

  const commonTooltip = {
    trigger: type === 'pie' || type === 'doughnut' ? 'item' : 'axis',
    backgroundColor: '#ffffff',
    borderColor: GRID_COLOR,
    textStyle: { color: AXIS_TEXT_COLOR },
    formatter: tooltipFormatter,
  }

  if (type === 'pie' || type === 'doughnut') {
    const seriesKey = seriesKeys[0]
    const autoUnit = unit ?? detectUnit(data.map(row => row[seriesKey]))
    const pieData = data
      .map(row => ({
        name: String(row[labelKey]),
        value: parseNumeric(row[seriesKey]),
      }))
      .filter(d => d.value !== 0)
      .sort((a, b) => b.value - a.value)

    return {
      color: colors,
      title: baseTitle,
      tooltip: {
        ...commonTooltip,
        formatter: (params: unknown) => {
          const p = params as { name?: string; value?: number; percent?: number }
          return `${p.name}<br/>${formatValue(Number(p.value ?? 0), autoUnit)} (${p.percent ?? 0}%)`
        },
      },
      legend: legend
        ? {
            type: 'scroll',
            orient: 'vertical',
            right: 10,
            top: title ? 64 : 24,
            bottom: 24,
            textStyle: { color: AXIS_TEXT_COLOR },
          }
        : undefined,
      series: [
        {
          type: 'pie',
          radius: type === 'doughnut' ? ['45%', '75%'] : '65%',
          center: legend ? ['40%', '55%'] : ['50%', '55%'],
          data: pieData,
          itemStyle: { borderRadius: 4, borderColor: '#fff', borderWidth: 2 },
          label: dataLabels
            ? {
                show: true,
                formatter: '{b}\n{d}%',
                color: AXIS_TEXT_COLOR,
              }
            : { show: false },
          emphasis: {
            itemStyle: { shadowBlur: 12, shadowOffsetX: 0, shadowColor: 'rgba(0,0,0,0.25)' },
          },
        },
      ],
      ...overrides,
    } as echarts.EChartsCoreOption
  }

  const isHorizontal = type === 'horizontalBar'
  const xAxisData = data.map(row => String(row[labelKey]))
  const autoUnit = unit ?? detectUnit(data.flatMap(row => seriesKeys.map(k => row[k])))
  const useLogScale = shouldUseLogScale(data, seriesKeys, options.logScale)

  const series = seriesKeys.map(key => ({
    name: key,
    type: type === 'line' || type === 'area' ? 'line' : isHorizontal ? 'bar' : 'bar',
    stack: stacked ? 'total' : undefined,
    smooth: type === 'line' || type === 'area' ? smooth : undefined,
    areaStyle: type === 'area' ? { opacity: 0.25 } : undefined,
    data: data.map(row => parseNumeric(row[key])),
    itemStyle: { borderRadius: isHorizontal ? [0, 4, 4, 0] : [4, 4, 0, 0] },
    label: dataLabels
      ? {
          show: xAxisData.length <= 24,
          position: isHorizontal ? 'right' : 'top',
          formatter: (p: unknown) => {
            const v = Number((p as { value?: number }).value ?? 0)
            return autoUnit === '%' ? `${v}%` : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)
          },
          color: AXIS_TEXT_COLOR,
          fontSize: 11,
        }
      : { show: false },
  }))

  const axisLabelStyle = { color: AXIS_TEXT_COLOR, fontSize: 12 }
  const nameTextStyle = { color: AXIS_TEXT_COLOR, fontSize: 13, fontWeight: 500 }
  const categoryAxis = {
    type: 'category' as const,
    data: xAxisData,
    axisLabel: {
      ...axisLabelStyle,
      interval: 0,
      rotate: xAxisData.length > 8 ? 30 : 0,
    },
    axisLine: { lineStyle: { color: GRID_COLOR } },
    axisTick: { alignWithLabel: true, lineStyle: { color: GRID_COLOR } },
    name: isHorizontal ? yAxisLabel || labelKey : xAxisLabel || labelKey,
    nameLocation: 'middle' as const,
    nameGap: 36,
    nameTextStyle,
  }

  const valueAxis = {
    type: useLogScale ? ('log' as const) : ('value' as const),
    axisLabel: {
      ...axisLabelStyle,
      formatter: (value: number) => {
        if (useLogScale) {
          const exponent = Math.log10(value)
          if (Number.isFinite(exponent) && Math.abs(exponent - Math.round(exponent)) < 0.001) {
            return `10^${Math.round(exponent)}`
          }
          return value.toExponential(1)
        }
        if (autoUnit === '%') return `${value}%`
        if (autoUnit === '$') return `$${value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value}`
        return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value)
      },
    },
    logBase: useLogScale ? 10 : undefined,
    splitLine: gridLines ? { lineStyle: { color: GRID_COLOR, type: 'dashed' } } : { show: false },
    axisLine: { show: false },
    axisTick: { show: false },
    name: isHorizontal ? xAxisLabel || (seriesKeys.length === 1 ? seriesKeys[0] : 'Value') : yAxisLabel || (seriesKeys.length === 1 ? seriesKeys[0] : 'Value'),
    nameLocation: 'middle' as const,
    nameGap: 48,
    nameTextStyle,
  }

  return {
    color: colors,
    title: baseTitle,
    tooltip: commonTooltip,
    legend: legend
      ? {
          bottom: 8,
          textStyle: { color: AXIS_TEXT_COLOR },
          itemGap: 16,
        }
      : undefined,
    grid: commonGrid,
    xAxis: isHorizontal ? valueAxis : categoryAxis,
    yAxis: isHorizontal ? categoryAxis : valueAxis,
    series,
    ...overrides,
  } as echarts.EChartsCoreOption
}

export async function renderChartToPng(
  options: ChartRenderOptions,
  width = 900,
  height = 520,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const container = document.createElement('div')
    container.style.position = 'fixed'
    container.style.left = '-9999px'
    container.style.top = '-9999px'
    container.style.width = `${width}px`
    container.style.height = `${height}px`
    document.body.appendChild(container)

    try {
      const chart = echarts.init(container, undefined, { renderer: 'canvas', width, height })
      chart.setOption(buildChartOption(options))

      requestAnimationFrame(() => {
        try {
          const dataUrl = chart.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#ffffff' })
          resolve(dataUrl)
        } catch (err) {
          reject(err)
        } finally {
          chart.dispose()
          if (container.parentNode) container.parentNode.removeChild(container)
        }
      })
    } catch (err) {
      if (container.parentNode) container.parentNode.removeChild(container)
      reject(err)
    }
  })
}
