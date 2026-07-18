import type { Metadata } from "next"

import { DocPage } from "../components/doc-page"
import { Playground } from "../components/playground"

export const metadata: Metadata = { title: "Playground" }

export default function PlaygroundPage() {
  return (
    <DocPage
      index="05 / Playground"
      title="Drive the complete working-copy lifecycle."
      lead="The sample is a real 2,500-row Eidos File. No file is uploaded; the writable adapter below is deliberately in-memory so conflict and failure states are repeatable."
    >
      <Playground />
      <section>
        <h2>Try the failure path</h2>
        <ol className="instruction-list">
          <li>Advance a Timeline record from Backlog to Active.</li>
          <li>Create a recovery checkpoint.</li>
          <li>Choose “Create conflict”, then “Save changes”.</li>
          <li>
            Restore the checkpoint or explicitly overwrite the working copy.
          </li>
        </ol>
      </section>
    </DocPage>
  )
}
