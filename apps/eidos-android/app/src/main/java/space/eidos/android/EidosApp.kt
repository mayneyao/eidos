@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package space.eidos.android

import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
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
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.launch

@Composable
fun EidosApp(model: EidosModel) {
    val languageContext = LocalContext.current
    val language = AppLanguage.selected()
    var languageSheet by rememberSaveable { mutableStateOf(false) }
    val systemConfiguration = androidx.compose.ui.platform.LocalConfiguration.current
    SideEffect { AppLanguage.updateSystem(systemConfiguration.locales[0].toLanguageTag()) }
    val resolvedLanguage = AppLanguage.resolve(language, listOf(systemConfiguration.locales[0].toLanguageTag()))
    val localizedConfiguration = remember(systemConfiguration, resolvedLanguage) {
        android.content.res.Configuration(systemConfiguration).apply { setLocale(java.util.Locale.forLanguageTag(resolvedLanguage)) }
    }
    CompositionLocalProvider(androidx.compose.ui.platform.LocalConfiguration provides localizedConfiguration) {
        EidosLocalizedApp(model, chooseLanguage = { languageSheet = true })
        if (languageSheet) LanguageSheet(language, select = {
            AppLanguage.set(languageContext, it)
        }, close = { languageSheet = false })
    }
}

@Composable
private fun EidosLocalizedApp(model: EidosModel, chooseLanguage: () -> Unit) {
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
    val colors = eidosColorScheme()
    MaterialTheme(colorScheme = colors) {
        var createSheet by rememberSaveable { mutableStateOf(false) }
        var renameTarget by remember { mutableStateOf<SpaceFile?>(null) }
        var searchSheet by rememberSaveable(state.spaceId) { mutableStateOf(false) }
        var sortSheet by rememberSaveable { mutableStateOf(false) }
        val sortedFiles =
            remember(state.files, state.fileSort) {
                state.files.sortedWith(state.fileSort.comparator())
            }
        var pluginMarket by rememberSaveable { mutableStateOf(false) }
        val navigationPages =
            remember(state.spaceId, state.pluginGeneration) {
                model.pluginMarket.navigationPages(state.spaceId)
            }
        var selectedPage by rememberSaveable(state.spaceId) { mutableStateOf<String?>(null) }
        var retainedPage by rememberSaveable(state.spaceId) { mutableStateOf<String?>(null) }
        var morePages by remember { mutableStateOf(false) }
        val activePage = navigationPages.find { it.key == selectedPage }
        val keptPage = navigationPages.find { it.key == retainedPage }
        LaunchedEffect(navigationPages) {
            if (activePage == null) selectedPage = null
            if (keptPage == null) retainedPage = null
        }
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
        BackHandler(state.folder.isNotEmpty()) { if (!state.busy) model.back() }
        Surface(Modifier.fillMaxSize()) {
            when {
                pluginMarket -> NativePluginManager(model, state.spaceName) { pluginMarket = false }
                state.pluginFile != null -> {
                    val session = state.pluginFile!!
                    if (session.view.revision != null) {
                        MobilePluginScreen(model, session, close = model::closePluginFile)
                    } else {
                        PluginFileScreen(session, model.repository, model::closePluginFile)
                    }
                }
                state.publish != null -> PublishScreen(state, model)
                state.shareRecord != null ->
                    key(
                        state.spaceId,
                        state.editorGeneration,
                        state.pendingShares.first().inboxId,
                        state.shareRecord!!.table?.id,
                    ) {
                        val page = state.shareRecord!!
                        EmbeddedEditorScreen(
                            SpaceFile(page.path, page.path.substringAfterLast('/'), false, 0, 0),
                            model,
                            editorPool,
                            shareMode = true,
                        )
                    }
                state.webFile != null ->
                    key(state.spaceId, state.editorGeneration) {
                        EmbeddedEditorScreen(state.webFile!!, model, editorPool,
                            export = exportEntry, rename = { renameTarget = it }, trash = model::trash)
                    }
                else ->
                    Scaffold(
                        topBar = {
                            if (state.tab != MainTab.Sync || activePage != null)
                                TopAppBar(
                                    title = {
                                        if (activePage != null) Text(activePage.title)
                                        else SpaceSelector(state, model)
                                    },
                                    navigationIcon = {
                                        if (state.folder.isNotEmpty() && activePage == null)
                                            IconButton(
                                                onClick = model::back,
                                                enabled = !state.busy,
                                            ) {
                                                Icon(Icons.AutoMirrored.Outlined.ArrowBack, tr("返回上级"))
                                            }
                                    },
                                    actions = {
                                        IconButton(
                                            onClick = { searchSheet = true },
                                            enabled = !state.busy,
                                        ) {
                                            Icon(Icons.Outlined.Search, tr("搜索"))
                                        }
                                        if (state.tab == MainTab.Files && activePage == null)
                                            Box {
                                                IconButton(
                                                    onClick = { createSheet = true },
                                                    enabled = !state.busy,
                                                ) {
                                                    Icon(Icons.Outlined.Add, tr("新建"))
                                                }
                                                DropdownMenu(createSheet, { createSheet = false }) {
                                                    listOf(
                                                            Triple(
                                                                "markdown",
                                                                tr("新建笔记"),
                                                                Icons.AutoMirrored.Outlined
                                                                    .InsertDriveFile,
                                                            ),
                                                            Triple(
                                                                "eidos",
                                                                tr("新建 .eidos 文件"),
                                                                Icons.Outlined.TableChart,
                                                            ),
                                                            Triple(
                                                                "folder",
                                                                tr("新建文件夹"),
                                                                Icons.Outlined.CreateNewFolder,
                                                            ),
                                                        )
                                                        .forEach { (kind, label, icon) ->
                                                            DropdownMenuItem(
                                                                text = { Text(label) },
                                                                leadingIcon = { Icon(icon, null) },
                                                                enabled = !state.busy,
                                                                onClick = {
                                                                    createSheet = false
                                                                    model.create("", kind) {}
                                                                },
                                                            )
                                                        }
                                                    HorizontalDivider()
                                                    DropdownMenuItem(
                                                        text = { Text(tr("导入文件")) },
                                                        leadingIcon = {
                                                            Icon(Icons.Outlined.FileDownload, null)
                                                        },
                                                        enabled = !state.busy,
                                                        onClick = {
                                                            createSheet = false
                                                            import.launch(arrayOf("*/*"))
                                                        },
                                                    )
                                                    DropdownMenuItem(
                                                        text = { Text(tr("导入文件夹")) },
                                                        leadingIcon = {
                                                            Icon(Icons.Outlined.FolderOpen, null)
                                                        },
                                                        enabled = !state.busy,
                                                        onClick = {
                                                            createSheet = false
                                                            importDirectory.launch(null)
                                                        },
                                                    )
                                                }
                                            }
                                        Box {
                                            IconButton(
                                                onClick = { transferMenu = true },
                                                enabled = !state.busy,
                                            ) {
                                                Icon(Icons.Outlined.MoreVert, tr("当前文件夹操作"))
                                            }
                                            DropdownMenu(transferMenu, { transferMenu = false }) {
                                                DropdownMenuItem(
                                                    text = { Text(tr("语言")) },
                                                    leadingIcon = { Icon(Icons.Outlined.Language, null) },
                                                    onClick = { transferMenu = false; chooseLanguage() },
                                                )
                                                DropdownMenuItem(
                                                    text = { Text(tr("排序")) },
                                                    leadingIcon = {
                                                        Icon(Icons.Outlined.Sort, null)
                                                    },
                                                    onClick = {
                                                        transferMenu = false
                                                        sortSheet = true
                                                    },
                                                )
                                                DropdownMenuItem(
                                                    text = { Text(tr("插件")) },
                                                    leadingIcon = {
                                                        Icon(Icons.Outlined.Extension, null)
                                                    },
                                                    onClick = {
                                                        transferMenu = false
                                                        pluginMarket = true
                                                    },
                                                )
                                                DropdownMenuItem(
                                                    text = { Text(tr("导出当前目录")) },
                                                    leadingIcon = {
                                                        Icon(Icons.Outlined.IosShare, null)
                                                    },
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
                                if (state.tab == MainTab.Files && activePage == null)
                                    state.captureNotice?.let {
                                        Text(
                                            it,
                                            Modifier.padding(horizontal = 24.dp, vertical = 4.dp),
                                            style = MaterialTheme.typography.bodySmall,
                                        )
                                    }
                                NavigationBar(containerColor = MaterialTheme.colorScheme.surface) {
                                    listOf(
                                            Triple(MainTab.Files, tr("资料"), Icons.Outlined.Folder),
                                            Triple(MainTab.Sync, tr("同步"), Icons.Outlined.Sync),
                                        )
                                        .forEach { (tab, label, icon) ->
                                            NavigationBarItem(
                                                selected = activePage == null && state.tab == tab,
                                                enabled = !state.busy,
                                                onClick = {
                                                    selectedPage = null
                                                    model.tab(tab)
                                                },
                                                icon = { Icon(icon, label) },
                                                label = { Text(label) },
                                            )
                                        }
                                    val inlinePages =
                                        navigationPages.take(if (navigationPages.size > 2) 1 else 2)
                                    inlinePages.forEach { page ->
                                        NavigationBarItem(
                                            selected = activePage?.key == page.key,
                                            onClick = {
                                                selectedPage = page.key
                                                retainedPage = page.key
                                            },
                                            icon = { Icon(Icons.Outlined.Article, page.title) },
                                            label = {
                                                Text(
                                                    page.title,
                                                    maxLines = 1,
                                                    overflow =
                                                        androidx.compose.ui.text.style.TextOverflow
                                                            .Ellipsis,
                                                )
                                            },
                                        )
                                    }
                                    if (navigationPages.size > 2) {
                                        NavigationBarItem(
                                            selected =
                                                activePage != null && activePage !in inlinePages,
                                            onClick = { morePages = true },
                                            icon = { Icon(Icons.Outlined.MoreHoriz, tr("更多页面")) },
                                            label = { Text(tr("更多")) },
                                        )
                                    }
                                }
                            }
                        },
                    ) { padding ->
                        Box(Modifier.padding(padding).consumeWindowInsets(padding).fillMaxSize()) {
                            Column(
                                if (activePage == null) Modifier.fillMaxSize()
                                else Modifier.size(0.dp)
                            ) {
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
                                            if (
                                                state.folder.isEmpty() &&
                                                    state.favorites.isNotEmpty()
                                            ) {
                                                item { SectionLabel(tr("收藏")) }
                                                items(
                                                    state.favorites,
                                                    key = { "favorite:${it.key}" },
                                                ) { favorite ->
                                                    val file =
                                                        state.favoriteFiles[favorite.path]
                                                            ?: SpaceFile(
                                                                favorite.path,
                                                                favorite.path.substringAfterLast(
                                                                    '/'
                                                                ),
                                                                false,
                                                                0,
                                                                0,
                                                            )
                                                    FileRow(
                                                        file = file,
                                                        enabled = !state.busy,
                                                        open = { model.openFavorite(favorite) },
                                                        export = exportEntry,
                                                        favorite = true,
                                                        toggleFavorite = {
                                                            model.toggleFavorite(favorite)
                                                        },
                                                        publish = model::openPublish,
                                                        pluginRegistry = model.pluginOpenWith,
                                                        openPlugin = model::openWithPlugin,
                                                        showPath = true,
                                                        rename = { renameTarget = it },
                                                        trash = model::trash,
                                                        displayName =
                                                            if (favorite.tableId != null)
                                                                favorite.name
                                                            else file.name,
                                                    )
                                                }
                                            }
                                            if (
                                                state.folder.isEmpty() && state.recent.isNotEmpty()
                                            ) {
                                                item { SectionLabel(tr("最近使用")) }
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
                                                        rename = { renameTarget = it },
                                                        trash = model::trash,
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
                                                    if (state.folder.isEmpty()) tr("文件")
                                                    else state.folder
                                                )
                                            }
                                            if (state.files.isEmpty())
                                                item {
                                                    EmptyState(
                                                        tr("从一份资料开始"),
                                                        tr("新建笔记或导入 .eidos 文件。\n所有文件保存在这台设备上。"),
                                                    )
                                                }
                                            items(sortedFiles, key = { it.path }) {
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
                                                    rename = { renameTarget = it },
                                                    trash = model::trash,
                                                )
                                            }
                                        }
                                    MainTab.Sync -> SyncScreen(state, model)
                                }
                            }
                            keptPage?.let { page ->
                                key(
                                    state.spaceId,
                                    page.key,
                                    page.revision,
                                    state.pluginGeneration,
                                ) {
                                    Box(
                                        if (activePage != null) Modifier.fillMaxSize()
                                        else Modifier.size(0.dp)
                                    ) {
                                        MobilePluginScreen(
                                            model,
                                            navigationPage = page,
                                            active = activePage != null,
                                        ) {
                                            selectedPage = null
                                        }
                                    }
                                }
                            }
                        }
                    }
            }
        }
        if (morePages)
            ModalBottomSheet(onDismissRequest = { morePages = false }) {
                navigationPages.forEach { page ->
                    ListItem(
                        headlineContent = { Text(page.title) },
                        modifier =
                            Modifier.clickable {
                                selectedPage = page.key
                                retainedPage = page.key
                                morePages = false
                            },
                    )
                }
            }
        state.attachmentPreview?.let { AttachmentPreviewDialog(it, model::closeAttachment) }
        if (state.shareInboxVisible && state.pendingShares.isNotEmpty()) {
            if (state.pendingShares.first().submitting)
                AlertDialog(
                    onDismissRequest = { if (!state.busy) model.showShareInbox(false) },
                    title = { Text(tr("检查上次分享的保存结果")) },
                    text = {
                        Text(
                            (state.pendingShares.first().destination?.let { tr("上次目标：{0}\n\n", it) }
                                ?: "") +
                                tr("上次保存被中断，部分内容可能已写入。请先检查目标文件夹或表格；重新保存可能产生重复内容。暂存副本会保留到你处理完成。")
                        )
                    },
                    confirmButton = {
                        TextButton(
                            enabled = !state.busy,
                            onClick = { model.showShareInbox(false) },
                        ) {
                            Text(tr("先检查文件"))
                        }
                    },
                    dismissButton = {
                        Column {
                            TextButton(
                                enabled = !state.busy,
                                onClick = model::retryInterruptedShare,
                            ) {
                                Text(tr("仍要重新保存"))
                            }
                            TextButton(enabled = !state.busy, onClick = model::cancelShare) {
                                Text(tr("移除待办"))
                            }
                        }
                    },
                )
            else if (state.shareRecord == null) ShareDestinationSheet(state, model)
        }
        if (sortSheet)
            ModalBottomSheet(onDismissRequest = { sortSheet = false }) {
                Column(Modifier.padding(bottom = 24.dp)) {
                    Text(
                        tr("排序"),
                        Modifier.padding(24.dp, 8.dp),
                        style = MaterialTheme.typography.titleLarge,
                    )
                    for ((key, label) in
                        listOf("name" to tr("名称"), "modified" to tr("修改时间"), "type" to tr("类型"))) {
                        ListItem(
                            headlineContent = { Text(label) },
                            trailingContent = {
                                if (state.fileSort.by == key) Icon(Icons.Outlined.Check, tr("已选择"))
                            },
                            modifier =
                                Modifier.clickable {
                                    model.sortFiles(state.fileSort.copy(by = key))
                                },
                        )
                    }
                    HorizontalDivider(Modifier.padding(horizontal = 24.dp))
                    for ((descending, label) in listOf(false to tr("升序"), true to tr("降序"))) {
                        ListItem(
                            headlineContent = { Text(label) },
                            trailingContent = {
                                if (state.fileSort.descending == descending)
                                    Icon(Icons.Outlined.Check, tr("已选择"))
                            },
                            modifier =
                                Modifier.clickable {
                                    model.sortFiles(state.fileSort.copy(descending = descending))
                                },
                        )
                    }
                    Text(
                        tr("文件夹始终置顶"),
                        Modifier.padding(24.dp, 8.dp),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        if (searchSheet)
            ModalBottomSheet(
                onDismissRequest = { searchSheet = false },
                sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
                containerColor = MaterialTheme.colorScheme.surface,
                tonalElevation = 0.dp,
            ) {
                val searchFocus = remember { androidx.compose.ui.focus.FocusRequester() }
                LaunchedEffect(Unit) { searchFocus.requestFocus() }
                Column(Modifier.fillMaxHeight(0.9f).imePadding().testTag("global-search-sheet")) {
                    Row(
                        Modifier.fillMaxWidth().padding(start = 16.dp, end = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(tr("搜索"), Modifier.weight(1f), style = MaterialTheme.typography.titleMedium)
                        IconButton(onClick = { searchSheet = false }) {
                            Icon(Icons.Outlined.Close, tr("关闭搜索"))
                        }
                    }
                    EidosSearchField(
                        state.search,
                        model::search,
                        tr("搜索文件、Markdown 和数据记录"),
                        Modifier.fillMaxWidth()
                            .padding(horizontal = 16.dp)
                            .focusRequester(searchFocus),
                    )
                    Text(
                        if (state.searching) tr("正在搜索本地资料…") else tr("最多显示 100 项；数据记录按表显示"),
                        Modifier.padding(16.dp, 12.dp),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    if (state.searchSkipped.isNotEmpty())
                        Text(
                            tr("部分文件未能搜索：{0}", state.searchSkipped.joinToString("、")),
                            Modifier.padding(start = 16.dp, end = 16.dp, bottom = 8.dp),
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodySmall,
                        )
                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                    LazyColumn(Modifier.weight(1f)) {
                        if (state.search.isBlank())
                            item { EmptyState(tr("搜索当前 Space"), tr("输入关键词，查找文件、笔记内容和数据记录。")) }
                        items(
                            if (state.search.isBlank()) emptyList() else state.matches,
                            key = { it.key },
                        ) { match ->
                            if (match.tableId != null)
                                ListItem(
                                    headlineContent = {
                                        Text(
                                            match.preview?.takeIf { it.isNotEmpty() } ?: tr("匹配的记录"),
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis,
                                        )
                                    },
                                    supportingContent = {
                                        Text(
                                            "${match.file.path} · ${match.tableName}",
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis,
                                        )
                                    },
                                    leadingContent = { Icon(Icons.Outlined.TableChart, null) },
                                    colors = ListItemDefaults.colors(containerColor = MaterialTheme.colorScheme.surface),
                                    trailingContent = { Spacer(Modifier.size(48.dp)) },
                                    modifier =
                                        Modifier.clickable(enabled = !state.busy) {
                                            searchSheet = false
                                            model.openSearchMatch(match)
                                        },
                                )
                            else
                                FileRow(
                                    match.file,
                                    !state.busy,
                                    {
                                        searchSheet = false
                                        model.openSearchMatch(match)
                                    },
                                    exportEntry,
                                    match.file.path in favoritePaths,
                                    toggleFile,
                                    publish = {
                                        searchSheet = false
                                        model.openPublish(it)
                                    },
                                    pluginRegistry = model.pluginOpenWith,
                                    openPlugin = { file, key ->
                                        searchSheet = false
                                        model.openWithPlugin(file, key)
                                    },
                                    showPath = true,
                                    trash = { searchSheet = false; model.trash(it) },
                                    rename = {
                                        searchSheet = false
                                        renameTarget = it
                                    },
                                )
                        }
                        if (
                            !state.searching && state.search.isNotBlank() && state.matches.isEmpty()
                        )
                            item { EmptyState(tr("没有找到资料"), tr("换一个关键词试试")) }
                    }
                }
            }
        renameTarget?.let { file ->
            var name by remember(file.path) { mutableStateOf(file.name) }
            AlertDialog(
                onDismissRequest = { if (!state.busy) renameTarget = null },
                title = { Text(tr("重命名")) },
                text = {
                    OutlinedTextField(
                        name,
                        { name = it },
                        label = { Text(tr("名称")) },
                        singleLine = true,
                        enabled = !state.busy,
                    )
                },
                confirmButton = {
                    TextButton(
                        enabled = !state.busy && name.isNotBlank(),
                        onClick = { model.rename(file, name) { renameTarget = null } },
                    ) {
                        Text(tr("保存"))
                    }
                },
                dismissButton = {
                    TextButton(enabled = !state.busy, onClick = { renameTarget = null }) {
                        Text(tr("取消"))
                    }
                },
            )
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
                title = { Text(tr("操作未完成")) },
                text = { Text(message) },
                confirmButton = { TextButton(onClick = model::clearError) { Text(tr("知道了")) } },
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
private fun EmptyState(title: String, message: String) {
    Column(
        Modifier.fillMaxWidth().padding(16.dp, 24.dp),
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
internal fun FileRow(
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
    displayName: String = file.name,
    rename: (SpaceFile) -> Unit,
    menuOnly: Boolean = false,
    trash: ((SpaceFile) -> Unit)? = null,
) {
    var menu by remember { mutableStateOf(false) }
    var openWith by remember { mutableStateOf(false) }
    var deleting by remember { mutableStateOf(false) }
    val candidates = pluginRegistry.candidates(file)
    if (menuOnly) {
        IconButton(onClick = { menu = true }, enabled = enabled) {
            Icon(Icons.Outlined.MoreVert, tr("文件操作"))
        }
    } else ListItem(
        colors = ListItemDefaults.colors(containerColor = MaterialTheme.colorScheme.surface),
        headlineContent = { Text(displayName, maxLines = 1, overflow = TextOverflow.Ellipsis) },
        supportingContent = {
            Text(
                if (showPath) file.path
                else if (file.directory) tr("文件夹")
                else if (file.eidos) tr("Eidos 数据文件")
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
            IconButton(onClick = { menu = true }, enabled = enabled) {
                Icon(Icons.Outlined.MoreVert, tr("更多 {0}", displayName), Modifier.size(20.dp))
            }
        },
        modifier =
            Modifier.combinedClickable(
                enabled = enabled,
                onClick = { open(file) },
                onLongClick = { menu = true },
            ),
    )
    if (menu)
        ModalBottomSheet(
            modifier = Modifier.testTag("file-actions-sheet"),
            onDismissRequest = {
                menu = false
                openWith = false
            },
            sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        ) {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                Row(
                    Modifier.padding(horizontal = 16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (openWith)
                        IconButton(onClick = { openWith = false }) {
                            Icon(Icons.AutoMirrored.Outlined.ArrowBack, tr("返回文件操作"))
                        }
                    Text(
                        if (openWith) tr("打开方式") else file.name,
                        Modifier.weight(1f).padding(8.dp),
                        style = MaterialTheme.typography.titleMedium,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                if (openWith) {
                    ListItem(
                        headlineContent = { Text(tr("默认打开方式")) },
                        modifier =
                            Modifier.clickable(enabled = enabled) {
                                menu = false
                                openWith = false
                                open(file)
                            },
                    )
                    candidates.forEach { view ->
                        ListItem(
                            headlineContent = { Text(view.title) },
                            supportingContent = {
                                Text(
                                    if (view.revision == null) tr("内置插件")
                                    else tr("已启用插件")
                                )
                            },
                            modifier =
                                Modifier.clickable(enabled = enabled) {
                                    menu = false
                                    openWith = false
                                    openPlugin(file, view.id)
                                },
                        )
                    }
                } else {
                    if (!file.directory)
                        ListItem(
                            headlineContent = { Text(tr("打开方式")) },
                            leadingContent = { Icon(Icons.Outlined.OpenInNew, null) },
                            modifier = Modifier.clickable(enabled = enabled) { openWith = true },
                        )
                    ListItem(
                        headlineContent = { Text(if (favorite) tr("取消收藏") else tr("收藏")) },
                        leadingContent = { Icon(Icons.Outlined.Star, null) },
                        modifier =
                            Modifier.clickable(enabled = enabled) {
                                menu = false
                                toggleFavorite(file)
                            },
                    )
                    ListItem(
                        headlineContent = { Text(tr("重命名")) },
                        leadingContent = { Icon(Icons.Outlined.Edit, null) },
                        modifier =
                            Modifier.clickable(enabled = enabled) {
                                menu = false
                                rename(file)
                            },
                    )
                    HorizontalDivider(Modifier.padding(horizontal = 24.dp))
                    ListItem(
                        headlineContent = { Text(tr("导出")) },
                        leadingContent = { Icon(Icons.Outlined.IosShare, null) },
                        modifier =
                            Modifier.clickable(enabled = enabled) {
                                menu = false
                                export(file)
                            },
                    )
                    if (trash != null)
                        ListItem(
                            headlineContent = { Text(tr("删除"), color = MaterialTheme.colorScheme.error) },
                            leadingContent = { Icon(Icons.Outlined.Delete, null) },
                            modifier = Modifier.clickable(enabled = enabled) {
                                menu = false
                                deleting = true
                            },
                        )
                }
                Spacer(Modifier.height(24.dp))
            }
        }
    if (deleting)
        AlertDialog(
            onDismissRequest = { deleting = false },
            title = { Text(tr("删除 {0}", file.name)) },
            text = { Text(tr("将从 Space 移除此项目，下一次同步会同步该删除。")) },
            confirmButton = {
                TextButton(enabled = enabled, onClick = {
                    deleting = false
                    trash?.invoke(file)
                }) { Text(tr("删除")) }
            },
            dismissButton = { TextButton(onClick = { deleting = false }) { Text(tr("取消")) } },
        )
}
