@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package space.eidos.android

import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asComposePath
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject

@Composable
internal fun NativePluginManager(model: EidosModel, spaceName: String, close: () -> Unit) {
    var opened by remember { mutableStateOf<String?>(null) }
    var readme by remember { mutableStateOf<Pair<String, String>?>(null) }
    Box(Modifier.fillMaxSize()) {
        if (opened != null)
            MobilePluginScreen(
                model,
                pluginId = opened,
                onOpenFile = close,
                close = { opened = null },
            )
        else
            PluginMarketScreen(
                model.pluginMarket,
                model.repository.spaceId,
                spaceName,
                close,
                openPlugin = { opened = it },
                openReadme = { id, name -> readme = id to name },
                uninstall = { id ->
                    MobilePluginService(
                            model.getApplication(),
                            model.repository,
                            model.pluginMarket,
                            {},
                            { error("No picker") },
                        )
                        .handle("uninstall", JSONObject().put("id", id))
                },
            )
        readme?.let { (id, name) ->
            MobilePluginScreen(
                model,
                pluginId = id,
                readme = true,
                title = name,
                close = { readme = null },
            )
        }
    }
}

private fun pluginCategory(category: String) =
    when (category) {
        "knowledge-and-writing" -> "知识记录"
        "data-visualization" -> "数据视图"
        "automation" -> "自动化"
        else -> "其他"
    }

@Composable
private fun PluginGlyph(icon: JSONObject?) {
    val paths =
        remember(icon?.toString()) {
            val values = icon?.optJSONArray("paths")
            (0 until minOf(values?.length() ?: 0, 32)).mapNotNull { index ->
                runCatching {
                        androidx.core.graphics.PathParser.createPathFromPathData(
                                values!!.getString(index)
                            )
                            ?.asComposePath()
                    }
                    .getOrNull()
            }
        }
    val ink = MaterialTheme.colorScheme.onSurface
    Box(Modifier.size(40.dp), contentAlignment = Alignment.Center) {
        if (paths.isEmpty()) Icon(Icons.Outlined.Extension, null, Modifier.size(26.dp))
        else
            Canvas(Modifier.size(26.dp)) {
                scale(
                    size.width / 24f,
                    size.height / 24f,
                    pivot = androidx.compose.ui.geometry.Offset.Zero,
                ) {
                    paths.forEach { drawPath(it, ink, style = Stroke(width = 1.7f)) }
                }
            }
    }
}

internal fun pluginPermissions(manifest: JSONObject): String =
    buildList {
            add(tr("可读取所选文件或数据表。"))
            val files = manifest.optJSONObject("workspace")?.opt("files")
            if (files == true || files is JSONObject)
                add(
                    if (files == true || (files as? JSONObject)?.optBoolean("write") == true)
                        tr("可读取和修改当前 Space 的普通文件。")
                    else tr("可读取当前 Space 的普通文件。")
                )
            if (
                listOf("actions", "views").any { key ->
                    val items = manifest.optJSONArray(key)
                    items != null &&
                        (0 until items.length()).any {
                            items.optJSONObject(it)?.optString("access") == "write"
                        }
                }
            )
                add(tr("包含写入操作，可修改资料。"))
            if (manifest.has("connections")) add(tr("可通过已配置的连接发送资料；密钥由本机保管。"))
            val origins = manifest.optJSONObject("browser")?.optJSONArray("networkOrigins")
            if (origins == null || origins.length() == 0) add(tr("不允许联网"))
            else for (index in 0 until origins.length()) add(tr("允许联网：{0}", origins.getString(index)))
        }
        .joinToString("\n")

@Composable
fun PluginMarketScreen(
    store: PluginMarketStore,
    spaceId: String,
    spaceName: String,
    close: () -> Unit,
    openPlugin: (String) -> Unit = {},
    openReadme: (String, String) -> Unit = { _, _ -> },
    uninstall: (suspend (String) -> Unit)? = null,
) {
    val scope = rememberCoroutineScope()
    var catalog by remember { mutableStateOf<List<MarketPlugin>>(emptyList()) }
    var installed by remember { mutableStateOf(store.installed(spaceId)) }
    var busy by remember { mutableStateOf(false) }
    var loadingCatalog by remember { mutableStateOf(false) }
    var marketError by remember { mutableStateOf<String?>(null) }
    var message by remember { mutableStateOf<String?>(null) }
    var review by remember { mutableStateOf<Pair<PreparedPlugin, String>?>(null) }
    var importSpace by remember { mutableStateOf(spaceId) }
    var removing by remember { mutableStateOf<InstalledPlugin?>(null) }
    var enabling by remember { mutableStateOf<InstalledPlugin?>(null) }
    var details by remember { mutableStateOf<InstalledPlugin?>(null) }
    var discover by rememberSaveable { mutableStateOf(false) }
    var query by rememberSaveable { mutableStateOf("") }
    var category by rememberSaveable { mutableStateOf("全部") }
    var more by remember { mutableStateOf(false) }
    var catalogLoaded by remember { mutableStateOf(false) }
    val installedScroll = rememberLazyListState()
    val marketScroll = rememberLazyListState()
    fun action(block: suspend () -> Unit) {
        if (busy) return
        scope.launch {
            busy = true
            message = null
            try {
                block()
                installed = store.installed(spaceId)
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (error: Exception) {
                message = error.message ?: tr("插件操作失败，请重试")
            } finally {
                busy = false
            }
        }
    }
    val import =
        rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
            val target = importSpace
            if (uri != null) action {
                review = null
                review = store.prepare(uri) to target
            }
        }
    fun refreshMarket() {
        if (loadingCatalog) return
        scope.launch {
            loadingCatalog = true
            marketError = null
            try {
                catalog = store.market().filter { it.category != "themes" }
                catalogLoaded = true
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (error: Exception) {
                marketError = error.message ?: tr("市场暂时不可用；仍可管理或导入本地插件。")
            } finally {
                loadingCatalog = false
            }
        }
    }
    BackHandler { if (!busy) close() }
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(tr("插件")) },
                navigationIcon = {
                    IconButton(onClick = close, enabled = !busy) {
                        Icon(Icons.AutoMirrored.Outlined.ArrowBack, tr("返回"))
                    }
                },
                actions = {
                    Box {
                        IconButton(onClick = { more = true }, enabled = !busy) {
                            Icon(Icons.Outlined.MoreHoriz, tr("插件更多操作"))
                        }
                        DropdownMenu(more, { more = false }) {
                            DropdownMenuItem(
                                text = { Text(tr("导入插件包")) },
                                leadingIcon = { Icon(Icons.Outlined.FileUpload, null) },
                                onClick = {
                                    more = false
                                    importSpace = spaceId
                                    import.launch(arrayOf("*/*"))
                                },
                            )
                            DropdownMenuItem(
                                text = { Text(tr("检查更新")) },
                                leadingIcon = { Icon(Icons.Outlined.Refresh, null) },
                                enabled = !loadingCatalog,
                                onClick = {
                                    more = false
                                    discover = true
                                    refreshMarket()
                                },
                            )
                        }
                    }
                },
            )
        }
    ) { padding ->
        Column(Modifier.padding(padding).fillMaxSize()) {
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 20.dp),
                horizontalArrangement = Arrangement.spacedBy(28.dp),
            ) {
                for ((market, label) in listOf(true to tr("发现"), false to tr("已安装"))) {
                    Column(
                        Modifier.clickable {
                                discover = market
                                if (market && !catalogLoaded && !loadingCatalog) refreshMarket()
                            }
                            .semantics { contentDescription = label }
                            .padding(top = 14.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Text(
                            label,
                            style = MaterialTheme.typography.titleSmall,
                            color =
                                if (discover == market) MaterialTheme.colorScheme.onSurface
                                else MaterialTheme.colorScheme.onSurfaceVariant,
                            fontWeight =
                                if (discover == market) FontWeight.SemiBold else FontWeight.Normal,
                        )
                        Spacer(Modifier.height(13.dp))
                        Box(
                            Modifier.height(2.dp)
                                .width(44.dp)
                                .background(
                                    if (discover == market) MaterialTheme.colorScheme.onSurface
                                    else androidx.compose.ui.graphics.Color.Transparent
                                )
                        )
                    }
                }
            }
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            if (discover) {
                OutlinedTextField(
                    query,
                    { query = it },
                    placeholder = { Text(tr("搜索插件")) },
                    leadingIcon = { Icon(Icons.Outlined.Search, null) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth().padding(20.dp, 14.dp),
                    shape = androidx.compose.foundation.shape.RoundedCornerShape(12.dp),
                )
                Row(
                    Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 20.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    for (label in listOf("全部", "知识记录", "数据视图", "自动化", "其他")) {
                        FilterChip(
                            selected = category == label,
                            onClick = { category = label },
                            label = { Text(tr(label)) },
                        )
                    }
                }
            }
            if (busy || loadingCatalog) LinearProgressIndicator(Modifier.fillMaxWidth())
            message?.let {
                Text(
                    it,
                    Modifier.padding(20.dp, 8.dp),
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall,
                )
            }
            LazyColumn(
                state = if (discover) marketScroll else installedScroll,
                modifier = Modifier.weight(1f),
                contentPadding = PaddingValues(horizontal = 20.dp, vertical = 16.dp),
            ) {
                if (!discover) {
                    item {
                        Text(spaceName, style = MaterialTheme.typography.titleSmall)
                        Text(
                            tr("开关仅影响当前 Space"),
                            Modifier.padding(top = 4.dp, bottom = 14.dp),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    if (installed.isEmpty())
                        item {
                            Text(
                                tr("还没有安装插件"),
                                Modifier.padding(top = 24.dp),
                                style = MaterialTheme.typography.titleMedium,
                            )
                            Text(
                                tr("从发现页选择插件，或导入本地插件包。"),
                                Modifier.padding(vertical = 8.dp),
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            TextButton(
                                onClick = {
                                    discover = true
                                    if (!catalogLoaded) refreshMarket()
                                }
                            ) {
                                Text(tr("浏览插件市场"))
                            }
                        }
                    items(installed, key = { it.id }) { plugin ->
                        Row(
                            Modifier.fillMaxWidth().padding(vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Row(
                                Modifier.weight(1f)
                                    .clickable(enabled = !busy) {
                                        openReadme(plugin.id, plugin.manifest.getString("name"))
                                    }
                                    .padding(vertical = 16.dp),
                                horizontalArrangement = Arrangement.spacedBy(12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                PluginGlyph(plugin.manifest.optJSONObject("icon"))
                                Column(
                                    Modifier.weight(1f),
                                    verticalArrangement = Arrangement.spacedBy(4.dp),
                                ) {
                                    Text(
                                        plugin.manifest.getString("name"),
                                        style = MaterialTheme.typography.titleSmall,
                                        maxLines = 2,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                    Text(
                                        if (plugin.manifest.optString("kind") == "theme") tr("移动端不支持主题")
                                        else
                                            plugin.manifest.optString("description").ifBlank {
                                                tr("文件视图与工具")
                                            },
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        maxLines = 2,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                    Text(
                                        plugin.manifest.getString("version"),
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                            }
                            IconButton(onClick = { details = plugin }, enabled = !busy) {
                                Icon(
                                    Icons.Outlined.MoreVert,
                                    contentDescription = tr("管理 ") + plugin.manifest.getString("name"),
                                )
                            }
                            Switch(
                                checked = plugin.enabled,
                                modifier =
                                    Modifier.semantics {
                                        contentDescription =
                                            tr("启用 ") + plugin.manifest.getString("name")
                                    },
                                enabled = !busy && plugin.manifest.optString("kind") != "theme",
                                onCheckedChange = { value ->
                                    if (value) enabling = plugin
                                    else
                                        action {
                                            withContext(Dispatchers.IO) {
                                                store.setEnabled(spaceId, plugin, false)
                                            }
                                        }
                                },
                            )
                        }
                        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                    }
                } else {
                    val matches =
                        catalog.filter {
                            (category == "全部" || pluginCategory(it.category) == category) &&
                                (it.name + " " + it.description).contains(
                                    query.trim(),
                                    ignoreCase = true,
                                )
                        }
                    marketError?.let { error ->
                        item {
                            Text(
                                error,
                                color = MaterialTheme.colorScheme.error,
                                style = MaterialTheme.typography.bodySmall,
                            )
                            TextButton(onClick = { refreshMarket() }) { Text(tr("重试")) }
                        }
                    }
                    item {
                        Text(
                            matches.size.toString() + tr(" 个插件"),
                            Modifier.padding(vertical = 12.dp),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    if (catalogLoaded && matches.isEmpty())
                        item {
                            Text(
                                tr("没有匹配的插件"),
                                Modifier.padding(vertical = 24.dp),
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    items(matches, key = { it.id }) { entry ->
                        val current = installed.firstOrNull { it.id == entry.id }
                        val upToDate = current?.manifest?.optString("version") == entry.version
                        Row(
                            Modifier.fillMaxWidth()
                                .clickable(enabled = !busy) { openReadme(entry.id, entry.name) }
                                .padding(vertical = 20.dp),
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            PluginGlyph(entry.icon)
                            Column(
                                Modifier.weight(1f),
                                verticalArrangement = Arrangement.spacedBy(4.dp),
                            ) {
                                Text(entry.name, style = MaterialTheme.typography.titleSmall)
                                Text(
                                    entry.description,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    maxLines = 2,
                                    overflow = TextOverflow.Ellipsis,
                                )
                                Text(
                                    tr(pluginCategory(entry.category)) + " · " + entry.version,
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            OutlinedButton(
                                onClick = {
                                    val target = spaceId
                                    action {
                                        review = null
                                        review = store.prepare(entry) to target
                                    }
                                },
                                enabled = !busy && !upToDate,
                                contentPadding = PaddingValues(horizontal = 14.dp),
                            ) {
                                Text(if (upToDate) tr("已安装") else if (current != null) tr("更新") else tr("安装"))
                            }
                        }
                        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                    }
                }
            }
        }
    }
    review?.let { (prepared, targetSpace) ->
        val manifest = prepared.manifest
        val browser = manifest.optJSONObject("browser")
        AlertDialog(
            onDismissRequest = { if (!busy) review = null },
            title = { Text(tr("安装 {0}", manifest.getString("name"))) },
            text = {
                Column(
                    Modifier.verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text(tr("版本 {0}\n{1}", manifest.getString("version"), manifest.getString("id")))
                    Text(prepared.origin, style = MaterialTheme.typography.bodySmall)
                    installed
                        .find { it.id == manifest.getString("id") }
                        ?.let {
                            Text(tr("将替换 {0}。版本内容变化后需重新在其他 Space 启用。", it.manifest.getString("version")))
                        }
                    Text(pluginPermissions(manifest))
                    message?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                    if (browser?.optBoolean("workers") == true) Text(tr("允许本地 Worker"))
                    Text(tr("安装后将在发起安装的 Space 启用。"))
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        action {
                            store.install(prepared, targetSpace)
                            review = null
                            message = tr("安装完成，已在发起安装的 Space 启用。")
                        }
                    },
                    enabled = !busy,
                ) {
                    Text(tr("安装"))
                }
            },
            dismissButton = {
                TextButton(onClick = { review = null }, enabled = !busy) { Text(tr("取消")) }
            },
        )
    }
    removing?.let { plugin ->
        AlertDialog(
            onDismissRequest = { removing = null },
            title = { Text(tr("卸载 {0}", plugin.manifest.getString("name"))) },
            text = { Text(tr("将从所有 Space 移除此插件的安装和启用状态，本地资料不会被删除。")) },
            confirmButton = {
                TextButton(
                    onClick = {
                        action {
                            withContext(Dispatchers.IO) {
                                if (uninstall != null) uninstall(plugin.id)
                                else store.uninstall(plugin.id)
                            }
                            removing = null
                        }
                    },
                    enabled = !busy,
                ) {
                    Text(tr("卸载"))
                }
            },
            dismissButton = { TextButton(onClick = { removing = null }) { Text(tr("取消")) } },
        )
    }
    enabling?.let { plugin ->
        AlertDialog(
            onDismissRequest = { if (!busy) enabling = null },
            title = { Text(tr("启用 {0}", plugin.manifest.getString("name"))) },
            text = {
                Text(
                    pluginPermissions(plugin.manifest),
                    Modifier.verticalScroll(rememberScrollState()),
                )
            },
            confirmButton = {
                TextButton(
                    enabled = !busy,
                    onClick = {
                        action {
                            withContext(Dispatchers.IO) { store.setEnabled(spaceId, plugin, true) }
                            enabling = null
                        }
                    },
                ) {
                    Text(tr("启用"))
                }
            },
            dismissButton = {
                TextButton(onClick = { enabling = null }, enabled = !busy) { Text(tr("取消")) }
            },
        )
    }
    details?.let { plugin ->
        ModalBottomSheet(onDismissRequest = { details = null }) {
            Column(
                Modifier.padding(20.dp).verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text(plugin.manifest.getString("name"), style = MaterialTheme.typography.titleLarge)
                Text(plugin.manifest.optString("description"))
                Text(
                    "${plugin.id} · ${plugin.manifest.optString("version")}",
                    style = MaterialTheme.typography.bodySmall,
                )
                Text(pluginPermissions(plugin.manifest))
                if (plugin.enabled)
                    Button(
                        onClick = {
                            details = null
                            openPlugin(plugin.id)
                        }
                    ) {
                        Text(tr("打开插件"))
                    }
                TextButton(
                    onClick = {
                        details = null
                        removing = plugin
                    }
                ) {
                    Text(tr("卸载插件"))
                }
            }
        }
    }
}
