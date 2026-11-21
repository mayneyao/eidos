package space.eidos.android

import android.content.res.AssetManager
import java.util.Locale
import org.json.JSONArray
import org.json.JSONObject

private val fileExtensionPattern = Regex("\\.[a-z0-9]{1,16}")

private fun normalizeExtension(extension: String): String? =
    extension.lowercase(Locale.ROOT).takeIf(fileExtensionPattern::matches)

private fun fileExtension(path: String): String? {
    if (path.isBlank() || path.startsWith('/') || '\\' in path) return null
    if (path.split('/').any { it.isEmpty() || it == "." || it == ".." }) return null
    return normalizeExtension("." + path.substringAfterLast('/').substringAfterLast('.', ""))
}

internal fun fileOpenExtension(file: SpaceFile): String? =
    if (file.directory) null else fileExtension(file.path)

internal fun manifestFileViews(manifest: JSONObject, revision: String): List<PluginFileView> {
    if (manifest.optString("kind") == "theme") return emptyList()
    val views = manifest.optJSONArray("views") ?: return emptyList()
    val placements = manifest.optJSONArray("placements") ?: return emptyList()
    val browser = manifest.optJSONObject("browser")
    val openPlacements = (0 until placements.length()).map(placements::getJSONObject)
        .filter { it.optString("location") == "file/open" }
        .groupBy { it.getString("view") }
    return (0 until views.length()).mapNotNull { index ->
        val view = views.getJSONObject(index)
        if (view.optString("kind") != "file") return@mapNotNull null
        val id = view.getString("id")
        val extensions = openPlacements[id].orEmpty().flatMap { placement ->
            val values = placement.getJSONArray("extensions")
            (0 until values.length()).mapNotNull { normalizeExtension(values.getString(it)) }
        }.toSet()
        if (extensions.isEmpty()) return@mapNotNull null
        PluginFileView(
            "${manifest.getString("id")}/$id",
            view.getString("title"),
            "installed.$revision.js",
            extensions,
            view.optJSONArray("capabilities")?.toString()?.contains("\"document\"") == true,
            browser?.optBoolean("workers", false) ?: false,
            browser?.optJSONArray("networkOrigins")?.let { origins ->
                (0 until origins.length()).map(origins::getString).toSet()
            } ?: emptySet(),
            revision,
            view.getString("entry"),
        )
    }
}

data class PluginFileView(
    val id: String,
    val title: String,
    val asset: String,
    val extensions: Set<String>,
    val document: Boolean = true,
    val workers: Boolean = false,
    val networkOrigins: Set<String> = emptySet(),
    val revision: String? = null,
    val entry: String? = null,
) {
    fun accepts(path: String): Boolean = fileExtension(path)?.let(extensions::contains) ?: false
}

/** File views come from build-validated APK assets or verified installed packages. */
class PluginOpenWithRegistry(
    private val views: List<PluginFileView>,
    private val defaultViewIds: Map<String, String> = emptyMap(),
) {
    fun allViews(): List<PluginFileView> = views.toList()

    init {
        require(views.map { it.id }.distinct().size == views.size)
        require(views.all { it.asset.matches(Regex("[a-z0-9.-]+\\.js")) })
        require(views.all { view -> view.networkOrigins.all(PluginResourcePolicy::validOrigin) })
        require(
            views.all { view ->
                view.extensions.all {
                    fileExtensionPattern.matches(it) && (it != ".eidos" || view.revision != null)
                }
            }
        )
    }

    fun candidates(file: SpaceFile): List<PluginFileView> =
        if (file.directory) emptyList() else views.filter { it.accepts(file.path) }

    fun configuredExtension(file: SpaceFile): String? =
        fileOpenExtension(file)?.takeIf(defaultViewIds::containsKey)

    fun defaultFor(file: SpaceFile): PluginFileView? {
        val extension = configuredExtension(file) ?: return null
        val id = defaultViewIds.getValue(extension)
        return candidates(file).singleOrNull { it.id == id && it.revision != null }
    }

    fun resolve(file: SpaceFile, id: String): PluginFileView =
        candidates(file).singleOrNull { it.id == id } ?: error(tr("此打开方式不适用于当前文件"))

    companion object {
        fun bundled(assets: AssetManager): PluginOpenWithRegistry {
            val catalog =
                JSONArray(
                    assets.open("plugins/catalog.json").bufferedReader().use { it.readText() }
                )
            return PluginOpenWithRegistry(
                (0 until catalog.length()).map { index ->
                    val item = catalog.getJSONObject(index)
                    val extensions = item.getJSONArray("extensions")
                    PluginFileView(
                        item.getString("id"),
                        item.getString("title"),
                        item.getString("asset"),
                        (0 until extensions.length()).map { extensions.getString(it) }.toSet(),
                        item.optBoolean("document", true),
                        item.optBoolean("workers", false),
                        item.optJSONArray("networkOrigins")?.let { origins ->
                            (0 until origins.length()).map { origins.getString(it) }.toSet()
                        } ?: emptySet(),
                    )
                }
            )
        }
    }
}

data class PluginFileSession(
    val view: PluginFileView,
    val file: SpaceFile,
    val document: TextDocument?,
    val source: String? = null,
)
