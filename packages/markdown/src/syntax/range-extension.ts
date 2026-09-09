import type {
  Extension,
  Tokenizer,
  TokenType,
  Code,
  State,
} from "micromark-util-types"
import type { Extension as MdastExtension } from "mdast-util-from-markdown"
import type { Literal } from "mdast"

export interface SemanticToken extends Literal {
  type: "eidosSyntax"
  syntax: string
}
declare module "mdast" {
  interface PhrasingContentMap {
    eidosSyntax: SemanticToken
  }
  interface BlockContentMap {
    eidosSyntax: SemanticToken
  }
  interface RootContentMap {
    eidosSyntax: SemanticToken
  }
}
declare module "micromark-util-types" {
  interface TokenTypeMap {
    eidosSyntax: "eidosSyntax"
    eidosSyntaxChunk: "eidosSyntaxChunk"
    eidosSyntaxBreak: "eidosSyntaxBreak"
  }
}
export interface SyntaxRange {
  start: number
  end: number
  syntax: string
  block?: boolean
}

/** Source ranges become real parser tokens, never source-injected HTML/placeholders. */
export function rangeExtension(
  ranges: readonly SyntaxRange[],
  source: string
): {
  extension: Extension
  mdastExtension: MdastExtension
} {
  const anchor = (range: SyntaxRange) =>
    range.block
      ? range.start +
        (source.slice(range.start, range.end).match(/^ {0,3}/u)?.[0].length ??
          0)
      : range.start
  const byOffset = new Map(ranges.map((range) => [anchor(range), range]))
  const tokenize: Tokenizer = function (effects, ok, nok) {
    const range = byOffset.get(this.now().offset)
    const context = this
    return start
    function start(code: Code): State | undefined {
      if (!range || code === null) return nok(code)
      effects.enter("eidosSyntax" satisfies TokenType)
      effects.enter("eidosSyntaxChunk")
      return consume(code)
    }
    function consume(code: Code): State | undefined {
      if (!range) return nok(code)
      // Micromark represents tabs and line endings using virtual codes. Source
      // offsets, not code counts, define the ownership boundary.
      if (context.now().offset >= range.end || code === null) {
        effects.exit("eidosSyntaxChunk")
        effects.exit("eidosSyntax")
        return ok(code)
      }
      if (code === -5 || code === -4 || code === -3) {
        effects.exit("eidosSyntaxChunk")
        effects.enter("eidosSyntaxBreak")
        effects.consume(code)
        effects.exit("eidosSyntaxBreak")
        effects.enter("eidosSyntaxChunk")
      } else effects.consume(code)
      return consume
    }
  }
  const text: NonNullable<Extension["text"]> = {}
  const flow: NonNullable<Extension["flow"]> = {}
  for (const range of ranges) {
    const code = source.charCodeAt(anchor(range))
    ;(range.block ? flow : text)[code] = { tokenize, concrete: !!range.block }
  }
  return {
    extension: { text, flow },
    mdastExtension: {
      enter: {
        eidosSyntax(token) {
          const range = byOffset.get(token.start.offset)
          if (!range) throw new Error("Missing semantic token range")
          this.enter(
            {
              type: "eidosSyntax",
              syntax: range.syntax,
              value: source.slice(range.start, range.end),
            },
            token
          )
        },
      },
      exit: {
        eidosSyntax(token) {
          this.exit(token)
        },
      },
    },
  }
}
