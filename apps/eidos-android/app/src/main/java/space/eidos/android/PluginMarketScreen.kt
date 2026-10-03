@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package space.eidos.android

import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
fun PluginMarketScreen(
    store: PluginMarketStore,
    spaceId: String,
    spaceName: String,
    close: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    var catalog by remember { mutableStateOf<List<MarketPlugin>>(emptyList()) }
    var installed by remember { mutableStateOf(store.installed(spaceId)) }
    var busy by remember { mutableStateOf(false) }
    var loadingCatalog by remember { mutableStateOf(false) }
    var marketError by remember { mutableStateOf<String?>(null) }
    var message by remember { mutableStateOf<String?>(null) }
    var review by remember { mutableStateOf<PreparedPlugin?>(null) }
    var removing by remember { mutableStateOf<InstalledPlugin?>(null) }
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
                message = error.message ?: "插件操作失败，请重试"
            } finally {
                busy = false
            }
        }
    }
    val import =
        rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
            if (uri != null) action { review = store.prepare(uri) }
        }
    fun refreshMarket() {
        if (loadingCatalog) return
        scope.launch {
            loadingCatalog = true
            marketError = null
            try {
                catalog = store.market()
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (error: Exception) {
                marketError = error.message ?: "市场暂时不可用；仍可管理或导入本地插件。"
            } finally {
                loadingCatalog = false
            }
        }
    }
    LaunchedEffect(Unit) { refreshMarket() }
    BackHandler { if (!busy) close() }
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("插件") },
                navigationIcon = {
                    IconButton(onClick = close, enabled = !busy) {
                        Icon(Icons.AutoMirrored.Outlined.ArrowBack, "返回")
                    }
                },
                actions = {
                    TextButton(onClick = { import.launch(arrayOf("*/*")) }, enabled = !busy) {
                        Text("导入插件包")
                    }
                },
            )
        }
    ) { padding ->
        LazyColumn(
            Modifier.padding(padding).fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            item {
                Text("安装到此设备，按 Space 启用。当前：$spaceName", style = MaterialTheme.typography.bodySmall)
            }
            if (busy || loadingCatalog) item { LinearProgressIndicator(Modifier.fillMaxWidth()) }
            message?.let { value -> item { Text(value, color = MaterialTheme.colorScheme.error) } }
            item { Text("已安装", style = MaterialTheme.typography.titleMedium) }
            if (installed.isEmpty()) item { Text("尚未安装插件。内置打开方式仍可使用。") }
            items(installed, key = { "installed:${it.id}" }) { plugin ->
                ListItem(
                    headlineContent = { Text(plugin.manifest.getString("name")) },
                    supportingContent = {
                        Text(
                            "${plugin.manifest.getString("version")} · ${if (plugin.enabled) "已在当前 Space 启用" else "未启用"}"
                        )
                    },
                    trailingContent = {
                        Row {
                            Switch(
                                checked = plugin.enabled,
                                enabled = !busy,
                                onCheckedChange = { value ->
                                    action {
                                        withContext(Dispatchers.IO) {
                                            store.setEnabled(spaceId, plugin, value)
                                        }
                                    }
                                },
                            )
                            TextButton(onClick = { removing = plugin }, enabled = !busy) {
                                Text("卸载")
                            }
                        }
                    },
                )
            }
            item {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("插件市场", style = MaterialTheme.typography.titleMedium)
                    TextButton(onClick = { refreshMarket() }, enabled = !busy && !loadingCatalog) {
                        Text("刷新")
                    }
                }
                Text(
                    "下载后检查 Android 兼容性，再展示安装权限。当前支持只读文件打开方式。",
                    style = MaterialTheme.typography.bodySmall,
                )
            }
            marketError?.let { value ->
                item { Text(value, color = MaterialTheme.colorScheme.error) }
            }
            items(catalog, key = { "market:${it.id}" }) { entry ->
                ListItem(
                    headlineContent = { Text(entry.name) },
                    supportingContent = { Text("${entry.version}\n${entry.description}") },
                    trailingContent = {
                        TextButton(
                            onClick = { action { review = store.prepare(entry) } },
                            enabled = !busy,
                        ) {
                            Text("检查安装")
                        }
                    },
                )
            }
        }
    }
    review?.let { prepared ->
        val manifest = prepared.manifest
        val browser = manifest.optJSONObject("browser")
        val origins = browser?.optJSONArray("networkOrigins")
        AlertDialog(
            onDismissRequest = { if (!busy) review = null },
            title = { Text("安装 ${manifest.getString("name")}") },
            text = {
                Column(
                    Modifier.verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text("版本 ${manifest.getString("version")}\n${manifest.getString("id")}")
                    Text(prepared.origin, style = MaterialTheme.typography.bodySmall)
                    installed
                        .find { it.id == manifest.getString("id") }
                        ?.let {
                            Text("将替换 ${it.manifest.getString("version")}。版本内容变化后需重新在各 Space 启用。")
                        }
                    Text("权限：只读你选择用它打开的文件；不能写入或读取其他文件。")
                    Text(
                        if (origins == null || origins.length() == 0) "不允许联网"
                        else
                            "允许连接：\n${(0 until origins.length()).joinToString("\n") { origins.getString(it) }}\n联网插件能够向这些地址发送已读取的内容。"
                    )
                    if (browser?.optBoolean("workers") == true) Text("允许本地 Worker")
                    Text("安装不会自动在 Space 启用。")
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        action {
                            store.install(prepared)
                            review = null
                            message = "安装完成，请在当前 Space 启用。"
                        }
                    },
                    enabled = !busy,
                ) {
                    Text("安装")
                }
            },
            dismissButton = {
                TextButton(onClick = { review = null }, enabled = !busy) { Text("取消") }
            },
        )
    }
    removing?.let { plugin ->
        AlertDialog(
            onDismissRequest = { removing = null },
            title = { Text("卸载 ${plugin.manifest.getString("name")}") },
            text = { Text("将从所有 Space 移除此插件的安装和启用状态，本地资料不会被删除。") },
            confirmButton = {
                TextButton(
                    onClick = {
                        action {
                            withContext(Dispatchers.IO) { store.uninstall(plugin.id) }
                            removing = null
                        }
                    },
                    enabled = !busy,
                ) {
                    Text("卸载")
                }
            },
            dismissButton = { TextButton(onClick = { removing = null }) { Text("取消") } },
        )
    }
}
