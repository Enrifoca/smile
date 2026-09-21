# Chart renderer

Renders tabular data to PNG chart images using ECharts.

Used by `generate_chart` in `src/components/ChatView.tsx`. For conceptual or approximate charts, use the `generate_image` tool and describe the chart in the prompt.

## Supported chart types

| Type | When to use |
| --- | --- |
| `bar` | Comparing values across categories (default). |
| `horizontalBar` | Comparing values when category labels are long. |
| `line` | Trends over time or ordered categories. |
| `area` | Trends where cumulative magnitude matters. |
| `pie` | Part-of-whole with a small number of slices. |
| `doughnut` | Same as pie, with a hollow center. |

## Data shape

```ts
[
  { Month: 'Jan', Revenue: 12000, Cost: 8000 },
  { Month: 'Feb', Revenue: 15000, Cost: 9000 },
]
```

- The first key (`Month`) is the category axis and must contain unique labels.
- Remaining keys are numeric series.
- Values should be numbers. `%` and `$` are auto-detected from string values, but raw numbers are preferred.
- Rows with duplicate category labels are combined by summing their numeric values.

## Styling

- 12-color professional palette.
- Axis labels, grid lines, legend, and data labels.
- Auto-rotates dense category labels.
- Auto-formats large values with `k` suffix; respects `unit: '%'` and `unit: '$'`.
- Automatic logarithmic scale when values span more than two orders of magnitude; can be forced with `logScale: true`.

## API

```ts
import { buildChartOption, renderChartToPng } from './chartRenderer'

const option = buildChartOption({
  type: 'bar',
  data: [...],
  title: 'Monthly revenue',
  xAxisLabel: 'Month',
  yAxisLabel: 'USD',
  unit: '$',
})

const dataUrl = await renderChartToPng({ type: 'bar', data: [...], title: '...' })
```
