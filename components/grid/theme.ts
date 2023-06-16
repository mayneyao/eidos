import { Theme } from "@glideapps/glide-data-grid"

export const darkTheme = {
  accentColor: "hsl(0,0%,100%)",
  accentLight: "hsl(222.2,47.4%,11.2%)",

  textDark: "#ffffff",
  textMedium: "#b8b8b8",
  textLight: "#a0a0a0",
  textBubble: "#ffffff",

  bgIconHeader: "#b8b8b8",
  fgIconHeader: "#000000",
  textHeader: "#a1a1a1",
  textHeaderSelected: "#000000",

  bgCell: "hsl(224,71%, 4%)",
  bgCellMedium: "#202027",
  bgHeader: "hsl(224,71%, 4%)",
  bgHeaderHasFocus: "hsl(224,71%, 4%)",
  bgHeaderHovered: "#333333",

  bgBubble: "#212121",
  bgBubbleSelected: "#000000",

  bgSearchResult: "#423c24",

  borderColor: "rgba(225,225,225,0.2)",
  drilldownBorder: "rgba(225,225,225,0.4)",

  linkColor: "#4F5DFF",

  headerFontStyle: "bold 14px",
  baseFontStyle: "13px",
  fontFamily:
    "Inter, Roboto, -apple-system, BlinkMacSystemFont, avenir next, avenir, segoe ui, helvetica neue, helvetica, Ubuntu, noto, arial, sans-serif",
}

export const lightTheme: Theme = {
  accentColor: "#4F5DFF",
  accentFg: "#FFFFFF",
  accentLight: "rgba(62, 116, 253, 0.1)",

  textDark: "#313139",
  textMedium: "#737383",
  textLight: "#B2B2C0",
  textBubble: "#313139",

  bgIconHeader: "#FFFFFF",
  fgIconHeader: "#aaaaaa",
  textHeader: "#313139",
  textGroupHeader: "#313139BB",
  textHeaderSelected: "#FFFFFF",

  bgCell: "#FFFFFF",
  bgCellMedium: "#FAFAFB",
  bgHeader: "#FFFFFF",
  bgHeaderHasFocus: "#E9E9EB",
  bgHeaderHovered: "#EFEFF1",

  bgBubble: "#EDEDF3",
  bgBubbleSelected: "#FFFFFF",

  bgSearchResult: "#fff9e3",

  borderColor: "rgba(115, 116, 131, 0.16)",
  drilldownBorder: "rgba(0, 0, 0, 0)",

  linkColor: "#4F5DFF",

  cellHorizontalPadding: 8,
  cellVerticalPadding: 3,

  headerIconSize: 18,

  headerFontStyle: "500 14px",
  baseFontStyle: "13px",
  fontFamily:
    "Inter, Roboto, -apple-system, BlinkMacSystemFont, avenir next, avenir, segoe ui, helvetica neue, helvetica, Ubuntu, noto, arial, sans-serif",
  editorFontSize: "13px",
  lineHeight: 1.4, //unitless scaler depends on your font
}
