package space.eidos.android

import java.net.URI

internal fun markdownLocalPath(documentPath: String, destination: String): String {
    val uri =
        runCatching { URI(destination.replace(" ", "%20")) }
            .getOrElse { throw IllegalArgumentException(tr("链接地址无效")) }
    require(uri.scheme == null && uri.rawAuthority == null) { tr("需要 Space 内的相对链接") }
    require(uri.rawQuery == null) { tr("本地文件链接暂不支持查询参数") }
    require(uri.rawFragment == null) { tr("暂不支持文档内锚点跳转") }
    val path = uri.path.orEmpty()
    require(path.isNotEmpty() && !path.startsWith('/')) { tr("需要 Space 内的相对链接") }
    require(path.none { it == '\\' || it.code < 32 }) { tr("链接地址无效") }
    val parts =
        documentPath
            .substringBeforeLast('/', "")
            .split('/')
            .filter { it.isNotEmpty() }
            .toMutableList()
    path.split('/').forEach { part ->
        when (part) {
            "",
            "." -> Unit
            ".." -> {
                require(parts.isNotEmpty()) { tr("链接超出 Space") }
                parts.removeAt(parts.lastIndex)
            }
            else -> {
                require(!part.startsWith('.')) { tr("不能访问内部文件") }
                parts.add(part)
            }
        }
    }
    require(parts.isNotEmpty()) { tr("链接未指向文件") }
    return parts.joinToString("/")
}
