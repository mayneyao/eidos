package space.eidos.android

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.util.UUID
import kotlinx.coroutines.runBlocking
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class RuntimeDeviceTest {
    private val context
        get() = InstrumentationRegistry.getInstrumentation().targetContext

    @Test
    fun sharingTargetsATableWithTodayWithoutQueryingItsRecords() = runBlocking {
        val repository = SpaceRepository(context)
        val folder = repository.create("", "share-today-${UUID.randomUUID()}", "folder")
        val root = java.io.File(context.filesDir, "spaces/personal")
        try {
            val path = repository.create(folder, "Share", "eidos")
            val file = java.io.File(root, path)
            val original = repository.loadEidos(path)
            val table = checkNotNull(original.table)
            val field =
                JSONObject()
                    .put("clientKey", "today")
                    .put("name", "Today")
                    .put("kind", "formula")
                    .put("position", "10")
                    .put("definition", JSONObject().put("sourceText", "TODAY()").put("resultType", "date"))
            val plan =
                NativeRuntime.call(
                    file.path,
                    "web:preflightSchema",
                    JSONObject()
                        .put("expectedRevision", original.revision)
                        .put(
                            "change",
                            JSONObject().put("kind", "create-field").put("tableId", table.id).put("field", field),
                        ),
                )
            NativeRuntime.call(
                file.path,
                "web:mutateSchema",
                JSONObject()
                    .put("expectedRevision", original.revision)
                    .put("planToken", plan.getString("planToken"))
                    .put("actionsHash", plan.getString("actionsHash")),
            )

            val destination = repository.loadEidos(path, table.id, includeRecords = false)
            val today = destination.fields.single { it.name == "Today" }
            assertEquals(table.id, destination.table?.id)
            assertTrue(destination.rows.isEmpty())
            repository.mutate(destination, null, mapOf(table.labelFieldId to "Shared text"))

            val rows =
                NativeRuntime.call(
                    file.path,
                    "queryRows",
                    JSONObject()
                        .put("tableId", table.id)
                        .put("query", JSONObject())
                        .put("limit", 10)
                        .put(
                            "calendar",
                            JSONObject().put("timeZone", "UTC").put("timeZoneData", "2026f").put("weekStartsOn", 1),
                        )
                        .put("referenceInstant", "2026-11-20T03:00:00.000Z")
                        .put(
                            "projection",
                            JSONObject()
                                .put("fields", JSONArray(listOf(table.labelFieldId, today.id)))
                                .put("resolveRelations", JSONArray()),
                        ),
                ).getJSONArray("rows")
            val values = rows.getJSONObject(0).getJSONArray("values")
            assertEquals("Shared text", values.getString(0))
            assertEquals("2026-11-20", values.getString(1))
        } finally {
            repository.close()
            java.io.File(root, folder).deleteRecursively()
        }
    }

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
