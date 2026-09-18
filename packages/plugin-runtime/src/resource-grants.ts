import type { ResourceDeclaration } from "./contracts"
import { invalid, PluginError } from "./errors"
import { Scope } from "./lifecycle"
import { parseResourceDeclaration } from "./manifest"

export type TextResourceDeclaration = Extract<
  ResourceDeclaration,
  { kind: "text" | "directory" }
>
export type ResourceOperation =
  | "list"
  | "read"
  | "write"
  | "create"
  | "delete"
  | "inspect"

/** Host state, never a guest token or an absolute filesystem path. */
export interface ResourceGrant {
  generation: number
  target: string
  ceiling: TextResourceDeclaration
}

export interface ResourceGrantRecord {
  id: string
  generation: number
  binding: { target: string; ceiling: TextResourceDeclaration } | null
}

export function validateResourcePath(value: string): void {
  if (
    typeof value !== "string" ||
    value.length > 4096 ||
    /[\\:\u0000-\u001f\u007f]/.test(value) ||
    value.split("/").some((part) => !part || part === "." || part === "..")
  )
    invalid("Expected a relative resource path")
}

function declaration(value: TextResourceDeclaration): TextResourceDeclaration {
  const result = parseResourceDeclaration(value)
  if (result.kind !== "text" && result.kind !== "directory")
    invalid("Only text and directory grants are supported")
  return structuredClone(result)
}

/** Segment DP avoids regex backtracking and implements zero-segment ** matching. */
function matches(pattern: string, relativePath: string): boolean {
  const parts = relativePath.split("/")
  let reachable = new Set([0])
  for (const segment of pattern.split("/")) {
    const next = new Set<number>()
    if (segment === "**") {
      for (const start of reachable)
        for (let i = start; i <= parts.length; i++) next.add(i)
    } else {
      for (const start of reachable)
        if (start < parts.length && matchesSegment(segment, parts[start]))
          next.add(start + 1)
    }
    reachable = next
  }
  return reachable.has(parts.length)
}

function matchesSegment(pattern: string, name: string): boolean {
  let previous = new Array<boolean>(name.length + 1).fill(false)
  previous[0] = true
  for (const character of pattern) {
    const next = new Array<boolean>(name.length + 1).fill(false)
    next[0] = character === "*" && previous[0]
    for (let i = 1; i <= name.length; i++)
      next[i] =
        character === "*"
          ? previous[i] || next[i - 1]
          : previous[i - 1] && character === name[i - 1]
    previous = next
  }
  return previous[name.length]
}

function permits(
  decl: TextResourceDeclaration,
  operation: ResourceOperation
): boolean {
  const access: readonly string[] = decl.access
  return operation === "inspect"
    ? access.includes("read") || access.includes("delete")
    : access.includes(operation)
}

/** One authority per (Space, plugin), regardless of installation scope.
 * This enforces logical grants only. The adapter MUST still use native safe
 * filesystem operations, validate aliases/protected roots and detect file kind.
 */
export class ResourceGrants {
  private readonly entries = new Map<string, ResourceGrant>()
  private readonly generations = new Map<string, number>()
  private readonly leases = new Map<string, Set<Scope>>()

  constructor(
    readonly spaceId: string,
    readonly pluginId: string,
    records: readonly ResourceGrantRecord[] = []
  ) {
    if (!spaceId || !pluginId)
      invalid("Resource grants require Space and plugin identity")
    for (const item of records) {
      if (
        !item ||
        !/^[a-z][a-z0-9-]*$/.test(item.id) ||
        !Number.isSafeInteger(item.generation) ||
        item.generation < 1 ||
        this.generations.has(item.id)
      )
        invalid("Invalid resource grant record")
      if (item.binding !== null) {
        const checked = declaration(item.binding.ceiling)
        if (item.binding.target !== "." || checked.kind !== "directory")
          validateResourcePath(item.binding.target)
        this.entries.set(item.id, {
          generation: item.generation,
          target: item.binding.target,
          ceiling: checked,
        })
      }
      this.generations.set(item.id, item.generation)
    }
  }

  snapshot(): ResourceGrantRecord[] {
    return [...this.generations].map(([id, generation]) => {
      const grant = this.entries.get(id)
      return {
        id,
        generation,
        binding: grant
          ? structuredClone({ target: grant.target, ceiling: grant.ceiling })
          : null,
      }
    })
  }

  bind(
    id: string,
    target: string,
    ceiling: TextResourceDeclaration
  ): ResourceGrant {
    if (!/^[a-z][a-z0-9-]*$/.test(id)) invalid("Invalid resource name")
    const checked = declaration(ceiling)
    if (target !== "." || checked.kind !== "directory")
      validateResourcePath(target)
    this.revoke(id)
    const grant = {
      generation: this.generations.get(id)!,
      target,
      ceiling: checked,
    }
    this.entries.set(id, grant)
    return structuredClone(grant)
  }

  revoke(id: string): void {
    if (!/^[a-z][a-z0-9-]*$/.test(id)) invalid("Invalid resource name")
    const generation = (this.generations.get(id) ?? 0) + 1
    if (!Number.isSafeInteger(generation))
      invalid("Resource generation exhausted")
    this.generations.set(id, generation)
    this.entries.delete(id)
    const leases = this.leases.get(id)
    this.leases.delete(id)
    for (const scope of leases ?? []) scope.dispose()
  }

  dispose(): void {
    for (const id of this.entries.keys()) this.revoke(id)
  }

  acquire(
    id: string,
    requested: TextResourceDeclaration,
    lifetime: Scope
  ): ResourceLease {
    lifetime.assertActive()
    const grant = this.entries.get(id)
    if (!grant)
      throw new PluginError(
        "RESOURCE_UNBOUND",
        "Resource is not bound in this Space"
      )
    const checked = declaration(requested)
    if (grant.ceiling.kind !== checked.kind)
      throw new PluginError(
        "PERMISSION_DENIED",
        "Resource kind requires a new grant"
      )
    const scope = new Scope()
    const leases = this.leases.get(id) ?? new Set<Scope>()
    leases.add(scope)
    this.leases.set(id, leases)
    const abort = () => scope.dispose()
    lifetime.signal.addEventListener("abort", abort, { once: true })
    scope.subscriptions.add({
      dispose: () => {
        lifetime.signal.removeEventListener("abort", abort)
        leases.delete(scope)
        if (!leases.size && this.leases.get(id) === leases)
          this.leases.delete(id)
      },
    })
    return new ResourceLease(scope, structuredClone(grant), checked)
  }
}

/** Host-only handle. Every operation, including observer delivery, must check it. */
export class ResourceLease {
  readonly signal: AbortSignal
  constructor(
    private readonly scope: Scope,
    private readonly grant: ResourceGrant,
    private readonly requested: TextResourceDeclaration
  ) {
    this.signal = scope.signal
  }

  dispose(): void {
    this.scope.dispose()
  }

  /** Returns a logical Space-relative path, NOT a validated filesystem handle. */
  authorize(operation: ResourceOperation, relativePath?: string): string {
    this.scope.assertActive()
    const allowed =
      operation === "inspect"
        ? (["read", "delete"] as const).some(
            (right) =>
              permits(this.grant.ceiling, right) &&
              permits(this.requested, right)
          )
        : permits(this.grant.ceiling, operation) &&
          permits(this.requested, operation)
    if (!allowed)
      throw new PluginError(
        "PERMISSION_DENIED",
        "Resource operation is not granted"
      )
    if (this.requested.kind === "text") {
      if (relativePath !== undefined)
        invalid("Text resources do not accept child paths")
      return this.grant.target
    }
    if (operation === "list" && relativePath === undefined)
      return this.grant.target
    if (relativePath === undefined)
      invalid("Directory operation requires a path")
    validateResourcePath(relativePath)
    if (!this.includes(relativePath))
      throw new PluginError(
        "PERMISSION_DENIED",
        "Path is outside the resource filters"
      )
    return this.grant.target === "."
      ? relativePath
      : `${this.grant.target}/${relativePath}`
  }

  /** Use to filter list results BEFORE pagination; never expose excluded names. */
  includes(relativePath: string): boolean {
    this.scope.assertActive()
    validateResourcePath(relativePath)
    if (
      this.requested.kind !== "directory" ||
      this.grant.ceiling.kind !== "directory"
    )
      invalid("Only directories have include filters")
    return (
      this.requested.include.some((glob) => matches(glob, relativePath)) &&
      this.grant.ceiling.include.some((glob) => matches(glob, relativePath))
    )
  }
}
