class AssertionError extends Error {
  readonly name = "AssertionError"
}

function isTypedArray(value: unknown): value is Uint8Array {
  return (
    ArrayBuffer.isView(value) &&
    Object.prototype.toString.call(value) === "[object Uint8Array]"
  )
}

function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (typeof left !== typeof right) return false
  if (typeof left !== "object" || left === null || right === null) return false
  if (isTypedArray(left) && isTypedArray(right)) {
    if (left.byteLength !== right.byteLength) return false
    for (let index = 0; index < left.byteLength; index += 1) {
      if (left[index] !== right[index]) return false
    }
    return true
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) return false
    if (left.length !== right.length) return false
    return left.every((value, index) => deepEqual(value, right[index]))
  }
  const leftKeys = Object.keys(left as Record<string, unknown>)
  const rightKeys = Object.keys(right as Record<string, unknown>)
  if (leftKeys.length !== rightKeys.length) return false
  return leftKeys.every((key) =>
    deepEqual(
      (left as Record<string, unknown>)[key],
      (right as Record<string, unknown>)[key]
    )
  )
}

function matchObject(actual: unknown, pattern: unknown): boolean {
  if (pattern instanceof ObjectContaining) {
    return matchObject(actual, pattern.sample)
  }
  if (pattern instanceof ArrayContaining) {
    if (!Array.isArray(actual)) return false
    return pattern.sample.every((expected) =>
      actual.some((value) => matchObject(value, expected))
    )
  }
  if (typeof pattern !== "object" || pattern === null) {
    return deepEqual(actual, pattern)
  }
  if (typeof actual !== "object" || actual === null) return false
  if (Array.isArray(pattern)) {
    if (!Array.isArray(actual) || actual.length < pattern.length) return false
    return pattern.every((value, index) => matchObject(actual[index], value))
  }
  return Object.entries(pattern as Record<string, unknown>).every(
    ([key, value]) =>
      matchObject((actual as Record<string, unknown>)[key], value as unknown)
  )
}

class ObjectContaining {
  constructor(readonly sample: unknown) {}
}

class ArrayContaining {
  constructor(readonly sample: unknown[]) {}
}

function describe(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}

interface RejectExpectation {
  toMatchObject(expected: unknown): Promise<void>
  toThrow(pattern: RegExp): Promise<void>
}

interface Expectation {
  toBe(expected: unknown): void
  toEqual(expected: unknown): void
  toMatchObject(expected: unknown): void
  toHaveLength(length: number): void
  toBeNull(): void
  toThrow(pattern?: RegExp | Error): void
  not: {
    toBeNull(): void
  }
  rejects: RejectExpectation
}

export function expect(actual: unknown): Expectation {
  const rejects: RejectExpectation = {
    async toMatchObject(expected: unknown) {
      let thrown: unknown = null
      try {
        await (actual as Promise<unknown>)
      } catch (error) {
        thrown = error
      }
      if (thrown === null) {
        throw new AssertionError("Expected promise to reject, but it resolved")
      }
      if (!matchObject(thrown, expected)) {
        throw new AssertionError(
          `Expected rejection ${describe(thrown)} to match ${describe(expected)}`
        )
      }
    },
    async toThrow(pattern: RegExp) {
      let thrown: unknown = null
      try {
        await (actual as Promise<unknown>)
      } catch (error) {
        thrown = error
      }
      if (thrown === null || !pattern.test((thrown as Error).message ?? "")) {
        throw new AssertionError(
          `Expected promise to reject matching ${pattern}, got ${describe(thrown)}`
        )
      }
    },
  }
  const builder = (negated: boolean): Expectation => ({
    toBe(expected: unknown) {
      if (Object.is(actual, expected) === negated) {
        throw new AssertionError(
          `Expected ${describe(actual)} ${negated ? "not " : ""}to be ${describe(expected)}`
        )
      }
    },
    toEqual(expected: unknown) {
      if (deepEqual(actual, expected) === negated) {
        throw new AssertionError(
          `Expected ${describe(actual)} ${negated ? "not " : ""}to equal ${describe(expected)}`
        )
      }
    },
    toMatchObject(expected: unknown) {
      if (matchObject(actual, expected) === negated) {
        throw new AssertionError(
          `Expected ${describe(actual)} ${negated ? "not " : ""}to match ${describe(expected)}`
        )
      }
    },
    toHaveLength(length: number) {
      const actualLength = (actual as { length?: number })?.length
      if ((actualLength === length) === negated) {
        throw new AssertionError(
          `Expected length ${actualLength} ${negated ? "not " : ""}to be ${length}`
        )
      }
    },
    toBeNull() {
      if ((actual === null) === negated) {
        throw new AssertionError(
          `Expected ${describe(actual)} ${negated ? "not " : ""}to be null`
        )
      }
    },
    toThrow(pattern?: RegExp | Error) {
      if (typeof actual !== "function") {
        throw new AssertionError("toThrow requires a function")
      }
      let thrown: unknown = null
      try {
        ;(actual as () => unknown)()
      } catch (error) {
        thrown = error
      }
      const matched =
        thrown !== null &&
        (pattern === undefined ||
          (pattern instanceof RegExp &&
            pattern.test((thrown as Error).message ?? "")) ||
          (pattern instanceof Error && thrown === pattern))
      if (matched === negated) {
        throw new AssertionError(
          `Expected function ${negated ? "not " : ""}to throw${pattern ? ` matching ${pattern}` : ""}, got ${describe(thrown)}`
        )
      }
    },
    not: {
      toBeNull() {
        if (actual === null) {
          throw new AssertionError("Expected value not to be null")
        }
      },
    },
    rejects,
  })
  return builder(false)
}

expect.arrayContaining = (sample: unknown[]) => new ArrayContaining(sample)
expect.objectContaining = (sample: unknown) => new ObjectContaining(sample)
