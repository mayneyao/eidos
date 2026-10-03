package space.eidos.android

import android.content.Context
import android.util.AtomicFile
import java.io.File
import java.security.MessageDigest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

data class RecordDraft(val revision: String, val changes: String)

interface RecordDraftStorage {
    suspend fun load(path: String, table: String, row: String?): RecordDraft?

    suspend fun save(path: String, table: String, row: String?, draft: RecordDraft)

    suspend fun clear(path: String, table: String, row: String?)
}

/** Drafts are private app state, never synchronized as Space content. */
class RecordDraftStore(context: Context, spaceId: String) : RecordDraftStorage {
    private val root = File(context.filesDir, "record-drafts")
    private val space = spaceId

    private fun file(path: String, table: String, row: String?): AtomicFile {
        val key = JSONArray(listOf(space, path, table, row ?: JSONObject.NULL)).toString()
        val hash =
            MessageDigest.getInstance("SHA-256").digest(key.toByteArray()).joinToString("") {
                "%02x".format(it)
            }
        check(root.isDirectory || root.mkdirs()) { "无法创建记录草稿目录" }
        return AtomicFile(File(root, "$hash.json"))
    }

    override suspend fun load(path: String, table: String, row: String?): RecordDraft? =
        lock.withLock {
            withContext(Dispatchers.IO) {
                val file = file(path, table, row)
                if (!file.baseFile.exists() && !File(file.baseFile.path + ".bak").exists())
                    return@withContext null
                val json =
                    JSONObject(file.openRead().use { it.readBytes().toString(Charsets.UTF_8) })
                RecordDraft(json.getString("revision"), json.getJSONObject("changes").toString())
            }
        }

    override suspend fun save(path: String, table: String, row: String?, draft: RecordDraft) =
        lock.withLock {
            withContext(NonCancellable + Dispatchers.IO) {
                val bytes =
                    JSONObject()
                        .put("revision", draft.revision)
                        .put("changes", JSONObject(draft.changes))
                        .toString()
                        .toByteArray()
                val file = file(path, table, row)
                val stream = file.startWrite()
                try {
                    stream.write(bytes)
                    file.finishWrite(stream)
                } catch (error: Exception) {
                    file.failWrite(stream)
                    throw error
                }
            }
        }

    override suspend fun clear(path: String, table: String, row: String?) =
        lock.withLock {
            withContext(NonCancellable + Dispatchers.IO) {
                val target = file(path, table, row)
                target.delete()
                check(!target.baseFile.exists()) { "无法清除记录草稿" }
            }
        }

    private companion object {
        val lock = Mutex()
    }
}
