export type LiteWindowKind = "welcome" | "space"

const MACOS_TRAFFIC_LIGHT_POSITION = {
  welcome: { x: 16, y: 15 },
  space: { x: 16, y: 12 },
} satisfies Record<LiteWindowKind, { x: number; y: number }>

export function macosTrafficLightPosition(kind: LiteWindowKind): {
  x: number
  y: number
} {
  return MACOS_TRAFFIC_LIGHT_POSITION[kind]
}
