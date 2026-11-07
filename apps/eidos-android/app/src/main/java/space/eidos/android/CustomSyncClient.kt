package space.eidos.android

import android.content.Context
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URI
import java.util.UUID
import org.json.JSONObject

data class CustomSyncRepository(val name: String, val displayName: String, val url: String, val uuid: String?)

/** Personal template management; no account session or redirect may supply credentials. */
internal class CustomSyncClient(origin: String, token: String) {
    val origin = CustomSyncAddress.origin(origin)
    val token = token.trim().also { require(it.length in 32..512 && it.none { value -> value.isWhitespace() || value.isISOControl() }) { tr("请输入服务器访问密钥（至少 32 个字符）") } }
    companion object {
        private val namePattern = Regex("^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,62}[A-Za-z0-9])?$")
        fun saved(context: Context): SyncProfile? = SyncProfileStore(context, "custom-server").load()
        fun encryption(value: JSONObject?): String? {
            if (value == null) return null
            val uuid = value.optString("uuid")
            require(value.optString("profile") == "encrypted-remote-v1" && value.optInt("version") == 1 && value.optInt("suite") == 1 &&
                Regex("^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$").matches(uuid)) { tr("服务器加密身份不受支持") }
            return uuid
        }
    }
    private fun request(path: String, method: String = "GET", body: JSONObject? = null, authenticated: Boolean = true): JSONObject {
        val connection = URI(origin + path).toURL().openConnection() as HttpURLConnection
        try {
            connection.instanceFollowRedirects = false
            connection.requestMethod = method
            connection.connectTimeout = 10000
            connection.readTimeout = 30000
            connection.setRequestProperty("Accept", "application/json")
            connection.setRequestProperty("Graft-Protocol", "1")
            if (authenticated) connection.setRequestProperty("Authorization", "Bearer $token")
            if (body != null) {
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json")
                connection.outputStream.use { it.write(body.toString().toByteArray()) }
            }
            check(connection.responseCode in 200..299) { when (connection.responseCode) {
                401, 403 -> tr("服务器访问密钥被拒绝，请更新后重试")
                in 300..399 -> tr("服务器重定向了请求，请使用最终服务器地址")
                else -> tr("服务器返回 HTTP {0}", connection.responseCode)
            } }
            val bytes = connection.inputStream.use { input ->
                val output = ByteArrayOutputStream()
                val buffer = ByteArray(8192)
                while (true) {
                    val count = input.read(buffer)
                    if (count < 0) break
                    check(output.size() + count <= 1024 * 1024) { tr("服务器响应过大") }
                    output.write(buffer, 0, count)
                }
                output.toByteArray()
            }
            return JSONObject(String(bytes, Charsets.UTF_8))
        } finally { connection.disconnect() }
    }
    fun discover() {
        val value = request("/.well-known/graft", authenticated = false)
        val auth = value.optJSONObject("authentication")
        require(value.optString("protocol") == "graft-remote" && value.optInt("version") == 1 &&
            value.optString("remote_url_template") == "$origin/personal/{repository}" && auth?.optString("scheme") == "bearer" &&
            auth.optString("authority") == origin && value.optJSONObject("management")?.optString("repositories") == "$origin/api/graft/repositories") {
            tr("服务器协议不兼容或发现信息不可信")
        }
    }
    fun repositories(): List<CustomSyncRepository> {
        discover()
        val value = request("/api/graft/repositories")
        require(value.getString("namespace") == "personal") { tr("服务器仓库列表无效") }
        val entries = value.getJSONArray("repositories")
        val result = (0 until entries.length()).map { index ->
            val item = entries.getJSONObject(index)
            val name = item.getString("name")
            val url = item.getString("remote_url")
            val displayName = item.optString("display_name", name)
            require(namePattern.matches(name) && url == "$origin/personal/$name" && displayName.length in 1..80 && displayName.none(Char::isISOControl)) { tr("服务器仓库列表无效") }
            CustomSyncRepository(name, displayName, url, encryption(item.optJSONObject("encryption")))
        }
        require(result.map { it.url }.distinct().size == result.size) { tr("服务器仓库列表无效") }
        return result
    }
    fun verify(repository: CustomSyncRepository) {
        require(namePattern.matches(repository.name) && repository.url == "$origin/personal/${repository.name}") { tr("服务器返回不可信地址") }
        CustomSyncAddress.encrypted(origin)
        discover()
        val value = request("/personal/${repository.name}")
        require(value.optString("protocol") == "graft-remote" && value.optInt("version") == 1 &&
            repository.uuid != null && encryption(value.optJSONObject("encryption")) == repository.uuid) { tr("服务器加密身份已变化，请检查连接") }
    }
    fun provision(displayName: String, id: String): CustomSyncRepository {
        require(displayName.length in 1..80 && displayName.none(Char::isISOControl)) { tr("Space 名称需要 1–80 个字符") }
        CustomSyncAddress.encrypted(origin)
        discover()
        val name = UUID.fromString(id).toString()
        val value = request("/api/graft/repositories/$name", "PUT", JSONObject().put("display_name", displayName).put("encryption", "encrypted-remote-v1"))
        require(value.getString("namespace") == "personal" && value.getString("repository") == name && value.getString("remote_url") == "$origin/personal/$name") { tr("服务器未创建加密仓库") }
        val result = CustomSyncRepository(name, displayName, value.getString("remote_url"), encryption(value.optJSONObject("encryption")))
        verify(result)
        return result
    }
    fun remember(context: Context) { SyncProfileStore(context, "custom-server").save(SyncProfile(origin, token, custom = true)) }
}
