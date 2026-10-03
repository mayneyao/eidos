package space.eidos.android

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.util.UUID
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class RuntimeDeviceTest {
    private val context
        get() = InstrumentationRegistry.getInstrumentation().targetContext

    @Test
    fun favoritesPersistAndUnavailableTargetsCanBeRemoved() = runBlocking {
        val repository = SpaceRepository(context)
        val folder = repository.create("", "favorite-test-${UUID.randomUUID()}", "folder")
        val target = java.io.File(context.filesDir, "spaces/personal/$folder")
        val favorite = Favorite(folder, "收藏的文件夹")
        try {
            repository.setFavorite(favorite, true)
            repository.setFavorite(favorite, true)
            assertEquals(1, SpaceRepository(context).favorites().count { it.key == favorite.key })
            assertTrue(repository.file(folder).directory)
            target.deleteRecursively()
            assertTrue(runCatching { repository.file(folder) }.isFailure)
            assertTrue(SpaceRepository(context).favorites().contains(favorite))
            repository.setFavorite(favorite, false)
            assertFalse(SpaceRepository(context).favorites().contains(favorite))
        } finally {
            repository.setFavorite(favorite, false)
            target.deleteRecursively()
        }
    }

    @Test
    fun realRuntimeCreatesEditsReopensAndRejectsStaleWrites() = runBlocking {
        val repository = SpaceRepository(context)
        val folder = repository.create("", "runtime-test-${UUID.randomUUID()}", "folder")
        try {
            val path = repository.create(folder, "资料", "eidos")
            val empty = repository.loadEidos(path)
            assertTrue(runCatching { repository.loadEidos(path, "deleted-table") }.isFailure)
            val title = checkNotNull(empty.table).labelFieldId
            repository.mutate(empty, null, mapOf(title to "来自 Android 的记录"))
            val reopened = SpaceRepository(context).loadEidos(path)
            assertEquals("来自 Android 的记录", reopened.rows.single().values[title])
            assertTrue(
                runCatching { repository.mutate(empty, null, mapOf(title to "过期写入")) }.isFailure
            )
            repository.mutate(reopened, reopened.rows.single(), mapOf(title to "离线修改"))
            val changed = repository.loadEidos(path, query = "离线")
            assertEquals("离线修改", changed.rows.single().values[title])
            repository.mutate(changed, changed.rows.single(), emptyMap(), delete = true)
            assertTrue(repository.loadEidos(path).rows.isEmpty())
        } finally {
            java.io.File(context.filesDir, "spaces/personal/$folder").deleteRecursively()
        }
    }

    @Test
    fun draftSurvivesRepositoryRecreationAndCommitPreservesContent() = runBlocking {
        val repository = SpaceRepository(context)
        val folder = repository.create("", "draft-test-${UUID.randomUUID()}", "folder")
        try {
            val path = repository.create(folder, "笔记", "markdown")
            val listed = repository.files(folder).single()
            assertEquals(path, listed.path)
            assertFalse(listed.path.contains(".."))
            val original = repository.readText(path)
            val text = "# 随身资料\n\n中文输入 🌱\n- [ ] 离线继续"
            repository.saveDraft(original.copy(text = text))
            val recovered = SpaceRepository(context).readText(path)
            assertTrue(recovered.recovered)
            assertEquals(text, recovered.text)
            repository.saveText(recovered)
            val saved = SpaceRepository(context).readText(path)
            assertFalse(saved.recovered)
            assertEquals(text, saved.text)
        } finally {
            java.io.File(context.filesDir, "spaces/personal/$folder").deleteRecursively()
        }
    }
}
