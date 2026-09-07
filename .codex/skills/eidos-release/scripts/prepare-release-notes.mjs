#!/usr/bin/env node

import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import process from "node:process"
import { fileURLToPath } from "node:url"

export const surfaceConfigs = {
  cli: {
    name: "CLI",
    notes: "apps/cli/RELEASE_NOTES.md",
    prefix: "cli-v",
    paths: [
      "apps/cli",
      "packages/eidos-file",
      "packages/eidos-file-serve",
      "apps/download",
      "skills/eidos",
    ],
  },
  lite: {
    name: "Eidos Lite",
    notes: "apps/eidos-lite-desktop/RELEASE_NOTES.md",
    prefix: "lite-v",
    paths: [
      "apps/eidos-lite-desktop",
      "apps/download",
      "apps/cli",
      "packages/eidos-file",
      "packages/eidos-file-ui",
      "packages/eidos-file-serve",
      "packages/markdown",
      "pnpm-lock.yaml",
    ],
  },
}

const internalScopesOrTypes = new Set([
  "ci",
  "build",
  "test",
  "docs",
  "chore",
  "release",
])

const genericScopes = new Set([
  "lite",
  "cli",
  "markdown",
  "ui",
  "web",
  "desktop",
  "app",
  "packages",
  "core",
])

export function isSourceFile(filePath) {
  if (
    filePath.endsWith(".md") ||
    filePath.endsWith(".json") ||
    filePath.endsWith(".css") ||
    filePath.endsWith(".lock") ||
    filePath.endsWith(".yaml") ||
    filePath.endsWith(".yml") ||
    filePath.includes(".test.") ||
    filePath.includes(".spec.")
  ) {
    return false
  }
  return true
}

export function parseCommitMessage(rawMessage) {
  const lines = rawMessage.trim().split("\n")
  const firstLine = lines[0]?.trim() ?? ""
  const body = lines.slice(1).join("\n").trim()

  const match =
    /^(?<type>[a-zA-Z]+)(?:\((?<scope>[^)]+)\))?(?<breaking>!)?:\s*(?<subject>.+)$/u.exec(
      firstLine
    )

  if (!match) {
    return {
      body,
      isBreaking: false,
      raw: rawMessage,
      scope: "",
      subject: firstLine,
      type: "other",
    }
  }

  const { type, scope, breaking, subject } = match.groups
  return {
    body,
    isBreaking: Boolean(breaking) || /BREAKING CHANGE:/iu.test(body),
    raw: rawMessage,
    scope: (scope ?? "").toLowerCase(),
    subject: subject.trim(),
    type: type.toLowerCase(),
  }
}

export function isInternalCommit(commit) {
  if (internalScopesOrTypes.has(commit.type)) return true
  if (internalScopesOrTypes.has(commit.scope)) return true
  if (/^prepare\s+[\d.]+/iu.test(commit.subject)) return true
  if (/^bump\s+version/iu.test(commit.subject)) return true
  return false
}

const domainStopWords = new Set([
  "and",
  "the",
  "for",
  "feat",
  "fix",
  "perf",
  "refactor",
  "chore",
  "ci",
  "build",
  "test",
  "docs",
  "lite",
  "cli",
  "app",
  "desktop",
  "eidos",
  "space",
  "workspace",
  "add",
  "support",
  "with",
  "from",
  "into",
  "when",
  "after",
  "before",
  "over",
  "under",
  "more",
  "less",
  "than",
  "only",
  "each",
  "both",
  "some",
  "make",
  "keep",
  "allow",
  "update",
  "use",
  "using",
  "uses",
  "show",
  "shows",
  "view",
  "views",
  "open",
  "opens",
  "opening",
  "close",
  "closes",
  "closing",
  "save",
  "saves",
  "saved",
  "saving",
  "file",
  "files",
  "item",
  "items",
  "data",
  "text",
  "page",
  "pages",
  "line",
  "lines",
  "editor",
  "document",
  "documents",
  "mode",
  "modes",
  "button",
  "buttons",
  "sidebar",
  "table",
  "tables",
  "record",
  "records",
  "field",
  "fields",
  "content",
  "contents",
  "handle",
  "handles",
  "value",
  "values",
  "safe",
  "copies",
  "copy",
  "reveal",
  "individual",
  "non",
])

function normalizeWord(word) {
  if (
    word === "find" ||
    word === "finding" ||
    word === "searches" ||
    word === "searching"
  ) {
    return "search"
  }
  if (word === "history" || word === "versions" || word === "versioning") {
    return "history"
  }
  if (word === "notes" || word === "notelink") {
    return "note"
  }
  if (word.endsWith("s") && word.length > 4) {
    return word.slice(0, -1)
  }
  return word
}

export function extractFeatureKeywords(commit) {
  const scopeText = genericScopes.has(commit.scope) ? "" : commit.scope
  const text = `${scopeText} ${commit.subject}`.toLowerCase()
  const words = text
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/u)
    .filter(
      (w) => w.length >= 3 && !domainStopWords.has(w) && !genericScopes.has(w)
    )
    .map(normalizeWord)
  return new Set(words)
}

export function matchesFeature(commit, commitIndex, feature) {
  // An iterative fix for a new feature must occur AFTER the feature commit was introduced
  if (commitIndex <= feature.commitIndex) {
    return false
  }

  // 1. Exact specific non-generic scope match
  if (
    commit.scope &&
    !genericScopes.has(commit.scope) &&
    commit.scope === feature.commit.scope
  ) {
    return true
  }

  // 2. File overlap: if commit touches ANY source file that was newly created by this feature
  if (
    commit.files &&
    commit.files.length > 0 &&
    feature.addedFiles &&
    feature.addedFiles.size > 0
  ) {
    const touchesNewFeatureFile = commit.files.some(
      (f) => isSourceFile(f) && feature.addedFiles.has(f)
    )
    if (touchesNewFeatureFile) return true
  }

  // 3. Distinctive keyword overlap in subject/scope
  const commitKeywords = extractFeatureKeywords(commit)
  let overlap = 0
  for (const word of commitKeywords) {
    if (feature.keywords.has(word)) {
      overlap += 1
    }
  }

  if (overlap >= 1) {
    return true
  }

  return false
}

export function clusterFeatures(rawFeatures) {
  const clusters = []

  for (const feat of rawFeatures) {
    let matchedCluster = null

    // Attempt to cluster only with strong distinctive signals
    for (const cluster of clusters) {
      // 1. Specific scope
      if (
        feat.commit.scope &&
        !genericScopes.has(feat.commit.scope) &&
        feat.commit.scope === cluster.primaryScope
      ) {
        matchedCluster = cluster
        break
      }

      // 2. Shared newly added source files
      if (
        feat.addedFiles &&
        feat.addedFiles.size > 0 &&
        cluster.addedFiles.size > 0
      ) {
        let fileOverlap = false
        for (const f of feat.addedFiles) {
          if (isSourceFile(f) && cluster.addedFiles.has(f)) {
            fileOverlap = true
            break
          }
        }
        if (fileOverlap) {
          matchedCluster = cluster
          break
        }
      }

      // 3. Distinctive anchor keywords (e.g., search, history, formula)
      let distinctiveOverlap = 0
      for (const word of feat.keywords) {
        if (cluster.keywords.has(word)) {
          distinctiveOverlap += 1
        }
      }
      if (distinctiveOverlap >= 1) {
        matchedCluster = cluster
        break
      }
    }

    if (matchedCluster) {
      matchedCluster.commits.push(feat.commit)
      matchedCluster.subFeatures.push(feat)
      for (const word of feat.keywords) matchedCluster.keywords.add(word)
      for (const f of feat.addedFiles) matchedCluster.addedFiles.add(f)
      for (const abs of feat.absorbedCommits)
        matchedCluster.absorbedCommits.push(abs)
    } else {
      const cluster = {
        absorbedCommits: [...feat.absorbedCommits],
        addedFiles: new Set(feat.addedFiles),
        commit: feat.commit,
        commitIndex: feat.commitIndex,
        commits: [feat.commit],
        keywords: new Set(feat.keywords),
        primaryScope: feat.commit.scope,
        subFeatures: [feat],
        title: feat.title,
      }
      clusters.push(cluster)
    }
  }

  return clusters
}

export function analyzeCommits({ commits, newFiles = new Set() }) {
  const rawFeatures = []
  const candidatesForBugFix = []
  const candidatesForImprovement = []
  const excluded = []

  // First pass: identify all new features (feat:)
  for (let i = 0; i < commits.length; i += 1) {
    const commit = commits[i]
    if (isInternalCommit(commit)) {
      excluded.push({ commit, reason: "internal engineering / bookkeeping" })
      continue
    }

    if (commit.type === "feat") {
      const featAddedFiles = new Set(
        (commit.files ?? []).filter((f) => newFiles.has(f) && isSourceFile(f))
      )
      rawFeatures.push({
        absorbedCommits: [],
        addedFiles: featAddedFiles,
        commit,
        commitIndex: i,
        keywords: extractFeatureKeywords(commit),
        title: capitalize(commit.subject),
      })
    } else if (commit.type === "fix") {
      candidatesForBugFix.push({ commit, commitIndex: i })
    } else if (commit.type === "perf" || commit.type === "refactor") {
      candidatesForImprovement.push({ commit, commitIndex: i })
    } else {
      candidatesForImprovement.push({ commit, commitIndex: i })
    }
  }

  const bugFixes = []
  const improvements = []

  // Second pass: check if bug fixes target newly added features in this cycle
  for (const { commit: fixCommit, commitIndex } of candidatesForBugFix) {
    let absorbed = false
    for (const feature of rawFeatures) {
      if (matchesFeature(fixCommit, commitIndex, feature)) {
        feature.absorbedCommits.push(fixCommit)
        absorbed = true
        break
      }
    }

    if (absorbed) {
      continue
    }

    // If it touches ONLY source files that are brand new in this release, absorb into closest feature or exclude
    const touchedNewSourceFiles =
      fixCommit.files &&
      fixCommit.files.filter((f) => isSourceFile(f) && newFiles.has(f))

    if (touchedNewSourceFiles && touchedNewSourceFiles.length > 0) {
      const touchesOldFiles = fixCommit.files.some(
        (f) => isSourceFile(f) && !newFiles.has(f)
      )
      if (!touchesOldFiles) {
        if (rawFeatures.length > 0) {
          rawFeatures[rawFeatures.length - 1].absorbedCommits.push(fixCommit)
        } else {
          excluded.push({
            commit: fixCommit,
            reason: "fix on newly created file within current iteration",
          })
        }
        continue
      }
    }

    bugFixes.push(fixCommit)
  }

  // Third pass: check improvements / perf
  for (const { commit: impCommit, commitIndex } of candidatesForImprovement) {
    let absorbed = false
    for (const feature of rawFeatures) {
      if (matchesFeature(impCommit, commitIndex, feature)) {
        feature.absorbedCommits.push(impCommit)
        absorbed = true
        break
      }
    }

    if (!absorbed) {
      improvements.push(impCommit)
    }
  }

  // Cluster related feat commits into cohesive features
  const features = clusterFeatures(rawFeatures)

  return {
    bugFixes,
    excluded,
    features,
    improvements,
  }
}

function capitalize(text) {
  if (!text) return ""
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function formatDraftNotes({
  features,
  improvements,
  bugFixes,
  surface = "lite",
  existingNotes = "",
}) {
  const sections = []

  if (features.length > 0) {
    sections.push("## What's new\n")
    for (const feat of features) {
      sections.push(`### ${feat.title}\n`)
      const primaryCommit = feat.commits?.[0] || feat.commit || {}
      const desc = primaryCommit.body
        ? primaryCommit.body
        : feat.description || `${feat.title}.`
      sections.push(`${desc}\n`)
    }
  }

  if (improvements.length > 0) {
    sections.push("## Improvements\n")
    for (const imp of improvements) {
      const scopePrefix =
        imp.scope && !genericScopes.has(imp.scope)
          ? `**${capitalize(imp.scope)}**: `
          : ""
      sections.push(`- ${scopePrefix}${capitalize(imp.subject)}`)
    }
    sections.push("")
  }

  if (bugFixes.length > 0) {
    sections.push("## Bug fixes\n")
    for (const fix of bugFixes) {
      const scopePrefix =
        fix.scope && !genericScopes.has(fix.scope)
          ? `**${capitalize(fix.scope)}**: `
          : ""
      sections.push(`- ${scopePrefix}${capitalize(fix.subject)}`)
    }
    sections.push("")
  }

  if (surface === "cli") {
    const installMatch = existingNotes.match(/## Install[\s\S]*?(?=\n## |$)/u)
    const agentMatch = existingNotes.match(
      /## (?:Use with an Agent|Use with Codex)[\s\S]*?(?=\n## |$)/u
    )
    if (agentMatch) {
      sections.push(agentMatch[0].trim() + "\n")
    }
    if (installMatch) {
      sections.push(installMatch[0].trim() + "\n")
    }
  }

  return sections.join("\n").trim() + "\n"
}

export function getLatestTag(prefix) {
  try {
    const output = execFileSync(
      "git",
      ["tag", "--list", `${prefix}*`, "--sort=-version:refname"],
      {
        encoding: "utf8",
        env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null" },
      }
    )
    const tags = output.trim().split("\n").filter(Boolean)
    return tags[0]
  } catch {
    return undefined
  }
}

export function getCommitsBetween(fromTag, toRef, paths = []) {
  const args = [
    "log",
    "--reverse",
    "--format=%H%x1f%s%x1f%b%x1e",
    `${fromTag}..${toRef}`,
  ]
  if (paths.length > 0) {
    args.push("--", ...paths)
  }

  const output = execFileSync("git", args, {
    encoding: "utf8",
    env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null" },
    maxBuffer: 10 * 1024 * 1024,
  })

  const rawCommits = output.split("\x1e").filter((entry) => entry.trim())
  return rawCommits.map((entry) => {
    const [hash, subject = "", body = ""] = entry.split("\x1f")
    const parsed = parseCommitMessage(`${subject}\n\n${body}`)
    let files = []
    try {
      const filesOutput = execFileSync(
        "git",
        ["diff-tree", "--no-commit-id", "--name-only", "-r", hash.trim()],
        {
          encoding: "utf8",
          env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null" },
        }
      )
      files = filesOutput.trim().split("\n").filter(Boolean)
    } catch {
      // Ignore if files cannot be retrieved
    }
    return {
      ...parsed,
      files,
      hash: hash.trim(),
    }
  })
}

export function getNewFilesBetween(fromTag, toRef, paths = []) {
  const args = ["diff", "--name-status", `${fromTag}..${toRef}`]
  if (paths.length > 0) {
    args.push("--", ...paths)
  }
  try {
    const output = execFileSync("git", args, {
      encoding: "utf8",
      env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null" },
      maxBuffer: 10 * 1024 * 1024,
    })
    const newFiles = new Set()
    for (const line of output.split("\n")) {
      const [status, filePath] = line.trim().split(/\s+/u)
      if (status?.startsWith("A") && filePath) {
        newFiles.add(filePath)
      }
    }
    return newFiles
  } catch {
    return new Set()
  }
}

function parseArgs(argv) {
  const options = {
    from: undefined,
    json: false,
    surface: undefined,
    to: "HEAD",
    write: false,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === "--surface") {
      options.surface = argv[++i]
    } else if (arg === "--from") {
      options.from = argv[++i]
    } else if (arg === "--to") {
      options.to = argv[++i]
    } else if (arg === "--write") {
      options.write = true
    } else if (arg === "--json") {
      options.json = true
    }
  }

  return options
}

export function prepareReleaseNotes(options) {
  const config = surfaceConfigs[options.surface]
  if (!config) {
    throw new Error("--surface must be either 'lite' or 'cli'")
  }

  const fromTag = options.from || getLatestTag(config.prefix)
  if (!fromTag) {
    throw new Error(`Could not find baseline tag with prefix ${config.prefix}`)
  }

  const toRef = options.to || "HEAD"
  const newFiles = getNewFilesBetween(fromTag, toRef, config.paths)
  const commits = getCommitsBetween(fromTag, toRef, config.paths)

  const analysis = analyzeCommits({ commits, newFiles })

  let existingNotes = ""
  try {
    existingNotes = readFileSync(config.notes, "utf8")
  } catch {
    // optional
  }

  const draft = formatDraftNotes({
    bugFixes: analysis.bugFixes,
    existingNotes,
    features: analysis.features,
    improvements: analysis.improvements,
    surface: options.surface,
  })

  return {
    analysis,
    config,
    draft,
    fromTag,
    toRef,
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  if (!options.surface) {
    process.stderr.write(
      "Usage: prepare-release-notes.mjs --surface <lite|cli> [--from <tag>] [--to <ref>] [--write] [--json]\n"
    )
    process.exitCode = 1
    return
  }

  const result = prepareReleaseNotes(options)

  if (options.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n")
    return
  }

  process.stdout.write(
    `Analyzing ${result.config.name} changes from ${result.fromTag} to ${result.toRef}...\n\n`
  )

  process.stdout.write(
    `Features identified (${result.analysis.features.length}):\n`
  )
  for (const f of result.analysis.features) {
    process.stdout.write(`  + ${f.title} (${f.commits.length} commit(s))\n`)
    if (f.absorbedCommits.length > 0) {
      process.stdout.write(
        `    Absorbed ${f.absorbedCommits.length} iteration fix/refactor commit(s):\n`
      )
      for (const abs of f.absorbedCommits) {
        process.stdout.write(
          `      - [${abs.type}] ${abs.subject} (${abs.hash.slice(0, 8)})\n`
        )
      }
    }
  }

  process.stdout.write(
    `\nImprovements identified (${result.analysis.improvements.length}):\n`
  )
  for (const imp of result.analysis.improvements) {
    process.stdout.write(`  * ${imp.subject} (${imp.hash.slice(0, 8)})\n`)
  }

  process.stdout.write(
    `\nBug fixes identified (${result.analysis.bugFixes.length}):\n`
  )
  for (const fix of result.analysis.bugFixes) {
    process.stdout.write(`  * ${fix.subject} (${fix.hash.slice(0, 8)})\n`)
  }

  process.stdout.write(
    `\nExcluded internal/bookkeeping commits (${result.analysis.excluded.length})\n\n`
  )

  process.stdout.write(
    "--- Starter Skeleton (For Agent to polish into user-facing copy) ---\n\n"
  )
  process.stdout.write(result.draft)
  process.stdout.write(
    "\n--------------------------------------------------------------------\n"
  )

  if (options.write) {
    writeFileSync(result.config.notes, result.draft, "utf8")
    process.stdout.write(`\nUpdated ${result.config.notes} successfully.\n`)
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    main()
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`)
    process.exitCode = 1
  }
}
