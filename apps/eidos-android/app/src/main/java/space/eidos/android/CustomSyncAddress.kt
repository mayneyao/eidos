package space.eidos.android

import java.net.URI

/** Shared normalization for the form, secure store and native transport. */
internal object CustomSyncAddress {
    fun password(input: String): String {
        require(input.toByteArray(Charsets.UTF_8).size in 1..1024) { tr("同步密码需要 1–1024 个 UTF-8 字节") }
        return input
    }
    fun repository(input: String): String {
        val text = input.trim().removePrefix("graft+").trimEnd('/')
        val uri = runCatching { URI(text) }.getOrElse { throw IllegalArgumentException(tr("请输入有效的远程地址")) }
        require(uri.scheme in setOf("https", "http") && !uri.host.isNullOrBlank()) { tr("请输入 HTTP 或 HTTPS 远程地址") }
        require(uri.rawUserInfo == null && uri.rawQuery == null && uri.rawFragment == null &&
            (uri.port == -1 || uri.port in 1..65535)) { tr("地址不能包含凭证、查询参数或片段") }
        require(!uri.rawPath.isNullOrEmpty() && uri.rawPath != "/") { tr("请输入包含仓库路径的完整远程地址") }
        return text
    }
    fun origin(input: String): String {
        val text = input.trim().trimEnd('/')
        val uri = runCatching { URI(text) }.getOrElse { throw IllegalArgumentException(tr("无效服务器地址")) }
        require(uri.scheme in setOf("https", "http") && !uri.host.isNullOrBlank() && uri.rawUserInfo == null &&
            uri.rawQuery == null && uri.rawFragment == null && uri.rawPath.isNullOrEmpty() &&
            (uri.port == -1 || uri.port in 1..65535)) { tr("请输入服务器 HTTP 或 HTTPS 地址，不含路径、账号或查询") }
        return URI(uri.scheme, null, uri.host.lowercase(), uri.port, null, null, null).toASCIIString()
    }
    fun encrypted(origin: String) {
        val uri = URI(origin)
        require(uri.scheme == "https" || uri.host in setOf("localhost", "127.0.0.1", "[::1]")) {
            tr("加密同步需要 HTTPS；HTTP 仅支持本机回环地址。请为自建服务器配置 HTTPS。")
        }
    }
}
