package space.eidos.android

import android.content.Context
import android.net.Uri
import android.util.AtomicFile
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject

data class MarketPlugin(
    val id: String,
    val name: String,
    val description: String,
    val version: String,
    val url: String,
    val hash: String,
    val category: String = "",
    val icon: JSONObject? = null,
)

data class PreparedPlugin(
    val json: String,
    val manifest: JSONObject,
    val revision: String,
    val origin: String = tr("本地文件（未通过市场校验）"),
)

data class InstalledPlugin(val manifest: JSONObject, val revision: String, val enabled: Boolean) {
    val id
        get() = manifest.getString("id")
}

data class PluginNavigationPage(
    val pluginId: String,
    val viewId: String,
    val title: String,
    val revision: String,
) {
    val key
        get() = "$pluginId/$viewId"
}

class PluginMarketStore(private val context: Context, storageName: String = "plugin-market") {
    companion object {
        private val mutationLock = Any()
    }

    private val preferences = context.getSharedPreferences(storageName, Context.MODE_PRIVATE)
    private val directory = File(context.filesDir, "$storageName-packages")

    fun watch(changed: () -> Unit): () -> Unit {
        val listener =
            android.content.SharedPreferences.OnSharedPreferenceChangeListener { _, _ -> changed() }
        preferences.registerOnSharedPreferenceChangeListener(listener)
        return { preferences.unregisterOnSharedPreferenceChangeListener(listener) }
    }

    fun authorized(space: String, view: PluginFileView): Boolean =
        view.revision == null ||
            installed(space).any {
                it.enabled && it.id == view.id.substringBefore('/') && it.revision == view.revision
            }

    suspend fun market(): List<MarketPlugin> =
        withContext(Dispatchers.IO) {
            val root =
                JSONObject(
                    String(
                        PluginMarketTransport.download(
                            PluginMarketTransport.registryUrl,
                            2 * 1024 * 1024,
                        ),
                        Charsets.UTF_8,
                    )
                )
            require(root.getInt("schemaVersion") == 1) { tr("不支持的插件市场目录") }
            val items = root.getJSONArray("plugins")
            require(items.length() <= 1000)
            val ids = mutableSetOf<String>()
            (0 until items.length()).map { index ->
                val p = items.getJSONObject(index)
                val id = p.getString("id")
                val version = p.getString("version")
                val repo = p.getString("repo")
                val tag = p.getString("tag")
                val asset = p.getString("asset")
                val hash = p.getString("sha256")
                require(id.matches(Regex("[a-z][a-z0-9.-]{1,127}")) && ids.add(id))
                require(version.matches(Regex("\\d+\\.\\d+\\.\\d+(?:-[a-zA-Z0-9.-]+)?")))
                require(
                    repo.matches(Regex("[A-Za-z0-9][A-Za-z0-9_.-]*/[A-Za-z0-9][A-Za-z0-9_.-]*"))
                )
                require(tag.matches(Regex("[a-zA-Z0-9][a-zA-Z0-9._-]*")))
                require(asset == "$id-$version.eidos-plugin" && hash.matches(Regex("[a-f0-9]{64}")))
                preferences.edit().putString("readme-repo:$id", repo).apply()
                MarketPlugin(
                    id,
                    p.getString("name").take(128),
                    p.getString("description").take(1024),
                    version,
                    "https://github.com/$repo/releases/download/$tag/$asset",
                    hash,
                    p.optString("category").take(64),
                    p.optJSONObject("icon"),
                )
            }
        }

    suspend fun readme(id: String): JSONObject? =
        withContext(Dispatchers.IO) {
            require(id.matches(Regex("[a-z][a-z0-9.-]{1,127}")))
            val cached = preferences.getString("readme:$id", null)?.let { JSONObject(it) }
            if (
                cached != null &&
                    System.currentTimeMillis() - cached.optLong("fetchedAt") < 86_400_000
            ) {
                return@withContext cached.put("cached", true)
            }
            try {
                if (!preferences.contains("readme-repo:$id")) market()
                val repo = preferences.getString("readme-repo:$id", null) ?: return@withContext null
                var failure: Exception? = null
                for (branch in listOf("main", "master")) {
                    try {
                        val base = "https://raw.githubusercontent.com/$repo/$branch/"
                        val markdown =
                            String(
                                PluginMarketTransport.download(base + "README.md", 1024 * 1024),
                                Charsets.UTF_8,
                            )
                        val result =
                            JSONObject()
                                .put("markdown", markdown)
                                .put("baseUrl", base)
                                .put("fetchedAt", System.currentTimeMillis())
                        preferences.edit().putString("readme:$id", result.toString()).apply()
                        return@withContext result
                    } catch (error: Exception) {
                        failure = error
                    }
                }
                throw failure ?: IllegalStateException(tr("说明加载失败"))
            } catch (error: Exception) {
                if (error is kotlinx.coroutines.CancellationException) throw error
                cached?.put("cached", true) ?: throw error
            }
        }

    suspend fun prepare(entry: MarketPlugin): PreparedPlugin {
        val bytes =
            withContext(Dispatchers.IO) {
                PluginMarketTransport.download(entry.url, PluginMarketTransport.packageLimit)
            }
        require(PluginMarketTransport.hash(bytes) == entry.hash) { tr("插件校验和与市场目录不一致") }
        val prepared = prepareBytes(bytes)
        require(
            prepared.manifest.getString("id") == entry.id &&
                prepared.manifest.getString("version") == entry.version
        ) {
            tr("插件身份与目录不一致")
        }
        return prepared.copy(origin = tr("插件市场（SHA-256 已匹配）\n{0}", entry.url))
    }

    suspend fun prepare(uri: Uri): PreparedPlugin {
        val bytes =
            withContext(Dispatchers.IO) {
                context.contentResolver.openInputStream(uri)?.use {
                    PluginMarketTransport.bounded(it, PluginMarketTransport.packageLimit)
                } ?: error(tr("无法读取插件包"))
            }
        return prepareBytes(bytes)
    }

    private suspend fun prepareBytes(bytes: ByteArray): PreparedPlugin {
        val json = withContext(Dispatchers.IO) { PluginMarketTransport.unpack(bytes) }
        val manifest = PluginPackageValidation.validate(context, json)
        return PreparedPlugin(
            json,
            manifest,
            PluginMarketTransport.hash(json.toByteArray(Charsets.UTF_8)),
        )
    }

    private fun records() = JSONObject(preferences.getString("installed", "{}")!!)

    fun installed(space: String): List<InstalledPlugin> {
        val records = records()
        return records
            .keys()
            .asSequence()
            .map { id ->
                val record = records.getJSONObject(id)
                val revision = record.getString("revision")
                InstalledPlugin(
                    record.getJSONObject("manifest"),
                    revision,
                    record.getJSONObject("manifest").optString("kind") != "theme" &&
                        preferences.getString("enabled:$space:$id", null) == revision,
                )
            }
            .toList()
    }

    fun navigationPages(space: String): List<PluginNavigationPage> =
        installed(space)
            .filter { it.enabled }
            .flatMap { plugin ->
                val views = plugin.manifest.optJSONArray("views") ?: org.json.JSONArray()
                val placements = plugin.manifest.optJSONArray("placements") ?: org.json.JSONArray()
                (0 until placements.length()).mapNotNull { index ->
                    val placement = placements.getJSONObject(index)
                    if (placement.optString("location") != "navigation") return@mapNotNull null
                    val view =
                        (0 until views.length()).map(views::getJSONObject).find {
                            it.optString("id") == placement.optString("view") &&
                                it.optString("kind") == "page"
                        } ?: return@mapNotNull null
                    PluginNavigationPage(
                        plugin.id,
                        view.getString("id"),
                        view.getString("title"),
                        plugin.revision,
                    )
                }
            }
            .distinctBy { it.key }
            .sortedBy { it.key }

    // Callers pass the Space captured before preparation, after permission review.
    suspend fun install(prepared: PreparedPlugin, enableInSpace: String? = null) =
        withContext(Dispatchers.IO) {
            synchronized(mutationLock) {
                check(directory.isDirectory || directory.mkdirs())
                val file = AtomicFile(File(directory, "${prepared.revision}.json"))
                val stream = file.startWrite()
                try {
                    stream.write(prepared.json.toByteArray(Charsets.UTF_8))
                    file.finishWrite(stream)
                } catch (error: Exception) {
                    file.failWrite(stream)
                    throw error
                }
                val records =
                    records()
                        .put(
                            prepared.manifest.getString("id"),
                            JSONObject()
                                .put("revision", prepared.revision)
                                .put("manifest", prepared.manifest),
                        )
                val edit = preferences.edit().putString("installed", records.toString())
                if (enableInSpace != null && prepared.manifest.optString("kind") != "theme") {
                    edit.putString(
                        "enabled:$enableInSpace:${prepared.manifest.getString("id")}",
                        prepared.revision,
                    )
                }
                check(edit.commit()) {
                    tr("无法保存插件安装信息")
                }
                prunePackages()
            }
        }

    fun setEnabled(space: String, plugin: InstalledPlugin, enabled: Boolean) =
        synchronized(mutationLock) {
            require(!enabled || plugin.manifest.optString("kind") != "theme") { tr("移动端不支持插件主题") }
            require(records().getJSONObject(plugin.id).getString("revision") == plugin.revision) {
                tr("插件版本已变更，请刷新")
            }
            check(
                preferences
                    .edit()
                    .putString(
                        "enabled:$space:${plugin.id}",
                        if (enabled) plugin.revision else null,
                    )
                    .commit()
            )
        }

    fun uninstall(id: String) =
        synchronized(mutationLock) {
            val records = records().apply { remove(id) }
            val edit = preferences.edit().putString("installed", records.toString())
            preferences.all.keys
                .filter { it.startsWith("enabled:") && it.endsWith(":$id") }
                .forEach { edit.remove(it) }
            check(edit.commit())
            prunePackages()
        }

    private fun prunePackages() {
        val current = records()
        val retained =
            current
                .keys()
                .asSequence()
                .map { "${current.getJSONObject(it).getString("revision")}.json" }
                .toSet()
        directory
            .listFiles()
            ?.filter { it.name.matches(Regex("[a-f0-9]{64}\\.json")) && it.name !in retained }
            ?.forEach { it.delete() }
    }

    fun registry(space: String): PluginOpenWithRegistry {
        val installed = installed(space)
        val overridden = installed.map { it.id }.toSet()
        val bundled =
            PluginOpenWithRegistry.bundled(context.assets).allViews().filter {
                it.id.substringBefore('/') !in overridden
            }
        return PluginOpenWithRegistry(
            bundled +
                installed
                    .filter { it.enabled }
                    .flatMap { plugin ->
                        val manifest = plugin.manifest
                        val views = manifest.optJSONArray("views") ?: org.json.JSONArray()
                        val placements = manifest.optJSONArray("placements") ?: org.json.JSONArray()
                        val browser = manifest.optJSONObject("browser")
                        (0 until views.length()).mapNotNull { index ->
                            val view = views.getJSONObject(index)
                            if (
                                view.optString("kind") != "file"
                            )
                                return@mapNotNull null
                            val extensions =
                                (0 until placements.length())
                                    .map { placements.getJSONObject(it) }
                                    .filter {
                                        it.optString("location") == "file/open" &&
                                            it.optString("view") == view.getString("id")
                                    }
                                    .flatMap { p ->
                                        p.getJSONArray("extensions").let { values ->
                                            (0 until values.length()).map(values::getString)
                                        }
                                    }
                                    .toSet()
                            if (extensions.isEmpty())
                                return@mapNotNull null
                            PluginFileView(
                                "${plugin.id}/${view.getString("id")}",
                                view.getString("title"),
                                "installed.${plugin.revision}.js",
                                extensions,
                                view
                                    .optJSONArray("capabilities")
                                    ?.toString()
                                    ?.contains("\"document\"") == true,
                                browser?.optBoolean("workers", false) ?: false,
                                browser?.optJSONArray("networkOrigins")?.let { origins ->
                                    (0 until origins.length()).map(origins::getString).toSet()
                                } ?: emptySet(),
                                plugin.revision,
                                view.getString("entry"),
                            )
                        }
                    }
        )
    }

    suspend fun program(space: String, id: String): JSONObject =
        withContext(Dispatchers.IO) {
            val plugin = installed(space).single { it.id == id && it.enabled }
            val bytes =
                File(directory, "${plugin.revision}.json").inputStream().use {
                    PluginMarketTransport.bounded(it, PluginMarketTransport.packageLimit)
                }
            require(PluginMarketTransport.hash(bytes) == plugin.revision) { tr("插件校验失败，请重新安装") }
            JSONObject(String(bytes, Charsets.UTF_8))
        }

    suspend fun source(space: String, view: PluginFileView): String? =
        withContext(Dispatchers.IO) {
            val revision = view.revision ?: return@withContext null
            require(
                installed(space).any {
                    it.enabled && it.id == view.id.substringBefore('/') && it.revision == revision
                }
            ) {
                tr("插件未在当前 Space 启用")
            }
            val bytes =
                File(directory, "$revision.json").inputStream().use {
                    PluginMarketTransport.bounded(it, PluginMarketTransport.packageLimit)
                }
            require(PluginMarketTransport.hash(bytes) == revision) { tr("插件文件校验失败，请重新安装") }
            JSONObject(String(bytes, Charsets.UTF_8))
                .getJSONObject("modules")
                .getString(checkNotNull(view.entry))
        }
}
