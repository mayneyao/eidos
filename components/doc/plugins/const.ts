import {
  CHECK_LIST,
  CODE,
  HEADING,
  HIGHLIGHT,
  INLINE_CODE,
  LINK,
  ORDERED_LIST,
  QUOTE,
  TRANSFORMERS,
} from "@lexical/markdown"

export const allTransformers = [
  CHECK_LIST,
  CODE,
  HEADING,
  HIGHLIGHT,
  INLINE_CODE,
  LINK,
  ORDERED_LIST,
  QUOTE,
  ...TRANSFORMERS,
]
