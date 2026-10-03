package space.eidos.android

import android.content.res.AssetManager
import java.util.Locale
import org.json.JSONArray

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
    fun accepts(path: String): Boolean =
        path.isNotBlank() &&
            !path.startsWith('/') &&
            '\\' !in path &&
            path.split('/').none { it.isEmpty() || it == "." || it == ".." } &&
            ("." +
                path.substringAfterLast('/').substringAfterLast('.', "").lowercase(Locale.ROOT)) in
                extensions
}

/** Only build-validated APK assets are discoverable. Space contents are never executable. */
class PluginOpenWithRegistry(private val views: List<PluginFileView>) {
    fun allViews(): List<PluginFileView> = views.toList()

    init {
        require(views.map { it.id }.distinct().size == views.size)
        require(views.all { it.asset.matches(Regex("[a-z0-9.-]+\\.js")) })
        require(views.all { view -> view.networkOrigins.all(PluginResourcePolicy::validOrigin) })
        require(
            views.all { view ->
                view.extensions.all { it.matches(Regex("\\.[a-z0-9]{1,16}")) && it != ".eidos" }
            }
        )
    }

    fun candidates(file: SpaceFile): List<PluginFileView> =
        if (file.directory) emptyList() else views.filter { it.accepts(file.path) }

    fun resolve(file: SpaceFile, id: String): PluginFileView =
        candidates(file).singleOrNull { it.id == id } ?: error("此打开方式不适用于当前文件")

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
