@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package space.eidos.android

import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.webkit.*
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.MoreVert
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.viewinterop.AndroidView
import java.io.ByteArrayInputStream
import kotlinx.coroutines.*
import kotlinx.coroutines.channels.Channel
import org.json.JSONObject

private const val EDITOR_HOST = "appassets.androidplatform.net"
private const val EDITOR_URL = "https://$EDITOR_HOST/editor/index.html"

/**
 * One bridge is bound to one file. Javascript never receives a filesystem handle or account token.
 */
internal class EmbeddedEditorBridge(
    private val repository: SpaceRepository,
    private val file: SpaceFile,
    private val dark: Boolean,
    private val reply: (String, JSONObject) -> Unit,
    private val leave: (Boolean) -> Unit,
    private val openLink: (Uri) -> Unit,
    private val hideKeyboard: () -> Unit,
    private val ready: () -> Unit,
    private val session: String,
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
                        JSONObject().put("ok", false).put("error", error.message ?: "操作失败")
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
                    JSONObject().put("ok", false).put("error", "编辑请求过多，请稍后重试"),
                )
            }
        }
    }

    private suspend fun handle(message: JSONObject): Any? {
        val params = message.optJSONObject("params") ?: JSONObject()
        return when (message.getString("method")) {
            "editor.ready" -> {
                withContext(Dispatchers.Main) { ready() }
                null
            }
            "init" ->
                JSONObject()
                    .put("path", file.path)
                    .put("kind", if (file.markdown) "markdown" else "eidos")
                    .put("dark", dark)
                    .also {
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
                withContext(Dispatchers.Main) { leave(params.optString("mode") == "native") }
                null
            }
            "keyboard.hide" -> {
                withContext(Dispatchers.Main) { hideKeyboard() }
                null
            }
            "openLink" -> {
                val uri = Uri.parse(params.getString("url"))
                require(uri.scheme in listOf("https", "http") && uri.host != EDITOR_HOST) {
                    "请使用原生编辑器打开本地链接"
                }
                withContext(Dispatchers.Main) { openLink(uri) }
                null
            }
            else -> error("不支持的编辑操作")
        }
    }

    fun dispose() {
        messages.close()
        scope.cancel()
    }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
internal fun EmbeddedEditorScreen(file: SpaceFile, model: EidosModel, pool: EditorWebViewPool) {
    val session = remember(file.path) { java.util.UUID.randomUUID().toString() }
    val repository = model.repository
    val imagePrefix = "/document/$session/"
    val dark = isSystemInDarkTheme()
    val background = MaterialTheme.colorScheme.background.toArgb()
    var web by remember(file.path) { mutableStateOf<WebView?>(null) }
    var bridge by remember(file.path) { mutableStateOf<EmbeddedEditorBridge?>(null) }
    var menu by remember { mutableStateOf(false) }
    var loading by remember(file.path) { mutableStateOf(true) }
    var pageLoaded by remember(file.path) { mutableStateOf(false) }
    var editorReady by remember(file.path) { mutableStateOf(false) }
    var failed by remember(file.path) { mutableStateOf(false) }
    fun leave(native: Boolean = false) {
        if (failed || (!pageLoaded && !editorReady)) model.leaveWebEditor(native)
        else
            web?.evaluateJavascript(
                "(() => { if (!window.eidosLeave) return false; window.eidosLeave('${if (native) "native" else "back"}'); return true; })()"
            ) { ready ->
                if (ready != "true") model.leaveWebEditor(native)
            }
    }
    BackHandler { leave() }
    DisposableEffect(file.path) {
        onDispose { if (model.state.value.webFile?.path != file.path) pool.release(bridge, failed) }
    }
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(file.name, maxLines = 1) },
                navigationIcon = {
                    IconButton(onClick = { leave() }) {
                        Icon(Icons.AutoMirrored.Outlined.ArrowBack, "返回文件")
                    }
                },
                actions = {
                    Box {
                        IconButton(onClick = { menu = true }) {
                            Icon(Icons.Outlined.MoreVert, "文件操作")
                        }
                        DropdownMenu(menu, { menu = false }) {
                            DropdownMenuItem(
                                text = { Text("使用原生编辑器") },
                                onClick = {
                                    menu = false
                                    leave(true)
                                },
                            )
                        }
                    }
                },
            )
        }
    ) { padding ->
        Column(Modifier.padding(padding).fillMaxSize().imePadding()) {
            LoadingIndicator(loading)
            if (failed) Text("编辑器加载失败，请切换原生编辑器。")
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
                                ): Boolean = true

                                override fun onPageFinished(view: WebView, url: String) {
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
                                    if (
                                        request.isForMainFrame ||
                                            request.url.path.orEmpty().startsWith("/editor/")
                                    ) {
                                        failed = true
                                        loading = false
                                    }
                                }

                                override fun onReceivedHttpError(
                                    view: WebView,
                                    request: WebResourceRequest,
                                    response: WebResourceResponse,
                                ) {
                                    if (
                                        request.isForMainFrame ||
                                            request.url.path.orEmpty().startsWith("/editor/")
                                    ) {
                                        failed = true
                                        loading = false
                                    }
                                }

                                override fun shouldInterceptRequest(
                                    view: WebView,
                                    request: WebResourceRequest,
                                ): WebResourceResponse {
                                    val uri = request.url
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
                                                            "<html lang=\"zh\">",
                                                            "<html lang=\"zh\" class=\"${if (dark) "dark" else "light"}\" style=\"background:#${Integer.toHexString(background).takeLast(6)};color-scheme:${if (dark) "dark" else "light"}\">",
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
            )
        }
    }
}
