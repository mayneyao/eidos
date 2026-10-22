package space.eidos.android

import android.view.WindowManager
import androidx.activity.compose.setContent
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.lifecycle.viewModelScope
import java.io.File
import java.util.UUID
import kotlinx.coroutines.cancel
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

class FavoriteDeletionTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()

    @Test fun externalDeletionRemovesFileFolderAndTableFavoritesFromTheBrowser() = runBlocking {
        val app = compose.activity.application
        val id = "favorite-external-${UUID.randomUUID()}"
        val repository = SpaceRepository(app, id)
        val folder = repository.create("", "Removed", "folder")
        val note = repository.create(folder, "Gone", "markdown")
        val database = repository.create(folder, "Records", "eidos")
        val table = checkNotNull(repository.loadEidos(database).table)
        NativeRuntime.close()
        val keep = repository.create("", "Keep", "markdown")
        val keepFavorite = Favorite(keep, "Keep.md")
        val favorites = listOf(Favorite(folder, "Removed"), Favorite(note, "Gone.md"),
            Favorite(database, "Gone table", table.id), keepFavorite)
        favorites.forEach { repository.setFavorite(it, true) }
        lateinit var model: EidosModel
        try {
            compose.runOnUiThread {
                compose.activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                model = EidosModel(app, repository)
                compose.activity.setContent { EidosApp(model) }
            }
            compose.waitUntil(15_000) { !model.state.value.busy && model.state.value.favorites.size == 4 }
            // A sync checkout or another filesystem client bypasses trash().
            assertTrue(File(app.filesDir, "spaces/$id/$folder").deleteRecursively())
            compose.runOnUiThread { model.foregroundStarted() }
            compose.waitUntil(15_000) { !model.state.value.busy }
            assertEquals(listOf(keepFavorite), model.state.value.favorites)
            compose.onNodeWithText("Gone.md").assertDoesNotExist()
            compose.onNodeWithText("Gone table").assertDoesNotExist()
            compose.onNodeWithText("Removed").assertDoesNotExist()
            compose.onAllNodesWithText("Keep.md").onFirst().assertIsDisplayed()

            // Toggling an available favorite must not restore stale saved paths.
            compose.runOnUiThread { model.toggleFavorite(keepFavorite) }
            compose.waitUntil(15_000) { !model.state.value.busy }
            assertTrue(model.state.value.favorites.isEmpty())
            compose.runOnUiThread { model.toggleFavorite(keepFavorite) }
            compose.waitUntil(15_000) { !model.state.value.busy }
            assertEquals(listOf(keepFavorite), model.state.value.favorites)
        } finally {
            compose.runOnUiThread { model.viewModelScope.cancel(); compose.activity.setContent {} }
            repository.close()
            File(app.filesDir, "spaces/$id").deleteRecursively()
            app.deleteSharedPreferences("space-$id")
        }
    }

    @Test fun deletingFromFavoritesUpdatesTheVisibleListImmediately() = runBlocking {
        val app = compose.activity.application
        val id = "favorite-trash-${UUID.randomUUID()}"
        val repository = SpaceRepository(app, id)
        val note = repository.create("", "Gone", "markdown")
        repository.setFavorite(Favorite(note, "Gone.md"), true)
        lateinit var model: EidosModel
        try {
            compose.runOnUiThread {
                compose.activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                model = EidosModel(app, repository)
                compose.activity.setContent { EidosApp(model) }
            }
            compose.waitUntil(15_000) { !model.state.value.busy && model.state.value.favorites.size == 1 }
            compose.onAllNodesWithContentDescription("更多 Gone.md").onFirst().performClick()
            compose.onNodeWithText("删除").performClick()
            compose.onNodeWithText("删除").performClick()
            compose.waitUntil(15_000) { !model.state.value.busy && model.state.value.favorites.isEmpty() }
            compose.onNodeWithText("Gone.md").assertDoesNotExist()
            assertTrue(repository.favorites().isEmpty())
            assertFalse(File(app.filesDir, "spaces/$id/$note").exists())
        } finally {
            compose.runOnUiThread { model.viewModelScope.cancel(); compose.activity.setContent {} }
            repository.close()
            File(app.filesDir, "spaces/$id").deleteRecursively()
            File(app.filesDir, "trash-$id").deleteRecursively()
            app.deleteSharedPreferences("space-$id")
        }
    }
}
