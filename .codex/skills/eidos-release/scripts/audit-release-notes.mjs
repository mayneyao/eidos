#!/usr/bin/env node

import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import process from "node:process"
import { fileURLToPath } from "node:url"

const surfaceContracts = {
  cli: {
    notes: "apps/cli/RELEASE_NOTES.md",
    prefix: "cli-v",
  },
  lite: {
    notes: "apps/eidos-lite-desktop/RELEASE_NOTES.md",
    prefix: "lite-v",
  },
}

const generatedBoilerplate = [
  /^## What's Changed$/imu,
  /^## New Contributors$/imu,
  /\*\*Full Changelog\*\*:/iu,
  /github\.com\/[^\s]+\/compare\//iu,
]

const forbiddenWhatsNewHeadings = [
  /^(?:bug fixes(?: and improvements)?|improvements|miscellaneous|updates)$/iu,
  /^install(?:ation)?$/iu,
  /^version-matched eidos skill for codex$/iu,
]

function fail(message) {
  throw new Error(message)
}

function normalize(value) {
  return value
    .replace(/<!--[^]*?-->/gu, " ")
    .replace(/[`*_~>#|[\](){}]/gu, " ")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}./:+-]+/gu, " ")
    .trim()
}

function tokens(value) {
  return new Set(normalize(value).split(/\s+/u).filter(Boolean))
}

function similarity(left, right) {
  const a = tokens(left)
  const b = tokens(right)
  if (a.size < 12 || b.size < 12) return 0
  let intersection = 0
  for (const token of a) if (b.has(token)) intersection += 1
  return intersection / (a.size + b.size - intersection)
}

export function parseWhatsNew(
  markdown,
  label = "release notes",
  enforceCurrentPolicy = true
) {
  const headings = [...markdown.matchAll(/^## What's new\s*$/gmu)]
  if (headings.length !== 1)
    fail(`${label} must contain exactly one \"## What's new\" heading`)

  if (enforceCurrentPolicy) {
    for (const pattern of generatedBoilerplate) {
      if (pattern.test(markdown))
        fail(`${label} contains GitHub-generated release-note boilerplate`)
    }
  }

  const start = headings[0].index + headings[0][0].length
  const remainder = markdown.slice(start)
  const nextLevelTwo = remainder.search(/^## (?!#)/mu)
  const sectionBody =
    nextLevelTwo === -1 ? remainder : remainder.slice(0, nextLevelTwo)
  const sectionMatches = [...sectionBody.matchAll(/^### (.+?)\s*$/gmu)]
  if (sectionMatches.length === 0)
    fail(`${label} must contain at least one user-visible \"###\" section`)

  return sectionMatches.map((match, index) => {
    const bodyStart = match.index + match[0].length
    const bodyEnd =
      index + 1 < sectionMatches.length
        ? sectionMatches[index + 1].index
        : sectionBody.length
    const heading = match[1].trim()
    const body = sectionBody.slice(bodyStart, bodyEnd).trim()
    if (!body) fail(`${label} has an empty section: ${heading}`)
    if (
      enforceCurrentPolicy &&
      forbiddenWhatsNewHeadings.some((pattern) => pattern.test(heading))
    )
      fail(
        `${label} uses a generic or operational heading under What's new: ${heading}`
      )
    return { body, heading }
  })
}

export function auditBodies(candidateBody, history) {
  const candidate = parseWhatsNew(candidateBody, "candidate release notes")
  const seenHeadings = new Map()
  const seenBodies = new Map()

  for (const section of candidate) {
    const headingKey = normalize(section.heading)
    const bodyKey = normalize(section.body)
    if (seenHeadings.has(headingKey))
      fail(`candidate repeats the heading \"${section.heading}\"`)
    if (seenBodies.has(bodyKey))
      fail(
        `candidate repeats the body from \"${seenBodies.get(bodyKey)}\" under \"${section.heading}\"`
      )
    seenHeadings.set(headingKey, section.heading)
    seenBodies.set(bodyKey, section.heading)
  }

  for (const previous of history) {
    const historical = parseWhatsNew(previous.body, previous.label, false)
    for (const current of candidate) {
      for (const old of historical) {
        const sameHeading =
          normalize(current.heading) === normalize(old.heading)
        const sameBody = normalize(current.body) === normalize(old.body)
        const score = similarity(current.body, old.body)
        if (sameHeading || sameBody || score >= 0.9) {
          const similarityPercent = sameBody ? 100 : Math.round(score * 100)
          fail(
            `\"${current.heading}\" repeats \"${old.heading}\" from ${previous.label} (${similarityPercent}% token similarity)`
          )
        }
      }
    }
  }

  return { historyCount: history.length, sectionCount: candidate.length }
}

function parseVersion(tag, prefix) {
  if (!tag.startsWith(prefix)) return undefined
  const match =
    /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/u.exec(
      tag.slice(prefix.length)
    )
  if (!match) return undefined
  return {
    core: match.slice(1, 4).map(Number),
    prerelease: match[4]?.split(".") ?? [],
  }
}

function compareIdentifiers(left, right) {
  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    if (left[index] === undefined) return -1
    if (right[index] === undefined) return 1
    const a = /^\d+$/u.test(left[index]) ? Number(left[index]) : left[index]
    const b = /^\d+$/u.test(right[index]) ? Number(right[index]) : right[index]
    if (a === b) continue
    if (typeof a === "number" && typeof b !== "number") return -1
    if (typeof a !== "number" && typeof b === "number") return 1
    return a < b ? -1 : 1
  }
  return 0
}

function compareVersions(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left.core[index] !== right.core[index])
      return left.core[index] - right.core[index]
  }
  if (left.prerelease.length === 0 && right.prerelease.length > 0) return 1
  if (left.prerelease.length > 0 && right.prerelease.length === 0) return -1
  return compareIdentifiers(left.prerelease, right.prerelease)
}

function readArguments(argv) {
  const result = { history: 3 }
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index]
    const value = argv[index + 1]
    if (!name?.startsWith("--") || value === undefined)
      fail("expected --surface, --tag, and optional --history arguments")
    if (name === "--surface") result.surface = value
    else if (name === "--tag") result.tag = value
    else if (name === "--history") result.history = Number(value)
    else fail(`unknown argument: ${name}`)
  }
  if (!Number.isInteger(result.history) || result.history < 1)
    fail("--history must be a positive integer")
  return result
}

function readRecentBodies(contract, candidateTag, limit) {
  const candidateVersion = parseVersion(candidateTag, contract.prefix)
  if (!candidateVersion)
    fail(`${candidateTag} is not a valid ${contract.prefix}<semver> tag`)

  const candidateIsPrerelease = candidateVersion.prerelease.length > 0
  const tags = execFileSync(
    "git",
    ["tag", "--list", `${contract.prefix}*`, "--sort=-version:refname"],
    { encoding: "utf8" }
  )
    .trim()
    .split("\n")
    .filter(Boolean)

  const eligible = tags.filter((tag) => {
    if (tag === candidateTag) return false
    const version = parseVersion(tag, contract.prefix)
    return (
      version !== undefined &&
      version.prerelease.length > 0 === candidateIsPrerelease &&
      compareVersions(version, candidateVersion) < 0
    )
  })

  const history = []
  for (const tag of eligible) {
    if (history.length >= limit) break
    try {
      history.push({
        body: execFileSync("git", ["show", `${tag}:${contract.notes}`], {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        }),
        label: tag,
      })
    } catch {
      // Tags before the single-release manifest contract have no comparable body.
    }
  }
  return history
}

function main() {
  const args = readArguments(process.argv.slice(2))
  const contract = surfaceContracts[args.surface]
  if (!contract) fail("--surface must be either lite or cli")
  if (!args.tag) fail("--tag is required")

  const candidateBody = readFileSync(contract.notes, "utf8")
  const history = readRecentBodies(contract, args.tag, args.history)
  const result = auditBodies(candidateBody, history)
  process.stdout.write(
    `Release notes audit passed: ${result.sectionCount} new section(s), ` +
      `${result.historyCount} prior same-surface release(s) checked.\n`
  )
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    main()
  } catch (error) {
    process.stderr.write(`Release notes audit failed: ${error.message}\n`)
    process.exitCode = 1
  }
}
