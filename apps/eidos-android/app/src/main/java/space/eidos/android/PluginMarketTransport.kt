package space.eidos.android

import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URI
import java.security.MessageDigest
import java.util.zip.GZIPInputStream

object PluginMarketTransport {
    const val registryUrl =
        "https://raw.githubusercontent.com/eidos-space/registry/main/plugins.registry.json"
    const val packageLimit = 16 * 1024 * 1024
    private val hosts =
        setOf(
            "raw.githubusercontent.com",
            "github.com",
            "release-assets.githubusercontent.com",
            "objects.githubusercontent.com",
        )

    fun trusted(url: String): Boolean =
        runCatching {
                val uri = URI(url)
                uri.scheme == "https" &&
                    uri.host in hosts &&
                    uri.userInfo == null &&
                    uri.port == -1 &&
                    uri.fragment == null
            }
            .getOrDefault(false)

    fun bounded(input: InputStream, limit: Int): ByteArray {
        val output = ByteArrayOutputStream()
        val buffer = ByteArray(64 * 1024)
        while (true) {
            val count = input.read(buffer)
            if (count < 0) return output.toByteArray()
            require(output.size() + count <= limit) { tr("插件数据超过大小限制") }
            output.write(buffer, 0, count)
        }
    }

    fun download(initial: String, limit: Int): ByteArray {
        var url = initial
        val deadline = System.nanoTime() + 30_000_000_000L
        repeat(5) {
            require(trusted(url)) { tr("不受信任的插件下载地址") }
            check(System.nanoTime() < deadline) { tr("插件下载超时") }
            val connection = URI(url).toURL().openConnection() as HttpURLConnection
            try {
                connection.instanceFollowRedirects = false
                connection.connectTimeout = 10_000
                connection.readTimeout = 10_000
                connection.setRequestProperty("Accept", "application/octet-stream")
                when (connection.responseCode) {
                    301,
                    302,
                    303,
                    307,
                    308 -> {
                        url =
                            URI(url)
                                .resolve(
                                    connection.getHeaderField("Location") ?: error(tr("下载重定向缺少地址"))
                                )
                                .toString()
                    }
                    200 ->
                        return connection.inputStream.use { input ->
                            bounded(
                                object : java.io.FilterInputStream(input) {
                                    override fun read(
                                        bytes: ByteArray,
                                        offset: Int,
                                        length: Int,
                                    ): Int {
                                        check(System.nanoTime() < deadline) { tr("插件下载超时") }
                                        return super.read(bytes, offset, length)
                                    }
                                },
                                limit,
                            )
                        }
                    else -> error(tr("插件下载失败：HTTP {0}", connection.responseCode))
                }
            } finally {
                connection.disconnect()
            }
        }
        error(tr("插件下载重定向过多"))
    }

    fun hash(bytes: ByteArray): String =
        MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }

    fun unpack(bytes: ByteArray): String {
        require(bytes.size <= packageLimit) { tr("插件包超过 16 MiB") }
        val raw = GZIPInputStream(bytes.inputStream()).use { bounded(it, packageLimit) }
        return Charsets.UTF_8.newDecoder()
            .onMalformedInput(java.nio.charset.CodingErrorAction.REPORT)
            .decode(java.nio.ByteBuffer.wrap(raw))
            .toString()
    }
}
