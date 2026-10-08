package space.eidos.android

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.net.HttpURLConnection
import java.net.URI
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import org.json.JSONArray
import org.json.JSONObject

/** Only the bundled main-frame workbench can call this service, never plugin frames. */
internal class MobilePluginService(
    context: Context,
    private val repository: SpaceRepository,
    private val store: PluginMarketStore,
    private val openFile: suspend (String) -> Unit,
    private val importFile: suspend () -> android.net.Uri,
) {
    private val preferences = context.getSharedPreferences("mobile-plugin-settings", 0)
    private var prepared: PreparedPlugin? = null
    private val space
        get() = repository.spaceId

    private fun settingKey(id: String, key: String) = JSONArray(listOf(space, id, key)).toString()

    private fun key(): SecretKey {
        val alias = "eidos-plugin-connections"
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        return (store.getKey(alias, null) as? SecretKey)
            ?: KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
                .apply {
                    init(
                        KeyGenParameterSpec.Builder(
                                alias,
                                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
                            )
                            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                            .build()
                    )
                }
                .generateKey()
    }

    private fun seal(text: String): String {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        return Base64.encodeToString(cipher.iv + cipher.doFinal(text.toByteArray()), Base64.NO_WRAP)
    }

    private fun unseal(text: String): String {
        val data = Base64.decode(text, Base64.NO_WRAP)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, data.copyOfRange(0, 12)))
        return String(cipher.doFinal(data.copyOfRange(12, data.size)), Charsets.UTF_8)
    }

    private fun fileJson(file: SpaceFile) =
        JSONObject()
            .put("path", file.path)
            .put("name", file.name)
            .put("kind", if (file.directory) "directory" else "file")
            .put("size", file.bytes)
            .put("modifiedAtMs", file.modified)
            .put("isDirectory", file.directory)
            .put(
                "extension",
                if (file.directory || '.' !in file.name) ""
                else "." + file.name.substringAfterLast('.'),
            )

    suspend fun handle(method: String, p: JSONObject): Any? =
        when (method) {
            "readme" -> store.readme(p.getString("id"))
            "list" ->
                JSONArray(
                    store.installed(space).map {
                        JSONObject()
                            .put("manifest", it.manifest)
                            .put("enabled", it.enabled)
                            .put("revision", it.revision)
                    }
                )
            "market" ->
                JSONArray(
                    store.market().map {
                        JSONObject()
                            .put("id", it.id)
                            .put("name", it.name)
                            .put("description", it.description)
                            .put("version", it.version)
                            .put("category", it.category)
                            .put("icon", it.icon)
                    }
                )
            "prepare" -> {
                synchronized(this) { prepared = null }
                val value = store.prepare(store.market().single { it.id == p.getString("id") })
                synchronized(this) { prepared = value }
                JSONObject()
                    .put("manifest", value.manifest)
                    .put("origin", value.origin)
                    .put("revision", value.revision)
            }
            "import" -> {
                synchronized(this) { prepared = null }
                val value = store.prepare(importFile())
                synchronized(this) { prepared = value }
                JSONObject()
                    .put("manifest", value.manifest)
                    .put("origin", value.origin)
                    .put("revision", value.revision)
            }
            "install" -> {
                val value =
                    synchronized(this) {
                        val value = checkNotNull(prepared)
                        require(value.revision == p.getString("revision")) { tr("插件包已变更，请重新检查后安装") }
                        prepared = null
                        value
                    }
                // The repository (and its Space ID) is immutable for this service.
                store.install(value, space)
                null
            }
            "enable" -> {
                val plugin = store.installed(space).single { it.id == p.getString("id") }
                store.setEnabled(space, plugin, p.getBoolean("enabled"))
                null
            }
            "uninstall" -> {
                val id = p.getString("id")
                store.uninstall(id)
                val edit = preferences.edit()
                preferences.all.keys
                    .filter { runCatching { JSONArray(it).getString(1) == id }.getOrDefault(false) }
                    .forEach(edit::remove)
                check(edit.commit())
                null
            }
            "package" -> store.program(space, p.getString("id"))
            "files" -> {
                val files = mutableListOf<SpaceFile>()
                suspend fun visit(path: String, depth: Int) {
                    require(depth <= 32 && files.size <= 10000) { tr("目录太大，请选择更小的目录") }
                    if (path.isNotEmpty() && runCatching { repository.file(path) }.isFailure) return
                    for (file in repository.files(path)) {
                        files.add(file)
                        if (p.optBoolean("recursive") && file.directory) visit(file.path, depth + 1)
                    }
                }
                visit(p.optString("path"), 0)
                JSONArray(files.map(::fileJson))
            }
            "stat" -> runCatching { fileJson(repository.file(p.getString("path"))) }.getOrNull()
            "readText" ->
                repository.pluginTextSnapshot(p.getString("path")).let {
                    JSONObject().put("text", it.text).put("digest", it.digest)
                }
            "readBinary" ->
                Base64.encodeToString(
                    repository.pluginReadBinary(p.getString("path")),
                    Base64.NO_WRAP,
                )
            "writeText" -> {
                repository.pluginWriteText(p.getString("path"), p.getString("text"))
                null
            }
            "runtime" ->
                repository.embeddedRuntime(
                    p.getString("path"),
                    p.getString("method"),
                    p.optJSONObject("request") ?: JSONObject(),
                )
            "openFile" -> {
                openFile(p.getString("path"))
                null
            }
            "settingGet" ->
                preferences
                    .getString(settingKey(p.getString("id"), p.getString("key")), null)
                    ?.let { JSONArray(it).get(0) }
            "settingSet" -> {
                check(
                    preferences
                        .edit()
                        .putString(
                            settingKey(p.getString("id"), p.getString("key")),
                            if (p.isNull("value")) null
                            else JSONArray().put(p.get("value")).toString(),
                        )
                        .commit()
                )
                null
            }
            "connectionSave" -> {
                val id = p.getString("id")
                val declaration =
                    store
                        .program(space, id)
                        .getJSONObject("manifest")
                        .getJSONObject("connections")
                        .getJSONObject(p.getString("connection"))
                val url = p.optString("url", declaration.getString("url"))
                require(
                    declaration.optBoolean("configurable") || url == declaration.getString("url")
                )
                val uri = URI(url)
                require(
                    uri.scheme == "https" &&
                        uri.host != null &&
                        uri.userInfo == null &&
                        uri.fragment == null
                )
                val config = JSONObject().put("url", url).put("token", p.getString("token"))
                check(
                    preferences
                        .edit()
                        .putString(
                            settingKey(id, "connection:" + p.getString("connection")),
                            seal(config.toString()),
                        )
                        .commit()
                )
                null
            }
            "connectionStatus",
            "connectionRequest" -> {
                val id = p.getString("id")
                val declaration =
                    store
                        .program(space, id)
                        .getJSONObject("manifest")
                        .getJSONObject("connections")
                        .getJSONObject(p.getString("connection"))
                val saved =
                    preferences.getString(
                        settingKey(id, "connection:" + p.getString("connection")),
                        null,
                    )
                if (method == "connectionStatus") saved != null
                else {
                    val config = JSONObject(unseal(saved ?: error(tr("请先配置此插件的连接"))))
                    val url = config.getString("url")
                    require(
                        declaration.optBoolean("configurable") ||
                            url == declaration.getString("url")
                    )
                    val connection = URI(url).toURL().openConnection() as HttpURLConnection
                    try {
                        connection.instanceFollowRedirects = false
                        connection.connectTimeout = 15000
                        connection.readTimeout = 25000
                        connection.requestMethod = "POST"
                        connection.doOutput = true
                        connection.setRequestProperty("Content-Type", "application/json")
                        connection.setRequestProperty(
                            "Authorization",
                            "Bearer " + config.getString("token"),
                        )
                        val bytes = p.getJSONObject("body").toString().toByteArray()
                        require(bytes.size <= 1024 * 1024)
                        connection.outputStream.use { it.write(bytes) }
                        check(connection.responseCode in 200..299) {
                            tr("连接请求失败：HTTP {0}", connection.responseCode)
                        }
                        JSONObject(
                            String(
                                connection.inputStream.use {
                                    PluginMarketTransport.bounded(it, 2 * 1024 * 1024)
                                },
                                Charsets.UTF_8,
                            )
                        )
                    } finally {
                        connection.disconnect()
                    }
                }
            }
            else -> error(tr("不支持的插件宿主操作"))
        }
}
