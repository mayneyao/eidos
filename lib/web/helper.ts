export const isWindows = () =>
  navigator.userAgent.toLowerCase().indexOf("windows") > -1

export const isMac = () => navigator.userAgent.toLowerCase().indexOf("mac") > -1
