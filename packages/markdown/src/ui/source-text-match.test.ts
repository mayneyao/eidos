import { findSourceTextRange } from "./source-text-match"

it("maps repeated visible text without counting a hidden link destination", () => {
  const root = document.createElement("p")
  root.innerHTML =
    'work <strong>work</strong> <a href="https://work.test">work</a>'
  document.body.append(root)
  try {
    const source = "work **work** [work](https://work.test)"
    const range = findSourceTextRange(root, source, 7, 11)!
    expect(range.toString()).toBe("work")
    expect(range.startContainer.parentElement?.tagName).toBe("STRONG")
    const hidden = source.lastIndexOf("work")
    expect(findSourceTextRange(root, source, hidden, hidden + 4)).toBeNull()
    root.querySelector("strong")!.textContent = "changed"
    expect(findSourceTextRange(root, source, 7, 11)).toBeNull()
  } finally {
    root.remove()
  }
})
