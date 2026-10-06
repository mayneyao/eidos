package space.eidos.android

import android.content.ContextWrapper
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.util.UUID
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import org.junit.Rule
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule

class SpaceDeletionTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()

    @Test fun confirmationCancellationPreservesLocalSpace() {
        val before = SpaceCatalog(compose.activity).spaces()
        compose.onNodeWithContentDescription("切换 Space").performClick()
        compose.onNodeWithText("删除此 Space 的本地数据").performClick()
        compose.onNodeWithText("验证身份并删除").assertExists()
        compose.onNodeWithText("取消").performClick()
        assertEquals(before, SpaceCatalog(compose.activity).spaces())
    }

    @Test fun noScreenLockCannotDelete() {
        val keyguard = compose.activity.getSystemService(android.app.KeyguardManager::class.java)
        org.junit.Assume.assumeFalse(keyguard.isDeviceSecure)
        val before = SpaceCatalog(compose.activity).spaces()
        compose.onNodeWithContentDescription("切换 Space").performClick()
        compose.onNodeWithText("删除此 Space 的本地数据").performClick()
        compose.onNodeWithText("验证身份并删除").performClick()
        compose.onNodeWithText("请先在手机系统设置中设置锁屏密码，再删除 Space").assertExists()
        assertEquals(before, SpaceCatalog(compose.activity).spaces())
    }
    @Test fun removesOnlyTargetFilesDraftsAndSyncMapping() = runBlocking {
        val app = InstrumentationRegistry.getInstrumentation().targetContext
        val prefix = "delete-test-${UUID.randomUUID()}-"
        val directory = File(app.cacheDir, prefix).apply { mkdirs() }
        val context = object : ContextWrapper(app) {
            override fun getFilesDir() = directory
            override fun getSharedPreferences(name: String, mode: Int) = app.getSharedPreferences(prefix + name, mode)
            override fun deleteSharedPreferences(name: String) = app.deleteSharedPreferences(prefix + name)
        }
        try {
            val catalog = SpaceCatalog(context)
            val target = catalog.getOrCreatePeerSpace("paired", "remote", "Downloaded")
            catalog.completePeerSpace("paired", "remote", target)
            val repository = SpaceRepository(context, target.id)
            repository.create("", "note", "markdown")
            val draft = File(directory, "drafts-${target.id}/draft.json")
            draft.parentFile!!.mkdirs(); draft.writeText("draft")
            val keep = File(directory, "spaces/personal/keep.md")
            keep.parentFile!!.mkdirs(); keep.writeText("keep")
            catalog.select(target.id)
            try { repository.deleteLocalSpace(); fail("Active Space must not be deleted") } catch (_: IllegalArgumentException) { }
            assertTrue(File(directory, "spaces/${target.id}/note.md").exists())
            catalog.select("personal")
            repository.deleteLocalSpace()
            assertFalse(File(directory, "spaces/${target.id}").exists())
            assertFalse(draft.exists())
            assertEquals("keep", keep.readText())
            assertFalse(SpaceCatalog(context).spaces().any { it.id == target.id })
            assertTrue(catalog.peerLocalSpaces().isEmpty())
            assertNotEquals(target.id, catalog.getOrCreatePeerSpace("paired", "remote", "Downloaded").id)
        } finally {
            directory.deleteRecursively()
            listOf("space-catalog", "peer-spaces", "peer-sync-times", "peer-downloads", "sync-profiles").forEach { context.deleteSharedPreferences(it) }
        }
    }
}
