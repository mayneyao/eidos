package space.eidos.android

import java.net.URI

/** Native requests and the CSP both restrict resources; paths never select a Space file. */
class PluginResourcePolicy(val fileUrl: String, private val origins: Set<String>) {
    val pageUrl = fileUrl.substringBeforeLast('/') + "/index.html"

    fun isPageRead(url: String, method: String, mainFrame: Boolean) =
        mainFrame && method == "GET" && url == pageUrl

    fun isBoundRead(url: String, method: String) = method == "GET" && url == fileUrl

    fun allowsNetwork(url: String, method: String): Boolean {
        if (method != "GET") return false
        val uri = runCatching { URI(url) }.getOrNull() ?: return false
        if (uri.scheme != "https" || uri.userInfo != null || uri.host == null) return false
        return "https://${uri.rawAuthority}" in origins
    }

    companion object {
        fun validOrigin(origin: String): Boolean {
            val uri = runCatching { URI(origin) }.getOrNull() ?: return false
            return uri.scheme == "https" &&
                uri.host != null &&
                uri.userInfo == null &&
                uri.rawPath.isNullOrEmpty() &&
                uri.query == null &&
                uri.fragment == null &&
                !origin.contains('*')
        }
    }
}
