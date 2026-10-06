package space.eidos.android

import android.database.sqlite.SQLiteDatabase
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.util.UUID
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class PeerDownloadValidationTest {
    @Test
    fun desktopVirtualTableFixtureRemainsByteIdentical() = runBlocking {
        val app = InstrumentationRegistry.getInstrumentation().targetContext
        val fixture = File(app.cacheDir, "peer-validation-fixture.eidos")
        org.junit.Assume.assumeTrue("Supply a Desktop virtual table fixture", fixture.exists())
        val id = "peer-virtual-${UUID.randomUUID()}"
        val repository = SpaceRepository(app, id)
        val root = File(app.filesDir, "spaces/$id").apply { mkdirs() }
        val file = fixture.copyTo(File(root, "files.eidos"))
        try {
            val before = file.readBytes()
            repository.finalizePeerDownload()
            assertArrayEquals(before, file.readBytes())
            assertTrue(SpaceCatalog(app).downloadWarnings(id).isEmpty())
        } finally {
            repository.close()
            repository.discardPendingClone()
        }
    }
    @Test
    fun downloadDoesNotInterpretDatabaseContents() = runBlocking {
        val app = InstrumentationRegistry.getInstrumentation().targetContext
        val id = "peer-validation-${UUID.randomUUID()}"
        val repository = SpaceRepository(app, id)
        val root = File(app.filesDir, "spaces/$id").apply { mkdirs() }
        val file = File(root, "files.eidos")
        try {
            NativeRuntime.call(file.path, "create", JSONObject().put("title", "Files"))
            NativeRuntime.close()
            SQLiteDatabase.openDatabase(file.path, null, SQLiteDatabase.OPEN_READWRITE).use { db ->
                db.execSQL("INSERT INTO eidos__features VALUES ('vtab:fs_meta','1',1,'{}')")
            }
            val before = file.readBytes()
            val report = NativeRuntime.call(file.path, "validate", JSONObject().put("level", "full").put("diagnosticsLimit", 100))
            assertFalse(report.getBoolean("valid"))
            assertEquals("file-feature-unsupported", report.getJSONArray("diagnostics").getJSONObject(0).getString("code"))
            repository.finalizePeerDownload()
            assertArrayEquals(before, file.readBytes())
            SQLiteDatabase.openDatabase(file.path, null, SQLiteDatabase.OPEN_READWRITE).use { db ->
                db.execSQL("PRAGMA application_id=0")
            }
            repository.finalizePeerDownload()
            file.writeText("not a SQLite database")
            repository.finalizePeerDownload()
            assertEquals("not a SQLite database", file.readText())
            // Opaque sync must not hide a document error when the Runtime is used.
            assertTrue(runCatching { NativeRuntime.call(file.path, "validate", JSONObject().put("level", "identity")) }
                .fold({ !it.getBoolean("valid") }, { true }))
        } finally {
            repository.close()
            repository.discardPendingClone()
        }
    }

    @Test
    fun downloadStillRejectsSymbolicLinks() = runBlocking {
        val app = InstrumentationRegistry.getInstrumentation().targetContext
        val id = "peer-paths-${UUID.randomUUID()}"
        val repository = SpaceRepository(app, id)
        val root = File(app.filesDir, "spaces/$id").apply { mkdirs() }
        try {
            java.nio.file.Files.createSymbolicLink(File(root, "linked.eidos").toPath(), app.cacheDir.toPath())
            assertTrue(runCatching { repository.finalizePeerDownload() }.isFailure)
        } finally {
            java.nio.file.Files.deleteIfExists(File(root, "linked.eidos").toPath())
            repository.close()
            repository.discardPendingClone()
        }
    }

    @Test
    fun graftTotalsApplyOnlyToTheActiveTransferStage() {
        val receiving = PeerSyncProgress(stage = "下载数据", downloadBytes = 25, downloadTotal = 100, downloadPlanned = true)
        assertNull(receiving.copy(downloadPlanned = false).transferFraction())
        assertEquals(0.25f, receiving.transferFraction()!!)
        assertNull(receiving.copy(downloadTotal = null).transferFraction())
        assertNull(receiving.copy(downloadTotal = 0).transferFraction())
        assertNull(receiving.copy(stage = "正在完成下载").transferFraction())
        assertNull(receiving.copy(stage = "获取清单").transferFraction())
        assertNull(receiving.copy(stage = "写入文件").transferFraction())
        assertEquals(1f, receiving.copy(downloadBytes = 120).transferFraction()!!)
        assertEquals(0.5f, receiving.copy(stage = "发送本机版本", uploadBytes = 50, uploadTotal = 100, uploadPlanned = true).transferFraction()!!)
    }
}
