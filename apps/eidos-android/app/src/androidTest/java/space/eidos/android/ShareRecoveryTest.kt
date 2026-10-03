package space.eidos.android

import androidx.activity.compose.setContent
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.core.content.FileProvider
import androidx.lifecycle.viewModelScope
import java.io.File
import java.util.UUID
import kotlinx.coroutines.*
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

class ShareRecoveryTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()

    @Test
    fun restoresOwnedBytesAfterSourceDisappearsAndReviewsInterruptedSubmission(): Unit =
        runBlocking {
            val app = compose.activity.application
            val id = "share-recovery-${UUID.randomUUID()}"
            val repo = SpaceRepository(app, id)
            val inbox = ShareInbox(app, id)
            val fixture = File(app.cacheDir, "test-share/$id").apply { mkdirs() }
            val original = File(fixture, "图片.png").apply { writeBytes(byteArrayOf(1, 3, 5, 7)) }
            val uri = FileProvider.getUriForFile(app, "${app.packageName}.testshare", original)
            var model: EidosModel? = null
            fun reopen() {
                compose.runOnUiThread {
                    model?.viewModelScope?.cancel()
                    compose.activity.setContent {}
                }
                compose.waitForIdle()
                compose.runOnUiThread {
                    val fresh = EidosModel(app, repo)
                    model = fresh
                    compose.activity.setContent { EidosApp(fresh) }
                }
                compose.waitUntil(15_000) {
                    model?.state?.value?.pendingShares?.isNotEmpty() == true &&
                        model?.state?.value?.busy == false
                }
            }
            try {
                val received = inbox.receive(listOf(uri), "随附文字")
                assertEquals("image/png", app.contentResolver.getType(received.files.single()))
                assertTrue(original.delete())
                val restored = ShareInbox(app, id).pending().single()
                assertArrayEquals(
                    byteArrayOf(1, 3, 5, 7),
                    app.contentResolver.openInputStream(restored.files.single())!!.use {
                        it.readBytes()
                    },
                )
                assertTrue(ShareInbox(app, "$id-other").pending().isEmpty())
                reopen()
                compose.onNodeWithText("保存到此文件夹").performClick()
                compose.waitUntil(15_000) {
                    model?.state?.value?.pendingShares?.isEmpty() == true &&
                        model?.state?.value?.busy == false
                }
                assertArrayEquals(
                    byteArrayOf(1, 3, 5, 7),
                    File(app.filesDir, "spaces/$id/收件箱/图片.png").readBytes(),
                )
                assertTrue(ShareInbox(app, id).pending().isEmpty())
                val interrupted = inbox.receive(emptyList(), "需要检查的内容")
                inbox.markSubmitting(interrupted.id, true, "收件箱")
                reopen()
                compose.onNodeWithText("检查上次分享的保存结果").assertIsDisplayed()
                compose.onNodeWithText("先检查文件").performClick()
                compose.waitUntil(15_000) {
                    model?.state?.value?.shareInboxVisible == false &&
                        model?.state?.value?.busy == false
                }
                assertTrue(inbox.pending().single().submitting)
                assertEquals("收件箱", inbox.pending().single().destination)
                compose.onNodeWithContentDescription("切换 Space").performClick()
                compose.onNodeWithText("待处理分享（1）").performClick()
                compose.onNodeWithText("仍要重新保存").performClick()
                compose.waitUntil(15_000) {
                    model?.state?.value?.pendingShares?.singleOrNull()?.submitting == false &&
                        model?.state?.value?.busy == false
                }
                assertFalse(inbox.pending().single().submitting)
                compose.runOnUiThread { model!!.cancelShare() }
                compose.waitUntil(15_000) {
                    model?.state?.value?.pendingShares?.isEmpty() == true &&
                        model?.state?.value?.busy == false
                }
                assertTrue(inbox.pending().isEmpty())
            } finally {
                compose.runOnUiThread { model?.viewModelScope?.cancel() }
                inbox.pending().forEach { inbox.remove(it.id) }
                repo.close()
                fixture.deleteRecursively()
                File(app.filesDir, "spaces/$id").deleteRecursively()
            }
        }

    @Test
    fun failedCopyPublishesNoPartialShare(): Unit = runBlocking {
        val app = compose.activity.application
        val inbox = ShareInbox(app, "share-failure-${UUID.randomUUID()}")
        val fixture =
            File(app.cacheDir, "test-share/failure-${UUID.randomUUID()}").apply { mkdirs() }
        val valid = File(fixture, "valid.bin").apply { writeBytes(byteArrayOf(1, 2)) }
        fun uri(file: File) = FileProvider.getUriForFile(app, "${app.packageName}.testshare", file)
        try {
            val result = runCatching {
                inbox.receive(listOf(uri(valid), uri(File(fixture, "missing.bin"))), "caption")
            }
            assertTrue(result.isFailure)
            assertTrue(inbox.pending().isEmpty())
            assertTrue(valid.exists())
        } finally {
            fixture.deleteRecursively()
        }
    }

    @Test
    fun partialPublicationKeepsStagedBytesForReview(): Unit = runBlocking {
        val app = compose.activity.application
        val id = "share-partial-${UUID.randomUUID()}"
        val inbox = ShareInbox(app, id)
        val repo = SpaceRepository(app, id)
        val fixture = File(app.cacheDir, "test-share/$id").apply { mkdirs() }
        val good = File(fixture, "good.bin").apply { writeBytes(byteArrayOf(7)) }
        val rejected = File(fixture, ".hidden").apply { writeBytes(byteArrayOf(9)) }
        fun uri(file: File) = FileProvider.getUriForFile(app, "${app.packageName}.testshare", file)
        val received = inbox.receive(listOf(uri(good), uri(rejected)), null)
        var model: EidosModel? = null
        try {
            compose.runOnUiThread { model = EidosModel(app, repo) }
            compose.waitUntil(15_000) {
                model?.state?.value?.pendingShares?.isNotEmpty() == true &&
                    model?.state?.value?.busy == false
            }
            compose.runOnUiThread { model!!.saveShare() }
            compose.waitUntil(15_000) {
                model?.state?.value?.error != null && model?.state?.value?.busy == false
            }
            assertTrue(File(app.filesDir, "spaces/$id/收件箱/good.bin").exists())
            val kept = inbox.pending().single()
            assertEquals(received.id, kept.id)
            assertTrue(kept.submitting)
            assertArrayEquals(
                byteArrayOf(9),
                app.contentResolver.openInputStream(kept.files[1])!!.use { it.readBytes() },
            )
        } finally {
            compose.runOnUiThread { model?.viewModelScope?.cancel() }
            inbox.pending().forEach { inbox.remove(it.id) }
            repo.close()
            fixture.deleteRecursively()
            File(app.filesDir, "spaces/$id").deleteRecursively()
        }
    }
}
