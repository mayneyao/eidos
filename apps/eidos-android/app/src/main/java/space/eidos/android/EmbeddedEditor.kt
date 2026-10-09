@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package space.eidos.android

import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.webkit.*
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import java.io.ByteArrayInputStream
import kotlinx.coroutines.*
import kotlinx.coroutines.channels.Channel
import org.json.JSONObject

private const val EDITOR_HOST = "appassets.androidplatform.net"
internal fun hasTableView(manifest: JSONObject): Boolean {
    val views = manifest.optJSONArray("views") ?: return false
    val placements = manifest.optJSONArray("placements") ?: return false
    return (0 until views.length()).any { index ->
        val view = views.optJSONObject(index) ?: return@any false
        val capabilities = view.optJSONArray("capabilities") ?: return@any false
        view.optString("kind") == "file" &&
            (0 until capabilities.length()).any { capabilities.optString(it) == "eidos/table" } &&
            (0 until placements.length()).any {
                val placement = placements.optJSONObject(it)
                placement?.optString("location") == "table/view" &&
                    placement.optString("view") == view.optString("id")
            }
    }
}
private const val EDITOR_URL = "https://$EDITOR_HOST/editor/index.html"

/** Content images and fonts can fail without making the editor unusable. */
private fun isEditorLoadFailure(request: WebResourceRequest): Boolean {
    if (request.isForMainFrame) return true
    val uri = request.url
    val path = uri.path.orEmpty()
    return uri.scheme == "https" &&
        uri.host == EDITOR_HOST &&
        path.startsWith("/editor/assets/") &&
        (path.endsWith(".js") || path.endsWith(".css"))
}

/**
 * One bridge is bound to one file. Javascript never receives a filesystem handle or account token.
 */
internal class EmbeddedEditorBridge(
    private val repository: SpaceRepository,
    private val file: SpaceFile,
    private val dark: Boolean,
    private val reply: (String, JSONObject) -> Unit,
    private val leave: () -> Unit,
    private val openLink: (Uri) -> Unit,
    private val hideKeyboard: () -> Unit,
    private val ready: () -> Unit,
    private val session: String,
    private val pluginStore: PluginMarketStore? = null,
    private val pickFiles: suspend (Boolean) -> List<Uri> = { error(tr("文件选择器不可用")) },
    private val tablesChanged: (List<Pair<String, String>>, String) -> Unit = { _, _ -> },
    private val initial: JSONObject = JSONObject(),
    private val shareRequest: suspend (String, JSONObject) -> Any? = { _, _ -> error(tr("分享未打开")) },
    private val openLocalLink: (String) -> Unit = { error(tr("无法打开本地链接")) },
    private val recordPageChanged: (Boolean) -> Unit = {},
    private val fileActionReady: () -> Unit = {},
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val messages = Channel<JSONObject>(64)

    init {
        scope.launch {
            for (message in messages) {
                val id = message.optString("id")
                val result =
                    try {
                        JSONObject()
                            .put("ok", true)
                            .put("value", handle(message) ?: JSONObject.NULL)
                    } catch (error: Exception) {
                        if (error is CancellationException) throw error
                        JSONObject().put("ok", false).put("error", error.message ?: tr("操作失败"))
                    }
                withContext(Dispatchers.Main) { reply(id, result) }
            }
        }
    }

    @JavascriptInterface
    fun postMessage(raw: String) {
        if (raw.length > 20 * 1024 * 1024) return
        val message = runCatching { JSONObject(raw) }.getOrNull() ?: return
        if (message.optString("session") != session) return
        if (!messages.trySend(message).isSuccess) {
            scope.launch(Dispatchers.Main) {
                reply(
                    message.optString("id"),
                    JSONObject().put("ok", false).put("error", tr("编辑请求过多，请稍后重试")),
                )
            }
        }
    }

    private suspend fun handle(message: JSONObject): Any? {
        val params = message.optJSONObject("params") ?: JSONObject()
        val method = message.getString("method")
        if (method.startsWith("share.")) return shareRequest(method, params)
        return when (method) {
            "editor.fileAction" -> {
                withContext(Dispatchers.Main) { fileActionReady() }
                null
            }
            "editor.recordPage" -> {
                withContext(Dispatchers.Main) { recordPageChanged(params.optBoolean("active")) }
                null
            }
            "editor.tables" -> {
                val tables = params.getJSONArray("tables")
                val entries =
                    (0 until tables.length()).map { index ->
                        val entry = tables.getJSONObject(index)
                        entry.getString("id") to entry.getString("name")
                    }
                withContext(Dispatchers.Main) {
                    tablesChanged(entries, params.optString("selected"))
                }
                null
            }
            "files.import" ->
                repository.importEditorFiles(file.path, pickFiles(params.optBoolean("imagesOnly")))
            "plugin.catalog" ->
                org.json.JSONArray().also { result ->
                    pluginStore
                        ?.installed(repository.spaceId)
                        ?.filter {
                            it.enabled &&
                                (it.manifest.optString("kind") != "theme" &&
                                    !params.optBoolean("themeOnly") &&
                                    hasTableView(it.manifest))
                        }
                        ?.forEach { result.put(pluginStore.program(repository.spaceId, it.id)) }
                }
            "editor.ready" -> {
                withContext(Dispatchers.Main) { ready() }
                null
            }
            "init" ->
                JSONObject()
                    .put("path", file.path)
                    .put("recordPath", "${repository.spaceId}/${file.path}")
                    .put("kind", if (file.markdown) "markdown" else "eidos")
                    .put("dark", dark)
                    .also {
                        initial.keys().forEach { key -> it.put(key, initial.get(key)) }
                        if (file.markdown) {
                            val document = repository.readText(file.path)
                            it.put("text", document.text)
                                .put("digest", document.digest)
                                .put("recovered", document.recovered)
                        }
                    }
            "runtime" -> {
                check(file.eidos)
                repository.embeddedRuntime(
                    file.path,
                    params.getString("method"),
                    params.optJSONObject("request") ?: JSONObject(),
                )
            }
            "markdown.save" -> {
                check(file.markdown)
                val document =
                    TextDocument(file.path, params.getString("text"), params.getString("digest"))
                repository.saveDraft(document)
                val saved = repository.saveText(document)
                JSONObject().put("digest", saved.digest)
            }
            "leave" -> {
                withContext(Dispatchers.Main) { leave() }
                null
            }
            "keyboard.hide" -> {
                withContext(Dispatchers.Main) { hideKeyboard() }
                null
            }
            "openLink" -> {
                val uri = Uri.parse(params.getString("url"))
                withContext(Dispatchers.Main) {
                    when {
                        uri.scheme == null -> openLocalLink(uri.toString())
                        uri.scheme == "https" && uri.host == EDITOR_HOST -> {
                            val base = listOf("document", session)
                            val target = uri.encodedPath.orEmpty().trimStart('/').split('/')
                            val common = base.zip(target).takeWhile { it.first == it.second }.size
                            val relative = List(base.size - common) { ".." } + target.drop(common)
                            openLocalLink(
                                relative.joinToString("/") +
                                    (uri.encodedQuery?.let { "?$it" } ?: "") +
                                    (uri.encodedFragment?.let { "#$it" } ?: "")
                            )
                        }
                        uri.scheme in listOf("https", "http") && uri.host != EDITOR_HOST ->
                            openLink(uri)
                        else -> error(tr("不支持此链接"))
                    }
                }
                null
            }
            else -> error(tr("不支持的编辑操作"))
        }
    }

    fun dispose() {
        messages.close()
        scope.cancel()
    }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
internal fun EmbeddedEditorScreen(
    file: SpaceFile,
    model: EidosModel,
    pool: EditorWebViewPool,
    shareMode: Boolean = false,
    export: (SpaceFile) -> Unit = {},
    rename: (SpaceFile) -> Unit = {},
    trash: (SpaceFile) -> Unit = {},
) {
    val session = remember(file.path) { java.util.UUID.randomUUID().toString() }
    val repository = model.repository
    val pluginOrigins =
        model.pluginMarket
            .installed(repository.spaceId)
            .filter { it.enabled }
            .flatMap { plugin ->
                val origins =
                    plugin.manifest.optJSONObject("browser")?.optJSONArray("networkOrigins")
                if (origins == null) emptyList()
                else (0 until origins.length()).map(origins::getString)
            }
            .toSet()
    val imagePrefix = "/document/$session/"
    val dark = isSystemInDarkTheme()
    val background = MaterialTheme.colorScheme.background.toArgb()
    var web by remember(file.path) { mutableStateOf<WebView?>(null) }
    var bridge by remember(file.path) { mutableStateOf<EmbeddedEditorBridge?>(null) }
    var pendingFileAction by remember(file.path) { mutableStateOf<(() -> Unit)?>(null) }
    val state by model.state.collectAsState()
    fun afterSave(action: () -> Unit) {
        pendingFileAction = action
        web?.evaluateJavascript(
            "(async () => { if (!window.eidosFlush) return; try { await window.eidosFlush(); window.eidosFileActionReady(); } catch (_) {} })()", null)
    }
    var tables by remember(file.path) { mutableStateOf<List<Pair<String, String>>>(emptyList()) }
    var selectedTable by remember(file.path) { mutableStateOf("") }
    var recordPage by remember(file.path) { mutableStateOf(false) }
    var loading by remember(file.path) { mutableStateOf(true) }
    var pageLoaded by remember(file.path) { mutableStateOf(false) }
    var editorReady by remember(file.path) { mutableStateOf(false) }
    var failed by remember(file.path) { mutableStateOf(false) }
    var pendingPicker by remember { mutableStateOf<CompletableDeferred<List<Uri>>?>(null) }
    val picker =
        rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
            pendingPicker?.complete(uris)
            pendingPicker = null
        }
    val photoPicker =
        rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia()) { uris
            ->
            pendingPicker?.complete(uris)
            pendingPicker = null
        }
    fun leave() {
        if (failed || (!pageLoaded && !editorReady)) model.leaveWebEditor()
        else
            web?.evaluateJavascript(
                "(() => { if (!window.eidosLeave) return false; window.eidosLeave('back'); return true; })()"
            ) { ready ->
                if (ready != "true") model.leaveWebEditor()
            }
    }
    BackHandler { leave() }
    DisposableEffect(file.path) {
        onDispose {
            val currentPath =
                if (shareMode) model.state.value.shareRecord?.path
                else model.state.value.webFile?.path
            if (currentPath != file.path) pool.release(bridge, failed)
        }
    }
    Scaffold(
        topBar = {
            if (!recordPage)
                TopAppBar(
                    title = {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                file.name,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                modifier = Modifier.weight(1f, false),
                            )
                        }
                    },
                    navigationIcon = {
                        IconButton(onClick = { leave() }) {
                            Icon(Icons.AutoMirrored.Outlined.ArrowBack, tr("返回文件"))
                        }
                    },
                    actions = {
                        if (!shareMode) FileRow(
                            file = file, enabled = editorReady && !state.busy,
                            open = { /* Already using the default editor. */ },
                            export = { afterSave { export(it) } },
                            favorite = state.favorites.any { it.path == file.path && it.tableId == null },
                            toggleFavorite = { model.toggleFavorite(Favorite(it.path, it.name)) },
                            publish = {}, pluginRegistry = model.pluginOpenWith,
                            openPlugin = { target, id -> afterSave { model.openWithPlugin(target, id) } },
                            rename = { afterSave { rename(it) } }, menuOnly = true,
                            trash = { afterSave { trash(file) } },
                        )
                    },
                )
        }
    ) { padding ->
        Column(Modifier.padding(padding).consumeWindowInsets(padding).fillMaxSize().imePadding()) {
            LoadingIndicator(loading)
            if (failed) Text(tr("编辑器加载失败，请返回文件后重新打开。"))
            AndroidView(
                modifier = Modifier.weight(1f).fillMaxWidth(),
                factory = { context ->
                    pool.acquire(context).apply {
                        layoutParams =
                            android.view.ViewGroup.LayoutParams(
                                android.view.ViewGroup.LayoutParams.MATCH_PARENT,
                                android.view.ViewGroup.LayoutParams.MATCH_PARENT,
                            )
                        web = this
                        setBackgroundColor(background)
                        settings.javaScriptEnabled = true
                        settings.domStorageEnabled = true
                        settings.allowFileAccess = false
                        settings.allowContentAccess = false
                        settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                        settings.setSupportMultipleWindows(false)
                        settings.javaScriptCanOpenWindowsAutomatically = false
                        settings.mediaPlaybackRequiresUserGesture = true
                        webChromeClient = WebChromeClient()
                        val pluginNonce = java.util.UUID.randomUUID().toString()
                        lateinit var channel: EmbeddedEditorBridge
                        channel =
                            EmbeddedEditorBridge(
                                repository,
                                file,
                                dark,
                                reply = { id, result ->
                                    if (pool.owns(channel))
                                        evaluateJavascript(
                                            "window.eidosReply(${JSONObject.quote(id)},$result)",
                                            null,
                                        )
                                },
                                leave = model::leaveWebEditor,
                                fileActionReady = {
                                    val action = pendingFileAction
                                    pendingFileAction = null
                                    action?.invoke()
                                },
                                initial =
                                    JSONObject()
                                        .put("tableId", model.state.value.webTableId)
                                        .put("query", model.state.value.webQuery)
                                        .put("addRecord", model.state.value.webAddRecord)
                                        .put("share", shareMode),
                                openLocalLink = { model.openMarkdownLink(file.path, it) },
                                shareRequest = { method, params ->
                                    check(shareMode)
                                    val state = model.state.value
                                    val page = checkNotNull(state.shareRecord)
                                    val share = state.pendingShares.first()
                                    val table = checkNotNull(page.table).id
                                    val inbox =
                                        ShareInbox(model.getApplication(), repository.spaceId)
                                    when (method) {
                                        "share.init" ->
                                            checkNotNull(
                                                    inbox.form(share.inboxId, file.path, table)
                                                )
                                                .json()
                                                .put("pendingFileCount", share.files.size)
                                        "share.draft" -> {
                                            inbox.updateForm(
                                                share.inboxId,
                                                file.path,
                                                table,
                                                draft =
                                                    RecordDraft(
                                                        params.getString("revision"),
                                                        params.getJSONObject("changes").toString(),
                                                    ),
                                            )
                                            null
                                        }
                                        "share.attachmentField" -> {
                                            withContext(Dispatchers.Main) {
                                                model.selectShareAttachmentField(
                                                    params.getString("fieldId")
                                                )
                                            }
                                            null
                                        }
                                        "share.save" -> {
                                            val changes = params.getJSONObject("changes")
                                            withContext(Dispatchers.Main) {
                                                model.saveShareRecord(
                                                    changes.keys().asSequence().associateWith {
                                                        changes.get(it)
                                                    },
                                                    params.getString("revision"),
                                                )
                                            }
                                            null
                                        }
                                        else -> error(tr("不支持的分享操作"))
                                    }
                                },
                                openLink = {
                                    context.startActivity(Intent(Intent.ACTION_VIEW, it))
                                },
                                hideKeyboard = {
                                    (context.getSystemService(
                                            android.content.Context.INPUT_METHOD_SERVICE
                                        ) as android.view.inputmethod.InputMethodManager)
                                        .hideSoftInputFromWindow(windowToken, 0)
                                    clearFocus()
                                },
                                ready = {
                                    editorReady = true
                                    postVisualStateCallback(
                                        0,
                                        object : WebView.VisualStateCallback() {
                                            override fun onComplete(requestId: Long) {
                                                loading = false
                                            }
                                        },
                                    )
                                },
                                session = session,
                                tablesChanged = { entries, selected ->
                                    if (pool.owns(channel)) {
                                        tables = entries
                                        selectedTable = selected
                                    }
                                },
                                recordPageChanged = { active ->
                                    if (pool.owns(channel)) recordPage = active
                                },
                                pluginStore = model.pluginMarket,
                                pickFiles = { imagesOnly ->
                                    withContext(Dispatchers.Main) {
                                        check(pendingPicker == null) { tr("请先完成当前文件选择") }
                                        val result = CompletableDeferred<List<Uri>>()
                                        pendingPicker = result
                                        try {
                                            if (imagesOnly) {
                                                photoPicker.launch(
                                                    PickVisualMediaRequest(
                                                        ActivityResultContracts.PickVisualMedia
                                                            .ImageOnly
                                                    )
                                                )
                                            } else {
                                                picker.launch(arrayOf("*/*"))
                                            }
                                            result.await()
                                        } finally {
                                            if (pendingPicker === result) pendingPicker = null
                                        }
                                    }
                                },
                            )
                        bridge = channel
                        pool.bind(channel)
                        webViewClient =
                            object : WebViewClient() {
                                override fun onRenderProcessGone(
                                    view: WebView,
                                    detail: RenderProcessGoneDetail,
                                ): Boolean {
                                    failed = true
                                    loading = false
                                    pool.destroy()
                                    return true
                                }

                                override fun shouldOverrideUrlLoading(
                                    view: WebView,
                                    request: WebResourceRequest,
                                ): Boolean =
                                    if (request.isForMainFrame) {
                                        request.url.buildUpon().fragment(null).build().toString() !=
                                            EDITOR_URL
                                    } else request.url.scheme != "about"

                                override fun onPageStarted(
                                    view: WebView,
                                    url: String,
                                    favicon: android.graphics.Bitmap?,
                                ) {
                                    pageLoaded = false
                                }

                                override fun onPageFinished(view: WebView, url: String) {
                                    // Fragment routes can finish navigation without loading a new
                                    // document.
                                    if (pageLoaded) return
                                    // HTML completion only makes JS evaluation safe. The editor
                                    // owns readiness.
                                    pageLoaded = true
                                    pool.loaded = true
                                    evaluateJavascript(
                                        "window.eidosOpen(${JSONObject.quote(session)})",
                                        null,
                                    )
                                }

                                override fun onReceivedError(
                                    view: WebView,
                                    request: WebResourceRequest,
                                    error: WebResourceError,
                                ) {
                                    if (isEditorLoadFailure(request)) {
                                        failed = true
                                        loading = false
                                    }
                                }

                                override fun onReceivedHttpError(
                                    view: WebView,
                                    request: WebResourceRequest,
                                    response: WebResourceResponse,
                                ) {
                                    if (isEditorLoadFailure(request)) {
                                        failed = true
                                        loading = false
                                    }
                                }

                                override fun shouldInterceptRequest(
                                    view: WebView,
                                    request: WebResourceRequest,
                                ): WebResourceResponse? {
                                    val uri = request.url
                                    if (
                                        uri.scheme == "https" &&
                                            uri.host != EDITOR_HOST &&
                                            pluginOrigins.contains(
                                                "https://${uri.host}" +
                                                    if (uri.port != -1) ":${uri.port}" else ""
                                            )
                                    )
                                        return null
                                    if (
                                        uri.scheme != "https" ||
                                            uri.host != EDITOR_HOST ||
                                            request.method != "GET"
                                    )
                                        return blocked()
                                    return try {
                                        val path = uri.path.orEmpty()
                                        if (
                                            path.startsWith("/editor/") &&
                                                path.split('/').none { it == ".." }
                                        ) {
                                            val name = path.removePrefix("/")
                                            if (name == "editor/index.html") {
                                                val html =
                                                    context.assets
                                                        .open(name)
                                                        .bufferedReader()
                                                        .use { it.readText() }
                                                        .replace(
                                                            "__EIDOS_PLUGIN_NONCE__",
                                                            pluginNonce,
                                                        )
                                                        .replace("__EIDOS_LOCALE__", AppLanguage.locale())
                                                        .replace(
                                                            "<html lang=\"${AppLanguage.locale()}\">",
                                                            "<html lang=\"${AppLanguage.locale()}\" class=\"${if (dark) "dark" else "light"}\" style=\"background:#${Integer.toHexString(background).takeLast(6)};color-scheme:${if (dark) "dark" else "light"}\">",
                                                        )
                                                return WebResourceResponse(
                                                    "text/html",
                                                    "UTF-8",
                                                    ByteArrayInputStream(
                                                        html.toByteArray(Charsets.UTF_8)
                                                    ),
                                                )
                                            }
                                            val mime =
                                                when (name.substringAfterLast('.')) {
                                                    "html" -> "text/html"
                                                    "js" -> "text/javascript"
                                                    "css" -> "text/css"
                                                    "woff2" -> "font/woff2"
                                                    "woff" -> "font/woff"
                                                    "ttf" -> "font/ttf"
                                                    else -> "application/octet-stream"
                                                }
                                            WebResourceResponse(
                                                mime,
                                                "UTF-8",
                                                context.assets.open(name),
                                            )
                                        } else if (
                                            path.startsWith(imagePrefix) && pool.owns(channel)
                                        ) {
                                            val image = runBlocking {
                                                repository.embeddedImage(
                                                    file.path,
                                                    path.removePrefix(imagePrefix),
                                                )
                                            }
                                            WebResourceResponse(
                                                image.first,
                                                null,
                                                ByteArrayInputStream(image.second),
                                            )
                                        } else blocked()
                                    } catch (_: Exception) {
                                        blocked()
                                    }
                                }

                                private fun blocked() =
                                    WebResourceResponse(
                                        "text/plain",
                                        "UTF-8",
                                        403,
                                        "Forbidden",
                                        emptyMap(),
                                        ByteArrayInputStream(ByteArray(0)),
                                    )
                            }
                        if (pool.loaded) {
                            pageLoaded = true
                            evaluateJavascript(
                                "window.eidosOpen(${JSONObject.quote(session)})",
                                null,
                            )
                        } else loadUrl(EDITOR_URL)
                    }
                },
                update = { it.evaluateJavascript("window.eidosSetLocale?.('${AppLanguage.locale()}')", null) },
            )
        }
    }
}
