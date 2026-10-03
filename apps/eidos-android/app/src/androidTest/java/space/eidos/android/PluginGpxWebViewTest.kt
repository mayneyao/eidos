package space.eidos.android

import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import androidx.activity.compose.setContent
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test

class PluginGpxWebViewTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()

    private fun web(view: View): WebView? {
        if (view is WebView) return view
        if (view is ViewGroup)
            for (i in 0 until view.childCount) web(view.getChildAt(i))?.let {
                return it
            }
        return null
    }

    private fun js(expression: String): String {
        val done = CountDownLatch(1)
        var result = "false"
        compose.runOnUiThread {
            val view = web(compose.activity.window.decorView)
            if (view == null || view.progress < 100) done.countDown()
            else
                view.evaluateJavascript(expression) {
                    result = it
                    done.countDown()
                }
        }
        assertTrue("WebView evaluation timed out", done.await(10, TimeUnit.SECONDS))
        return result
    }

    @Test
    fun opensGpxMapAndRefreshesWithoutLeavingThePage() {
        val app = compose.activity.application
        val registry = PluginOpenWithRegistry.bundled(app.assets)
        assumeTrue(
            "Requires the optional GPX source bundle",
            registry.allViews().any { it.id == "local.eidos-gpx-viewer/map" },
        )
        val id = "gpx-regression-${UUID.randomUUID()}"
        val repository = SpaceRepository(app, id)
        val root = File(app.filesDir, "spaces/$id")
        val path = "journals/2026/10/waylog-20261001-205308.gpx"
        val input = InstrumentationRegistry.getArguments().getString("gpxPath")
        val bytes =
            if (input != null) File(input).readBytes()
            else
                """
            <gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1"><trk><trkseg>
            <trkpt lat="31.230" lon="121.474"><time>2026-10-01T12:00:00Z</time></trkpt>
            <trkpt lat="31.231" lon="121.475"><time>2026-10-01T12:00:10Z</time></trkpt>
            </trkseg></trk></gpx>
        """
                    .trimIndent()
                    .toByteArray()
        File(root, path).apply {
            parentFile!!.mkdirs()
            writeBytes(bytes)
        }
        try {
            val file = runBlocking { repository.file(path) }
            val session =
                PluginFileSession(
                    registry.resolve(file, "local.eidos-gpx-viewer/map"),
                    file,
                    null,
                    InstrumentationRegistry.getArguments().getString("pluginModulePath")?.let {
                        File(it).readText()
                    },
                )
            compose.runOnUiThread {
                compose.activity.setContent {
                    MaterialTheme { PluginFileScreen(session, repository) {} }
                }
            }
            try {
                compose.waitUntil(30_000) {
                    js("document.querySelector('#root')?.dataset.loaded === 'true'") == "true"
                }
            } catch (error: Throwable) {
                System.err.println(
                    "GPX WEBVIEW: " +
                        js(
                            "JSON.stringify({url:location.href,text:document.body.innerText.slice(0,500)})"
                        )
                )
                throw error
            }
            assertEquals("true", js("Number(document.querySelector('#scrub').max) > 0"))
            assertEquals("true", js("document.querySelector('.maplibregl-canvas') !== null"))
            val originalPosition = js("document.querySelector('#position').textContent")
            js(
                "document.querySelector('#scrub').value='1';document.querySelector('#scrub').dispatchEvent(new Event('input'));document.querySelector('#reload').click()"
            )
            compose.waitUntil(15_000) {
                js("document.querySelector('#position').textContent") == originalPosition
            }
            assertArrayEquals(bytes, File(root, path).readBytes())
            compose.waitUntil(45_000) {
                js("document.querySelector('#map')?.dataset.mapReady === 'true'") == "true"
            }
            val bitmap = InstrumentationRegistry.getInstrumentation().uiAutomation.takeScreenshot()
            File(app.getExternalFilesDir(null), "gpx-webview.png").outputStream().use {
                bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it)
            }
            bitmap.recycle()
        } finally {
            compose.runOnUiThread { compose.activity.setContent {} }
            runBlocking { repository.close() }
            root.deleteRecursively()
        }
    }
}
