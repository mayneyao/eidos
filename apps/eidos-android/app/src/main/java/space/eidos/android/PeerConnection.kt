package space.eidos.android

import android.content.Context
import android.util.Base64
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.net.URI
import java.security.MessageDigest
import java.security.SecureRandom
import java.security.cert.X509Certificate
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import javax.net.ssl.*
import org.json.JSONObject

internal data class PeerInvitation(
    val url: String,
    val fingerprint: String,
    val ticket: String,
    val space: String,
    val name: String,
) {
    companion object {
        fun parse(code: String): PeerInvitation {
            require(code.length <= 8192) { "配对码过长" }
            require(code.trim().startsWith("eidos-peer:")) { "请输入电脑显示的设备配对码" }
            val value =
                JSONObject(
                    String(
                        Base64.decode(
                            code.trim().removePrefix("eidos-peer:"),
                            Base64.URL_SAFE or Base64.NO_WRAP,
                        ),
                        Charsets.UTF_8,
                    )
                )
            require(value.getInt("version") == 1) { "不支持此配对版本" }
            val uri = URI(value.getString("url"))
            require(
                uri.scheme == "https" &&
                    uri.host != null &&
                    uri.port in 1..65535 &&
                    uri.rawUserInfo == null &&
                    uri.rawQuery == null &&
                    uri.rawFragment == null &&
                    uri.path.isNullOrEmpty()
            ) {
                "无效的设备地址"
            }
            val fingerprint = value.getString("fingerprint")
            require(fingerprint.matches(Regex("[a-f0-9]{64}"))) { "无效的设备指纹" }
            require(value.getString("ticket").matches(Regex("[A-Za-z0-9_-]{43}"))) { "无效的配对凭据" }
            return PeerInvitation(
                uri.toString(),
                fingerprint,
                value.getString("ticket"),
                value.getString("space"),
                value.getString("name"),
            )
        }
    }
}

data class PeerDevice(val fingerprint: String, val name: String)

data class PeerSpace(val id: String, val name: String, val url: String, val fingerprint: String)

internal class PeerConnection(
    val url: String,
    val fingerprint: String,
    val token: String,
    val name: String,
) {
    private val uri = URI(url)
    private val address: InetAddress =
        InetAddress.getByName(uri.host).also {
            require(it.isSiteLocalAddress || it.isLoopbackAddress) { "第一版设备同步仅支持局域网" }
        }
    private val tls =
        SSLContext.getInstance("TLS").apply {
            init(
                null,
                arrayOf<TrustManager>(
                    object : X509TrustManager {
                        override fun getAcceptedIssuers() = emptyArray<X509Certificate>()

                        override fun checkClientTrusted(
                            chain: Array<X509Certificate>,
                            authType: String,
                        ) {
                            throw java.security.cert.CertificateException(
                                "Client certificates are unsupported"
                            )
                        }

                        override fun checkServerTrusted(
                            chain: Array<X509Certificate>,
                            authType: String,
                        ) {
                            val certificate =
                                chain.firstOrNull()
                                    ?: throw java.security.cert.CertificateException(
                                        "Missing device certificate"
                                    )
                            certificate.checkValidity()
                            val actual =
                                MessageDigest.getInstance("SHA-256")
                                    .digest(certificate.encoded)
                                    .joinToString("") { "%02x".format(it) }
                            if (actual != fingerprint)
                                throw java.security.cert.CertificateException("设备身份已改变，请重新配对")
                        }
                    }
                ),
                SecureRandom(),
            )
        }

    // Android's HTTP pool keys HTTPS connections by factory/verifier identity.
    // Recreating either per request forces another TCP and TLS handshake.
    private val socketFactory = tls.socketFactory
    private val hostnameVerifier = HostnameVerifier { _, session ->
        val certificate = session.peerCertificates.first() as X509Certificate
        MessageDigest.getInstance("SHA-256").digest(certificate.encoded).joinToString("") {
            "%02x".format(it)
        } == fingerprint
    }

    fun call(
        route: String,
        body: JSONObject = JSONObject(),
        timeoutMillis: Int = 120_000,
    ): JSONObject {
        val started = android.os.SystemClock.elapsedRealtime()
        val connection = URI(url + route).toURL().openConnection() as HttpsURLConnection
        connection.sslSocketFactory = socketFactory
        // The QR-pinned certificate is the identity, rather than a mutable LAN hostname.
        connection.hostnameVerifier = hostnameVerifier
        connection.instanceFollowRedirects = false
        connection.connectTimeout = minOf(10_000, timeoutMillis)
        connection.readTimeout = timeoutMillis
        connection.requestMethod = "POST"
        connection.doOutput = true
        connection.setRequestProperty("Authorization", "Bearer $token")
        connection.setRequestProperty("Content-Type", "application/json")
        try {
            connection.outputStream.use { it.write(body.toString().toByteArray()) }
            if (BuildConfig.DEBUG)
                android.util.Log.d(
                    "PeerTiming",
                    "$route request ${android.os.SystemClock.elapsedRealtime() - started}ms",
                )
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val result = stream?.bufferedReader()?.use { JSONObject(it.readText()) } ?: JSONObject()
            if (BuildConfig.DEBUG)
                android.util.Log.d(
                    "PeerTiming",
                    "$route read ${android.os.SystemClock.elapsedRealtime() - started}ms",
                )
            check(status in 200..299) { result.optString("error", "设备连接失败 ($status)") }
            return result
        } finally {
            connection.disconnect()
            if (BuildConfig.DEBUG)
                android.util.Log.d(
                    "PeerTiming",
                    "$route closed ${android.os.SystemClock.elapsedRealtime() - started}ms",
                )
        }
    }

    fun tunnel(onTransfer: (Long, Long) -> Unit = { _, _ -> }) = Tunnel(onTransfer)

    inner class Tunnel(private val onTransfer: (Long, Long) -> Unit) : AutoCloseable {
        private val received = java.util.concurrent.atomic.AtomicLong()
        private val sent = java.util.concurrent.atomic.AtomicLong()
        private val reportedAt = java.util.concurrent.atomic.AtomicLong()

        private fun transfer(
            input: java.io.InputStream,
            output: java.io.OutputStream,
            count: java.util.concurrent.atomic.AtomicLong,
        ) {
            val buffer = ByteArray(64 * 1024)
            while (true) {
                val size = input.read(buffer)
                if (size < 0) break
                output.write(buffer, 0, size)
                count.addAndGet(size.toLong())
                val now = android.os.SystemClock.elapsedRealtime()
                val previous = reportedAt.get()
                if (now - previous >= 250 && reportedAt.compareAndSet(previous, now))
                    onTransfer(received.get(), sent.get())
            }
            onTransfer(received.get(), sent.get())
        }

        private val listener = ServerSocket(0, 8, InetAddress.getByName("127.0.0.1"))
        private val executor = Executors.newCachedThreadPool()
        private val sockets = ConcurrentHashMap.newKeySet<Socket>()
        private val slots = java.util.concurrent.Semaphore(8)
        val remoteUrl = "graft+http://127.0.0.1:${listener.localPort}/peer/space"

        init {
            executor.execute {
                while (!listener.isClosed) {
                    val local =
                        try {
                            listener.accept()
                        } catch (_: Exception) {
                            break
                        }
                    if (!slots.tryAcquire()) {
                        local.close()
                        continue
                    }
                    sockets.add(local)
                    executor.execute {
                        var remote: SSLSocket? = null
                        try {
                            val started = android.os.SystemClock.elapsedRealtime()
                            remote = socketFactory.createSocket() as SSLSocket
                            sockets.add(remote)
                            remote.connect(java.net.InetSocketAddress(address, uri.port), 10_000)
                            if (BuildConfig.DEBUG)
                                android.util.Log.d(
                                    "PeerTiming",
                                    "tunnel connected ${android.os.SystemClock.elapsedRealtime() - started}ms",
                                )
                            remote.soTimeout = 120_000
                            local.soTimeout = 120_000
                            remote.startHandshake()
                            if (BuildConfig.DEBUG)
                                android.util.Log.d(
                                    "PeerTiming",
                                    "tunnel TLS ${android.os.SystemClock.elapsedRealtime() - started}ms",
                                )
                            val upstream = remote
                            executor.execute {
                                try {
                                    transfer(local.getInputStream(), upstream.outputStream, sent)
                                } catch (_: Exception) {} finally {
                                    runCatching { upstream.shutdownOutput() }
                                }
                            }
                            transfer(remote.inputStream, local.getOutputStream(), received)
                        } catch (_: Exception) {
                            // Graft receives an interrupted transport and retains retryable
                            // objects.
                        } finally {
                            local.close()
                            sockets.remove(local)
                            remote?.let {
                                it.close()
                                sockets.remove(it)
                            }
                            slots.release()
                        }
                    }
                }
            }
        }

        override fun close() {
            listener.close()
            sockets.forEach { runCatching { it.close() } }
            executor.shutdownNow()
        }
    }

    fun save(context: Context, spaceId: String) {
        SyncProfileStore(context, "peer-$spaceId")
            .save(
                SyncProfile(
                    url,
                    JSONObject()
                        .put("fingerprint", fingerprint)
                        .put("token", token)
                        .put("name", name)
                        .toString(),
                )
            )
    }

    fun saveDevice(context: Context) {
        save(context, "device-$fingerprint")
        val preferences = context.getSharedPreferences("peer-devices", Context.MODE_PRIVATE)
        check(preferences.edit().putString(fingerprint, name).commit()) { "无法保存设备" }
    }

    fun spaces(timeoutMillis: Int = 120_000): List<PeerSpace> {
        val entries = call("/spaces", timeoutMillis = timeoutMillis).getJSONArray("spaces")
        return (0 until entries.length()).map { index ->
            val value = entries.getJSONObject(index)
            val endpoint = URI(value.getString("url"))
            require(
                endpoint.scheme == "https" &&
                    endpoint.host != null &&
                    endpoint.port in 1..65535 &&
                    endpoint.rawUserInfo == null &&
                    endpoint.rawQuery == null &&
                    endpoint.rawFragment == null &&
                    endpoint.path.isNullOrEmpty()
            ) {
                "无效的 Space 地址"
            }
            PeerSpace(
                value.getString("id"),
                value.getString("name"),
                endpoint.toString(),
                fingerprint,
            )
        }
    }

    companion object {
        suspend fun reconnect(
            context: Context,
            saved: PeerConnection,
            remoteSpace: String? = null,
        ): PeerConnection {
            suspend fun verify(url: String): PeerConnection? =
                kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
                    try {
                        val candidate =
                            PeerConnection(url, saved.fingerprint, saved.token, saved.name)
                        val spaces = candidate.spaces(timeoutMillis = 2000)
                        if (remoteSpace == null) candidate
                        else
                            spaces
                                .firstOrNull { it.id == remoteSpace }
                                ?.let {
                                    if (it.url == candidate.url) candidate
                                    else
                                        PeerConnection(
                                            it.url,
                                            saved.fingerprint,
                                            saved.token,
                                            saved.name,
                                        )
                                }
                    } catch (error: kotlinx.coroutines.CancellationException) {
                        throw error
                    } catch (_: Exception) {
                        null
                    }
                }
            return verify(saved.url)
                ?: PeerDiscovery.find(context, saved.fingerprint, remoteSpace, ::verify)
                ?: error("未找到已配对电脑。请确认在同一局域网，且电脑已开启此 Space 的设备同步")
        }

        fun devices(context: Context): List<PeerDevice> =
            context.getSharedPreferences("peer-devices", Context.MODE_PRIVATE).all.map { (id, name)
                ->
                PeerDevice(id, name as String)
            }

        fun forgetDevice(context: Context, fingerprint: String) {
            SyncProfileStore(context, "peer-device-$fingerprint").clear()
            SpaceCatalog(context).spaces().forEach { space ->
                val store = SyncProfileStore(context, "peer-${space.id}")
                val profile = store.load()
                if (
                    profile != null &&
                        JSONObject(profile.token).optString("fingerprint") == fingerprint
                )
                    store.clear()
            }
            context
                .getSharedPreferences("peer-devices", Context.MODE_PRIVATE)
                .edit()
                .remove(fingerprint)
                .commit()
        }

        fun load(context: Context, spaceId: String): PeerConnection? {
            val stored = SyncProfileStore(context, "peer-$spaceId").load() ?: return null
            val value = JSONObject(stored.token)
            val device =
                SyncProfileStore(context, "peer-device-${value.getString("fingerprint")}").load()
            return PeerConnection(
                stored.url,
                value.getString("fingerprint"),
                device?.let { JSONObject(it.token).getString("token") } ?: value.getString("token"),
                value.getString("name"),
            )
        }
    }
}
