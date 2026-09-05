/** Conservative source fallback. Rendered HTML also passes the safe preview. */
export const ACTIVE_HTML =
  /<(?:script|iframe|object|embed|style|link|meta|base|title|textarea|xmp|noembed|noframes|plaintext|form|input|button|select)\b|\son[a-z]+\s*=|(?:javascript|vbscript)\s*:/iu
