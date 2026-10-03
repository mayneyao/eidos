package space.eidos.android

import android.content.Context
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import java.io.ByteArrayInputStream
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import org.json.JSONObject

/** Dedicated trusted validator. Guest JavaScript is only parsed, never executed here. */
object PluginPackageValidation {
    suspend fun validate(context: Context, json: String): JSONObject =
        withContext(Dispatchers.Main) {
            val web = WebView(context)
            try {
                withTimeout(60_000) {
                    suspendCancellableCoroutine { continuation ->
                        val delivered = AtomicBoolean(false)
                        web.settings.javaScriptEnabled = true
                        web.settings.allowFileAccess = false
                        web.settings.allowContentAccess = false
                        web.settings.blockNetworkLoads = true
                        web.webViewClient =
                            object : WebViewClient() {
                                override fun shouldOverrideUrlLoading(
                                    view: WebView,
                                    request: WebResourceRequest,
                                ) = true

                                override fun shouldInterceptRequest(
                                    view: WebView,
                                    request: WebResourceRequest,
                                ): WebResourceResponse {
                                    val body =
                                        when (request.url.toString()) {
                                            "https://package-validator.invalid/validator.js" ->
                                                context.assets.open("plugins/validator.js")
                                            "https://package-validator.invalid/input" ->
                                                ByteArrayInputStream(
                                                    json.toByteArray(Charsets.UTF_8)
                                                )
                                            else -> ByteArrayInputStream(byteArrayOf())
                                        }
                                    return WebResourceResponse("text/javascript", "utf-8", body)
                                }
                            }
                        web.addJavascriptInterface(
                            object {
                                @JavascriptInterface
                                fun complete(value: String) {
                                    if (
                                        !delivered.compareAndSet(false, true) ||
                                            !continuation.isActive
                                    )
                                        return
                                    try {
                                        require(value.length < 256 * 1024) { "插件元数据过大" }
                                        val result = JSONObject(value)
                                        if (result.has("error")) error(result.getString("error"))
                                        continuation.resume(result.getJSONObject("manifest"))
                                    } catch (error: Exception) {
                                        continuation.resumeWithException(error)
                                    }
                                }
                            },
                            "AndroidValidationResult",
                        )
                        web.loadDataWithBaseURL(
                            "https://package-validator.invalid/",
                            """
                        <!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-src 'none'; worker-src 'none'">
                        <script src="https://package-validator.invalid/validator.js"></script>
                        <script>fetch('https://package-validator.invalid/input').then(r=>r.text()).then(text=>{
                          try { AndroidValidationResult.complete(JSON.stringify({manifest:AndroidPackageValidator.validatePackage(text)})); }
                          catch(error) { AndroidValidationResult.complete(JSON.stringify({error:String(error.message)})); }
                        }).catch(error=>AndroidValidationResult.complete(JSON.stringify({error:String(error)})));</script>
                    """
                                .trimIndent(),
                            "text/html",
                            "utf-8",
                            null,
                        )
                    }
                }
            } finally {
                web.removeJavascriptInterface("AndroidValidationResult")
                web.stopLoading()
                web.destroy()
            }
        }
}
