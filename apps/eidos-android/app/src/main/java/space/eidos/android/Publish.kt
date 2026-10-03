package space.eidos.android

import android.content.Context
import java.util.UUID
import kotlinx.coroutines.*
import org.json.JSONObject

internal class PublishSession(
    val subject: String,
    val token: String,
    val plan: String,
    val privateAccess: Boolean,
    val tenant: JSONObject,
)

data class PublicationBinding(
    val slug: String,
    val id: String,
    val url: String,
    val access: String,
    val active: Boolean,
)

data class PublishPage(
    val file: SpaceFile,
    val subject: String? = null,
    val host: String? = null,
    val plan: String? = null,
    val privateAccess: Boolean = false,
    val binding: PublicationBinding? = null,
    val progress: JSONObject? = null,
    val error: String? = null,
    val ready: Boolean = false,
    val complete: Boolean = false,
)

/** Device-local bindings: account + Space + path. Tokens and passwords are never persisted here. */
internal class PublicationStore(context: Context, space: String, private val subject: String) {
    private val preferences =
        context.getSharedPreferences("publications-$space", Context.MODE_PRIVATE)

    private fun key(path: String) =
        JSONObject()
            .put("origin", SyncEnvironment.publish)
            .put("subject", subject)
            .put("path", path)
            .toString()

    fun load(path: String): PublicationBinding? =
        preferences.getString(key(path), null)?.let {
            val value = JSONObject(it)
            PublicationBinding(
                value.getString("slug"),
                value.getString("id"),
                value.getString("url"),
                value.getString("access"),
                value.getBoolean("active"),
            )
        }

    fun save(path: String, binding: PublicationBinding) {
        if (load(path) == binding) return
        check(
            preferences
                .edit()
                .putString(
                    key(path),
                    JSONObject()
                        .put("slug", binding.slug)
                        .put("id", binding.id)
                        .put("url", binding.url)
                        .put("access", binding.access)
                        .put("active", binding.active)
                        .toString(),
                )
                .commit()
        ) {
            "无法保存发布记录"
        }
    }
}

internal object NativePublish {
    init {
        System.loadLibrary("eidos_android_host")
    }

    @JvmStatic external fun execute(root: String, method: String, request: String): String

    @JvmStatic external fun progress(): String

    suspend fun call(
        root: String,
        method: String,
        request: JSONObject,
        report: (JSONObject) -> Unit,
        bind: (JSONObject) -> Unit,
    ): JSONObject = coroutineScope {
        val id = UUID.randomUUID().toString()
        request.put("operationId", id)
        val watcher =
            launch(Dispatchers.Default) {
                while (isActive) {
                    delay(200)
                    val value = JSONObject(progress())
                    if (value.optString("operationId") == id) {
                        value.optJSONObject("event")?.let(report)
                        value.optJSONObject("publication")?.let(bind)
                    }
                }
            }
        try {
            val result = JSONObject(execute(root, method, request.toString()))
            result.optJSONObject("publication")?.let(bind)
            check(result.getBoolean("ok")) { result.optString("error", "发布失败，请重试") }
            result.optJSONObject("value") ?: JSONObject()
        } finally {
            watcher.cancelAndJoin()
        }
    }
}

internal fun publicationBinding(value: JSONObject, slug: String, host: String): PublicationBinding {
    val url =
        android.net.Uri.Builder()
            .scheme("https")
            .authority(host)
            .apply { slug.split('/').forEach { appendPath(it) } }
            .build()
            .toString()
    return PublicationBinding(
        slug,
        value.getString("publicationId"),
        value.optString("url", url),
        value.optString("accessMode", "public"),
        value.optBoolean("published", !value.isNull("currentVersionId")),
    )
}
