import {
  CHECK_LIST,
  CODE,
  HEADING,
  INLINE_CODE,
  LINK,
  ORDERED_LIST,
  QUOTE,
  TRANSFORMERS,
  type Transformer,
} from "@lexical/markdown"

export const getStandardTransformers = (): Transformer[] => [
  CHECK_LIST,
  CODE,
  HEADING,
  INLINE_CODE,
  LINK,
  ORDERED_LIST,
  QUOTE,
  ...TRANSFORMERS,
]
