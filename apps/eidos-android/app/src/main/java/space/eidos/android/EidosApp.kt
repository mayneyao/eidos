@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package space.eidos.android

import android.widget.TextView
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.automirrored.outlined.InsertDriveFile
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import io.noties.markwon.AbstractMarkwonPlugin
import io.noties.markwon.Markwon
import io.noties.markwon.MarkwonConfiguration
import io.noties.markwon.ext.strikethrough.StrikethroughPlugin
import io.noties.markwon.ext.tables.TablePlugin
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import org.json.JSONObject

@Composable
fun EidosApp(model: EidosModel) {
    val editorPool = remember { EditorWebViewPool() }
    val editorContext = LocalContext.current.applicationContext
    val editorLifecycle = androidx.lifecycle.compose.LocalLifecycleOwner.current.lifecycle
    DisposableEffect(editorPool, editorLifecycle) {
        val observer =
            androidx.lifecycle.LifecycleEventObserver { _, event ->
                when (event) {
                    androidx.lifecycle.Lifecycle.Event.ON_STOP -> editorPool.background()
                    androidx.lifecycle.Lifecycle.Event.ON_START -> editorPool.foreground()
                    else -> Unit
                }
            }
        editorLifecycle.addObserver(observer)
        editorContext.registerComponentCallbacks(editorPool)
        onDispose {
            editorLifecycle.removeObserver(observer)
            editorContext.unregisterComponentCallbacks(editorPool)
            editorPool.shutdown()
        }
    }
    val state by model.state.collectAsStateWithLifecycle()
    val notificationContext = LocalContext.current
    val notificationPermission =
        rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {}
    fun requestSyncNotifications() {
        if (
            android.os.Build.VERSION.SDK_INT >= 33 &&
                notificationContext.checkSelfPermission(
                    android.Manifest.permission.POST_NOTIFICATIONS
                ) != android.content.pm.PackageManager.PERMISSION_GRANTED
        )
            notificationPermission.launch(android.Manifest.permission.POST_NOTIFICATIONS)
    }
    val colors =
        if (isSystemInDarkTheme())
            darkColorScheme(
                primary = Color(0xFFE4E4E7),
                onPrimary = Color(0xFF18181B),
                background = Color(0xFF18181B),
                surface = Color(0xFF18181B),
                surfaceContainer = Color(0xFF242427),
                secondaryContainer = Color(0xFF303034),
            )
        else
            lightColorScheme(
                primary = Color(0xFF242427),
                onPrimary = Color.White,
                background = Color(0xFFFAFAFA),
                surface = Color(0xFFFAFAFA),
                surfaceContainer = Color(0xFFF0F0F1),
                secondaryContainer = Color(0xFFE9E9EB),
            )
    MaterialTheme(colorScheme = colors) {
        var createSheet by rememberSaveable { mutableStateOf(false) }
        var pluginMarket by rememberSaveable { mutableStateOf(false) }
        var connectionSheet by rememberSaveable { mutableStateOf(false) }
        var exportPath by rememberSaveable { mutableStateOf<String?>(null) }
        var transferMenu by remember { mutableStateOf(false) }
        var exportFolder by rememberSaveable { mutableStateOf("") }
        val importDirectory =
            rememberLauncherForActivityResult(ActivityResultContracts.OpenDocumentTree()) {
                it?.let(model::importDirectory)
            }
        val exportDirectory =
            rememberLauncherForActivityResult(ActivityResultContracts.OpenDocumentTree()) {
                if (it != null) model.exportDirectory(exportFolder, it)
            }
        val import =
            rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) {
                it?.let(model::import)
            }
        val export =
            rememberLauncherForActivityResult(
                ActivityResultContracts.CreateDocument("application/octet-stream")
            ) { uri ->
                val path = exportPath
                if (uri != null && path != null) model.export(path, uri)
                exportPath = null
            }
        val exportFile: (String) -> Unit = { path ->
            exportPath = path
            export.launch(path.substringAfterLast('/'))
        }
        val exportEntry: (SpaceFile) -> Unit = { file ->
            if (file.directory) {
                exportFolder = file.path
                exportDirectory.launch(null)
            } else exportFile(file.path)
        }
        val favoritePaths = state.favorites.filter { it.tableId == null }.map { it.path }.toSet()
        val toggleFile: (SpaceFile) -> Unit = { model.toggleFavorite(Favorite(it.path, it.name)) }
        BackHandler(state.document != null || state.page != null || state.folder.isNotEmpty()) {
            if (!state.busy) model.back()
        }
        Surface(Modifier.fillMaxSize()) {
            when {
                pluginMarket ->
                    PluginMarketScreen(model.pluginMarket, state.spaceId, state.spaceName) {
                        pluginMarket = false
                    }
                state.pluginFile != null ->
                    PluginFileScreen(state.pluginFile!!, model.repository, model::closePluginFile)
                state.publish != null -> PublishScreen(state, model)
                state.webFile != null ->
                    key(state.spaceId, state.webFile!!.path) {
                        EmbeddedEditorScreen(state.webFile!!, model, editorPool)
                    }
                state.shareRecord != null ->
                    RecordScreen(
                        checkNotNull(state.shareRecord),
                        null,
                        state.busy,
                        model::closeShareTable,
                        initialValues = state.shareInitialValues,
                        pendingFileCount = state.pendingShares.firstOrNull()?.files?.size ?: 0,
                        attachmentFieldId = state.shareAttachmentFieldId,
                        selectAttachmentField = model::selectShareAttachmentField,
                        draftStore =
                            remember(state.spaceId, state.pendingShares.first().inboxId) {
                                ShareFormDraftStore(
                                    ShareInbox(model.getApplication(), state.spaceId),
                                    state.pendingShares.first().inboxId,
                                )
                            },
                        openAttachment = { entry ->
                            model.openAttachment(checkNotNull(state.shareRecord).path, entry)
                        },
                    ) { values, _, revision ->
                        model.saveShareRecord(values, revision)
                    }
                state.document != null -> MarkdownScreen(state, model, exportFile)
                state.page != null -> DatabaseScreen(state, model, exportFile)
                else ->
                    Scaffold(
                        topBar = {
                            if (state.tab != MainTab.Sync)
                                TopAppBar(
                                    title = { SpaceSelector(state, model) },
                                    navigationIcon = {
                                        if (state.folder.isNotEmpty())
                                            IconButton(
                                                onClick = model::back,
                                                enabled = !state.busy,
                                            ) {
                                                Icon(Icons.AutoMirrored.Outlined.ArrowBack, "返回上级")
                                            }
                                    },
                                    actions = {
                                        Box {
                                            IconButton(
                                                onClick = { transferMenu = true },
                                                enabled = !state.busy,
                                            ) {
                                                Icon(Icons.Outlined.MoreVert, "当前文件夹操作")
                                            }
                                            DropdownMenu(transferMenu, { transferMenu = false }) {
                                                DropdownMenuItem(
                                                    text = { Text("插件市场") },
                                                    onClick = {
                                                        transferMenu = false
                                                        pluginMarket = true
                                                    },
                                                )
                                                DropdownMenuItem(
                                                    text = { Text("导出当前目录") },
                                                    onClick = {
                                                        transferMenu = false
                                                        exportFolder = state.folder
                                                        exportDirectory.launch(null)
                                                    },
                                                )
                                            }
                                        }
                                    },
                                )
                        },
                        bottomBar = {
                            Column {
                                if (state.tab == MainTab.Files)
                                    state.captureNotice?.let {
                                        Text(
                                            it,
                                            Modifier.padding(horizontal = 24.dp, vertical = 4.dp),
                                            style = MaterialTheme.typography.bodySmall,
                                        )
                                    }
                                if (state.tab == MainTab.Files)
                                    StatusLine(
                                        homeSyncMessage(
                                            state.graft,
                                            state.backgroundSync,
                                            state.syncing,
                                            state.mergeReview != null,
                                            state.peerDevices
                                                .firstOrNull { device ->
                                                    state.peerLocalSpaces.any {
                                                        it.id == state.spaceId &&
                                                            it.fingerprint == device.fingerprint
                                                    }
                                                }
                                                ?.name,
                                        )
                                    )
                                NavigationBar(containerColor = MaterialTheme.colorScheme.surface) {
                                    listOf(
                                            Triple(MainTab.Files, "资料", Icons.Outlined.Folder),
                                            Triple(MainTab.Search, "搜索", Icons.Outlined.Search),
                                            Triple(MainTab.Sync, "同步", Icons.Outlined.Sync),
                                        )
                                        .forEach { (tab, label, icon) ->
                                            NavigationBarItem(
                                                selected = state.tab == tab,
                                                enabled = !state.busy,
                                                onClick = { model.tab(tab) },
                                                icon = { Icon(icon, label) },
                                                label = { Text(label) },
                                            )
                                        }
                                }
                            }
                        },
                        floatingActionButton = {
                            if (state.tab == MainTab.Files)
                                FloatingActionButton(
                                    onClick = { createSheet = true },
                                    containerColor = MaterialTheme.colorScheme.primary,
                                    contentColor = MaterialTheme.colorScheme.onPrimary,
                                    shape = RoundedCornerShape(18.dp),
                                ) {
                                    Icon(Icons.Outlined.Add, "新建")
                                }
                        },
                    ) { padding ->
                        Column(Modifier.padding(padding).fillMaxSize()) {
                            // Downloads own their progress UI; retain the global slot without a
                            // second bar.
                            LoadingIndicator(
                                state.busy &&
                                    state.downloadProgress == null &&
                                    (state.peerProgress == null ||
                                        state.peerProgress?.finishedAt != null)
                            )
                            when (state.tab) {
                                MainTab.Files ->
                                    LazyColumn(
                                        Modifier.fillMaxSize(),
                                        contentPadding = PaddingValues(bottom = 96.dp),
                                    ) {
                                        item {
                                            Heading(
                                                if (state.folder.isEmpty()) "资料"
                                                else state.folder.substringAfterLast('/')
                                            )
                                        }
                                        if (
                                            state.folder.isEmpty() && state.favorites.isNotEmpty()
                                        ) {
                                            item { SectionLabel("收藏") }
                                            items(
                                                state.favorites,
                                                key = { "favorite:${it.key}" },
                                            ) { favorite ->
                                                ListItem(
                                                    headlineContent = {
                                                        Text(
                                                            favorite.name,
                                                            maxLines = 1,
                                                            overflow = TextOverflow.Ellipsis,
                                                        )
                                                    },
                                                    supportingContent = {
                                                        Text(
                                                            favorite.path,
                                                            maxLines = 1,
                                                            overflow = TextOverflow.Ellipsis,
                                                        )
                                                    },
                                                    leadingContent = {
                                                        Icon(
                                                            if (favorite.tableId == null)
                                                                Icons.Outlined.Star
                                                            else Icons.Outlined.TableChart,
                                                            null,
                                                        )
                                                    },
                                                    trailingContent = {
                                                        IconButton(
                                                            onClick = {
                                                                model.toggleFavorite(favorite)
                                                            },
                                                            enabled = !state.busy,
                                                        ) {
                                                            Icon(
                                                                Icons.Outlined.Star,
                                                                "取消收藏 ${favorite.name}",
                                                            )
                                                        }
                                                    },
                                                    modifier =
                                                        Modifier.clickable(enabled = !state.busy) {
                                                            model.openFavorite(favorite)
                                                        },
                                                )
                                            }
                                        }
                                        if (state.folder.isEmpty() && state.recent.isNotEmpty()) {
                                            item { SectionLabel("最近使用") }
                                            items(state.recent, key = { "recent:${it.path}" }) {
                                                FileRow(
                                                    it,
                                                    !state.busy,
                                                    model::open,
                                                    exportEntry,
                                                    it.path in favoritePaths,
                                                    toggleFile,
                                                    publish = model::openPublish,
                                                    pluginRegistry = model.pluginOpenWith,
                                                    openPlugin = model::openWithPlugin,
                                                )
                                            }
                                            item {
                                                HorizontalDivider(
                                                    Modifier.padding(
                                                        horizontal = 24.dp,
                                                        vertical = 12.dp,
                                                    )
                                                )
                                            }
                                        }
                                        item {
                                            SectionLabel(
                                                if (state.folder.isEmpty()) "文件" else state.folder
                                            )
                                        }
                                        if (state.files.isEmpty())
                                            item {
                                                EmptyState(
                                                    "从一份资料开始",
                                                    "新建笔记或导入 .eidos 文件。\n所有文件保存在这台设备上。",
                                                )
                                            }
                                        items(state.files, key = { it.path }) {
                                            FileRow(
                                                it,
                                                !state.busy,
                                                model::open,
                                                exportEntry,
                                                it.path in favoritePaths,
                                                toggleFile,
                                                publish = model::openPublish,
                                                pluginRegistry = model.pluginOpenWith,
                                                openPlugin = model::openWithPlugin,
                                            )
                                        }
                                    }
                                MainTab.Search ->
                                    Column {
                                        Heading("搜索")
                                        OutlinedTextField(
                                            state.search,
                                            model::search,
                                            Modifier.fillMaxWidth().padding(horizontal = 24.dp),
                                            placeholder = { Text("搜索文件、Markdown 和数据记录") },
                                            leadingIcon = { Icon(Icons.Outlined.Search, null) },
                                            singleLine = true,
                                        )
                                        Text(
                                            if (state.searching) "正在搜索本地资料…"
                                            else "最多显示 100 项；数据记录按表显示",
                                            Modifier.padding(24.dp, 12.dp),
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        )
                                        if (state.searchSkipped.isNotEmpty())
                                            Text(
                                                "部分文件未能搜索：${state.searchSkipped.joinToString("、")}",
                                                Modifier.padding(horizontal = 24.dp),
                                                color = MaterialTheme.colorScheme.error,
                                                style = MaterialTheme.typography.bodySmall,
                                            )
                                        LazyColumn {
                                            items(state.matches, key = { it.key }) { match ->
                                                if (match.tableId != null)
                                                    ListItem(
                                                        headlineContent = {
                                                            Text(
                                                                match.preview?.takeIf {
                                                                    it.isNotEmpty()
                                                                } ?: "匹配的记录",
                                                                maxLines = 2,
                                                                overflow = TextOverflow.Ellipsis,
                                                            )
                                                        },
                                                        supportingContent = {
                                                            Text(
                                                                "${match.file.path} · ${match.tableName}",
                                                                maxLines = 2,
                                                                overflow = TextOverflow.Ellipsis,
                                                            )
                                                        },
                                                        leadingContent = {
                                                            Icon(Icons.Outlined.TableChart, null)
                                                        },
                                                        modifier =
                                                            Modifier.clickable(
                                                                enabled = !state.busy
                                                            ) {
                                                                model.openSearchMatch(match)
                                                            },
                                                    )
                                                else
                                                    FileRow(
                                                        match.file,
                                                        !state.busy,
                                                        { model.openSearchMatch(match) },
                                                        exportEntry,
                                                        match.file.path in favoritePaths,
                                                        toggleFile,
                                                        publish = model::openPublish,
                                                        pluginRegistry = model.pluginOpenWith,
                                                        openPlugin = model::openWithPlugin,
                                                        showPath = true,
                                                    )
                                            }
                                            if (
                                                !state.searching &&
                                                    state.search.isNotBlank() &&
                                                    state.matches.isEmpty()
                                            )
                                                item { EmptyState("没有找到资料", "换一个关键词试试") }
                                        }
                                    }
                                MainTab.Sync ->
                                    SyncScreen(
                                        state,
                                        model,
                                        signIn = {
                                            model.signIn { uri ->
                                                notificationContext.startActivity(
                                                    android.content.Intent(
                                                        android.content.Intent.ACTION_VIEW,
                                                        uri,
                                                    )
                                                )
                                            }
                                        },
                                        manageAccount = {
                                            notificationContext.startActivity(
                                                android.content.Intent(
                                                    android.content.Intent.ACTION_VIEW,
                                                    android.net.Uri.parse(
                                                        SyncEnvironment.account +
                                                            "/account?tab=sync"
                                                    ),
                                                )
                                            )
                                        },
                                        connect = { connectionSheet = true },
                                        requestNotifications = ::requestSyncNotifications,
                                    )
                            }
                        }
                    }
            }
        }
        state.attachmentPreview?.let { AttachmentPreviewDialog(it, model::closeAttachment) }
        if (state.shareInboxVisible && state.pendingShares.isNotEmpty()) {
            if (state.pendingShares.first().submitting)
                AlertDialog(
                    onDismissRequest = { if (!state.busy) model.showShareInbox(false) },
                    title = { Text("检查上次分享的保存结果") },
                    text = {
                        Text(
                            (state.pendingShares.first().destination?.let { "上次目标：$it\n\n" }
                                ?: "") +
                                "上次保存被中断，部分内容可能已写入。请先检查目标文件夹或表格；重新保存可能产生重复内容。暂存副本会保留到你处理完成。"
                        )
                    },
                    confirmButton = {
                        TextButton(
                            enabled = !state.busy,
                            onClick = { model.showShareInbox(false) },
                        ) {
                            Text("先检查文件")
                        }
                    },
                    dismissButton = {
                        Column {
                            TextButton(
                                enabled = !state.busy,
                                onClick = model::retryInterruptedShare,
                            ) {
                                Text("仍要重新保存")
                            }
                            TextButton(enabled = !state.busy, onClick = model::cancelShare) {
                                Text("移除待办")
                            }
                        }
                    },
                )
            else if (state.shareRecord == null) ShareDestinationSheet(state, model)
        }
        if (createSheet)
            CreateSheet(
                state.busy,
                importFile = {
                    createSheet = false
                    import.launch(arrayOf("*/*"))
                },
                importFolder = {
                    createSheet = false
                    importDirectory.launch(null)
                },
                dismiss = { createSheet = false },
            ) { name, kind ->
                model.create(name, kind) { createSheet = false }
            }
        if (connectionSheet)
            SyncConnectionSheet(state.graft?.remoteUrl, state.busy, { connectionSheet = false }) {
                url,
                token ->
                model.connectRemote(url, token) { connectionSheet = false }
            }
        state.mergeReview?.let { MergeReviewDialog(state, model) }
        state.error?.let { message ->
            AlertDialog(
                onDismissRequest = model::clearError,
                title = { Text("操作未完成") },
                text = { Text(message) },
                confirmButton = { TextButton(onClick = model::clearError) { Text("知道了") } },
            )
        }
    }
}

@Composable
private fun Heading(text: String) {
    Text(
        text,
        Modifier.padding(24.dp, 12.dp),
        style = MaterialTheme.typography.headlineLarge,
        fontWeight = FontWeight.SemiBold,
    )
}

@Composable
private fun SectionLabel(text: String) {
    Text(
        text,
        Modifier.padding(24.dp, 12.dp),
        style = MaterialTheme.typography.labelLarge,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

@Composable
private fun StatusLine(text: String) {
    Row(
        Modifier.padding(24.dp, 16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(
            Icons.Outlined.Save,
            null,
            Modifier.size(16.dp),
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            text,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun EmptyState(title: String, message: String) {
    Column(
        Modifier.fillMaxWidth().padding(24.dp, 32.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(title, style = MaterialTheme.typography.titleMedium)
        Text(
            message,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun FileRow(
    file: SpaceFile,
    enabled: Boolean,
    open: (SpaceFile) -> Unit,
    export: (SpaceFile) -> Unit,
    favorite: Boolean,
    toggleFavorite: (SpaceFile) -> Unit,
    publish: (SpaceFile) -> Unit,
    pluginRegistry: PluginOpenWithRegistry,
    openPlugin: (SpaceFile, String) -> Unit,
    showPath: Boolean = false,
) {
    var menu by remember { mutableStateOf(false) }
    var openWith by remember { mutableStateOf(false) }
    val candidates = pluginRegistry.candidates(file)
    ListItem(
        headlineContent = { Text(file.name, maxLines = 1, overflow = TextOverflow.Ellipsis) },
        supportingContent = {
            Text(
                if (showPath) file.path
                else if (file.directory) "文件夹"
                else if (file.eidos) "Eidos 数据文件"
                else if (file.markdown) "Markdown" else "${file.bytes} bytes",
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        },
        leadingContent = {
            Icon(
                if (file.directory) Icons.Outlined.Folder
                else if (file.eidos) Icons.Outlined.TableChart
                else Icons.AutoMirrored.Outlined.InsertDriveFile,
                null,
            )
        },
        trailingContent = {
            Box {
                IconButton(onClick = { menu = true }, enabled = enabled) {
                    Icon(Icons.Outlined.MoreVert, "更多 ${file.name}", Modifier.size(20.dp))
                }
                DropdownMenu(menu, { menu = false }) {
                    if (!file.directory)
                        DropdownMenuItem(
                            text = { Text("打开方式") },
                            onClick = {
                                menu = false
                                openWith = true
                            },
                            enabled = enabled,
                        )
                    if (file.markdown || file.eidos)
                        DropdownMenuItem(
                            text = { Text("发布") },
                            leadingIcon = { Icon(Icons.Outlined.Public, null) },
                            onClick = {
                                menu = false
                                publish(file)
                            },
                            enabled = enabled,
                        )
                    DropdownMenuItem(
                        text = { Text(if (favorite) "取消收藏" else "收藏") },
                        leadingIcon = { Icon(Icons.Outlined.Star, null) },
                        onClick = {
                            menu = false
                            toggleFavorite(file)
                        },
                        enabled = enabled,
                    )
                    DropdownMenuItem(
                        text = { Text("导出") },
                        leadingIcon = { Icon(Icons.Outlined.IosShare, null) },
                        onClick = {
                            menu = false
                            export(file)
                        },
                        enabled = enabled,
                    )
                }
            }
        },
        modifier = Modifier.clickable(enabled = enabled) { open(file) },
    )
    if (openWith)
        ModalBottomSheet(onDismissRequest = { openWith = false }) {
            Text(
                "打开方式",
                Modifier.padding(24.dp, 8.dp),
                style = MaterialTheme.typography.titleMedium,
            )
            ListItem(
                headlineContent = { Text("默认打开方式") },
                modifier =
                    Modifier.clickable(enabled = enabled) {
                        openWith = false
                        open(file)
                    },
            )
            candidates.forEach { view ->
                ListItem(
                    headlineContent = { Text(view.title) },
                    supportingContent = {
                        Text(
                            if (view.networkOrigins.isEmpty()) "内置插件 · 只读当前文件"
                            else "只读当前文件 · 联网：${view.networkOrigins.joinToString()}"
                        )
                    },
                    modifier =
                        Modifier.clickable(enabled = enabled) {
                            openWith = false
                            openPlugin(file, view.id)
                        },
                )
            }
            Spacer(Modifier.height(24.dp))
        }
}

@Composable
private fun CreateSheet(
    busy: Boolean,
    importFile: () -> Unit,
    importFolder: () -> Unit,
    dismiss: () -> Unit,
    create: (String, String) -> Unit,
) {
    var name by rememberSaveable { mutableStateOf("") }
    var kind by rememberSaveable { mutableStateOf<String?>(null) }
    val choices =
        listOf(
            Triple("markdown", "新建笔记", Icons.AutoMirrored.Outlined.InsertDriveFile),
            Triple("eidos", "新建 .eidos 文件", Icons.Outlined.TableChart),
            Triple("folder", "新建文件夹", Icons.Outlined.CreateNewFolder),
        )
    BackHandler(kind != null) { if (!busy) kind = null }
    ModalBottomSheet(onDismissRequest = { if (!busy) dismiss() }) {
        Column(
            Modifier.verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp)
                .padding(bottom = 24.dp)
                .imePadding()
        ) {
            if (kind == null) {
                Text(
                    "添加到当前目录",
                    Modifier.padding(16.dp),
                    style = MaterialTheme.typography.titleLarge,
                )
                choices.forEach { (value, label, icon) ->
                    ListItem(
                        headlineContent = { Text(label) },
                        leadingContent = { Icon(icon, null) },
                        modifier = Modifier.clickable(enabled = !busy) { kind = value },
                    )
                }
                HorizontalDivider(Modifier.padding(vertical = 8.dp))
                ListItem(
                    headlineContent = { Text("导入文件") },
                    leadingContent = { Icon(Icons.Outlined.FileDownload, null) },
                    modifier = Modifier.clickable(enabled = !busy, onClick = importFile),
                )
                ListItem(
                    headlineContent = { Text("导入文件夹") },
                    leadingContent = { Icon(Icons.Outlined.FolderOpen, null) },
                    modifier = Modifier.clickable(enabled = !busy, onClick = importFolder),
                )
            } else {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconButton(onClick = { kind = null }, enabled = !busy) {
                        Icon(Icons.AutoMirrored.Outlined.ArrowBack, "返回添加菜单")
                    }
                    Text(
                        choices.first { it.first == kind }.second,
                        style = MaterialTheme.typography.titleLarge,
                    )
                }
                OutlinedTextField(
                    name,
                    { name = it },
                    Modifier.fillMaxWidth().padding(vertical = 12.dp),
                    label = { Text("名称") },
                    singleLine = true,
                    enabled = !busy,
                )
                Button(
                    onClick = { create(name, checkNotNull(kind)) },
                    Modifier.fillMaxWidth(),
                    enabled = !busy && name.isNotBlank(),
                ) {
                    Text("创建")
                }
            }
        }
    }
}

@Composable
private fun DocumentActions(
    path: String,
    enabled: Boolean,
    model: EidosModel,
    export: (String) -> Unit,
) {
    var open by remember { mutableStateOf(false) }
    Box {
        IconButton(onClick = { open = true }, enabled = enabled) {
            Icon(Icons.Outlined.MoreVert, "文件操作")
        }
        DropdownMenu(open, { open = false }) {
            DropdownMenuItem(
                text = { Text("使用共享编辑器") },
                onClick = {
                    open = false
                    model.useSharedEditor(path)
                },
            )
            DropdownMenuItem(
                text = { Text("发布") },
                leadingIcon = { Icon(Icons.Outlined.Public, null) },
                onClick = {
                    open = false
                    model.openPublish(SpaceFile(path, path.substringAfterLast('/'), false, 0, 0))
                },
            )
            DropdownMenuItem(
                text = { Text("导出") },
                leadingIcon = { Icon(Icons.Outlined.IosShare, null) },
                onClick = {
                    open = false
                    export(path)
                },
            )
        }
    }
}

@Composable
private fun MarkdownScreen(state: AppState, model: EidosModel, export: (String) -> Unit) {
    val document = checkNotNull(state.document)
    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        document.path.substringAfterLast('/'),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        style = MaterialTheme.typography.titleMedium,
                    )
                },
                navigationIcon = {
                    IconButton(onClick = model::back, enabled = !state.busy) {
                        Icon(Icons.AutoMirrored.Outlined.ArrowBack, "返回")
                    }
                },
                actions = {
                    if (state.editing)
                        TextButton(onClick = model::saveDocument, enabled = !state.busy) {
                            Text("完成")
                        }
                    else {
                        IconButton(onClick = model::edit) { Icon(Icons.Outlined.Edit, "编辑") }
                        DocumentActions(document.path, !state.busy, model, export)
                    }
                },
            )
        },
        bottomBar = {
            StatusLine(
                if (state.dirty) if (state.draftSaved) "草稿已保存在本机" else "正在保存草稿…" else "已保存在本机"
            )
        },
    ) { padding ->
        Column(Modifier.padding(padding).imePadding().fillMaxSize()) {
            LoadingIndicator(state.busy)
            if (state.editing) {
                MarkdownEditor(document.path, document.text, !state.busy, model::textChanged) {
                    text,
                    start,
                    end,
                    uri ->
                    model.insertMarkdownImage(document.path, text, start, end, uri)
                }
            } else if (document.text.isEmpty()) EmptyState("还没有内容", "点击右上角的编辑按钮开始记录")
            else {
                val context = LocalContext.current
                val markwon =
                    remember(context, document.path, document.text) {
                        Markwon.builder(context)
                            .usePlugin(
                                MarkdownTasksPlugin(document.text) { task ->
                                    model.toggleMarkdownTask(document, task.offset, task.checked)
                                }
                            )
                            .usePlugin(
                                localMarkdownImages(context, model.repository, document.path)
                            )
                            .usePlugin(
                                object : AbstractMarkwonPlugin() {
                                    override fun configureConfiguration(
                                        builder: MarkwonConfiguration.Builder
                                    ) {
                                        builder.imageDestinationProcessor(
                                            object :
                                                io.noties.markwon.image.destination.ImageDestinationProcessor() {
                                                override fun process(destination: String) =
                                                    "eidos-image:" +
                                                        android.net.Uri.encode(destination)
                                            }
                                        )
                                        builder.linkResolver { _, link ->
                                            val scheme =
                                                android.net.Uri.parse(link).scheme?.lowercase()
                                            if (scheme == null)
                                                model.openMarkdownLink(document.path, link)
                                            else if (scheme in setOf("https", "http", "mailto")) {
                                                try {
                                                    context.startActivity(
                                                        android.content.Intent(
                                                            android.content.Intent.ACTION_VIEW,
                                                            android.net.Uri.parse(link),
                                                        )
                                                    )
                                                } catch (
                                                    _: android.content.ActivityNotFoundException) {
                                                    model.linkError("没有可打开此链接的应用")
                                                }
                                            } else model.linkError("暂不支持此链接类型")
                                        }
                                    }
                                }
                            )
                            .usePlugin(TablePlugin.create(context))
                            .usePlugin(StrikethroughPlugin.create())
                            .build()
                    }
                val color = MaterialTheme.colorScheme.onSurface.toArgb()
                AndroidView(
                    factory = {
                        TextView(it).apply {
                            textSize = 17f
                            setTextIsSelectable(true)
                            // Selectable TextViews already have a movement method, so
                            // Markwon's default link handler is not installed automatically.
                            movementMethod = android.text.method.LinkMovementMethod.getInstance()
                            setLineSpacing(8f, 1.1f)
                        }
                    },
                    update = {
                        it.setTextColor(color)
                        if (it.tag !== markwon) {
                            it.tag = markwon
                            markwon.setMarkdown(it, document.text)
                        }
                    },
                    modifier =
                        Modifier.verticalScroll(rememberScrollState()).padding(24.dp).fillMaxWidth(),
                )
            }
        }
    }
}

@Composable
private fun DatabaseScreen(state: AppState, model: EidosModel, export: (String) -> Unit) {
    val page = checkNotNull(state.page)
    var query by
        rememberSaveable(page.path, page.table?.id, page.view?.id) { mutableStateOf(page.query) }
    var selectedId by rememberSaveable(page.path) { mutableStateOf<String?>(null) }
    var newRecord by rememberSaveable(page.path) { mutableStateOf(false) }
    var searchVisible by rememberSaveable(page.path) { mutableStateOf(false) }
    var visibleFields by
        rememberSaveable(page.path, page.table?.id, page.view?.id) {
            mutableStateOf(
                viewFields(page)
                    ?: page.table?.let { model.repository.displayedFields(page.path, it.id) }
                    ?: page.fields
                        .filter { it.id != page.table?.labelFieldId }
                        .take(2)
                        .map { it.id }
            )
        }
    LaunchedEffect(state.addRecord) {
        if (state.addRecord) {
            model.beginRecordEdit()
            newRecord = true
            model.recordRequestHandled()
        }
    }
    val selected = page.rows.find { it.id == selectedId }
    if (newRecord || selected != null) {
        RecordScreen(
            page,
            selected,
            state.busy,
            {
                selectedId = null
                newRecord = false
            },
            openAttachment = { entry -> model.openAttachment(page.path, entry) },
            draftStore =
                remember(state.spaceId) { RecordDraftStore(model.getApplication(), state.spaceId) },
        ) { values, delete, revision ->
            model.mutate(selected, values, delete, revision) {
                selectedId = null
                newRecord = false
            }
        }
        return
    }
    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        page.path.substringAfterLast('/'),
                        style = MaterialTheme.typography.titleMedium,
                        maxLines = 1,
                    )
                },
                navigationIcon = {
                    IconButton(onClick = model::back, enabled = !state.busy) {
                        Icon(Icons.AutoMirrored.Outlined.ArrowBack, "返回")
                    }
                },
                actions = {
                    IconButton(
                        onClick = { searchVisible = !searchVisible },
                        enabled = !state.busy,
                    ) {
                        Icon(Icons.Outlined.Search, "搜索记录")
                    }

                    page.table?.let { table ->
                        val favorite = Favorite(page.path, table.name, table.id)
                        val selectedFavorite = state.favorites.any { it.key == favorite.key }
                        IconButton(
                            onClick = { model.toggleFavorite(favorite) },
                            enabled = !state.busy,
                        ) {
                            Icon(
                                if (selectedFavorite) Icons.Outlined.Star
                                else Icons.Outlined.StarBorder,
                                if (selectedFavorite) "取消收藏此表" else "收藏此表",
                            )
                        }
                    }
                    DocumentActions(page.path, !state.busy, model, export)
                },
            )
        },
        bottomBar = {
            if (page.table != null)
                Row(
                    Modifier.fillMaxWidth()
                        .navigationBarsPadding()
                        .padding(horizontal = 16.dp, vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        "已加载 ${page.rows.size} 条",
                        Modifier.weight(1f),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Button(
                        onClick = {
                            model.beginRecordEdit()
                            newRecord = true
                        },
                        enabled = !state.busy,
                        shape = RoundedCornerShape(8.dp),
                    ) {
                        Icon(Icons.Outlined.Add, null)
                        Spacer(Modifier.width(4.dp))
                        Text("新增记录")
                    }
                }
        },
    ) { padding ->
        Column(Modifier.padding(padding)) {
            LoadingIndicator(state.busy)
            if (page.tables.isNotEmpty())
                Row(
                    Modifier.fillMaxWidth()
                        .horizontalScroll(rememberScrollState())
                        .padding(horizontal = 8.dp)
                ) {
                    page.tables.forEach { table ->
                        Column {
                            TextButton(
                                onClick = { model.queryRows("", table.id) },
                                enabled = !state.busy && !state.rowLoading,
                            ) {
                                Text(
                                    table.name,
                                    fontWeight =
                                        if (table.id == page.table?.id) FontWeight.SemiBold
                                        else FontWeight.Normal,
                                )
                            }
                            HorizontalDivider(
                                Modifier.width(64.dp),
                                thickness = 2.dp,
                                color =
                                    if (table.id == page.table?.id)
                                        MaterialTheme.colorScheme.primary
                                    else Color.Transparent,
                            )
                        }
                    }
                }
            if (searchVisible || query.isNotEmpty())
                OutlinedTextField(
                    query,
                    {
                        query = it
                        model.queryRows(it)
                    },
                    Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
                    placeholder = { Text("搜索记录") },
                    leadingIcon = { Icon(Icons.Outlined.Search, null) },
                    trailingIcon = {
                        IconButton(
                            onClick = {
                                query = ""
                                model.queryRows("")
                                searchVisible = false
                            },
                            enabled = !state.busy,
                        ) {
                            Icon(Icons.Outlined.Close, "关闭搜索")
                        }
                    },
                    singleLine = true,
                    enabled = !state.busy,
                )
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                ViewControls(
                    page,
                    visibleFields,
                    !state.busy && !state.rowLoading,
                    model,
                    Modifier.weight(1f),
                )
                RecordControls(
                    page,
                    visibleFields,
                    !state.busy && !state.rowLoading,
                    {
                        visibleFields = it
                        page.table?.let { table ->
                            if (page.view == null)
                                model.repository.setDisplayedFields(page.path, table.id, it)
                        }
                    },
                    filter = { model.filterRows(query, it) },
                ) {
                    model.sortRows(query, it)
                }
            }
            LoadingIndicator(state.rowLoading)
            LazyColumn {
                if (page.rows.isEmpty())
                    item {
                        EmptyState(
                            if (page.table == null) "还没有表" else "没有记录",
                            if (
                                query.isNotEmpty() || page.filters.isNotEmpty() || page.view != null
                            )
                                "调整搜索或筛选条件试试"
                            else "添加第一条记录，离线也能使用",
                        )
                    }
                items(page.rows, key = { it.id }) { row ->
                    val secondary =
                        page.fields
                            .filter { it.id in visibleFields && it.id != page.table?.labelFieldId }
                            .sortedBy { visibleFields.indexOf(it.id) }
                            .filter {
                                row.values[it.id]?.let { value -> value != JSONObject.NULL } == true
                            }
                    val badge =
                        secondary.firstOrNull {
                            it.kind == "select" && (row.values[it.id] as? String)?.length in 1..12
                        }
                    ListItem(
                        headlineContent = {
                            val label = page.fields.find { it.id == page.table?.labelFieldId }
                            if (label?.kind in setOf("select", "multi-select")) {
                                OptionValue(checkNotNull(label), row.values[label.id])
                            } else
                                Text(
                                    displayValue(row.values[page.table?.labelFieldId]).ifEmpty {
                                        "未命名记录"
                                    },
                                    maxLines = 2,
                                )
                        },
                        supportingContent = {
                            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                secondary
                                    .filter { it != badge }
                                    .forEach { field ->
                                        if (field.kind in setOf("select", "multi-select")) {
                                            Text(
                                                field.name,
                                                style = MaterialTheme.typography.labelSmall,
                                            )
                                            OptionValue(field, row.values[field.id])
                                        } else
                                            Text(
                                                "${field.name}：${row.fieldDisplay(field)}",
                                                maxLines = 2,
                                                overflow = TextOverflow.Ellipsis,
                                            )
                                    }
                            }
                        },
                        trailingContent = {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                if (badge != null)
                                    Box(
                                        Modifier.widthIn(max = 120.dp).semantics {
                                            contentDescription =
                                                "${badge.name}：${displayValue(row.values[badge.id])}"
                                        }
                                    ) {
                                        OptionValue(badge, row.values[badge.id])
                                    }
                                Icon(Icons.Outlined.ChevronRight, null)
                            }
                        },
                        modifier =
                            Modifier.clickable(enabled = !state.busy && !state.rowLoading) {
                                model.beginRecordEdit()
                                selectedId = row.id
                            },
                    )
                    HorizontalDivider(Modifier.padding(horizontal = 24.dp))
                }
                if (page.nextCursor != null)
                    item {
                        TextButton(
                            onClick = model::nextPage,
                            enabled = !state.busy && !state.rowLoading,
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text("加载更多")
                        }
                    }
            }
        }
    }
}

internal fun displayValue(value: Any?): String =
    when (value) {
        null,
        JSONObject.NULL -> ""
        true -> "是"
        false -> "否"
        else -> value.toString()
    }

@Composable
private fun RecordScreen(
    page: EidosPage,
    record: EidosRecord?,
    busy: Boolean,
    dismiss: () -> Unit,
    initialValues: String = "{}",
    pendingFileCount: Int = 0,
    attachmentFieldId: String? = null,
    selectAttachmentField: (String) -> Unit = {},
    openAttachment: (JSONObject) -> Unit = {},
    draftStore: RecordDraftStorage? = null,
    save: (Map<String, Any>, Boolean, String) -> Unit,
) {
    var draftJson by
        rememberSaveable(page.path, page.table?.id, record?.id, initialValues) {
            mutableStateOf(initialValues)
        }
    var confirmDiscard by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }
    var revision by
        rememberSaveable(page.path, page.table?.id, record?.id) { mutableStateOf(page.revision) }
    var loaded by remember { mutableStateOf(draftStore == null) }
    var draftSaved by remember { mutableStateOf(false) }
    var recovered by remember { mutableStateOf(false) }
    var draftError by remember { mutableStateOf<String?>(null) }
    var draftWrite by remember { mutableStateOf<Job?>(null) }
    val scope = rememberCoroutineScope()
    val tableId = checkNotNull(page.table).id
    LaunchedEffect(draftStore, page.path, tableId, record?.id) {
        if (draftStore != null) {
            try {
                val stored = draftStore.load(page.path, tableId, record?.id)
                if (stored != null && draftJson == initialValues) {
                    draftJson = stored.changes
                    revision = stored.revision
                    recovered = true
                    draftSaved = true
                }
                if (stored?.changes == draftJson) draftSaved = true
                loaded = true
            } catch (error: Exception) {
                draftError = "无法读取记录草稿：${error.message}"
            }
        }
    }
    val changes = JSONObject(draftJson)
    fun set(field: EidosField, value: Any) {
        draftJson = JSONObject(draftJson).put(field.id, value).toString()
        if (draftStore != null) {
            draftSaved = false
            draftWrite?.cancel()
            val snapshot = RecordDraft(revision, draftJson)
            draftWrite =
                scope.launch {
                    try {
                        draftStore.save(page.path, tableId, record?.id, snapshot)
                        if (draftJson == snapshot.changes) {
                            draftSaved = true
                            draftError = null
                        }
                    } catch (error: kotlinx.coroutines.CancellationException) {
                        throw error
                    } catch (error: Exception) {
                        draftError = "草稿保存失败：${error.message}"
                    }
                }
        }
    }
    fun submit(delete: Boolean) {
        scope.launch {
            draftWrite?.join()
            save(
                if (delete) emptyMap()
                else changes.keys().asSequence().associateWith { changes.get(it) },
                delete,
                revision,
            )
        }
    }
    fun discard() {
        scope.launch {
            draftWrite?.join()
            try {
                draftStore?.clear(page.path, tableId, record?.id)
                dismiss()
            } catch (error: Exception) {
                draftError = "无法清除草稿：${error.message}"
            }
        }
    }
    fun back() {
        if (draftJson != "{}") confirmDiscard = true else dismiss()
    }
    BackHandler { if (!busy) back() }
    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        if (record == null) "新增记录" else "编辑记录",
                        style = MaterialTheme.typography.titleMedium,
                    )
                },
                navigationIcon = {
                    IconButton(onClick = ::back, enabled = !busy) {
                        Icon(Icons.AutoMirrored.Outlined.ArrowBack, "返回")
                    }
                },
                actions = {
                    TextButton(onClick = { submit(false) }, enabled = !busy && loaded) {
                        Text("完成")
                    }
                },
            )
        }
    ) { padding ->
        Column(
            Modifier.padding(padding)
                .imePadding()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(0.dp),
        ) {
            Text(
                "${page.path.substringAfterLast('/')} / ${page.table?.name}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (loaded)
                page.fields.forEach { field ->
                    val value =
                        if (changes.has(field.id)) changes.get(field.id)
                        else record?.values?.get(field.id) ?: JSONObject.NULL
                    PropertyField(
                        field,
                        value,
                        !busy && loaded,
                        openAttachment,
                        record?.relationLabels?.get(field.id),
                    ) {
                        set(field, it)
                    }
                    if (pendingFileCount > 0 && field.kind == "file" && field.writable) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier =
                                Modifier.fillMaxWidth().clickable(enabled = !busy) {
                                    selectAttachmentField(field.id)
                                },
                        ) {
                            RadioButton(
                                selected = attachmentFieldId == field.id,
                                onClick = { selectAttachmentField(field.id) },
                                enabled = !busy,
                            )
                            Text(
                                "将 $pendingFileCount 个分享附件保存到${field.name}",
                                style = MaterialTheme.typography.bodySmall,
                            )
                        }
                    }
                }
            Text(
                draftError
                    ?: if (!loaded) "正在读取草稿…"
                    else if (recovered && revision != page.revision) "已恢复旧版本草稿。文件已变化，提交时将检查冲突。"
                    else if (draftSaved) "草稿已保存在本机；点击完成提交记录"
                    else if (draftStore != null && draftJson != "{}") "正在保存草稿…" else "点击完成后保存到本机",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (record != null)
                TextButton(onClick = { confirmDelete = true }, enabled = !busy && loaded) {
                    Text("删除记录", color = MaterialTheme.colorScheme.error)
                }
        }
    }
    if (confirmDiscard)
        AlertDialog(
            onDismissRequest = { confirmDiscard = false },
            title = { Text("离开记录编辑？") },
            text = { Text("这次记录修改尚未保存。") },
            confirmButton = { TextButton(onClick = ::discard) { Text("放弃修改") } },
            dismissButton = {
                Column {
                    if (draftStore != null)
                        TextButton(onClick = dismiss, enabled = draftSaved && !busy) {
                            Text("保留草稿并返回")
                        }
                    TextButton(onClick = { confirmDiscard = false }) { Text("继续编辑") }
                }
            },
        )
    if (confirmDelete)
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text("删除这条记录？") },
            text = { Text("此开发版本尚未提供历史恢复。") },
            confirmButton = {
                TextButton(
                    onClick = {
                        confirmDelete = false
                        submit(true)
                    }
                ) {
                    Text("删除")
                }
            },
            dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text("取消") } },
        )
}
