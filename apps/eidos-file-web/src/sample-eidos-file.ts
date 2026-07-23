import type { Locale } from "./i18n"

export type EidosFileTemplateId =
  | "project-portfolio"
  | "personal-crm"
  | "household-finance"
  | "reading-library"
  | "habit-journal"
  | "content-calendar"
  | "feature-lab"
  | "field-capabilities"

interface LocalizedTemplateCopy {
  title: string
  category: string
  description: string
  highlights: readonly string[]
}

export interface EidosFileTemplate {
  id: EidosFileTemplateId
  sources: Record<Locale, EidosFileTemplateSource>
  copy: Record<Locale, LocalizedTemplateCopy>
}

export interface EidosFileTemplateSource {
  fileName: string
  url: string
  startTable: string
}

function fixtureUrl(fileName: string): string {
  return new URL(`../fixtures/${fileName}`, import.meta.url).href
}

function localizedSources(
  assetStem: string,
  englishFileName: string,
  chineseFileName: string,
  englishStartTable: string,
  chineseStartTable: string
): Record<Locale, EidosFileTemplateSource> {
  return {
    en: {
      fileName: englishFileName,
      url: fixtureUrl(`${assetStem}.eidos`),
      startTable: englishStartTable,
    },
    zh: {
      fileName: chineseFileName,
      url: fixtureUrl(`${assetStem}.zh.eidos`),
      startTable: chineseStartTable,
    },
  }
}

export const EIDOS_FILE_TEMPLATES: readonly EidosFileTemplate[] = [
  {
    id: "project-portfolio",
    sources: localizedSources(
      "project-tracker",
      "project-tracker.eidos",
      "项目组合.eidos",
      "Projects",
      "项目"
    ),
    copy: {
      en: {
        title: "Project portfolio",
        category: "Work",
        description:
          "Plan projects, owners, delivery stages, and team capacity.",
        highlights: ["Relations", "Formulas", "Rollups", "Kanban"],
      },
      zh: {
        title: "项目组合",
        category: "工作",
        description: "规划项目、负责人、交付阶段与团队负载。",
        highlights: ["关联", "公式", "汇总", "看板"],
      },
    },
  },
  {
    id: "personal-crm",
    sources: localizedSources(
      "personal-crm",
      "personal-crm.eidos",
      "个人关系管理.eidos",
      "People",
      "联系人"
    ),
    copy: {
      en: {
        title: "Personal CRM",
        category: "Personal",
        description:
          "Remember people, companies, conversations, and follow-ups.",
        highlights: ["Relations", "Lookups", "Formula", "Timeline"],
      },
      zh: {
        title: "个人关系管理",
        category: "个人",
        description: "整理联系人、公司、沟通记录与后续提醒。",
        highlights: ["关联", "查找", "公式", "时间线"],
      },
    },
  },
  {
    id: "household-finance",
    sources: localizedSources(
      "household-finance",
      "household-finance.eidos",
      "家庭财务.eidos",
      "Transactions",
      "流水"
    ),
    copy: {
      en: {
        title: "Household finance",
        category: "Personal",
        description:
          "Track accounts, spending, income, budgets, and monthly flow.",
        highlights: ["Rollups", "Formula", "Filters", "Statistics"],
      },
      zh: {
        title: "家庭财务",
        category: "个人",
        description: "追踪账户、支出、收入、预算与每月现金流。",
        highlights: ["汇总", "公式", "筛选", "统计"],
      },
    },
  },
  {
    id: "reading-library",
    sources: localizedSources(
      "reading-library",
      "reading-library.eidos",
      "阅读资料库.eidos",
      "Books",
      "书籍"
    ),
    copy: {
      en: {
        title: "Reading library",
        category: "Knowledge",
        description:
          "Organize books, authors, reading progress, and highlights.",
        highlights: ["Relations", "Progress formula", "Gallery", "Highlights"],
      },
      zh: {
        title: "阅读资料库",
        category: "知识",
        description: "整理书籍、作者、阅读进度与重点摘录。",
        highlights: ["关联", "进度公式", "画廊", "摘录"],
      },
    },
  },
  {
    id: "habit-journal",
    sources: localizedSources(
      "habit-journal",
      "habit-journal.eidos",
      "习惯日志.eidos",
      "Daily logs",
      "每日日志"
    ),
    copy: {
      en: {
        title: "Habit journal",
        category: "Wellbeing",
        description:
          "Review daily practice, targets, quality, and consistency.",
        highlights: ["Daily log", "Formula", "Lookups", "Rollups"],
      },
      zh: {
        title: "习惯日志",
        category: "生活",
        description: "回顾每日习惯、目标、质量与持续情况。",
        highlights: ["每日记录", "公式", "查找", "汇总"],
      },
    },
  },
  {
    id: "content-calendar",
    sources: localizedSources(
      "content-calendar",
      "content-calendar.eidos",
      "内容日历.eidos",
      "Content",
      "内容"
    ),
    copy: {
      en: {
        title: "Content calendar",
        category: "Work",
        description:
          "Coordinate content, channels, campaigns, stages, and owners.",
        highlights: ["Kanban", "Calendar data", "Lookups", "Workload formula"],
      },
      zh: {
        title: "内容日历",
        category: "工作",
        description: "协调内容、渠道、营销活动、阶段与负责人。",
        highlights: ["看板", "日历数据", "查找", "工作量公式"],
      },
    },
  },
  {
    id: "feature-lab",
    sources: localizedSources(
      "feature-lab",
      "eidos-1.0-feature-lab.eidos",
      "Eidos-1.0-全功能实验室.eidos",
      "Experiments",
      "实验"
    ),
    copy: {
      en: {
        title: "Eidos 1.0 Feature Lab",
        category: "Explore",
        description:
          "Test every editable field, derived model, and core view in one file.",
        highlights: ["All fields", "Relations", "Lookups", "3 view types"],
      },
      zh: {
        title: "Eidos 1.0 全功能实验室",
        category: "探索",
        description: "在一个文件中测试全部可编辑字段、派生模型与核心视图。",
        highlights: ["全部字段", "关联", "查找汇总", "3 种视图"],
      },
    },
  },
  {
    id: "field-capabilities",
    sources: localizedSources(
      "field-capability-matrix",
      "eidos-field-capability-matrix.eidos",
      "Eidos-字段能力矩阵.eidos",
      "Field capabilities",
      "字段能力"
    ),
    copy: {
      en: {
        title: "Field capability matrix",
        category: "Reference",
        description:
          "Explore every Field kind across storage, queries, search, statistics, derivation, CSV, and UI.",
        highlights: ["All fields", "Search", "Statistics", "Layer ownership"],
      },
      zh: {
        title: "字段能力矩阵",
        category: "参考",
        description:
          "从存储、查询、搜索、统计、派生、CSV 与 UI 纵览全部字段类型。",
        highlights: ["全部字段", "搜索", "统计", "分层职责"],
      },
    },
  },
]

export const DEFAULT_EIDOS_FILE_TEMPLATE_ID: EidosFileTemplateId =
  "project-portfolio"

export const SAMPLE_EIDOS_FILE_URL = EIDOS_FILE_TEMPLATES[0].sources.en.url

export function getEidosFileTemplate(
  id: EidosFileTemplateId
): EidosFileTemplate {
  const template = EIDOS_FILE_TEMPLATES.find((candidate) => candidate.id === id)
  if (!template) throw new Error(`Unknown Eidos File template: ${id}`)
  return template
}

export function getEidosFileTemplateSource(
  id: EidosFileTemplateId,
  locale: Locale
): EidosFileTemplateSource {
  return getEidosFileTemplate(id).sources[locale]
}

export async function loadTemplateEidosFile(
  id: EidosFileTemplateId,
  locale: Locale = "en"
): Promise<File> {
  const source = getEidosFileTemplateSource(id, locale)
  const response = await fetch(source.url)
  if (!response.ok) {
    throw new Error(
      `The ${source.fileName} template could not be loaded (${response.status})`
    )
  }
  return new File([await response.arrayBuffer()], source.fileName, {
    type: "application/vnd.eidos+sqlite3",
  })
}

export async function loadSampleEidosFile(
  locale: Locale = "en"
): Promise<File> {
  return loadTemplateEidosFile(DEFAULT_EIDOS_FILE_TEMPLATE_ID, locale)
}
