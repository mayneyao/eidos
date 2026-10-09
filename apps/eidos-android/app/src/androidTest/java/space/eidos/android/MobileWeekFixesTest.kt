package space.eidos.android

import androidx.activity.compose.setContent
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import java.io.File
import java.util.UUID
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

class MobileWeekFixesTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()

    @Test
    fun fileDeletionRequiresConfirmationAndProtectsDrafts() = runBlocking {
        val app = compose.activity.application
        val id = "delete-${UUID.randomUUID()}"
        val repository = SpaceRepository(app, id)
        val path = repository.create("", "Note", "markdown")
        repository.setFavorite(Favorite(path, "Note.md"), true)
        val document = repository.readText(path)
        repository.saveDraft(document.copy(text = "unsaved"))
        assertTrue(runCatching { repository.trash(path) }.isFailure)
        assertTrue(repository.file(path).markdown)
        repository.saveText(document.copy(text = "saved"))
        val file = repository.file(path)
        var requested = false
        try {
            compose.runOnUiThread {
                compose.activity.setContent {
                    MaterialTheme {
                        FileRow(file, true, {}, {}, false, {}, {}, PluginOpenWithRegistry(emptyList()), { _, _ -> }, rename = {}, trash = { requested = true })
                    }
                }
            }
            compose.onNodeWithContentDescription("更多 Note.md").performClick()
            compose.onNodeWithText("删除").performClick()
            compose.onNodeWithText("取消").performClick()
            compose.runOnIdle { assertFalse(requested) }
            compose.onNodeWithContentDescription("更多 Note.md").performClick()
            compose.onNodeWithText("删除").performClick()
            compose.onNodeWithText("删除").performClick()
            compose.runOnIdle { assertTrue(requested) }
            repository.trash(path)
            assertTrue(repository.files("").isEmpty())
            assertTrue(repository.favorites().isEmpty())
            val payload = File(app.filesDir, "trash-$id").listFiles()!!.single().resolve("payload")
            assertEquals("saved", payload.readText())
        } finally {
            compose.runOnUiThread { compose.activity.setContent {} }
            repository.close()
            File(app.filesDir, "spaces/$id").deleteRecursively()
            File(app.filesDir, "trash-$id").deleteRecursively()
        }
    }
}
