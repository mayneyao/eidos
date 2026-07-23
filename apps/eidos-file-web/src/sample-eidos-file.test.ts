import { describe, expect, it } from "vitest"

import {
  EIDOS_FILE_TEMPLATES,
  getEidosFileTemplate,
  getEidosFileTemplateSource,
} from "./sample-eidos-file"

describe("Eidos File templates", () => {
  it("exposes independent localized Feature Lab and capability fixtures", () => {
    expect(EIDOS_FILE_TEMPLATES).toHaveLength(8)
    expect(
      new Set(EIDOS_FILE_TEMPLATES.map((template) => template.id)).size
    ).toBe(8)

    const template = getEidosFileTemplate("feature-lab")
    expect(template.copy.en).toMatchObject({
      title: "Eidos 1.0 Feature Lab",
      category: "Explore",
    })
    expect(template.copy.zh).toMatchObject({
      title: "Eidos 1.0 全功能实验室",
      category: "探索",
    })
    expect(getEidosFileTemplateSource("feature-lab", "en")).toMatchObject({
      fileName: "eidos-1.0-feature-lab.eidos",
      startTable: "Experiments",
    })
    expect(getEidosFileTemplateSource("feature-lab", "zh")).toMatchObject({
      fileName: "Eidos-1.0-全功能实验室.eidos",
      startTable: "实验",
    })

    const matrix = getEidosFileTemplate("field-capabilities")
    expect(matrix.copy.en).toMatchObject({
      title: "Field capability matrix",
      category: "Reference",
    })
    expect(matrix.copy.zh).toMatchObject({
      title: "字段能力矩阵",
      category: "参考",
    })
    expect(
      getEidosFileTemplateSource("field-capabilities", "en")
    ).toMatchObject({
      fileName: "eidos-field-capability-matrix.eidos",
      startTable: "Field capabilities",
    })
    expect(
      getEidosFileTemplateSource("field-capabilities", "zh")
    ).toMatchObject({
      fileName: "Eidos-字段能力矩阵.eidos",
      startTable: "字段能力",
    })
  })
})
