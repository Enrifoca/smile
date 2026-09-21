# Diagram renderer

Renders text-based diagrams to PNG images using [Mermaid](https://mermaid.js.org/).

Used by `generate_diagram` in `src/components/ChatView.tsx`.

## Supported diagram types

- `flowchart` / `graph` — flowcharts and directed graphs
- `sequenceDiagram` — sequence diagrams
- `classDiagram` — class diagrams
- `stateDiagram` — state machines
- `erDiagram` — entity-relationship diagrams
- `mindmap` — mind maps
- `timeline` — timelines
- `gantt` — Gantt charts
- `pie` — simple pie charts (for data pies, prefer `generate_chart`)
- `journey` — user journey maps

## Source format

Pass valid Mermaid syntax in the `source` field:

```text
flowchart TD
  A[User request] --> B{Valid?}
  B -->|Yes| C[Process]
  B -->|No| D[Reject]
  C --> E[Return result]
  D --> E
```

The renderer strips markdown fences automatically if the source is wrapped in ` ```mermaid ... ``` `.

## Output

Renders to SVG via Mermaid, then draws the SVG to a canvas and exports a PNG at 2× resolution with a white background.
