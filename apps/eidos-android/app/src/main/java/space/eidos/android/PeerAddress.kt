package space.eidos.android

/** Literal IPv4 only: pairing must not resolve arbitrary names or public endpoints. */
internal fun isPeerLanHost(host: String): Boolean {
    val parts = host.split('.')
    if (parts.size != 4 || parts.any { it.isEmpty() || it.any { c -> c !in '0'..'9' } || (it.length > 1 && it[0] == '0') }) return false
    val bytes = parts.map { it.toIntOrNull() ?: return false }
    if (bytes.any { it !in 0..255 }) return false
    return bytes[0] == 10 || bytes[0] == 127 ||
        (bytes[0] == 172 && bytes[1] in 16..31) ||
        (bytes[0] == 192 && bytes[1] == 168)
}
