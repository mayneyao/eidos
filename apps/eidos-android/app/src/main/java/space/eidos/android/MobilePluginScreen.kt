@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package space.eidos.android

import android.annotation.SuppressLint
import android.webkit.*
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import java.io.ByteArrayInputStream
import java.util.UUID
import kotlinx.coroutines.*
import org.json.JSONObject

@SuppressLint("SetJavaScriptEnabled")
@Composable
internal fun MobilePluginScreen(
    model: EidosModel,
    initialFile: PluginFileSession? = null,
    navigationPage: PluginNavigationPage? = null,
    pluginId: String? = null,
    readme: Boolean = false,
    title: String? = null,
    onOpenFile: (() -> Unit)? = null,
    active: Boolean = true,
    headerActions: @Composable () -> Unit = {},
    close: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    val token = remember { UUID.randomUUID().toString() }
    var web by remember { mutableStateOf<WebView?>(null) }
    var pickerReply by remember { mutableStateOf<CompletableDeferred<android.net.Uri>?>(null) }
    val picker =
        rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
            if (uri == null) pickerReply?.completeExceptionally(IllegalStateException(tr("已取消")))
            else pickerReply?.complete(uri)
            pickerReply = null
        }
    val dark = androidx.compose.foundation.isSystemInDarkTheme()
    val url = "https://appassets.androidplatform.net/editor/plugins.html"
    val launch =
        initialFile?.let {
            JSONObject()
                .put("id", it.view.id.substringBefore('/'))
                .put("view", it.view.id.substringAfter('/'))
                .put("path", it.file.path)
                .toString()
        }
            ?: navigationPage?.let {
                JSONObject().put("id", it.pluginId).put("view", it.viewId).toString()
            }
            ?: pluginId?.let {
                JSONObject().put("id", it).put("mode", if (readme) "readme" else "tools").toString()
            }
            ?: "null"
    BackHandler(enabled = active, onBack = close)
    Scaffold(
        contentWindowInsets =
            if (navigationPage == null) ScaffoldDefaults.contentWindowInsets
            else WindowInsets(0, 0, 0, 0),
        topBar = {
            if (navigationPage == null)
                TopAppBar(
                    title = { Text(title ?: initialFile?.file?.name ?: tr("插件"), maxLines = 1) },
                    navigationIcon = { TextButton(onClick = close) { Text(tr("返回")) } },
                    actions = { headerActions() },
                )
        },
    ) { padding ->
        AndroidView(
            modifier =
                Modifier.padding(padding).consumeWindowInsets(padding).fillMaxSize().imePadding(),
            factory = { context ->
                val service =
                    MobilePluginService(
                        context,
                        model.repository,
                        model.pluginMarket,
                        openFile = { path ->
                            val file = model.repository.file(path)
                            withContext(Dispatchers.Main) {
                                if (navigationPage == null) (onOpenFile ?: close)()
                                model.open(file)
                            }
                        },
                        importFile = {
                            val reply = CompletableDeferred<android.net.Uri>()
                            withContext(Dispatchers.Main) {
                                check(pickerReply == null) { tr("正在选择插件") }
                                pickerReply = reply
                                picker.launch(arrayOf("*/*"))
                            }
                            reply.await()
                        },
                    )
                WebView(context).apply {
                    // A wrap-content WebView can measure viewport CSS units against zero
                    // even when Compose later gives the AndroidView a non-zero size.
                    layoutParams =
                        android.view.ViewGroup.LayoutParams(
                            android.view.ViewGroup.LayoutParams.MATCH_PARENT,
                            android.view.ViewGroup.LayoutParams.MATCH_PARENT,
                        )
                    web = this
                    settings.javaScriptEnabled = true
                    settings.allowFileAccess = false
                    settings.allowContentAccess = false
                    settings.domStorageEnabled = false
                    settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                    webChromeClient = WebChromeClient()
                    addJavascriptInterface(
                        object {
                            @JavascriptInterface
                            fun postMessage(raw: String) {
                                if (raw.length > 20 * 1024 * 1024) return
                                val message = runCatching { JSONObject(raw) }.getOrNull() ?: return
                                // addJavascriptInterface is visible to subframes; the unguessable
                                // token
                                // stays in a main-frame closure and is never sent through guest
                                // RPC.
                                if (message.optString("token") != token) return
                                if (message.optString("method") == "readme.openLink") {
                                    val link =
                                        android.net.Uri.parse(
                                            message
                                                .optJSONObject("params")
                                                ?.optString("url")
                                                .orEmpty()
                                        )
                                    if (link.scheme in listOf("https", "http"))
                                        scope.launch {
                                            runCatching {
                                                context.startActivity(
                                                    android.content.Intent(
                                                        android.content.Intent.ACTION_VIEW,
                                                        link,
                                                    )
                                                )
                                            }
                                            web?.evaluateJavascript(
                                                "window.eidosMobileReply(${JSONObject.quote(message.getString("id"))},{value:null})",
                                                null,
                                            )
                                        }
                                    return
                                }
                                if (message.optString("method") == "manager.open") {
                                    scope.launch { close() }
                                    return
                                }
                                scope.launch(Dispatchers.Main) {
                                    val response =
                                        try {
                                            val result =
                                                withContext(Dispatchers.IO) {
                                                    service.handle(
                                                        message.getString("method"),
                                                        message.optJSONObject("params")
                                                            ?: JSONObject(),
                                                    )
                                                }
                                            JSONObject().put("value", result ?: JSONObject.NULL)
                                        } catch (error: Exception) {
                                            if (error is CancellationException) throw error
                                            JSONObject().put("error", error.message ?: tr("插件操作失败"))
                                        }
                                    web?.evaluateJavascript(
                                        "window.eidosMobileReply(${JSONObject.quote(message.getString("id"))},$response)",
                                        null,
                                    )
                                }
                            }
                        },
                        "EidosMobile",
                    )
                    webViewClient =
                        object : WebViewClient() {
                            override fun onPageFinished(view: WebView, loaded: String) {
                                if (loaded == url)
                                    view.evaluateJavascript(
                                        "(() => { const start = () => window.eidosMobileStart(${JSONObject.quote(token)},$dark,$launch); if (window.eidosMobileStart) start(); else window.addEventListener('eidos-mobile-ready',start,{once:true}); })()",
                                        null,
                                    )
                            }

                            override fun shouldOverrideUrlLoading(
                                view: WebView,
                                request: WebResourceRequest,
                            ) = request.isForMainFrame && request.url.toString() != url

                            override fun shouldInterceptRequest(
                                view: WebView,
                                request: WebResourceRequest,
                            ): WebResourceResponse? {
                                if (request.url.host != "appassets.androidplatform.net") return null
                                val path = request.url.path.orEmpty().removePrefix("/")
                                if (
                                    !path.startsWith("editor/") ||
                                        path.split('/').any { it == ".." }
                                )
                                    return WebResourceResponse(
                                        "text/plain",
                                        "utf-8",
                                        ByteArrayInputStream(byteArrayOf()),
                                    )
                                return runCatching {
                                        val mime =
                                            when {
                                                path.endsWith(".js") -> "text/javascript"
                                                path.endsWith(".css") -> "text/css"
                                                else -> "text/html"
                                            }
                                        WebResourceResponse(
                                            mime,
                                            "utf-8",
                                            if (path.endsWith(".html")) java.io.ByteArrayInputStream(
                                                context.assets.open(path).bufferedReader().use { it.readText() }
                                                    .replace("__EIDOS_LOCALE__", AppLanguage.locale()).toByteArray(Charsets.UTF_8)
                                            ) else context.assets.open(path),
                                        )
                                    }
                                    .getOrNull()
                            }
                        }
                    loadUrl(url)
                }
            },
            onRelease = {
                web = null
                it.removeJavascriptInterface("EidosMobile")
                it.stopLoading()
                it.destroy()
            },
            update = {
                it.evaluateJavascript("window.eidosSetLocale?.('${AppLanguage.locale()}')", null)
                it.visibility = if (active) android.view.View.VISIBLE else android.view.View.GONE
                if (active) it.onResume() else it.onPause()
            },
        )
    }
}
