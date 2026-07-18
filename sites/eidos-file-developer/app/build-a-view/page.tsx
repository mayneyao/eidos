import type { Metadata } from "next"

import { CodeBlock } from "../components/code-block"
import { DocPage } from "../components/doc-page"

export const metadata: Metadata = { title: "Build a View" }

const pagingCode = `function Timeline({
  source,
  table,
  query,
  selection,
  onSelectionChange,
  onMutation,
}: EidosFileViewRendererProps) {
  const [rows, setRows] = useState<EidosFileRow[]>([])

  useEffect(() => {
    source.getPage(table.table.id, 0, 24, query)
      .then((page) => setRows(page.rows))
  }, [query, source, table.table.id])

  async function advance(row: EidosFileRow) {
    const result = await source.updateRow(
      table.table.id,
      String(row._id),
      { status: "Active" }
    )
    onMutation?.(result)
  }

  // Render month lanes and use onSelectionChange for host-owned selection.
}`

export default function BuildAView() {
  return (
    <DocPage
      index="02 / Build a View"
      title="Views are trusted renderers over a narrow data contract."
      lead="The first release is deliberately React-shaped: a persisted view descriptor selects a statically imported renderer, and the host passes only controlled context."
    >
      <section>
        <h2>Renderer inputs</h2>
        <div className="contract-list">
          <div>
            <code>source</code>
            <span>Async paging and mutation API</span>
          </div>
          <div>
            <code>table / view</code>
            <span>Typed, persisted descriptors</span>
          </div>
          <div>
            <code>query</code>
            <span>Normalized search, filter, and sort</span>
          </div>
          <div>
            <code>selection</code>
            <span>Host-controlled row and field identity</span>
          </div>
          <div>
            <code>state</code>
            <span>View-local serializable state</span>
          </div>
          <div>
            <code>commands</code>
            <span>Host-defined actions with explicit context</span>
          </div>
          <div>
            <code>capabilities</code>
            <span>Read/mutate/asset flags; no raw file or filesystem</span>
          </div>
        </div>
      </section>

      <section>
        <h2>A non-trivial Timeline</h2>
        <p>
          The live implementation pages real records, groups them by due month,
          owns a selected row, writes status changes through the data source,
          and reports the mutation so the host can mark its session dirty.
        </p>
        <CodeBlock code={pagingCode} label="timeline-view.tsx · excerpt" />
      </section>

      <section>
        <h2>Trust model</h2>
        <p>
          A React renderer is application code, not a sandboxed Eidos extension.
          Review it and import it statically. The contract never supplies
          SQLite, raw file bytes, native file handles, Electron IPC, router
          state, or an Eidos Zustand store.
        </p>
        <div className="capability-strip" aria-label="View capabilities">
          <span>read ✓</span>
          <span>mutate host-controlled</span>
          <span>rawFile ×</span>
          <span>nativeFileSystem ×</span>
        </div>
      </section>
    </DocPage>
  )
}
