package space.eidos.android

import android.app.Application
import androidx.lifecycle.viewModelScope
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.util.UUID
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.first
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class ShareFormDraftTest {
    @Test
    fun recoveredShareCannotAdoptNewRevisionAtSubmission(): Unit = runBlocking {
        val app =
            InstrumentationRegistry.getInstrumentation().targetContext.applicationContext
                as Application
        val id = "share-stale-${UUID.randomUUID()}"
        val repo = SpaceRepository(app, id)
        val path = repo.create("", "记录", "eidos")
        val original = repo.loadEidos(path)
        val table = checkNotNull(original.table)
        val inbox = ShareInbox(app, id)
        val share = inbox.receive(emptyList(), "分享文本")
        val values = JSONObject().put(table.labelFieldId, "未提交分享").toString()
        inbox.ensureForm(share.id, ShareForm(path, table.id, original.revision, values, null))
        repo.mutate(original, null, mapOf(table.labelFieldId to "后来新增"))
        var model: EidosModel? = null
        try {
            val restored = withContext(Dispatchers.Main) { EidosModel(app, repo) }
            model = restored
            withTimeout(15_000) {
                restored.state.first { !it.busy && it.pendingShares.isNotEmpty() }
            }
            withContext(Dispatchers.Main) { restored.openShareTable(path, table.id) }
            withTimeout(15_000) { restored.state.first { !it.busy && it.shareRecord != null } }
            val result = runCatching {
                withContext(Dispatchers.Main) {
                    restored.saveShareRecord(mapOf(table.labelFieldId to "未提交分享"))
                }
            }
            assertTrue(result.isFailure)
            assertEquals("后来新增", repo.loadEidos(path).rows.single().values[table.labelFieldId])
            assertEquals(original.revision, inbox.pending().single().form?.revision)
            assertEquals(values, inbox.pending().single().form?.changes)
        } finally {
            withContext(Dispatchers.Main) { model?.viewModelScope?.cancel() }
            inbox.remove(share.id)
            repo.close()
            File(app.filesDir, "spaces/$id").deleteRecursively()
        }
    }

    @Test
    fun isolatesTargetsPreservesRevisionAndMergesAttachmentSelection(): Unit = runBlocking {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val id = "form-${UUID.randomUUID()}"
        val inbox = ShareInbox(context, id)
        val share = inbox.receive(emptyList(), "original")
        try {
            val first = ShareForm("one.eidos", "table", "old-revision", "{}", "first-file-field")
            inbox.ensureForm(share.id, first)
            val values = JSONObject().put("title", "draft").put("empty", JSONObject.NULL).toString()
            inbox.updateForm(
                share.id,
                first.path,
                first.table,
                draft = RecordDraft(first.revision, values),
            )
            inbox.updateForm(
                share.id,
                first.path,
                first.table,
                attachmentField = "second-file-field",
            )
            inbox.updateForm(
                share.id,
                first.path,
                first.table,
                draft = RecordDraft(first.revision, values),
            )
            val second = first.copy(path = "two.eidos", revision = "another-revision")
            inbox.ensureForm(share.id, second)
            assertEquals("{}", inbox.form(share.id, second.path, second.table)?.changes)
            val restored =
                ShareInbox(context, id).ensureForm(share.id, first.copy(revision = "new-revision"))
            assertEquals("old-revision", restored.revision)
            assertEquals(values, restored.changes)
            assertEquals("second-file-field", restored.attachmentField)
            assertEquals(restored, ShareInbox(context, id).pending().single().form)
            inbox.clearForm(share.id, first.path, first.table)
            assertNull(inbox.form(share.id, first.path, first.table))
            assertNotNull(inbox.form(share.id, second.path, second.table))
            inbox.markSubmitting(share.id, true)
            assertTrue(
                runCatching {
                        inbox.updateForm(
                            share.id,
                            second.path,
                            second.table,
                            draft = RecordDraft("revision", "{}"),
                        )
                    }
                    .isFailure
            )
        } finally {
            inbox.remove(share.id)
        }
    }
}
