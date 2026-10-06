package space.eidos.android

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels

class MainActivity : ComponentActivity() {
    private val model: EidosModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent { EidosApp(model) }
        if (savedInstanceState == null) receiveIntent(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        receiveIntent(intent)
    }

    private fun receiveIntent(intent: Intent) {
        val uri = intent.data
        if (intent.action == Intent.ACTION_VIEW && uri?.scheme == BuildConfig.APPLICATION_ID) {
            model.loginCallback(uri)
            setIntent(Intent(this, MainActivity::class.java))
        } else receiveShare(intent)
    }

    @Suppress("DEPRECATION")
    private fun receiveShare(intent: Intent) {
        if (intent.action !in setOf(Intent.ACTION_SEND, Intent.ACTION_SEND_MULTIPLE)) return
        val streams =
            if (intent.action == Intent.ACTION_SEND_MULTIPLE)
                intent
                    .getParcelableArrayListExtra<android.os.Parcelable>(Intent.EXTRA_STREAM)
                    .orEmpty()
                    .filterIsInstance<android.net.Uri>()
            else
                listOfNotNull(
                    intent.getParcelableExtra<android.os.Parcelable>(Intent.EXTRA_STREAM)
                        as? android.net.Uri
                )
        val files =
            streams.ifEmpty {
                intent.clipData
                    ?.let { clip ->
                        (0 until clip.itemCount).mapNotNull {
                            clip.getItemAt(it).uri?.takeIf { uri -> uri.scheme == "content" }
                        }
                    }
                    .orEmpty()
            }
        val text =
            sharedText(
                intent.getCharSequenceExtra(Intent.EXTRA_SUBJECT)?.toString(),
                intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString(),
            )
        if (files.isNotEmpty() || !text.isNullOrBlank()) model.receiveShare(files, text)
        else model.linkError(tr("分享内容中没有可读取的文件或文本"))
    }

    override fun onStop() {
        model.backgroundStarted()
        super.onStop()
    }

    override fun onStart() {
        super.onStart()
        model.foregroundStarted()
    }
}

internal fun sharedText(subject: String?, body: String?): String? {
    val title = subject?.trim()?.takeIf { it.isNotEmpty() }
    if (title == null) return body
    if (body.isNullOrBlank()) return title
    if (body.lineSequence().firstOrNull()?.trim() == title) return body
    return "$title\n\n$body"
}
