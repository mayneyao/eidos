import { expect, test, type Locator, type Page } from "@playwright/test"

async function installFallbackMode(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperties(window, {
      showOpenFilePicker: { configurable: true, value: undefined },
      showSaveFilePicker: { configurable: true, value: undefined },
    })
  })
}

async function fieldRow(inspector: Locator, name: string): Promise<Locator> {
  const label = inspector.getByText(name, { exact: true })
  await expect(label).toBeVisible()
  return label.locator("..")
}

async function toggleMultiSelectOption(
  page: Page,
  trigger: Locator,
  optionName: string
): Promise<void> {
  const option = page
    .getByRole("button", { name: optionName, exact: true })
    .last()
  await expect(async () => {
    if (!(await option.isVisible())) await trigger.click()
    await expect(option).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 15_000 })
  await option.click()
}

async function selectRelationOption(
  page: Page,
  trigger: Locator,
  optionName: string
): Promise<void> {
  const option = page.getByRole("option", { name: optionName, exact: true })
  await expect(async () => {
    if (!(await option.isVisible())) await trigger.click()
    await expect(option).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 15_000 })
  await option.click()
}

test("edits every writable Feature Lab field through the Chromium editor", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "Chromium covers the SQLite WASM editing path"
  )
  test.setTimeout(180_000)
  await installFallbackMode(page)

  const pageErrors: string[] = []
  page.on("pageerror", (error) => pageErrors.push(error.message))

  await page.goto("/")
  await page.getByRole("button", { name: "Choose a template" }).click()
  await page
    .getByRole("button", { name: "Open Eidos 1.0 Feature Lab template" })
    .click()

  await page.getByRole("tab", { name: "Quality signals", exact: true }).click()
  await expect(
    page.getByText("Filter values exceed the query limit")
  ).toHaveCount(0)
  await expect(page.locator("[data-testid='glide-cell-1-0']")).toContainText(
    "Feature"
  )

  await page.getByRole("tab", { name: "Lab gallery", exact: true }).click()
  await page.getByRole("button", { name: "Open Feature Lab launch" }).click()
  const inspector = page.locator('[data-eidos-file-detail-panel="record"]')
  await expect(inspector).toBeVisible()

  const experiment = inspector.getByRole("textbox", { name: "Experiment" })
  await experiment.fill("QA all-field record")
  await experiment.press("Control+Enter")
  await expect(experiment).toHaveValue("QA all-field record")

  const summary = inspector.getByRole("textbox", { name: "Summary" })
  await summary.fill("Text edit with 中文 and emoji ✅")
  await summary.press("Control+Enter")
  await expect(summary).toHaveValue("Text edit with 中文 and emoji ✅")

  const budget = inspector.getByRole("spinbutton", { name: "Budget" })
  await budget.fill("1000.5")
  await budget.press("Enter")
  await expect(budget).toHaveValue("1000.5")

  const progress = inspector.getByRole("spinbutton", { name: "Progress" })
  await progress.fill("")
  await progress.press("Enter")
  await expect(progress).toHaveValue("")
  await progress.fill("0.25")
  await progress.press("Enter")
  await expect(progress).toHaveValue("0.25")
  await expect(await fieldRow(inspector, "Weighted budget")).toContainText(
    "250.125"
  )

  const samples = inspector.getByRole("textbox", { name: "Samples" })
  await samples.fill("41")
  await samples.press("Enter")
  await expect(samples).toHaveValue("41")
  await expect(await fieldRow(inspector, "Sample successor")).toContainText(
    "42"
  )

  const stage = inspector.getByRole("combobox", { name: "Stage" })
  await stage.click()
  await page.getByRole("option", { name: "Review", exact: true }).click()
  await expect(stage).toContainText("Review")

  const signals = inspector.getByRole("button", {
    name: "Signals",
    exact: true,
  })
  await toggleMultiSelectOption(page, signals, "Quality")
  await expect(signals).toContainText("Accessibility")
  await toggleMultiSelectOption(page, signals, "Accessibility")
  await expect(signals).toContainText("Empty")
  await toggleMultiSelectOption(page, signals, "Speed")
  await expect(signals).toContainText("Speed")

  const approved = inspector.getByRole("switch", { name: "Approved" })
  const approvedBefore = await approved.isChecked()
  await approved.click()
  await expect(approved).toHaveAttribute(
    "data-state",
    approvedBefore ? "unchecked" : "checked"
  )

  const confidence = inspector.getByRole("spinbutton", { name: "Confidence" })
  await confidence.fill("4")
  await confidence.press("Enter")
  await expect(confidence).toHaveValue("4")

  const startDate = inspector.getByRole("textbox", { name: "Start date" })
  await startDate.fill("2028-02-29")
  await startDate.press("Enter")
  await expect(startDate).toHaveValue("2028-02-29")
  await expect(await fieldRow(inspector, "Next review")).toContainText(
    "2028-03-14"
  )

  const reviewAt = inspector.getByRole("textbox", { name: "Review at" })
  await reviewAt.fill("2028-02-29T23:45")
  await reviewAt.press("Enter")
  await expect(reviewAt).toHaveValue("2028-02-29T23:45")

  const website = inspector.getByRole("textbox", { name: "Website" })
  await website.fill("https://example.com/feature-lab?qa=1#all-fields")
  await website.press("Enter")
  await expect(website).toHaveValue(
    "https://example.com/feature-lab?qa=1#all-fields"
  )
  await expect(await fieldRow(inspector, "Canonical page")).toContainText(
    "https://example.com/feature-lab?qa=1#all-fields"
  )

  const payload = inspector.getByRole("textbox", { name: "Payload" })
  await payload.fill('{ "z": 2, "a": [true, null] }')
  await payload.press("Control+Enter")
  await expect(payload).toHaveValue('{"a":[true,null],"z":2}')
  await expect(await fieldRow(inspector, "Payload mirror")).toContainText(
    '{"a":[true,null],"z":2}'
  )

  const owner = inspector.getByRole("button", { name: "Owner", exact: true })
  await selectRelationOption(page, owner, "Mina Park")
  await expect(owner).toContainText("Mina Park")
  await expect(await fieldRow(inspector, "Owner allocation")).toContainText(
    "32"
  )

  const collaborators = inspector.getByRole("button", {
    name: "Collaborators",
    exact: true,
  })
  await collaborators.click()
  await page.getByRole("button", { name: "Clear", exact: true }).click()
  await expect(collaborators).toContainText("No linked records")
  await selectRelationOption(page, collaborators, "Theo Martin")
  await page.keyboard.press("Escape")
  await expect(collaborators).toContainText("Theo Martin")
  await expect(await fieldRow(inspector, "Contributor names")).toContainText(
    "Theo Martin"
  )

  const program = inspector.getByRole("button", {
    name: "Program",
    exact: true,
  })
  await selectRelationOption(page, program, "Browser runtime")
  await expect(program).toContainText("Browser runtime")

  const reference = inspector.getByRole("button", {
    name: "Reference source",
    exact: true,
  })
  await selectRelationOption(page, reference, "Runtime conformance")
  await expect(reference).toContainText("Runtime conformance")

  await inspector.getByRole("button", { name: "Remove Eidos File 1.0" }).click()
  await expect(
    inspector.getByRole("button", { name: "Remove Eidos File 1.0" })
  ).toHaveCount(0)
  await inspector
    .getByRole("button", { name: "Remove feature-lab-2.png" })
    .click()
  await expect(inspector.getByText("No files", { exact: true })).toBeVisible()
  await expect(
    inspector.getByRole("button", { name: "Add files" })
  ).toHaveCount(0)

  await expect(page.getByText("Unable to save record")).toHaveCount(0)
  await expect(page.getByText("Could not save this Grid change")).toHaveCount(0)
  await expect(
    page.locator("[data-eidos-file-grid-write-recovery]")
  ).toHaveCount(0)

  await page.getByRole("button", { name: "Close record details" }).click()
  await page.getByRole("button", { name: "Open QA all-field record" }).click()
  await expect(inspector.getByRole("textbox", { name: "Samples" })).toHaveValue(
    "41"
  )
  await expect(inspector.getByRole("textbox", { name: "Payload" })).toHaveValue(
    '{"a":[true,null],"z":2}'
  )
  await expect(
    inspector.getByRole("button", { name: "Owner", exact: true })
  ).toContainText("Mina Park")
  await expect(
    inspector.getByRole("button", { name: "Collaborators", exact: true })
  ).toContainText("Theo Martin")
  await expect(inspector.getByText("No files", { exact: true })).toBeVisible()
  expect(pageErrors).toEqual([])
})

test("keeps system fields read-only in the unified field manager", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "Chromium covers the production Grid field manager"
  )
  await installFallbackMode(page)

  await page.goto("/")
  await page.getByRole("button", { name: "Choose a template" }).click()
  await page
    .getByRole("button", { name: "Open Eidos 1.0 Feature Lab template" })
    .click()
  await page.getByRole("tab", { name: "Grid", exact: true }).click()
  await page
    .locator("[data-eidos-file-workbar-actions]")
    .getByRole("button", { name: "Manage fields" })
    .click()

  const systemFields = page.locator("[data-eidos-file-system-field]")
  await expect(systemFields).toHaveCount(3)
  await expect(systemFields).toContainText([
    "Record ID",
    "Created at",
    "Updated at",
  ])
  const systemFieldPositions = await page
    .locator("[data-eidos-file-sortable-field]")
    .evaluateAll((rows) =>
      rows.flatMap((row, index) =>
        row.querySelector("[data-eidos-file-system-field]") ? [index] : []
      )
    )
  const fieldCount = await page
    .locator("[data-eidos-file-sortable-field]")
    .count()
  expect(systemFieldPositions).toEqual([
    fieldCount - 3,
    fieldCount - 2,
    fieldCount - 1,
  ])
  await expect(
    page.getByRole("button", { name: /Edit Record ID properties/ })
  ).toHaveCount(0)
  await expect(
    page.getByRole("button", { name: /Edit Created at properties/ })
  ).toHaveCount(0)
  await expect(
    page.getByRole("button", { name: /Edit Updated at properties/ })
  ).toHaveCount(0)

  const recordIdVisibility = page.getByRole("checkbox", {
    name: "Show Record ID",
  })
  await page
    .locator("[data-eidos-file-view-fields-list] label")
    .filter({ has: recordIdVisibility })
    .click()
  await expect(recordIdVisibility).toBeChecked()
  await page
    .locator("[data-eidos-file-workbar-actions]")
    .getByRole("button", { name: "Manage fields" })
    .click()
  await page
    .locator("[data-eidos-file-workbar-actions]")
    .getByRole("button", { name: "Manage fields" })
    .click()
  await expect(
    page.getByRole("checkbox", { name: "Show Record ID" })
  ).toBeChecked()
})

test("replaces a Formula expression after inserting a function", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "Chromium covers CodeMirror's contenteditable replacement path"
  )
  await installFallbackMode(page)
  await page.goto("/")
  await page.getByRole("button", { name: "Open sample Eidos File" }).click()
  await page.locator("[data-testid='glide-cell-1-0']").waitFor({
    state: "attached",
  })
  await page
    .locator("[data-eidos-file-workbar-actions]")
    .getByRole("button", { name: "Manage fields" })
    .click()
  await page.getByRole("button", { name: "New field" }).click()

  const creator = page.locator("[data-eidos-file-field-create='true']")
  await creator.getByLabel("Name").fill("Formula replacement")
  await creator.locator("[data-eidos-file-field-type-trigger]").click()
  await page.locator("[data-eidos-file-field-type='formula']").click()
  await creator.locator('[data-formula-reference="function:abs"]').click()

  const expression = creator.getByLabel("Formula expression")
  await expect(expression).toContainText("ABS()")
  await creator.locator(".eidos-file-formula-display-select").click()
  await page.getByRole("option", { name: "Number", exact: true }).click()
  await expression.click()
  await expression.press("ControlOrMeta+a")
  await expression.pressSequentially('"Estimate" * 2')

  await expect(expression).toHaveText('"Estimate" * 2')
  await expect(
    creator.locator('[data-eidos-file-formula-status="valid"]')
  ).toContainText("Preview · Ship Eidos File Web Editor: 4")
})
