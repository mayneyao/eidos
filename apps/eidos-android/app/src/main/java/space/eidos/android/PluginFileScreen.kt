@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package space.eidos.android

import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import java.io.ByteArrayInputStream
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.runBlocking
import org.json.JSONObject

private fun scriptJson(value: JSONObject) =
    value
        .toString()
        .replace("<", "\\u003c")
        .replace("&", "\\u0026")
        .replace("\u2028", "\\u2028")
        .replace("\u2029", "\\u2029")

internal fun pluginSnapshotHtml(
    session: PluginFileSession,
    host: String,
    plugin: String,
    dark: Boolean,
    fileUrl: String = "https://plugin.invalid/unbound",
): String {
    val nonce = UUID.randomUUID().toString()
    val snapshot =
        session.document?.let { document ->
            JSONObject()
                .put("text", document.text.removePrefix("\uFEFF"))
                .put("version", document.digest)
                .put("encoding", "utf-8")
                .put("bom", document.text.startsWith("\uFEFF"))
                .put("dirty", false)
                .put("conflicted", false)
        }
    val origins = session.view.networkOrigins.joinToString(" ")
    val workers = if (session.view.workers) "blob:" else "'none'"
    val moduleSource = if (session.source != null) "blob:" else ""
    val binding =
        JSONObject()
            .put("id", "current")
            .put("path", session.file.path)
            .put("name", session.file.name)
    // Package modules have passed canonical validation and explicit install/Space authorization.
    fun script(source: String) =
        "<script nonce='$nonce'>${source.replace("</script", "<\\/script", ignoreCase = true)}</script>"
    val mountArguments =
        "document.getElementById('root'),${scriptJson(binding)},${snapshot?.let(::scriptJson) ?: "null"},${JSONObject.quote(fileUrl)}"
    val boot =
        if (session.source == null) {
            script(plugin) +
                script("EidosPluginHost.mountSnapshot(EidosPlugin.default,$mountArguments);")
        } else {
            script(
                """
            const moduleUrl=URL.createObjectURL(new Blob([${scriptJson(JSONObject().put("code", plugin))}.code],{type:'text/javascript'}));
            import(moduleUrl).then(module=>EidosPluginHost.mountSnapshot(module.default,$mountArguments))
              .catch(error=>{document.getElementById('root').textContent='插件加载失败：'+error.message;})
              .finally(()=>URL.revokeObjectURL(moduleUrl));
        """
                    .trimIndent()
            )
        }
    return """<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-$nonce' 'wasm-unsafe-eval' $moduleSource; style-src 'unsafe-inline'; img-src data: blob: $origins; font-src data:; connect-src $fileUrl $origins; frame-src 'none'; worker-src $workers; object-src 'none'; base-uri 'none'; form-action 'none'">
        <style>html{color-scheme:${if (dark) "dark" else "light"}}html,body,#root{height:100%;width:100%}body{margin:0;overflow:hidden;background:${if (dark) "#18181b" else "#fafafa"};color:${if (dark) "#e4e4e7" else "#242427"}}#root{overflow:auto}#notice{padding:0 16px}</style>
        </head><body><div id="notice" role="status"></div><main id="root"></main>
        ${script(host)}$boot
        </body></html>"""
        .trimIndent()
}

@Composable
fun PluginFileScreen(session: PluginFileSession, repository: SpaceRepository, close: () -> Unit) {
    val context = LocalContext.current
    val dark = androidx.compose.foundation.isSystemInDarkTheme()
    val policy =
        remember(session) {
            PluginResourcePolicy(
                "https://plugin.invalid/${UUID.randomUUID()}/file",
                session.view.networkOrigins,
            )
        }
    val html =
        remember(session, dark) {
            pluginSnapshotHtml(
                session,
                context.assets.open("plugins/host.js").bufferedReader().use { it.readText() },
                session.source
                    ?: context.assets.open("plugins/${session.view.asset}").bufferedReader().use {
                        it.readText()
                    },
                dark,
                policy.fileUrl,
            )
        }
    BackHandler(onBack = close)
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(session.file.name, maxLines = 1) },
                navigationIcon = {
                    IconButton(onClick = close) {
                        Icon(Icons.AutoMirrored.Outlined.ArrowBack, "返回")
                    }
                },
            )
        }
    ) { padding ->
        Column(Modifier.padding(padding).fillMaxSize()) {
            Text(session.view.title, style = MaterialTheme.typography.labelMedium)
            key(html) {
                AndroidView(
                    modifier = Modifier.fillMaxSize(),
                    factory = { ctx ->
                        WebView(ctx).apply {
                            val active = AtomicBoolean(true)
                            tag = active
                            settings.javaScriptEnabled = true
                            settings.allowFileAccess = false
                            settings.allowContentAccess = false
                            settings.domStorageEnabled = false
                            settings.databaseEnabled = false
                            settings.blockNetworkLoads = session.view.networkOrigins.isEmpty()
                            settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                            settings.javaScriptCanOpenWindowsAutomatically = false
                            settings.setSupportMultipleWindows(false)
                            webViewClient =
                                object : WebViewClient() {
                                    override fun shouldOverrideUrlLoading(
                                        view: WebView,
                                        request: WebResourceRequest,
                                    ) = true

                                    override fun shouldInterceptRequest(
                                        view: WebView,
                                        request: WebResourceRequest,
                                    ): WebResourceResponse? {
                                        fun blocked() =
                                            WebResourceResponse(
                                                "text/plain",
                                                "utf-8",
                                                403,
                                                "Blocked",
                                                emptyMap(),
                                                ByteArrayInputStream(byteArrayOf()),
                                            )
                                        if (!active.get()) return blocked()
                                        val url = request.url.toString()
                                        if (
                                            policy.isPageRead(
                                                url,
                                                request.method,
                                                request.isForMainFrame,
                                            )
                                        ) {
                                            return WebResourceResponse(
                                                "text/html",
                                                "utf-8",
                                                200,
                                                "OK",
                                                mapOf("Cache-Control" to "no-store"),
                                                ByteArrayInputStream(
                                                    html.toByteArray(Charsets.UTF_8)
                                                ),
                                            )
                                        }
                                        if (
                                            policy.isBoundRead(url, request.method) &&
                                                !session.view.document
                                        ) {
                                            return try {
                                                val bytes = runBlocking {
                                                    repository.pluginReadBinary(session.file.path)
                                                }
                                                if (!active.get()) blocked()
                                                else
                                                    WebResourceResponse(
                                                        "application/octet-stream",
                                                        null,
                                                        200,
                                                        "OK",
                                                        mapOf("Cache-Control" to "no-store"),
                                                        ByteArrayInputStream(bytes),
                                                    )
                                            } catch (_: Exception) {
                                                blocked()
                                            }
                                        }
                                        return if (policy.allowsNetwork(url, request.method)) null
                                        else blocked()
                                    }
                                }
                            // No JavascriptInterface: this renderer has no native authority.
                            // WebView intercepts loadDataWithBaseURL's synthetic data request too.
                            // Serve the document at an exact local route through the same policy.
                            loadUrl(policy.pageUrl)
                        }
                    },
                    onRelease = { web ->
                        (web.tag as AtomicBoolean).set(false)
                        web.loadUrl("about:blank")
                        web.stopLoading()
                        web.removeAllViews()
                        web.destroy()
                    },
                )
            }
        }
    }
}
