package space.eidos.android

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import android.util.AtomicFile
import androidx.core.content.FileProvider
import java.io.File
import java.io.FileOutputStream
import java.security.MessageDigest
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

data class InboxShare(
    val id: String,
    val files: List<Uri>,
    val text: String?,
    val submitting: Boolean,
    val destination: String? = null,
    val form: ShareForm? = null,
)

data class ShareForm(
    val path: String,
    val table: String,
    val revision: String,
    val changes: String,
    val attachmentField: String?,
) {
    fun json(): JSONObject =
        JSONObject()
            .put("path", path)
            .put("table", table)
            .put("revision", revision)
            .put("changes", JSONObject(changes))
            .put("attachmentField", attachmentField ?: JSONObject.NULL)

    companion object {
        fun from(value: JSONObject) =
            ShareForm(
                value.getString("path"),
                value.getString("table"),
                value.getString("revision"),
                value.getJSONObject("changes").toString(),
                if (value.isNull("attachmentField")) null else value.getString("attachmentField"),
            )
    }
}

/** Durable copies of external URI grants. A manifest publishes only complete copies. */
class ShareInbox(private val context: Context, spaceId: String) {
    private val root =
        File(
            context.filesDir,
            "share-inbox/" +
                MessageDigest.getInstance("SHA-256").digest(spaceId.toByteArray()).joinToString(
                    ""
                ) {
                    "%02x".format(it)
                },
        )

    private fun directory(id: String): File {
        require(id.matches(Regex("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"))) {
            "无效的分享记录"
        }
        return File(root, id)
    }

    private fun write(directory: File, value: JSONObject) {
        val file = AtomicFile(File(directory, "manifest.json"))
        val stream = file.startWrite()
        try {
            stream.write(value.toString().toByteArray())
            file.finishWrite(stream)
        } catch (error: Exception) {
            file.failWrite(stream)
            throw error
        }
    }

    private fun read(directory: File): JSONObject =
        JSONObject(
            AtomicFile(File(directory, "manifest.json")).openRead().use {
                it.readBytes().toString(Charsets.UTF_8)
            }
        )

    private fun decode(directory: File, value: JSONObject): InboxShare {
        val files = value.getJSONArray("files")
        val uris =
            (0 until files.length()).map { index ->
                val entry = files.getJSONObject(index)
                val file = File(directory, entry.getString("path")).canonicalFile
                check(file.toPath().startsWith(directory.canonicalFile.toPath()) && file.isFile) {
                    "暂存的分享文件不可用"
                }
                FileProvider.getUriForFile(context, "${context.packageName}.attachments", file)
                    .buildUpon()
                    .appendQueryParameter("inboxMime", entry.getString("mime"))
                    .build()
            }
        return InboxShare(
            directory.name,
            uris,
            if (value.isNull("text")) null else value.getString("text"),
            value.getBoolean("submitting"),
            if (value.isNull("destination")) null else value.getString("destination"),
            value
                .optJSONObject("forms")
                ?.optJSONObject(value.optString("activeForm"))
                ?.let(ShareForm::from),
        )
    }

    suspend fun receive(uris: List<Uri>, text: String?): InboxShare =
        lock.withLock {
            withContext(Dispatchers.IO) {
                val unique = uris.distinct()
                require(unique.size <= 100) { "一次最多接收 100 个文件" }
                require(unique.isNotEmpty() || !text.isNullOrBlank()) { "分享内容为空" }
                require((text?.toByteArray()?.size ?: 0) <= 2 * 1024 * 1024) { "分享文本超过 2 MB" }
                check(root.isDirectory || root.mkdirs()) { "无法创建分享暂存目录" }
                check(root.listFiles().orEmpty().size < 20) { "请先处理已有的待分享内容" }
                val directory = directory(UUID.randomUUID().toString())
                check(directory.mkdir()) { "无法创建分享暂存目录" }
                try {
                    var total = 0L
                    val files =
                        unique.mapIndexed { index, uri ->
                            require(uri.scheme == "content") { "分享文件需要 content URI" }
                            val resolver = context.contentResolver
                            val name =
                                resolver
                                    .query(
                                        uri,
                                        arrayOf(OpenableColumns.DISPLAY_NAME),
                                        null,
                                        null,
                                        null,
                                    )
                                    ?.use { if (it.moveToFirst()) it.getString(0) else null }
                                    ?: "分享文件"
                            require(
                                name.isNotBlank() &&
                                    name !in setOf(".", "..") &&
                                    name.none { it == '/' || it == '\\' || it.code < 32 }
                            ) {
                                "分享文件名无效"
                            }
                            val folder = File(directory, index.toString()).apply { check(mkdir()) }
                            val target = File(folder, name)
                            checkNotNull(resolver.openInputStream(uri)) { "无法读取分享文件" }
                                .use { input ->
                                    FileOutputStream(target).use { output ->
                                        val buffer = ByteArray(64 * 1024)
                                        var count = 0L
                                        while (true) {
                                            currentCoroutineContext().ensureActive()
                                            val size = input.read(buffer)
                                            if (size < 0) break
                                            count += size
                                            total += size
                                            require(
                                                count <= 64L * 1024 * 1024 &&
                                                    total <= 128L * 1024 * 1024
                                            ) {
                                                "分享文件超出暂存大小限制"
                                            }
                                            output.write(buffer, 0, size)
                                        }
                                        output.fd.sync()
                                    }
                                }
                            JSONObject()
                                .put("path", "$index/$name")
                                .put("mime", resolver.getType(uri) ?: "application/octet-stream")
                        }
                    currentCoroutineContext().ensureActive()
                    val value =
                        JSONObject()
                            .put("files", JSONArray(files))
                            .put("text", text ?: JSONObject.NULL)
                            .put("submitting", false)
                            .put("created", System.currentTimeMillis())
                    write(directory, value)
                    decode(directory, value)
                } catch (error: Exception) {
                    directory.deleteRecursively()
                    throw error
                }
            }
        }

    suspend fun pending(): List<InboxShare> =
        lock.withLock {
            withContext(Dispatchers.IO) {
                root
                    .listFiles()
                    .orEmpty()
                    .filter {
                        !File(it, "manifest.json").exists() &&
                            !File(it, "manifest.json.bak").exists()
                    }
                    .forEach { check(it.deleteRecursively()) { "无法清理中断的暂存文件" } }
                root
                    .listFiles()
                    .orEmpty()
                    .filter {
                        File(it, "manifest.json").exists() || File(it, "manifest.json.bak").exists()
                    }
                    .map { it to read(it) }
                    .sortedBy { it.second.getLong("created") }
                    .map { decode(it.first, it.second) }
            }
        }

    /** Persist before publication; a restarted caller must review an uncertain submission. */
    suspend fun markSubmitting(id: String, submitting: Boolean, destination: String? = null) =
        lock.withLock {
            withContext(Dispatchers.IO) {
                val folder = directory(id)
                write(
                    folder,
                    read(folder)
                        .put("submitting", submitting)
                        .put("destination", destination ?: JSONObject.NULL),
                )
            }
        }

    suspend fun remove(id: String) =
        lock.withLock {
            withContext(Dispatchers.IO) { check(directory(id).deleteRecursively()) { "无法移除暂存分享" } }
        }

    private fun formKey(path: String, table: String) = JSONArray(listOf(path, table)).toString()

    suspend fun form(id: String, path: String, table: String): ShareForm? =
        lock.withLock {
            withContext(Dispatchers.IO) {
                read(directory(id))
                    .optJSONObject("forms")
                    ?.optJSONObject(formKey(path, table))
                    ?.let(ShareForm::from)
            }
        }

    suspend fun ensureForm(id: String, initial: ShareForm): ShareForm =
        lock.withLock {
            withContext(NonCancellable + Dispatchers.IO) {
                val folder = directory(id)
                val value = read(folder)
                val forms = value.optJSONObject("forms") ?: JSONObject()
                val key = formKey(initial.path, initial.table)
                val form = forms.optJSONObject(key)?.let(ShareForm::from) ?: initial
                forms.put(key, form.json())
                write(folder, value.put("forms", forms).put("activeForm", key))
                form
            }
        }

    suspend fun updateForm(
        id: String,
        path: String,
        table: String,
        draft: RecordDraft? = null,
        attachmentField: String? = null,
    ) =
        lock.withLock {
            withContext(NonCancellable + Dispatchers.IO) {
                val folder = directory(id)
                val value = read(folder)
                check(!value.getBoolean("submitting")) { "请先检查上次保存的结果" }
                val forms = value.getJSONObject("forms")
                val key = formKey(path, table)
                val form = ShareForm.from(forms.getJSONObject(key))
                forms.put(
                    key,
                    form
                        .copy(
                            revision = draft?.revision ?: form.revision,
                            changes = draft?.changes ?: form.changes,
                            attachmentField = attachmentField ?: form.attachmentField,
                        )
                        .json(),
                )
                write(folder, value)
            }
        }

    suspend fun clearForm(id: String, path: String, table: String) =
        lock.withLock {
            withContext(NonCancellable + Dispatchers.IO) {
                val folder = directory(id)
                val value = read(folder)
                val key = formKey(path, table)
                value.optJSONObject("forms")?.remove(key)
                if (value.optString("activeForm") == key) value.remove("activeForm")
                write(folder, value)
            }
        }

    private companion object {
        val lock = Mutex()
    }
}
