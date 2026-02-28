export const PRESET_COLORS = {
  // gray: {
  //   fill: "#9BA3AF",
  //   stroke: "#6B7280",
  // },
  brown: {
    fill: "#937264",
    stroke: "#7C5F53",
  },
  orange: {
    fill: "#D97847",
    stroke: "#C2622F",
  },
  yellow: {
    fill: "#DFAB01",
    stroke: "#B58E00",
  },
  green: {
    fill: "#68A47C",
    stroke: "#528A64",
  },
  blue: {
    fill: "#5B8DB8",
    stroke: "#4B749A",
  },
  purple: {
    fill: "#9A6DD7",
    stroke: "#8154C5",
  },
  pink: {
    fill: "#E255A1",
    stroke: "#D13B8B",
  },
  red: {
    fill: "#E45C3A",
    stroke: "#CC4628",
  },
  // chart1: {
  //   fill: 'hsl(var(--chart-1))',
  //   stroke: 'hsl(var(--chart-1))',
  // },
  // chart2: {
  //   fill: 'hsl(var(--chart-2))',
  //   stroke: 'hsl(var(--chart-2))',
  // },
  // chart3: {
  //   fill: 'hsl(var(--chart-3))',
  //   stroke: 'hsl(var(--chart-3))',
  // },
  // chart4: {
  //   fill: 'hsl(var(--chart-4))',
  //   stroke: 'hsl(var(--chart-4))',
  // },
  // chart5: {
  //   fill: 'hsl(var(--chart-5))',
  //   stroke: 'hsl(var(--chart-5))',
  // },
} as const

export type PresetColor = keyof typeof PRESET_COLORS

// Helper to get all fill colors
export const PRESET_FILL_COLORS = Object.values(PRESET_COLORS).map(
  (color) => color.fill
)

// Helper to get all stroke colors
export const PRESET_STROKE_COLORS = Object.values(PRESET_COLORS).map(
  (color) => color.stroke
)
