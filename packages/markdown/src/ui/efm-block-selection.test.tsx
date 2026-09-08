import { act } from "react"
import { createRoot } from "react-dom/client"
import {
  $createParagraphNode,
  $createTextNode,
  $createRangeSelection,
  $getRoot,
  $setSelection,
  createEditor,
} from "lexical"
import { EfmBlockSelection } from "./efm-block-selection"

beforeAll(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
})
afterAll(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: false })
})

it("does not enumerate a long text selection for every block", async () => {
  const editor = createEditor({
    onError: (error) => {
      throw error
    },
  })
  const host = document.createElement("div")
  const root = createRoot(host)
  const keys: string[] = []
  editor.update(
    () => {
      for (let index = 0; index < 300; index++) {
        const node = $createParagraphNode().append(
          $createTextNode(`Block ${index}`)
        )
        $getRoot().append(node)
        keys.push(node.getKey())
      }
    },
    { discrete: true }
  )
  try {
    await act(async () => {
      root.render(
        <>
          {keys.map((key) => (
            <EfmBlockSelection key={key} editor={editor} nodeKey={key} />
          ))}
        </>
      )
    })
    const enumerate = vi.fn(() => [])
    await act(async () => {
      editor.update(
        () => {
          const selection = $createRangeSelection()
          selection.anchor.set(keys[0], 0, "element")
          selection.focus.set(keys.at(-1)!, 1, "element")
          selection.getNodes = enumerate
          $setSelection(selection)
        },
        { discrete: true }
      )
    })
    expect(enumerate).not.toHaveBeenCalled()
  } finally {
    await act(async () => root.unmount())
  }
})
