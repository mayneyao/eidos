package space.eidos.android

import androidx.activity.compose.setContent
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.lifecycle.viewModelScope
import java.io.File
import java.util.UUID
import kotlinx.coroutines.*
import org.json.JSONArray
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

class SpaceSwitchTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()

    @Test
    fun createsSwitchesRemembersActiveAndRecoversIsolatedDrafts(): Unit = runBlocking {
        val app = compose.activity.application
        val catalog = SpaceCatalog(app)
        val original = catalog.activeId()
        val suffix = UUID.randomUUID().toString()
        val first = catalog.create("资料甲-$suffix")
        val created = mutableListOf(first.id)
        val repository = SpaceRepository(app, first.id)
        val path = repository.create("", "相同文件", "markdown")
        repository.saveText(repository.readText(path).copy(text = "甲的内容"))
        repository.setFavorite(Favorite(path, "甲的收藏"), true)
        var model: EidosModel? = null
        try {
            compose.runOnUiThread {
                val isolated = EidosModel(app, repository)
                model = isolated
                compose.activity.setContent { EidosApp(isolated) }
            }
            compose.waitUntil(15_000) {
                model?.state?.value?.spaceId == first.id && model?.state?.value?.busy == false
            }
            compose.onNodeWithContentDescription("切换 Space").performClick()
            compose.onNodeWithText("新建 Space").performClick()
            compose.onNodeWithText("Space 名称").performTextInput("资料乙-$suffix")
            compose.onNodeWithText("创建 Space").performClick()
            compose.waitUntil(15_000) {
                model?.state?.value?.spaceName == "资料乙-$suffix" &&
                    model?.state?.value?.busy == false
            }
            val second = model!!.state.value.spaceId
            created.add(second)
            assertTrue(model!!.state.value.files.isEmpty())
            assertTrue(model!!.state.value.favorites.isEmpty())
            assertEquals(second, SpaceCatalog(app).activeId())
            val secondRepository = model!!.repository
            val secondPath = secondRepository.create("", "相同文件", "markdown")
            secondRepository.saveText(secondRepository.readText(secondPath).copy(text = "乙的内容"))
            compose.onNodeWithContentDescription("切换 Space").performClick()
            compose.onNodeWithText(first.name).performClick()
            compose.waitUntil(15_000) {
                model?.state?.value?.spaceId == first.id && model?.state?.value?.busy == false
            }
            assertEquals("甲的收藏", model!!.state.value.favorites.single().name)
            assertEquals("甲的内容", model!!.repository.readText(path).text)
            val file = repository.file(path)
            compose.runOnUiThread { model!!.open(file) }
            compose.waitUntil(15_000) {
                model?.state?.value?.document != null && model?.state?.value?.busy == false
            }
            compose.runOnUiThread {
                model!!.edit()
                model!!.textChanged("甲的未提交草稿")
                model!!.switchSpace(second)
            }
            compose.waitUntil(15_000) {
                model?.state?.value?.spaceId == second && model?.state?.value?.busy == false
            }
            assertEquals("乙的内容", model!!.repository.readText(path).text)
            assertFalse(model!!.repository.readText(path).recovered)
            val recovered = SpaceRepository(app, first.id).readText(path)
            assertTrue(recovered.recovered)
            assertEquals("甲的未提交草稿", recovered.text)
            assertNull(model!!.state.value.document)
            assertEquals("local", model!!.state.value.graft?.syncStatus)
            assertNull(model!!.state.value.graft?.remoteUrl)
            assertTrue(model!!.state.value.matches.isEmpty())
        } finally {
            compose.runOnUiThread { model?.viewModelScope?.cancel() }
            catalog.select(original)
            val preferences =
                app.getSharedPreferences("space-catalog", android.content.Context.MODE_PRIVATE)
            val list = JSONArray(preferences.getString("spaces", "[]"))
            val kept =
                (0 until list.length()).map(list::getJSONObject).filter {
                    it.getString("id") !in created
                }
            preferences.edit().putString("spaces", JSONArray(kept).toString()).commit()
            created.forEach {
                SpaceRepository(app, it).close()
                File(app.filesDir, "spaces/$it").deleteRecursively()
                File(app.filesDir, "drafts-$it").deleteRecursively()
                File(app.filesDir, "staging/$it").deleteRecursively()
                app.deleteSharedPreferences("space-$it")
            }
        }
    }
}
