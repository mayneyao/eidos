export function isEscaped(source: string, offset: number): boolean {
  let slashes = 0
  for (
    let index = offset - 1;
    index >= 0 && source[index] === "\\";
    index -= 1
  ) {
    slashes += 1
  }
  return slashes % 2 === 1
}
