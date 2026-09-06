import { markdownReferenceTargets } from "./document-embed-source"

it("lists heading paths and explicit block IDs without fence contents", () => {
  expect(
    markdownReferenceTargets(
      "# Parent\n\n## Child\n\nText ^para\n\n- Item\n\n^list\n\n```md\n# Ignore\n```"
    ).map((item) => item.target)
  ).toEqual(["#Parent", "#Parent#Child", "#^para", "#^list"])
})
