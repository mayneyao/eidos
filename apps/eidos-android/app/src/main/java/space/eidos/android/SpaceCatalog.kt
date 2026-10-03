package space.eidos.android

import android.content.Context
import java.util.UUID
import org.json.JSONArray
import org.json.JSONObject

data class LocalSpace(val id: String, val name: String)

data class PeerLocalSpace(
    val id: String,
    val name: String,
    val fingerprint: String,
    val remoteId: String,
    val lastSynced: Long?,
)

class SpaceCatalog(context: Context) {
    private val preferences = context.getSharedPreferences("space-catalog", Context.MODE_PRIVATE)
    private val peerSpaces = context.getSharedPreferences("peer-spaces", Context.MODE_PRIVATE)
    private val peerTimes = context.getSharedPreferences("peer-sync-times", Context.MODE_PRIVATE)

    fun peerLocalSpaces(): List<PeerLocalSpace> =
        synchronized(lock) {
            val local = spaces().associateBy { it.id }
            peerSpaces.all.mapNotNull { (key, value) ->
                val space = local[value] ?: return@mapNotNull null
                val separator = key.indexOf(':')
                if (separator < 0) return@mapNotNull null
                PeerLocalSpace(
                    space.id,
                    space.name,
                    key.substring(0, separator),
                    key.substring(separator + 1),
                    peerTimes.getLong(space.id, 0).takeIf { it > 0 },
                )
            }
        }

    fun recordPeerSync(id: String) {
        check(peerTimes.edit().putLong(id, System.currentTimeMillis()).commit()) { "无法保存同步时间" }
    }

    internal fun peerRemoteSpace(fingerprint: String, localId: String): String? =
        synchronized(lock) {
            peerSpaces.all.entries
                .firstOrNull { it.key.startsWith("$fingerprint:") && it.value == localId }
                ?.key
                ?.removePrefix("$fingerprint:")
        }

    internal fun getOrCreatePeerSpace(
        fingerprint: String,
        remoteSpace: String,
        deviceName: String,
    ): LocalSpace =
        synchronized(lock) {
            // Names are presentation only. Never attach a different repository to an existing name.
            val key = "$fingerprint:$remoteSpace"
            val all = spaces()
            val existingId = peerSpaces.getString(key, null)
            all.firstOrNull { it.id == existingId }
                ?.let {
                    return@synchronized it
                }
            val device = deviceName.filter { it.code >= 32 }.trim().ifEmpty { "电脑" }
            val base = "${device.take(70)} 的 Space"
            var name = base
            var number = 2
            while (all.any { it.name.equals(name, true) }) {
                val suffix = " ($number)"
                name = base.take(80 - suffix.length) + suffix
                number++
            }
            val space = create(name)
            check(peerSpaces.edit().putString(key, space.id).commit()) { "无法保存设备 Space 关联" }
            space
        }

    fun spaces(): List<LocalSpace> =
        synchronized(lock) {
            val saved = JSONArray(preferences.getString("spaces", "[]"))
            listOf(LocalSpace("personal", "个人 Space")) +
                (0 until saved.length()).map { index ->
                    val entry = saved.getJSONObject(index)
                    LocalSpace(entry.getString("id"), entry.getString("name"))
                }
        }

    fun activeId(): String =
        synchronized(lock) {
            preferences.getString("active", "personal").takeIf { id ->
                spaces().any { it.id == id }
            } ?: "personal"
        }

    fun select(id: String) =
        synchronized(lock) {
            require(spaces().any { it.id == id }) { "Space 已不存在" }
            check(preferences.edit().putString("active", id).commit()) { "无法保存 Space 选择" }
        }

    fun prepare(name: String): LocalSpace =
        synchronized(lock) {
            val clean = name.trim()
            require(clean.isNotEmpty() && clean.length <= 80 && clean.none { it.code < 32 }) {
                "请输入 1–80 个字符的 Space 名称"
            }
            require(spaces().none { it.name.equals(clean, true) }) { "Space 名称已存在" }
            LocalSpace("space-${UUID.randomUUID()}", clean)
        }

    fun create(name: String): LocalSpace = synchronized(lock) { register(prepare(name)) }

    fun register(space: LocalSpace): LocalSpace =
        synchronized(lock) {
            require(space.id.matches(Regex("space-[0-9a-f-]{36}"))) { "无效的 Space 标识" }
            require(spaces().none { it.id == space.id || it.name.equals(space.name, true) }) {
                "Space 已存在"
            }
            val all = spaces().filter { it.id != "personal" } + space
            check(
                preferences
                    .edit()
                    .putString(
                        "spaces",
                        JSONArray(all.map { JSONObject().put("id", it.id).put("name", it.name) })
                            .toString(),
                    )
                    .commit()
            ) {
                "无法保存 Space"
            }
            space
        }

    private companion object {
        val lock = Any()
    }
}
