/**
 * [h1,h2,h3,h1,h2,h3] => [1,2,3,1,2,3]
 * [h2,h3,h1,h2,h3] => [1,2,1,2,3]
 * [h3,h1,h2,h3] => [1,1,2,3]
 * @param tableOfContents
 */
export const makeTitleLevels = (tableOfContents: string[]) => {
  const titleLevels: number[] = []
  const stack: number[] = []
  let lastLevel = 0
  tableOfContents.forEach((title) => {
    const level = Number(title.slice(1, 2))
    if (level > lastLevel) {
      stack.push(level)
      titleLevels.push(stack.length)
    } else if (level === lastLevel) {
      titleLevels.push(stack.length)
    } else {
      while (level < lastLevel) {
        stack.pop()
        lastLevel--
      }
      titleLevels.push(stack.length)
    }
    lastLevel = level
  })
  return titleLevels
}
