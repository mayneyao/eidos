package space.eidos.android

import android.content.Context
import android.net.Uri
import android.os.Build
import android.util.Base64
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL
import java.net.URLEncoder
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.UUID
import org.json.JSONObject

internal object SyncEnvironment {
    val account = if (BuildConfig.DEBUG) "https://staging.eidos.space" else "https://eidos.space"
    val remote =
        if (BuildConfig.DEBUG) "https://sync-staging.eidos.space" else "https://sync.eidos.space"
    val publish =
        if (BuildConfig.DEBUG) "https://publish-staging.eidos.space"
        else "https://publish.eidos.space"
    val client = if (BuildConfig.DEBUG) "android.dev.eidos.space" else "android.eidos.space"
    val redirect = "${BuildConfig.APPLICATION_ID}://oauth/callback"
    val label = if (BuildConfig.DEBUG) "Staging · 开发环境" else "Eidos Sync"

    fun requireRemote(url: String) {
        val parsed = URI(url)
        require(
            parsed.scheme == "https" &&
                parsed.rawAuthority == URI(remote).rawAuthority &&
                parsed.rawQuery == null &&
                parsed.rawFragment == null &&
                parsed.rawPath.matches(Regex("/[A-Za-z0-9_-]+/[A-Za-z0-9._-]+"))
        ) {
            "云端 Space 地址不属于当前环境"
        }
    }
}

data class CloudSpace(val name: String, val url: String)

data class SyncAccountView(val name: String, val subject: String)

/**
 * Blocking account operations run on IO. One process-wide lock serializes rotating refresh tokens.
 */
class SyncAccount
internal constructor(
    private val context: Context,
    private val transport: ((String, String, String?, String?, Boolean) -> JSONObject)? = null,
) {
    private val session = SyncProfileStore(context, "account.${SyncEnvironment.client}")
    private val pending = SyncProfileStore(context, "login.${SyncEnvironment.client}")
    private val device = context.getSharedPreferences("sync-device", Context.MODE_PRIVATE)

    companion object {
        private val lock = Any()
        private const val MARKER = "account:"
    }

    private fun read(): JSONObject? = session.load()?.let { JSONObject(it.token) }

    private fun save(value: JSONObject) =
        session.save(SyncProfile(SyncEnvironment.account, value.toString()))

    fun view(): SyncAccountView? =
        synchronized(lock) {
            read()?.let { SyncAccountView(it.getString("name"), it.getString("subject")) }
        }

    fun signOut() =
        synchronized(lock) {
            session.clear()
            pending.clear()
        }

    internal fun publishSession(): PublishSession =
        synchronized(lock) {
            val identity = view() ?: error("请先登录 Eidos 账号")
            val token = accessToken(registerSync = false)
            val user = request(SyncEnvironment.account + "/api/publish/userinfo", bearer = token)
            check(user.getString("sub") == identity.subject) { "发布账号不一致，请重新登录" }
            val grant = user.getJSONObject("publish_access")
            check(grant.getString("state") == "active") { "当前账号暂时无法发布" }
            val tenant = request(SyncEnvironment.publish + "/api/tenant", bearer = token)
            PublishSession(
                identity.subject,
                token,
                grant.getString("plan"),
                grant.optBoolean("privatePublications"),
                tenant,
            )
        }

    fun beginLogin(): Uri =
        synchronized(lock) {
            val discovery =
                request(SyncEnvironment.account + "/api/auth/.well-known/openid-configuration")
            check(
                discovery.getString("issuer") == SyncEnvironment.account &&
                    discovery.getString("authorization_endpoint") ==
                        SyncEnvironment.account + "/api/auth/oauth2/authorize" &&
                    discovery.getString("token_endpoint") ==
                        SyncEnvironment.account + "/api/auth/oauth2/token" &&
                    discovery
                        .getJSONArray("code_challenge_methods_supported")
                        .toString()
                        .contains("\"S256\"")
            ) {
                "账号服务配置与当前环境不匹配"
            }
            val verifier = random()
            val state = random()
            pending.save(
                SyncProfile(
                    SyncEnvironment.account,
                    JSONObject()
                        .put("state", state)
                        .put("verifier", verifier)
                        .put("created", System.currentTimeMillis())
                        .toString(),
                )
            )
            Uri.parse(SyncEnvironment.account + "/api/auth/oauth2/authorize")
                .buildUpon()
                .appendQueryParameter("client_id", SyncEnvironment.client)
                .appendQueryParameter("redirect_uri", SyncEnvironment.redirect)
                .appendQueryParameter("response_type", "code")
                .appendQueryParameter("scope", "openid profile email offline_access")
                .appendQueryParameter("state", state)
                .appendQueryParameter(
                    "code_challenge",
                    encode(MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray())),
                )
                .appendQueryParameter("code_challenge_method", "S256")
                .build()
        }

    fun finishLogin(uri: Uri, registerSync: Boolean = true) =
        synchronized(lock) {
            require(
                uri.toString().substringBefore('?') == SyncEnvironment.redirect &&
                    uri.fragment == null
            ) {
                "无效的登录回调"
            }
            val transaction = pending.load()?.let { JSONObject(it.token) } ?: error("登录请求已过期，请重新登录")
            require(
                uri.getQueryParameters("state").size == 1 &&
                    MessageDigest.isEqual(
                        transaction.getString("state").toByteArray(),
                        uri.getQueryParameter("state").orEmpty().toByteArray(),
                    ) &&
                    System.currentTimeMillis() - transaction.getLong("created") in 0..600_000
            ) {
                "登录校验失败，请重新登录"
            }
            pending.clear()
            check(uri.getQueryParameter("error") == null) { "登录已取消，请重试" }
            val code =
                uri.getQueryParameter("code")?.takeIf { it.isNotBlank() } ?: error("登录回调缺少授权码")
            require(uri.getQueryParameters("code").size == 1) { "无效的授权码" }
            val tokens =
                token(
                    mapOf(
                        "grant_type" to "authorization_code",
                        "code" to code,
                        "code_verifier" to transaction.getString("verifier"),
                        "redirect_uri" to SyncEnvironment.redirect,
                    )
                )
            val user =
                request(
                    SyncEnvironment.account + "/api/auth/oauth2/userinfo",
                    bearer = tokens.getString("access_token"),
                )
            val subject = user.getString("sub").also { check(it.isNotBlank()) }
            tokens
                .put("subject", subject)
                .put("name", user.optString("email").ifBlank { user.optString("name", subject) })
            // Persist rotating credentials before device registration so a transient failure is
            // retryable.
            save(tokens)
            if (registerSync) register(tokens.getString("access_token"))
        }

    private fun token(values: Map<String, String>): JSONObject {
        val body =
            (values + ("client_id" to SyncEnvironment.client)).entries.joinToString("&") {
                URLEncoder.encode(it.key, "UTF-8") + "=" + URLEncoder.encode(it.value, "UTF-8")
            }
        val result =
            request(SyncEnvironment.account + "/api/auth/oauth2/token", "POST", body, form = true)
        check(
            result.getString("access_token").isNotBlank() &&
                result.optString("token_type", "Bearer").equals("Bearer", true)
        ) {
            "账号服务返回无效凭证"
        }
        val seconds = result.getLong("expires_in")
        check(seconds in 1..31_536_000) { "凭证有效期无效" }
        result.put("expiresAt", System.currentTimeMillis() + seconds * 1000)
        return result
    }

    private fun accessToken(registerSync: Boolean = true): String {
        var value = read() ?: error("请先登录 Eidos 账号")
        if (value.getLong("expiresAt") <= System.currentTimeMillis() + 60_000) {
            val refresh =
                value.optString("refresh_token").takeIf { it.isNotBlank() } ?: error("登录已过期，请重新登录")
            val next = token(mapOf("grant_type" to "refresh_token", "refresh_token" to refresh))
            next.put("subject", value.getString("subject")).put("name", value.getString("name"))
            if (next.optString("refresh_token").isBlank()) next.put("refresh_token", refresh)
            save(next)
            value = next
        }
        val access = value.getString("access_token")
        if (registerSync) register(access)
        return access
    }

    private fun register(access: String) {
        val id =
            device.getString("id", null)
                ?: UUID.randomUUID().toString().also {
                    check(device.edit().putString("id", it).commit()) { "无法保存设备身份" }
                }
        request(
            SyncEnvironment.account + "/api/sync/devices/register",
            "POST",
            JSONObject()
                .put("stableDeviceId", id)
                .put("displayName", "Android · ${Build.MODEL}".take(80))
                // Existing account schema has no Android enum; use its forward-compatible unknown
                // value.
                .put("platform", "unknown")
                .put("appVersion", BuildConfig.VERSION_NAME)
                .toString(),
            access,
        )
    }

    fun credential(): String =
        synchronized(lock) { MARKER + (read() ?: error("请先登录 Eidos 账号")).getString("subject") }

    fun resolve(profile: SyncProfile): String =
        synchronized(lock) {
            if (!profile.token.startsWith(MARKER)) return@synchronized profile.token
            SyncEnvironment.requireRemote(profile.url)
            check(profile.token == credential()) { "此 Space 属于其他账号，请登录原账号" }
            accessToken()
        }

    private fun discoverRemote() {
        val value = request(SyncEnvironment.remote + "/.well-known/graft")
        check(
            value.getString("service") == "eidos-graft-remote" &&
                value.getInt("version") == 1 &&
                value.getString("remote_url_template") ==
                    SyncEnvironment.remote + "/{namespace}/{repository}" &&
                value.getJSONObject("authentication").getString("authority") ==
                    SyncEnvironment.account
        ) {
            "同步服务配置与当前环境不匹配"
        }
    }

    fun repositories(): List<CloudSpace> =
        synchronized(lock) {
            discoverRemote()
            val value =
                request(SyncEnvironment.remote + "/api/graft/repositories", bearer = accessToken())
                    .getJSONArray("repositories")
            (0 until value.length()).map {
                val entry = value.getJSONObject(it)
                CloudSpace(
                    entry.optString("display_name", entry.getString("name")),
                    entry.getString("remote_url").also(SyncEnvironment::requireRemote),
                )
            }
        }

    fun provision(id: String, name: String): String =
        synchronized(lock) {
            require(id.matches(Regex("[A-Za-z0-9-]+")))
            discoverRemote()
            val value =
                request(
                    SyncEnvironment.remote + "/api/graft/repositories/$id",
                    "PUT",
                    JSONObject().put("display_name", name).toString(),
                    accessToken(),
                )
            value.getString("remote_url").also(SyncEnvironment::requireRemote)
        }

    private fun request(
        url: String,
        method: String = "GET",
        body: String? = null,
        bearer: String? = null,
        form: Boolean = false,
    ): JSONObject {
        transport?.let {
            return it(url, method, body, bearer, form)
        }
        val connection = URL(url).openConnection() as HttpURLConnection
        try {
            connection.instanceFollowRedirects = false
            connection.connectTimeout = 15_000
            connection.readTimeout = 30_000
            connection.requestMethod = method
            connection.setRequestProperty("Accept", "application/json")
            if (bearer != null) connection.setRequestProperty("Authorization", "Bearer $bearer")
            if (body != null) {
                connection.doOutput = true
                connection.setRequestProperty(
                    "Content-Type",
                    if (form) "application/x-www-form-urlencoded" else "application/json",
                )
                connection.outputStream.use { it.write(body.toByteArray()) }
            }
            val status = connection.responseCode
            check(status in 200..299) {
                val publishing =
                    url.startsWith(SyncEnvironment.publish + "/") ||
                        url.startsWith(SyncEnvironment.account + "/api/publish/")
                when (status) {
                    400,
                    401 -> "登录凭证无效或已过期，请重新登录（HTTP $status）"
                    403 ->
                        if (publishing) "当前账号没有此发布权限，请检查 Publish 服务"
                        else "当前账号尚未获得同步权限，请在账号页面检查 Sync 服务"
                    409 -> "设备或云端 Space 状态发生变化，请检查账号中的设备授权"
                    else ->
                        if (publishing) "发布服务暂时不可用（HTTP $status），请重试"
                        else "账号或同步服务暂时不可用（HTTP $status），请重试"
                }
            }
            val bytes =
                connection.inputStream.use { input ->
                    val output = java.io.ByteArrayOutputStream()
                    val buffer = ByteArray(8192)
                    while (true) {
                        val count = input.read(buffer)
                        if (count < 0) break
                        check(output.size() + count <= 1_048_576) { "服务响应过大" }
                        output.write(buffer, 0, count)
                    }
                    output.toByteArray()
                }
            return JSONObject(String(bytes, Charsets.UTF_8))
        } finally {
            connection.disconnect()
        }
    }

    private fun random() = encode(ByteArray(32).also { SecureRandom().nextBytes(it) })

    private fun encode(bytes: ByteArray) =
        Base64.encodeToString(bytes, Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)
}
