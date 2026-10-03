package space.eidos.android

import android.content.ComponentCallbacks2
import android.content.Context
import android.content.res.Configuration
import android.webkit.JavascriptInterface
import android.webkit.WebView

/** One activity-owned shell. Document permissions belong to the short-lived bridge. */
internal class EditorWebViewPool : ComponentCallbacks2 {
    var web: WebView? = null
        private set

    var loaded = false
    @Volatile private var active: EmbeddedEditorBridge? = null
    @Volatile private var retiring = false

    @JavascriptInterface
    fun closeShell() {
        if (retiring) android.os.Handler(android.os.Looper.getMainLooper()).post { destroy() }
    }

    fun shutdown() {
        // Keep the bridge alive during Activity recreation until its local save finishes.
        retiring = true
        if (active == null || !loaded) destroy()
        else
            web?.evaluateJavascript(
                "Promise.resolve(window.eidosFlush?.()).catch(() => {}).finally(() => window.EidosAndroid.closeShell())",
                null,
            )
    }

    @JavascriptInterface
    fun postMessage(raw: String) {
        active?.postMessage(raw)
    }

    fun acquire(context: Context): WebView =
        web
            ?: WebView(context).also {
                web = it
                it.addJavascriptInterface(this, "EidosAndroid")
            }

    fun bind(bridge: EmbeddedEditorBridge) {
        active?.dispose()
        active = bridge
    }

    fun owns(bridge: EmbeddedEditorBridge) = active === bridge

    fun background() {
        web?.evaluateJavascript("window.eidosFlush?.().catch(() => {})", null)
        web?.onPause()
    }

    fun foreground() {
        web?.onResume()
    }

    override fun onConfigurationChanged(configuration: Configuration) = Unit

    override fun onLowMemory() {
        if (active == null) destroy()
    }

    override fun onTrimMemory(level: Int) {
        if (active == null) destroy()
    }

    fun release(bridge: EmbeddedEditorBridge?, failed: Boolean) {
        if (active !== bridge) return
        active = null
        bridge?.dispose()
        web?.evaluateJavascript("window.eidosSuspend?.()", null)
        web?.clearFocus()
        if (failed || !loaded) destroy()
    }

    fun destroy() {
        active?.dispose()
        active = null
        web?.removeJavascriptInterface("EidosAndroid")
        web?.destroy()
        web = null
        loaded = false
    }
}
