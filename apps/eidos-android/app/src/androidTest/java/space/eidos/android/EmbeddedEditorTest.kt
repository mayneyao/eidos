package space.eidos.android

import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import androidx.activity.compose.setContent
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.lifecycle.viewModelScope
import java.io.File
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.cancel
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Rule
import org.junit.Test

class EmbeddedEditorTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()
    private var previousHardwareKeyboardIme: String? = null

    @Before
    fun enableSoftwareKeyboardForViewportChecks() {
        val instrumentation =
            androidx.test.platform.app.InstrumentationRegistry.getInstrumentation()
        previousHardwareKeyboardIme =
            android.provider.Settings.Secure.getString(
                instrumentation.targetContext.contentResolver,
                "show_ime_with_hard_keyboard",
            )
        instrumentation.uiAutomation
            .executeShellCommand("settings put secure show_ime_with_hard_keyboard 1")
            .use { android.os.ParcelFileDescriptor.AutoCloseInputStream(it).readBytes() }
    }

    @After
    fun restoreSoftwareKeyboardPreference() {
        val command =
            previousHardwareKeyboardIme?.let {
                "settings put secure show_ime_with_hard_keyboard $it"
            } ?: "settings delete secure show_ime_with_hard_keyboard"
        androidx.test.platform.app.InstrumentationRegistry.getInstrumentation()
            .uiAutomation
            .executeShellCommand(command)
            .use { android.os.ParcelFileDescriptor.AutoCloseInputStream(it).readBytes() }
    }

    @Test
    fun fileRoutesKeepActionsAndNewViewOutsideScrollingTabs() {
        val app = compose.activity.application
        val id = "file-actions-" + UUID.randomUUID()
        val repository = SpaceRepository(app, id)
        val root = File(app.filesDir, "spaces/$id")
        lateinit var model: EidosModel
        try {
            val paths = runBlocking { listOf(repository.create("", "Menu note", "markdown"), repository.create("", "Menu data", "eidos")) }
            compose.runOnUiThread {
                model = EidosModel(app, repository)
                compose.activity.setContent { EidosApp(model) }
            }
            compose.waitUntil(15000) { !model.state.value.busy }
            for (path in paths) {
                compose.runOnUiThread { model.open(runBlocking { repository.file(path) }) }
                waitJs("typeof window.eidosFlush === 'function'")
                compose.waitUntil(15000) {
                    compose.onAllNodes(hasContentDescription("文件操作") and isEnabled()).fetchSemanticsNodes().isNotEmpty()
                }
                compose.onNodeWithContentDescription("文件操作").assertIsEnabled().performClick()
                compose.onNodeWithText("打开方式").assertExists()
                compose.onNodeWithText("收藏").performClick()
                compose.waitUntil(15000) { model.state.value.favorites.any { it.path == path } }
                compose.onNodeWithContentDescription("文件操作").performClick()
                compose.onNodeWithText("取消收藏").performClick()
                compose.waitUntil(15000) { model.state.value.favorites.none { it.path == path } }
                if (path.endsWith(".eidos")) {
                    assertEquals("true", js("document.querySelector('[aria-label=新建视图]')?.closest('.mobile-view-tabs') === null"))
                    createMobileView("gallery")
                    waitJs("document.querySelector('.mobile-view-switcher')?.textContent.includes('画廊') === true")
                }
                compose.onNodeWithContentDescription("返回文件").performClick()
                compose.waitUntil(15000) { model.state.value.webFile == null }
            }
        } finally {
            compose.runOnUiThread { compose.activity.setContent {}; model.viewModelScope.cancel() }
            runBlocking { repository.close() }
            root.deleteRecursively()
        }
    }

    @Test
    fun feedImagesUseDocumentPathsAndResourceErrorsDoNotDisableEditor() {
        val app = compose.activity.application
        val id = "feed-images-" + UUID.randomUUID()
        val repository = SpaceRepository(app, id)
        val root = File(app.filesDir, "spaces/$id")
        val path = runBlocking { repository.create("", "Feed images", "eidos") }
        val imageFile = File(root, "assets/photo.png")
        imageFile.parentFile!!.mkdirs()
        val bitmap =
            android.graphics.Bitmap.createBitmap(2, 2, android.graphics.Bitmap.Config.ARGB_8888)
        imageFile.outputStream().use {
            bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it)
        }
        bitmap.recycle()
        runBlocking {
            val page = repository.loadEidos(path)
            val table = checkNotNull(page.table)
            val content = page.fields.single { it.name == "笔记" }.id
            repository.mutate(
                page,
                null,
                mapOf(
                    table.labelFieldId to "Image article",
                    content to "![Local](assets/photo.png)\n\n![Missing](assets/missing.png)",
                ),
            )
            val revision = repository.loadEidos(path).revision
            val plan =
                NativeRuntime.call(
                    File(root, path).path,
                    "web:preflightSchema",
                    org.json
                        .JSONObject()
                        .put("expectedRevision", revision)
                        .put(
                            "change",
                            org.json
                                .JSONObject()
                                .put("kind", "set-table-settings")
                                .put("tableId", table.id)
                                .put(
                                    "settings",
                                    org.json.JSONObject().put("contentFieldId", content),
                                ),
                        ),
                )
            NativeRuntime.call(
                File(root, path).path,
                "web:mutateSchema",
                org.json
                    .JSONObject()
                    .put("expectedRevision", revision)
                    .put("planToken", plan.getString("planToken"))
                    .put("actionsHash", plan.getString("actionsHash")),
            )
        }
        lateinit var model: EidosModel
        try {
            compose.runOnUiThread {
                model = EidosModel(app, repository)
                compose.activity.setContent { EidosApp(model) }
            }
            compose.waitUntil(15000) { !model.state.value.busy }
            compose.runOnUiThread { model.open(runBlocking { repository.file(path) }) }
            waitJs("document.querySelector('.mobile-view-switcher') !== null")
            createMobileView("feed")
            waitJs(
                "document.querySelector('[data-eidos-file-feed-row] img[alt=Local]')?.naturalWidth === 2"
            )
            assertEquals(
                "true",
                js("document.querySelector('img[alt=Local]').src.includes('/document/')"),
            )
            assertEquals(
                "false",
                js(
                    "performance.getEntriesByType('resource').some(r=>r.name.endsWith('/editor/assets/photo.png'))"
                ),
            )
            waitJs("document.querySelector('img[alt=Missing]')?.complete === true")
            compose.onNodeWithText("编辑器加载失败，请返回文件后重新打开。").assertDoesNotExist()
            // A failed image under the shell namespace must also remain a local error.
            js(
                "(()=>{const i=new Image();i.onerror=()=>window.testImageFailed=true;i.src='/editor/assets/missing-image.png';document.body.append(i)})()"
            )
            waitJs("window.testImageFailed === true")
            compose.onNodeWithText("编辑器加载失败，请返回文件后重新打开。").assertDoesNotExist()
            // Missing application code remains fatal; do not hide genuine startup failures.
            js(
                "(()=>{const s=document.createElement('script');s.src='/editor/assets/missing-module.js';document.head.append(s)})()"
            )
            compose.waitUntil(15000) {
                compose.onAllNodesWithText("编辑器加载失败，请返回文件后重新打开。").fetchSemanticsNodes().isNotEmpty()
            }
        } finally {
            compose.runOnUiThread { model.viewModelScope.cancel() }
            runBlocking { repository.close() }
            root.deleteRecursively()
            app.deleteSharedPreferences("space-$id")
        }
    }

    @Test
    fun shareDraftsFavoritesAndLocalLinksUseSharedEditor() {
        val app = compose.activity.application
        app.getSharedPreferences("editor", 0).edit().putBoolean("web", false).commit()
        val id = "shared-entry-" + UUID.randomUUID()
        val repository = SpaceRepository(app, id)
        val root = File(app.filesDir, "spaces/$id")
        val path = runBlocking { repository.create("", "Share", "eidos") }
        val page = runBlocking { repository.loadEidos(path) }
        val table = checkNotNull(page.table)
        val note = runBlocking { repository.create("", "Source", "markdown") }
        File(root, note).writeText("[Open data](Share.eidos)")
        lateinit var model: EidosModel
        try {
            compose.runOnUiThread {
                model = EidosModel(app, repository)
                compose.activity.setContent { EidosApp(model) }
            }
            compose.waitUntil(15000) { !model.state.value.busy }
            compose.runOnUiThread { model.receiveShare(emptyList(), "Shared original") }
            compose.waitUntil(15000) {
                !model.state.value.busy && model.state.value.pendingShares.isNotEmpty()
            }
            compose.runOnUiThread { model.openShareTable(path, table.id) }
            waitJs("document.querySelector('textarea[aria-label=标题]')?.value === 'Shared original'")
            compose.runOnUiThread { findWeb(compose.activity.window.decorView)!!.requestFocus() }
            js(
                "(()=>{const t=document.querySelector('textarea[aria-label=标题]');t.focus();Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,'Shared edited');t.dispatchEvent(new Event('input',{bubbles:true}));})()"
            )
            waitJs("document.querySelector('textarea[aria-label=标题]')?.title === 'Shared edited'")
            js("document.activeElement.blur()")
            compose.waitUntil(15000) {
                runBlocking {
                    ShareInbox(app, id)
                        .form(model.state.value.pendingShares.first().inboxId, path, table.id)
                        ?.changes
                        ?.contains("Shared edited") == true
                }
            }
            val firstShareSession = js("document.documentElement.dataset.editorSession")
            js("window.eidosLeave('back')")
            compose.waitUntil(15000) {
                !model.state.value.busy && model.state.value.shareRecord == null
            }
            assertTrue(runBlocking { repository.loadEidos(path).rows.isEmpty() })
            compose.runOnUiThread { model.openShareTable(path, table.id) }
            waitJs(
                "document.documentElement.dataset.editorSession !== $firstShareSession && document.querySelector('textarea[aria-label=标题]')?.value === 'Shared edited'"
            )
            js(
                "Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='保存记录').click()"
            )
            try {
                compose.waitUntil(15000) {
                    model.state.value.pendingShares.isEmpty() &&
                        model.state.value.webFile?.path == path
                }
            } catch (error: Throwable) {
                throw AssertionError(
                    "state=" + model.state.value + "\\nDOM=" + js("document.body.innerText"),
                    error,
                )
            }
            waitJs("document.querySelector('button[aria-label=新记录]') !== null")
            js("window.eidosLeave('back')")
            compose.waitUntil(15000) { model.state.value.webFile == null }
            assertEquals(
                "Shared edited",
                runBlocking { repository.loadEidos(path).rows.single().values[table.labelFieldId] },
            )
            compose.runOnUiThread {
                model.openFavorite(Favorite(path, table.name, table.id), addRecord = true)
            }
            compose.waitUntil(15000) { !model.state.value.busy && model.state.value.webAddRecord }
            waitJs("document.querySelector('textarea[aria-label=标题]') !== null")
            js("window.eidosLeave('back')")
            waitJs("document.querySelector('textarea[aria-label=标题]') === null")
            js("window.eidosLeave('back')")
            compose.waitUntil(15000) { model.state.value.webFile == null }
            assertEquals(2, runBlocking { repository.loadEidos(path).rows.size })
            compose.runOnUiThread { model.open(runBlocking { repository.file(note) }) }
            waitJs("document.querySelector('[contenteditable=true]') !== null")
            js(
                "document.querySelector('a[href]').dispatchEvent(new MouseEvent('click',{bubbles:true,ctrlKey:true}))"
            )
            waitJs("document.querySelector('button[aria-label=新记录]') !== null")
            js("window.eidosLeave('back')")
            compose.waitUntil(15000) {
                !model.state.value.busy && model.state.value.webFile?.path == note
            }
            waitJs("document.querySelector('[contenteditable=true]') !== null")
            js("window.eidosLeave('back')")
            compose.waitUntil(15000) { model.state.value.webFile == null }
        } finally {
            compose.runOnUiThread { model.viewModelScope.cancel() }
            runBlocking { repository.close() }
            root.deleteRecursively()
            app.deleteSharedPreferences("space-$id")
        }
    }

    @Test
    fun gridHeaderActionsUseMobileSheets() {
        val app = compose.activity.application
        app.getSharedPreferences("editor", 0).edit().putBoolean("web", true).commit()
        val id = "grid-header-${UUID.randomUUID()}"
        val repository = SpaceRepository(app, id)
        val root = File(app.filesDir, "spaces/$id")
        val path = "Mobile.eidos"
        NativeRuntime.call(
            File(root, path).path,
            "create",
            org.json.JSONObject(
                """{"title":"Mobile","fields":[{"clientKey":"title","name":"标题","kind":"text","position":"0"},{"clientKey":"due","name":"日期","kind":"date","position":"1"}]}"""
            ),
        )
        runBlocking {
            val page = repository.loadEidos(path)
            repository.mutate(
                page,
                null,
                mapOf(
                    page.table!!.labelFieldId to "Touch record",
                    page.fields.first { it.name == "日期" }.id to "2026-10-04",
                ),
            )
        }
        lateinit var model: EidosModel
        try {
            compose.runOnUiThread {
                model = EidosModel(app, repository)
                compose.activity.setContent { EidosApp(model) }
            }
            compose.waitUntil(15000) { !model.state.value.busy }
            compose.runOnUiThread { model.open(runBlocking { repository.file(path) }) }
            waitJs(
                "document.querySelector('canvas')?.textContent.includes('Touch record') === true"
            )
            createMobileView("grid")
            waitJs("document.querySelector('.mobile-view-switcher')?.textContent === '表格'")
            touchCanvas(100f, 18f)
            waitJs("document.querySelector('[data-mobile-menu=true] [role=menuitem]') !== null")
            assertEquals(
                "true",
                js(
                    "Array.from(document.querySelectorAll('[data-mobile-menu=true] [role=menuitem]')).every(b=>b.getBoundingClientRect().height>=48)"
                ),
            )
            screenshot("grid-header-mobile-menu.png")
            js(
                "Array.from(document.querySelectorAll('[role=menuitem]')).find(b=>b.textContent==='降序排列').click()"
            )
            waitJs("document.querySelector('[data-mobile-menu=true]') === null")
            touchCanvas(100f, 18f)
            waitJs("document.querySelector('[data-mobile-menu=true]') !== null")
            js(
                "Array.from(document.querySelectorAll('[role=menuitem]')).find(b=>b.textContent.startsWith('计算')).click()"
            )
            waitJs("document.querySelector('[role=menuitemradio]') !== null")
            screenshot("grid-column-calculation.png")
            js("document.querySelectorAll('[role=menuitemradio]')[1].click()")
            waitJs("document.querySelector('[data-mobile-menu=true]') === null")
            android.os.SystemClock.sleep(500)
            touchCanvas(100f, 108f)
            touchCanvas(100f, 108f)
            android.os.SystemClock.sleep(500)
            assertEquals(1, runBlocking { repository.loadEidos(path) }.rows.size)
            assertEquals("true", js("document.querySelector('[role=dialog], .gdg-input') === null"))
            screenshot("grid-mobile-statistics.png")
            // Header (36), one data row (48), and statistics (48), without
            // reserving the system scrollbar size above the sticky footer.
            waitJs(
                "Math.abs(document.querySelector('canvas').getBoundingClientRect().height - 132) <= 1"
            )
            touchCanvas(100f, 18f)
            waitJs("document.querySelector('[data-mobile-menu=true]') !== null")
            js(
                "Array.from(document.querySelectorAll('[role=menuitem]')).find(b=>b.textContent==='在左侧插入字段').click()"
            )
            waitJs("document.querySelector('.eidos-mobile-fields-create form') !== null")
            js("document.querySelector('button[data-eidos-file-field-type-trigger]').click()")
            waitJs("document.querySelector('[cmdk-item][data-value=text]') !== null")
            assertEquals(
                "true",
                js(
                    "(()=>{const item=document.querySelector('[cmdk-item][data-value=text]');const r=item.getBoundingClientRect();return item.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))})()"
                ),
            )
            screenshot("grid-field-type-picker.png")
            js("document.querySelector('[cmdk-item][data-value=text]').click()")
            waitJs("document.querySelector('[cmdk-item][data-value=text]') === null")
            screenshot("grid-insert-field.png")
            js(
                "(()=>{const input=document.querySelector('.eidos-mobile-fields-create input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'临时字段');input.dispatchEvent(new Event('input',{bubbles:true}));})()"
            )
            js("document.querySelector('.eidos-mobile-fields-create button[type=submit]').click()")
            waitJs("document.querySelector('button[aria-label=编辑临时字段属性]') !== null")
            js(
                "document.querySelector('.eidos-mobile-fields-sheet > header button[aria-label=关闭]').click()"
            )
            waitJs(
                "document.querySelector('.eidos-mobile-fields-sheet') === null && document.querySelector('canvas').textContent.includes('临时字段')"
            )
            touchCanvas(100f, 18f)
            waitJs("document.querySelector('[data-mobile-menu=true]') !== null")
            assertEquals(
                "true",
                js("document.querySelector('[data-mobile-menu=true]').textContent.includes('临时字段')"),
            )
            js(
                "Array.from(document.querySelectorAll('[role=menuitem]')).find(b=>b.textContent==='编辑属性').click()"
            )
            waitJs("document.querySelector('[data-eidos-file-detail-panel=field]') !== null")
            screenshot("grid-field-properties.png")
            js(
                "document.querySelector('.eidos-mobile-fields-sheet > header button[aria-label=关闭]').click()"
            )
            waitJs("document.querySelector('.eidos-mobile-fields-sheet') === null")
            touchCanvas(100f, 18f)
            waitJs("document.querySelector('[data-mobile-menu=true]') !== null")
            js(
                "Array.from(document.querySelectorAll('[role=menuitem]')).find(b=>b.textContent==='删除字段').click()"
            )
            waitJs("document.querySelector('[role=alertdialog]') !== null")
            screenshot("grid-delete-field.png")
            js(
                "Array.from(document.querySelectorAll('[role=alertdialog] button')).find(b=>b.textContent==='删除字段').click()"
            )
            waitJs(
                "document.querySelector('[role=alertdialog]') === null && !document.querySelector('canvas').textContent.includes('临时字段')"
            )
            assertFalse(runBlocking { repository.loadEidos(path) }.fields.any { it.name == "临时字段" })
            touchCanvas(100f, 60f, 700L)
            waitJs("document.querySelector('[data-mobile-menu=true]') !== null")
            screenshot("grid-record-actions.png")
            js("window.eidosLeave('back')")
            waitJs("document.querySelector('[role=dialog]') === null")
            screenshot("grid-without-bottom-new.png")
        } finally {
            compose.runOnUiThread {
                compose.activity.setContent {}
                model.viewModelScope.cancel()
            }
            runBlocking { repository.close() }
            root.deleteRecursively()
        }
    }

    @Test
    fun gridCustomFieldEditorsPersistOnMobile() {
        for (kind in listOf("date", "datetime", "rating", "select", "multi-select")) {
            val app = compose.activity.application
            app.getSharedPreferences("editor", 0).edit().putBoolean("web", true).commit()
            val id = "grid-cell-${UUID.randomUUID()}"
            val repository = SpaceRepository(app, id)
            val root = File(app.filesDir, "spaces/$id")
            val path = "Mobile.eidos"
            val settings =
                when (kind) {
                    "rating" -> org.json.JSONObject("""{"display":{"kind":"rating","max":5}}""")
                    "select",
                    "multi-select" ->
                        org.json.JSONObject(
                            """{"options":[{"name":"Open","color":"blue"},{"name":"Done","color":"green"}]}"""
                        )
                    else -> org.json.JSONObject()
                }
            val field =
                org.json
                    .JSONObject()
                    .put("clientKey", "value")
                    .put("name", kind)
                    .put("kind", if (kind == "rating") "integer" else kind)
                    .put("position", "0")
                    .put("settings", settings)
            val title =
                org.json.JSONObject(
                    """{"clientKey":"title","name":"标题","kind":"text","position":"1"}"""
                )
            NativeRuntime.call(
                File(root, path).path,
                "create",
                org.json
                    .JSONObject()
                    .put("title", "Mobile")
                    .put("fields", org.json.JSONArray().put(field).put(title)),
            )
            runBlocking {
                val page = repository.loadEidos(path)
                repository.mutate(page, null, mapOf(page.table!!.labelFieldId to "Touch record"))
            }
            lateinit var model: EidosModel
            try {
                compose.runOnUiThread {
                    model = EidosModel(app, repository)
                    compose.activity.setContent { EidosApp(model) }
                }
                compose.waitUntil(15000) { !model.state.value.busy }
                compose.runOnUiThread { model.open(runBlocking { repository.file(path) }) }
                waitJs(
                    "document.querySelector('canvas')?.textContent.includes('Touch record') === true && document.querySelector('canvas').textContent.includes('$kind')"
                )
                touchCanvas(100f, 60f)
                waitJs(
                    "document.querySelector('.eidos-mobile-cell-sheet h2')?.textContent === '$kind'"
                )
                waitJs(
                    "(()=>{const b=document.querySelector('.eidos-mobile-cell-sheet button[aria-label=完成]');const r=b.getBoundingClientRect();return b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))})()"
                )
                android.os.SystemClock.sleep(500)
                screenshot("grid-cell-$kind.png")
                if (kind == "select" || kind == "multi-select") {
                    js(
                        "Array.from(document.querySelectorAll('.eidos-mobile-option-list button')).find(b=>b.textContent.includes('Done')).click()"
                    )
                    waitJs(
                        "document.querySelector('.eidos-mobile-option-list button[aria-pressed=true]') !== null"
                    )
                    js(
                        "(()=>{const input=document.querySelector('.eidos-mobile-option-search');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Mobile new');input.dispatchEvent(new Event('input',{bubbles:true}));})()"
                    )
                    waitJs(
                        "Array.from(document.querySelectorAll('.eidos-mobile-option-list button')).some(b=>b.textContent.includes('创建'))"
                    )
                    js(
                        "Array.from(document.querySelectorAll('.eidos-mobile-option-list button')).find(b=>b.textContent.includes('创建')).click()"
                    )
                    waitJs(
                        "document.querySelector('.eidos-mobile-selected-options')?.textContent.includes('Mobile new') === true"
                    )
                    screenshot("grid-created-$kind-option.png")
                } else {
                    val value =
                        when (kind) {
                            "date" -> "2026-12-31"
                            "datetime" -> "2026-12-31T09:30"
                            else -> "4"
                        }
                    js(
                        "(()=>{const input=document.querySelector('.eidos-mobile-cell-body input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'$value');input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));})()"
                    )
                    waitJs(
                        "document.querySelector('.eidos-mobile-cell-body input').value === '$value'"
                    )
                }
                js(
                    "document.querySelector('.eidos-mobile-cell-sheet button[aria-label=完成]').click()"
                )
                waitJs("document.querySelector('.eidos-mobile-cell-sheet') === null")
                val saved = runBlocking { repository.loadEidos(path) }
                val fieldId = saved.fields.first { it.name == kind }.id
                val value = saved.rows.first().values[fieldId].toString()
                when (kind) {
                    "date",
                    "datetime" ->
                        assertTrue("$kind persisted: $value", value.contains("2026-12-31"))
                    "rating" -> assertEquals("4", value)
                    else -> assertTrue("$kind persisted: $value", value.contains("Mobile new"))
                }
                if (kind == "select") {
                    touchCanvas(100f, 18f)
                    waitJs("document.querySelector('[data-mobile-menu=true]') !== null")
                    js(
                        "Array.from(document.querySelectorAll('[role=menuitem]')).find(b=>b.textContent==='编辑属性').click()"
                    )
                    waitJs(
                        "document.querySelector('[data-eidos-file-detail-panel=field]') !== null"
                    )
                    waitJs(
                        "Array.from(document.querySelectorAll('.eidos-mobile-fields-sheet button')).some(b=>b.getAttribute('aria-label')?.includes('Done') && b.getAttribute('aria-label')?.includes('颜色') && !b.disabled)"
                    )
                    js(
                        "Array.from(document.querySelectorAll('.eidos-mobile-fields-sheet button')).find(b=>b.getAttribute('aria-label')?.includes('Done') && b.getAttribute('aria-label')?.includes('颜色')).click()"
                    )
                    waitJs("document.querySelectorAll('[role=dialog]').length === 2")
                    assertEquals(
                        "true",
                        js(
                            "(()=>{const dialog=Array.from(document.querySelectorAll('[role=dialog]')).at(-1);const b=dialog.querySelector('.eidos-mobile-settings-body button');const r=b.getBoundingClientRect();return b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))})()"
                        ),
                    )
                    screenshot("grid-select-colors.png")
                    js("window.eidosLeave('back')")
                    waitJs("document.querySelectorAll('[role=dialog]').length === 1")
                    js("window.eidosLeave('back')")
                    waitJs(
                        "document.querySelector('[data-eidos-file-detail-panel=field]') === null"
                    )
                    js("window.eidosLeave('back')")
                    waitJs("document.querySelector('[role=dialog]') === null")
                    for (origin in listOf("grid", "gallery")) {
                        if (origin == "grid") {
                            touchCanvas(100f, 60f, 700L)
                            waitJs("document.querySelector('[data-mobile-menu=true]') !== null")
                            js(
                                "Array.from(document.querySelectorAll('[role=menuitem]')).find(b=>b.textContent==='打开记录').click()"
                            )
                        } else {
                            createMobileView("gallery")
                            waitJs(
                                "document.querySelector('[data-eidos-file-card-actions]') !== null"
                            )
                            js(
                                "document.querySelector('[data-eidos-file-card-actions]').closest('article').click()"
                            )
                        }
                        waitJs(
                            "document.querySelector('[data-mobile-record=true] button[aria-label=select]') !== null"
                        )
                        js(
                            "document.querySelector('[data-mobile-record=true] button[aria-label=select]').click()"
                        )
                        waitJs("document.querySelector('.eidos-mobile-option-search') !== null")
                        js(
                            "(()=>{const input=document.querySelector('.eidos-mobile-option-search');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'From $origin');input.dispatchEvent(new Event('input',{bubbles:true}));})()"
                        )
                        waitJs(
                            "Array.from(document.querySelectorAll('.eidos-mobile-option-list button')).some(b=>b.textContent.includes('创建'))"
                        )
                        js(
                            "Array.from(document.querySelectorAll('.eidos-mobile-option-list button')).find(b=>b.textContent.includes('创建')).click()"
                        )
                        waitJs(
                            "document.querySelector('.eidos-mobile-selected-options')?.textContent.includes('From $origin') === true"
                        )
                        js(
                            "document.querySelector('.eidos-mobile-cell-sheet button[aria-label=完成]').click()"
                        )
                        waitJs("document.querySelector('.eidos-mobile-cell-sheet') === null")
                        assertTrue(
                            runBlocking { repository.loadEidos(path) }
                                .rows
                                .first()
                                .values[fieldId]
                                .toString()
                                .contains("From $origin")
                        )
                        screenshot("record-$origin-option-created.png")
                        js("window.eidosLeave('back')")
                        waitJs("document.querySelector('[data-mobile-record=true]') === null")
                    }
                    createMobileView("kanban")
                    waitJs(
                        "document.querySelector('.mobile-view-switcher')?.textContent.includes('看板') === true && document.querySelector('[data-eidos-file-kanban-scroll]') !== null"
                    )
                    js(
                        "(()=>{const board=document.querySelector('[data-eidos-file-kanban-scroll]');board.scrollLeft=board.scrollWidth;board.dispatchEvent(new Event('scroll'));})()"
                    )
                    waitJs(
                        "document.querySelector('[data-eidos-file-card-actions] button') !== null"
                    )
                    js("document.querySelector('[data-eidos-file-card-actions] button').click()")
                    waitJs(
                        "document.querySelector('.eidos-mobile-calendar-menu')?.textContent.includes('移动到') === true"
                    )
                    screenshot("mobile-kanban-move-menu.png")
                    js(
                        "Array.from(document.querySelectorAll('.eidos-mobile-calendar-menu > button')).find(b=>b.textContent==='Open').click()"
                    )
                    waitJs("document.querySelector('.eidos-mobile-calendar-menu') === null")
                    compose.waitUntil(15000) {
                        runBlocking { repository.loadEidos(path) }
                            .rows
                            .first()
                            .values[fieldId]
                            .toString()
                            .contains("Open")
                    }
                    screenshot("mobile-kanban-moved.png")
                }
            } finally {
                compose.runOnUiThread {
                    compose.activity.setContent {}
                    model.viewModelScope.cancel()
                }
                runBlocking { repository.close() }
                root.deleteRecursively()
            }
        }
    }

    @Test
    fun mobileToolbarVisualReview() {
        val app = compose.activity.application
        app.getSharedPreferences("editor", 0).edit().putBoolean("web", true).commit()
        val id = "mobile-visual-${UUID.randomUUID()}"
        val repository = SpaceRepository(app, id)
        val root = File(app.filesDir, "spaces/$id")
        val path = "Mobile.eidos"
        NativeRuntime.call(
            File(root, path).path,
            "create",
            org.json.JSONObject(
                """{"title":"Mobile","fields":[{"clientKey":"title","name":"标题","kind":"text","position":"0"},{"clientKey":"due","name":"日期","kind":"date","position":"1"}]}"""
            ),
        )
        runBlocking {
            val page = repository.loadEidos(path)
            repository.mutate(
                page,
                null,
                mapOf(
                    page.table!!.labelFieldId to "Touch record",
                    page.fields.first { it.name == "日期" }.id to "2026-10-04",
                ),
            )
        }
        lateinit var model: EidosModel
        try {
            compose.runOnUiThread {
                model = EidosModel(app, repository)
                compose.activity.setContent { EidosApp(model) }
            }
            compose.waitUntil(15000) { !model.state.value.busy }
            compose.runOnUiThread { model.open(runBlocking { repository.file(path) }) }
            waitJs("document.querySelector('.mobile-view-switcher') !== null")
            for (kind in listOf("grid", "gallery", "feed", "grid", "gallery", "grid")) {
                createMobileView(kind)
                waitJs(
                    "document.querySelector('[role=dialog]') === null"
                )
                waitJs(
                    "document.querySelector('.mobile-view-switcher')?.textContent.startsWith('${if (kind == "grid") "表格" else if (kind == "gallery") "画廊" else "动态"}') === true"
                )
            }
            assertEquals(
                "true",
                js(
                    "(()=>{const tools=document.querySelector('.view-tools');return tools.scrollWidth <= tools.clientWidth})()"
                ),
            )
            screenshot("qa-toolbar-multiple.png")
            js("document.querySelector('button[aria-label=视图设置]').click()")
            waitJs("document.querySelector('input[aria-label=视图名称]') !== null")
            assertEquals(
                "true",
                js(
                    "(()=>{const title=document.querySelector('[role=dialog] h2');return title.scrollWidth <= title.clientWidth})()"
                ),
            )
            screenshot("qa-view-settings.png")
            js("document.querySelector('button[aria-label=管理字段]').click()")
            waitJs("document.querySelector('.eidos-mobile-fields-sheet') !== null")
            screenshot("qa-fields.png")
            assertEquals(
                "true",
                js(
                    "(()=>{const sheet=document.querySelector('.eidos-mobile-fields-sheet');const button=sheet.querySelector('button[aria-label=关闭]');const r=button.getBoundingClientRect();return button.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))})()"
                ),
            )
            js("window.eidosLeave('back')")
            waitJs("document.querySelector('.eidos-mobile-fields-sheet') === null")
            js("window.eidosLeave('back')")
            waitJs("document.querySelector('[role=dialog]') === null")
            js("document.querySelector('button[aria-label=搜索记录]').click()")
            waitJs("document.querySelector('input[aria-label=搜索记录]') !== null")
            js("document.querySelector('input[aria-label=搜索记录]').focus()")
            touchCanvas(30f, 22f, target = "input[aria-label=搜索记录]")
            compose.runOnUiThread {
                val web = findWeb(compose.activity.window.decorView)!!
                web.requestFocus()
                val keyboard =
                    app.getSystemService(android.content.Context.INPUT_METHOD_SERVICE)
                        as android.view.inputmethod.InputMethodManager
                keyboard.showSoftInput(
                    web,
                    android.view.inputmethod.InputMethodManager.SHOW_IMPLICIT,
                )
            }
            compose.waitUntil(15000) {
                var shown = false
                compose.runOnUiThread {
                    shown =
                        androidx.core.view.ViewCompat.getRootWindowInsets(
                                compose.activity.window.decorView
                            )!!
                            .isVisible(androidx.core.view.WindowInsetsCompat.Type.ime())
                }
                shown
            }
            waitJs(
                "(()=>{const sheet=document.querySelector('[role=dialog]').getBoundingClientRect();return sheet.top >= 0 && sheet.bottom <= innerHeight+1})()"
            )
            // The IME reports visible at the start of its animation. Capture only
            // after the native viewport has settled against the keyboard edge.
            android.os.SystemClock.sleep(500)
            waitForKeyboardViewport()
            waitJs(
                "(()=>{const input=document.querySelector('input[aria-label=搜索记录]').getBoundingClientRect();return input.top >= 0 && input.bottom <= innerHeight+1 && input.height >= 44})()"
            )
            screenshot("qa-search-keyboard.png")
            js(
                "(()=>{const input=document.querySelector('input[aria-label=搜索记录]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Touch');input.dispatchEvent(new Event('input',{bubbles:true}));})()"
            )
            waitJs("document.querySelector('input[aria-label=搜索记录]').value === 'Touch'")
            js("document.querySelector('[role=dialog] form').requestSubmit()")
            waitJs(
                "document.querySelector('[role=dialog]') === null && document.querySelector('button[aria-label=搜索记录]').dataset.active === 'true'"
            )
            compose.runOnUiThread {
                val web = findWeb(compose.activity.window.decorView)!!
                val keyboard =
                    app.getSystemService(android.content.Context.INPUT_METHOD_SERVICE)
                        as android.view.inputmethod.InputMethodManager
                keyboard.hideSoftInputFromWindow(web.windowToken, 0)
                web.settings.textZoom = 130
            }
            js("document.querySelector('.database-page').style.width='320px'")
            compose.waitUntil(15000) {
                var hidden = false
                compose.runOnUiThread {
                    hidden =
                        !androidx.core.view.ViewCompat.getRootWindowInsets(
                                compose.activity.window.decorView
                            )!!
                            .isVisible(androidx.core.view.WindowInsetsCompat.Type.ime())
                }
                hidden
            }
            waitJs("document.querySelector('.view-tools').getBoundingClientRect().width === 320")
            android.os.SystemClock.sleep(500)
            assertEquals(
                "true",
                js(
                    "(()=>{const bar=document.querySelector('.view-tools');return bar.scrollWidth <= 320 && Array.from(bar.querySelectorAll(':scope > button')).every(b=>b.getBoundingClientRect().width>=44)})()"
                ),
            )
            screenshot("qa-toolbar-narrow.png")
            compose.runOnUiThread {
                findWeb(compose.activity.window.decorView)!!.settings.textZoom = 100
            }
        } finally {
            compose.runOnUiThread {
                compose.activity.setContent {}
                model.viewModelScope.cancel()
            }
            runBlocking { repository.close() }
            root.deleteRecursively()
        }
    }

    @Test
    fun mobileNavigationMenusAndViewSettings() {
        val app = compose.activity.application
        app.getSharedPreferences("editor", 0).edit().putBoolean("web", true).commit()
        val id = "mobile-navigation-${UUID.randomUUID()}"
        val repository = SpaceRepository(app, id)
        val root = File(app.filesDir, "spaces/$id")
        val path = "Mobile.eidos"
        NativeRuntime.call(
            File(root, path).path,
            "create",
            org.json.JSONObject(
                """{"title":"Mobile","fields":[{"clientKey":"title","name":"标题","kind":"text","position":"0"},{"clientKey":"due","name":"日期","kind":"date","position":"1"},{"clientKey":"description","name":"描述","kind":"text","position":"2"}]}"""
            ),
        )
        runBlocking {
            val page = repository.loadEidos(path)
            repository.mutate(
                page,
                null,
                mapOf(
                    page.table!!.labelFieldId to "Touch record",
                    page.fields.first { it.name == "日期" }.id to "2026-10-04",
                    page.fields.first { it.name == "描述" }.id to
                        "Long text stays in its original value column. ".repeat(8),
                ),
            )
        }
        lateinit var model: EidosModel
        try {
            compose.runOnUiThread {
                model = EidosModel(app, repository)
                compose.activity.setContent { EidosApp(model) }
            }
            compose.waitUntil(15000) { !model.state.value.busy }
            compose.runOnUiThread { model.open(runBlocking { repository.file(path) }) }
            waitJs("document.querySelector('.mobile-view-switcher') !== null")
            assertEquals(
                "true",
                js(
                    "document.querySelector('.database-page > .tools') === null && document.querySelector('.view-tools input') === null && document.querySelector('.view-tools button[aria-label=管理字段]') === null"
                ),
            )
            js("document.querySelector('button[aria-label=搜索记录]').click()")
            waitJs("document.querySelector('input[aria-label=搜索记录]') !== null")
            js("window.eidosLeave('back')")
            waitJs("document.querySelector('[role=dialog]') === null")
            screenshot("mobile-compact-toolbar.png")
            createMobileView("gallery")
            waitJs("document.querySelector('[data-eidos-file-card-actions] button') !== null")
            js("document.querySelector('[data-eidos-file-card-actions] button').click()")
            waitJs("document.querySelector('.eidos-mobile-calendar-menu') !== null")
            assertEquals(
                "true",
                js(
                    "(()=>{const menu=document.querySelector('.eidos-mobile-calendar-menu');const overlay=document.querySelector('.eidos-mobile-cell-backdrop');const b=menu.querySelector('button');const r=b.getBoundingClientRect();return Number(getComputedStyle(menu).zIndex)>Number(getComputedStyle(overlay).zIndex) && b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))})()"
                ),
            )
            screenshot("mobile-gallery-actions.png")
            js("window.eidosLeave('back')")
            waitJs("document.querySelector('.eidos-mobile-calendar-menu') === null")
            assertNotNull(model.state.value.webFile)
            js("window.retainedRecordTable = document.querySelector('.eidos-file-detail-layout')")
            js(
                "document.querySelector('[data-eidos-file-card-actions]').closest('article').click()"
            )
            waitJs(
                "document.querySelector('[data-eidos-file-detail-panel=record] button[aria-label=日期]') !== null"
            )
            assertEquals(
                "true",
                js(
                    "document.querySelector('[data-eidos-file-record-layout=page]') !== null && document.querySelector('[aria-label=在侧边栏打开], [aria-label=以完整页面打开]') === null"
                ),
            )
            assertEquals(
                "true",
                js(
                    "(()=>{const panel=document.querySelector('[data-eidos-file-detail-panel=record]');return panel.scrollWidth<=panel.clientWidth})()"
                ),
            )
            compose.waitUntil(5000) {
                compose.onAllNodesWithText("Mobile.eidos").fetchSemanticsNodes().isEmpty()
            }
            screenshot("mobile-record-full-page.png")
            assertEquals(
                "true",
                js(
                    "document.querySelector('[data-full-width=true]') === null && document.querySelector('textarea[aria-label=描述]').getAttribute('wrap') === 'off'"
                ),
            )
            js(
                "(()=>{const input=document.querySelector('textarea[aria-label=描述]');input.focus();Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'Edited in place');input.dispatchEvent(new Event('input',{bubbles:true}));})()"
            )
            js("document.querySelector('textarea[aria-label=描述]').blur()")
            waitJs(
                "document.querySelector('textarea[aria-label=描述]')?.value === 'Edited in place' && document.querySelector('.eidos-mobile-cell-sheet') === null"
            )
            assertEquals(
                "true",
                js(
                    "location.hash.startsWith('#/records/') && document.querySelector('[data-mobile-record-page]').parentElement === document.body && getComputedStyle(document.querySelector('.database-page')).visibility === 'hidden'"
                ),
            )
            compose.waitUntil(5000) {
                compose.onAllNodesWithText("Mobile.eidos").fetchSemanticsNodes().isEmpty()
            }
            js(
                "document.querySelector('[data-eidos-file-detail-panel=record] button[aria-label=日期]').click()"
            )
            waitJs("document.querySelector('.eidos-mobile-date-editor button[name=day]') !== null")
            assertEquals(
                "true",
                js(
                    "document.querySelectorAll('[role=dialog]').length === 1 && document.querySelector('input[type=date]') === null"
                ),
            )
            screenshot("mobile-direct-date-editor.png")
            js(
                "window.dateEditorReady=false;requestAnimationFrame(()=>requestAnimationFrame(()=>window.dateEditorReady=true))"
            )
            waitJs("window.dateEditorReady === true")
            js(
                "[...document.querySelectorAll('.eidos-mobile-date-editor button[name=day]')].find(button=>button.textContent==='5').click()"
            )
            waitJs(
                "document.querySelector('.eidos-mobile-date-editor input')?.value === '2026-10-05'"
            )
            js("window.eidosLeave('back')")
            waitJs("document.querySelector('.eidos-mobile-cell-sheet') === null")
            waitJs(
                "document.querySelector('[data-eidos-file-detail-panel=record]')?.textContent.includes('10/5/2026') === true"
            )
            js("window.eidosLeave('back')")
            waitJs("document.querySelector('[data-eidos-file-detail-panel=record]') === null")
            assertEquals(
                "true",
                js(
                    "!location.hash.startsWith('#/records/') && window.retainedRecordTable === document.querySelector('.eidos-file-detail-layout') && getComputedStyle(document.querySelector('.database-page')).visibility === 'visible'"
                ),
            )
            js("document.querySelector('button[aria-label=视图设置]').click()")
            waitJs("document.querySelector('input[aria-label=视图名称]') !== null")
            js("document.querySelector('button[aria-label=管理字段]').click()")
            waitJs("document.querySelector('.eidos-mobile-fields-sheet') !== null")
            js("window.eidosLeave('back')")
            waitJs(
                "document.querySelector('.eidos-mobile-fields-sheet') === null && document.querySelector('input[aria-label=视图名称]') !== null"
            )
            js(
                "Array.from(document.querySelectorAll('.eidos-mobile-settings-body button')).find(b=>b.title==='筛选').click()"
            )
            waitJs("document.querySelectorAll('[role=dialog]').length === 2")
            js("window.eidosLeave('back')")
            waitJs("document.querySelectorAll('[role=dialog]').length === 1")
            screenshot("mobile-view-settings.png")
            js("document.querySelector('button[aria-label=布局设置]').click()")
            waitJs("document.querySelector('button[aria-label=卡片尺寸]') !== null")
            screenshot("mobile-gallery-layout.png")
            js("document.querySelector('button[aria-label=卡片尺寸]').click()")
            waitJs("document.querySelectorAll('[role=dialog]').length === 3")
            js(
                "Array.from(document.querySelectorAll('[role=dialog]')).at(-1).querySelectorAll('button')[1].click()"
            )
            waitJs(
                "document.querySelectorAll('[role=dialog]').length === 2 && document.querySelector('button[aria-label=卡片尺寸]').textContent.includes('小')"
            )
            js("window.eidosLeave('back')")
            waitJs("document.querySelectorAll('[role=dialog]').length === 1")
            js("document.querySelector('button[aria-label=布局设置]').click()")
            waitJs(
                "document.querySelector('button[aria-label=卡片尺寸]')?.textContent.includes('小') === true"
            )
            js("window.eidosLeave('back')")
            waitJs("document.querySelectorAll('[role=dialog]').length === 1")
            js("window.eidosLeave('back')")
            waitJs("document.querySelector('[role=dialog]') === null")
            assertNotNull(model.state.value.webFile)
            js("document.querySelector('[data-eidos-file-card-actions] button').click()")
            waitJs("document.querySelector('.eidos-mobile-calendar-menu') !== null")
            js(
                "Array.from(document.querySelectorAll('.eidos-mobile-calendar-menu button')).find(b=>b.textContent==='删除记录').click()"
            )
            waitJs("document.querySelector('[role=alertdialog]') !== null")
            js("window.eidosLeave('back')")
            waitJs("document.querySelector('[role=alertdialog]') === null")
            js("document.querySelector('[data-eidos-file-card-actions] button').click()")
            waitJs("document.querySelector('.eidos-mobile-calendar-menu') !== null")
            js(
                "Array.from(document.querySelectorAll('.eidos-mobile-calendar-menu button')).find(b=>b.textContent==='删除记录').click()"
            )
            waitJs("document.querySelector('[role=alertdialog]') !== null")
            js(
                "Array.from(document.querySelectorAll('[role=alertdialog] button')).find(b=>b.textContent==='删除记录').click()"
            )
            waitJs(
                "document.querySelector('[role=alertdialog]') === null && document.querySelector('[data-eidos-file-card-actions]') === null"
            )
            assertEquals(0, runBlocking { repository.loadEidos(path) }.rows.size)
            createMobileView("form")
            waitJs(
                "document.querySelectorAll('.eidos-mobile-form [data-eidos-file-form-block]').length >= 2"
            )
            val first =
                js(
                    "document.querySelector('[data-eidos-file-form-block]').getAttribute('data-eidos-file-form-block')"
                )
            js("document.querySelector('button[aria-label=下移问题]').click()")
            waitJs(
                "document.querySelector('[data-eidos-file-form-block]').getAttribute('data-eidos-file-form-block') !== $first"
            )
            js(
                "document.querySelector('.database-page').style.width='320px';document.querySelector('.eidos-mobile-form').style.fontSize='20px'"
            )
            assertEquals(
                "true",
                js(
                    "(()=>{const form=document.querySelector('.eidos-mobile-form');return form.scrollWidth <= 321 && Array.from(form.querySelectorAll('button')).filter(b=>b.getClientRects().length).every(b=>b.getBoundingClientRect().height >= 44)})()"
                ),
            )
            compose.runOnUiThread {
                findWeb(compose.activity.window.decorView)!!.settings.textZoom = 130
            }
            js(
                "window.largeTextReady=false;requestAnimationFrame(()=>requestAnimationFrame(()=>window.largeTextReady=true))"
            )
            waitJs("window.largeTextReady === true")
            assertEquals(
                "true",
                js("document.querySelector('.eidos-mobile-form').scrollWidth <= 321"),
            )
            screenshot("mobile-form-narrow.png")
            compose.runOnUiThread {
                findWeb(compose.activity.window.decorView)!!.settings.textZoom = 100
            }
            js(
                "document.querySelector('.database-page').style.width='';document.querySelector('.eidos-mobile-form').style.fontSize=''"
            )
        } finally {
            compose.runOnUiThread {
                compose.activity.setContent {}
                model.viewModelScope.cancel()
            }
            runBlocking { repository.close() }
            root.deleteRecursively()
        }
    }

    @Test
    fun mobileCalendarFitsAndKeepsSelectedDayWhenChangingLayout() {
        val app = compose.activity.application
        app.getSharedPreferences("editor", 0).edit().putBoolean("web", true).commit()
        val id = "mobile-calendar-${UUID.randomUUID()}"
        val repository = SpaceRepository(app, id)
        val root = File(app.filesDir, "spaces/$id")
        val path = "Calendar.eidos"
        val today = java.time.LocalDate.now()
        val tomorrow = today.plusDays(1).toString()
        NativeRuntime.call(
            File(root, path).path,
            "create",
            org.json.JSONObject(
                """{"title":"Calendar","fields":[{"clientKey":"title","name":"标题","kind":"text","position":"0"},{"clientKey":"due","name":"日期","kind":"date","position":"1"}]}"""
            ),
        )
        runBlocking {
            for ((date, title) in listOf(today.toString() to "今天的日程", tomorrow to "明天的日程")) {
                val page = repository.loadEidos(path)
                repository.mutate(
                    page,
                    null,
                    mapOf(
                        page.table!!.labelFieldId to title,
                        page.fields.first { it.name == "日期" }.id to date,
                    ),
                )
            }
        }
        lateinit var model: EidosModel
        try {
            compose.runOnUiThread {
                model = EidosModel(app, repository)
                compose.activity.setContent { EidosApp(model) }
            }
            compose.waitUntil(15000) { !model.state.value.busy }
            compose.runOnUiThread { model.open(runBlocking { repository.file(path) }) }
            waitJs("document.querySelector('.mobile-view-switcher') !== null")
            createMobileView("calendar")
            js("document.querySelector('button[aria-label=视图设置]').click()")
            waitJs("document.querySelector('button[aria-label=布局设置]') !== null")
            js("document.querySelector('button[aria-label=布局设置]').click()")
            waitJs("document.querySelector('button[aria-label=日期字段]') !== null")
            js("document.querySelector('button[aria-label=日期字段]').click()")
            waitJs("document.querySelectorAll('[role=dialog]').length === 3")
            js(
                "Array.from(Array.from(document.querySelectorAll('[role=dialog]')).at(-1).querySelectorAll('button')).find(b=>b.textContent==='日期').click()"
            )
            waitJs("document.querySelectorAll('[role=dialog]').length === 2")
            js("window.eidosLeave('back')")
            waitJs("document.querySelectorAll('[role=dialog]').length === 1")
            js("window.eidosLeave('back')")
            waitJs("document.querySelector('[role=dialog]') === null")
            waitJs(
                "document.querySelector('.eidos-mobile-calendar-agenda')?.textContent.includes('今天的日程') === true"
            )
            assertEquals("true", js("document.querySelector('button[aria-label=日历日期字段]') === null"))
            assertEquals(
                "true",
                js(
                    "(()=>{const calendar=document.querySelector('.eidos-mobile-calendar');return calendar.scrollWidth <= calendar.clientWidth + 1})()"
                ),
            )
            screenshot("mobile-calendar-month.png")
            js("document.querySelector('.eidos-mobile-calendar').style.width='320px'")
            assertEquals(
                "true",
                js(
                    "(()=>{const calendar=document.querySelector('.eidos-mobile-calendar');return calendar.scrollWidth <= 321 && Array.from(calendar.querySelectorAll('[data-eidos-file-calendar-day]')).every(day=>day.getBoundingClientRect().width>=44)})()"
                ),
            )
            screenshot("mobile-calendar-narrow.png")
            assertEquals(
                "true",
                js(
                    "(()=>{const h=document.querySelector('.eidos-mobile-calendar > div > header');const rows=Array.from(h.children).map(e=>e.getBoundingClientRect());return Math.max(...rows.map(r=>r.top)) < Math.min(...rows.map(r=>r.bottom)) && h.scrollWidth<=h.clientWidth})()"
                ),
            )
            js("document.querySelector('.eidos-mobile-calendar').style.width=''")
            js("document.querySelector('[data-eidos-file-calendar-day=\"$tomorrow\"]').click()")
            waitJs(
                "document.querySelector('.eidos-mobile-calendar-agenda')?.textContent.includes('明天的日程') === true"
            )
            js(
                "Array.from(document.querySelectorAll('.eidos-mobile-calendar header button')).find(b=>b.textContent==='周').click()"
            )
            waitJs(
                "document.querySelectorAll('[data-eidos-file-calendar-day]').length === 7 && document.querySelector('.eidos-mobile-calendar-agenda')?.textContent.includes('明天的日程') === true"
            )
            assertEquals(
                "true",
                js(
                    "document.querySelector('[data-eidos-file-calendar-day=\"$tomorrow\"]').getAttribute('aria-pressed') === 'true'"
                ),
            )
            screenshot("mobile-calendar-week.png")
            js(
                "document.querySelector('.eidos-mobile-calendar-record button[aria-haspopup=dialog]').click()"
            )
            waitJs("document.querySelector('.eidos-mobile-calendar-menu') !== null")
            screenshot("mobile-calendar-actions.png")
            js(
                "document.querySelector('.eidos-mobile-calendar-menu button[aria-label=关闭]').click()"
            )
            waitJs("document.querySelector('.eidos-mobile-calendar-menu') === null")
            js("document.querySelector('.eidos-mobile-calendar-agenda header button').click()")
            compose.waitUntil(10000) { runBlocking { repository.loadEidos(path) }.rows.size == 3 }
            val page = runBlocking { repository.loadEidos(path) }
            val dateField = page.fields.first { it.name == "日期" }.id
            assertEquals(2, page.rows.count { it.values[dateField] == tomorrow })
        } finally {
            compose.runOnUiThread {
                compose.activity.setContent {}
                model.viewModelScope.cancel()
            }
            runBlocking { repository.close() }
            root.deleteRecursively()
        }
    }

    @Test
    fun fieldSheetEditsSchemaAndNativeHeaderSwitchesTables() {
        val app = compose.activity.application
        app.getSharedPreferences("editor", 0).edit().putBoolean("web", true).commit()
        val id = "mobile-fields-${UUID.randomUUID()}"
        val repository = SpaceRepository(app, id)
        val root = File(app.filesDir, "spaces/$id")
        val path = runBlocking { repository.create("", "Field controls", "eidos") }
        val file = File(root, path)
        val schema = NativeRuntime.call(file.path, "schema")
        val revision = schema.getJSONObject("snapshot").getString("revision")
        val plan =
            NativeRuntime.call(
                file.path,
                "web:preflightSchema",
                org.json
                    .JSONObject()
                    .put("expectedRevision", revision)
                    .put(
                        "change",
                        org.json.JSONObject(
                            """{"kind":"create-table","clientKey":"other","name":"Other table","position":"10","fields":[{"clientKey":"title","name":"Name","kind":"text","position":"0"},${(1..30).joinToString(",") { """{"clientKey":"extra$it","name":"Field $it","kind":"text","position":"$it"}""" }}],"labelFieldClientKey":"title"}"""
                        ),
                    ),
            )
        NativeRuntime.call(
            file.path,
            "web:mutateSchema",
            org.json
                .JSONObject()
                .put("expectedRevision", revision)
                .put("planToken", plan.getString("planToken"))
                .put("actionsHash", plan.getString("actionsHash")),
        )
        lateinit var model: EidosModel
        try {
            compose.runOnUiThread {
                model = EidosModel(app, repository)
                compose.activity.setContent { EidosApp(model) }
            }
            compose.waitUntil(15000) { !model.state.value.busy }
            compose.runOnUiThread { model.open(runBlocking { repository.file(path) }) }
            waitJs("document.querySelector('button[aria-label=视图设置]') !== null")
            js("document.querySelector('button[aria-label=视图设置]').click()")
            waitJs("document.querySelector('button[aria-label=管理字段]') !== null")
            assertEquals("true", js("document.querySelector('select[aria-label=数据表]') === null"))
            compose.onNodeWithContentDescription("切换数据表").assertExists()
            js("document.querySelector('button[aria-label=管理字段]').click()")
            waitJs("document.querySelector('.eidos-mobile-fields-sheet') !== null")
            waitJs("document.querySelector('button[aria-label=编辑笔记属性]')?.disabled === false")
            js("document.querySelector('button[aria-label=编辑笔记属性]').click()")
            waitJs("document.querySelector('[data-eidos-file-detail-panel=field]') !== null")
            screenshot("mobile-field-properties.png")
            compose.runOnUiThread { findWeb(compose.activity.window.decorView)!!.requestFocus() }
            js(
                "(()=>{const input=document.querySelector('[data-eidos-file-detail-panel=field] input');input.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'说明');input.dispatchEvent(new Event('input',{bubbles:true}));})()"
            )
            waitJs(
                "document.querySelector('[data-eidos-file-detail-panel=field] input')?.getAttribute('value') === '说明'"
            )
            js(
                "document.querySelector('.eidos-mobile-fields-sheet > header button[aria-label=返回]').click()"
            )
            waitJs("document.querySelector('[data-eidos-file-detail-panel=field]') === null")
            waitJs("document.querySelector('button[aria-label=编辑说明属性]') !== null")
            js(
                "Array.from(document.querySelectorAll('.eidos-mobile-fields-list button')).find(b=>b.textContent.includes('新建字段')).click()"
            )
            waitJs("document.querySelector('.eidos-mobile-fields-create form') !== null")
            js(
                "(()=>{const input=document.querySelector('.eidos-mobile-fields-create input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Mobile field');input.dispatchEvent(new Event('input',{bubbles:true}));})()"
            )
            js("document.querySelector('.eidos-mobile-fields-create button[type=submit]').click()")
            waitJs("document.querySelector('button[aria-label=\"编辑Mobile field属性\"]') !== null")
            js(
                "document.querySelector('.eidos-mobile-fields-sheet > header button[aria-label=关闭]').click()"
            )
            waitJs("document.querySelector('.eidos-mobile-fields-sheet') === null")
            compose.onNodeWithContentDescription("切换数据表").performClick()
            compose.onNodeWithText("Other table").performClick()
            compose.waitUntil(10000) {
                compose.onAllNodesWithText("Other table").fetchSemanticsNodes().isNotEmpty()
            }
            waitJs("document.querySelector('canvas')?.textContent.includes('Name') === true")
            assertEquals("null", js("document.querySelector('[role=alert]')?.textContent ?? null"))
            screenshot("mobile-table-header.png")
            createMobileView("grid")
            js("document.querySelector('button[aria-label=视图设置]').click()")
            waitJs("document.querySelector('button[aria-label=管理字段]') !== null")
            js("document.querySelector('button[aria-label=管理字段]').click()")
            waitJs(
                "document.querySelector('.eidos-mobile-fields-list')?.scrollHeight > document.querySelector('.eidos-mobile-fields-list')?.clientHeight"
            )
            swipeFieldList()
            waitJs("document.querySelector('.eidos-mobile-fields-list').scrollTop > 40")
            assertEquals(
                "true",
                js("document.querySelector('[data-eidos-file-detail-panel=field]') === null"),
            )
            screenshot("mobile-fields-touch-scroll.png")
            js("window.eidosLeave('back')")
            waitJs("document.querySelector('.eidos-mobile-fields-sheet') === null")
            js("window.eidosLeave('back')")
            waitJs("document.querySelector('[role=dialog]') === null")
            compose.onNodeWithContentDescription("切换数据表").performClick()
            compose.onNodeWithText("新建数据表").performClick()
            compose.waitUntil(5000) {
                compose.onAllNodesWithText("新建数据表").fetchSemanticsNodes().isEmpty()
            }
            waitJs("document.querySelector('input[aria-label=数据表名称]') !== null")
            js(
                "(()=>{const input=document.querySelector('input[aria-label=数据表名称]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Mobile projects');input.dispatchEvent(new Event('input',{bubbles:true}));})()"
            )
            screenshot("mobile-create-table.png")
            js("document.querySelector('.mobile-table-settings').requestSubmit()")
            waitJs("document.querySelector('.mobile-table-settings') === null")
            compose.waitUntil(10000) {
                compose.onAllNodesWithText("Mobile projects").fetchSemanticsNodes().isNotEmpty()
            }
            waitJs("document.querySelector('canvas')?.textContent.includes('标题') === true")
            compose.onNodeWithContentDescription("切换数据表").performClick()
            compose.onNodeWithText("数据表设置").performClick()
            compose.waitUntil(5000) {
                compose.onAllNodesWithText("数据表设置").fetchSemanticsNodes().isEmpty()
            }
            waitJs("document.querySelector('input[aria-label=数据表名称]')?.value === 'Mobile projects'")
            js(
                "(()=>{const input=document.querySelector('input[aria-label=数据表名称]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Projects renamed');input.dispatchEvent(new Event('input',{bubbles:true}));})()"
            )
            js("document.querySelector('button[aria-label=内容字段]').click()")
            waitJs(
                "Array.from(document.querySelectorAll('.mobile-setting-list button')).some(b=>b.textContent==='标题')"
            )
            js(
                "Array.from(document.querySelectorAll('.mobile-setting-list button')).find(b=>b.textContent==='标题').click()"
            )
            waitJs(
                "document.querySelector('button[aria-label=内容字段]')?.textContent.includes('标题') === true"
            )
            screenshot("mobile-table-settings.png")
            js("document.querySelector('.mobile-table-settings').requestSubmit()")
            waitJs("document.querySelector('.mobile-table-settings') === null")
            compose.waitUntil(10000) {
                compose.onAllNodesWithText("Projects renamed").fetchSemanticsNodes().isNotEmpty()
            }
            js("window.eidosManageTables('edit')")
            waitJs(
                "document.querySelector('button[aria-label=内容字段]')?.textContent.includes('标题') === true"
            )
            js("document.querySelector('button[aria-label=内容字段]').click()")
            waitJs(
                "Array.from(document.querySelectorAll('.mobile-setting-list button')).some(b=>b.textContent==='无')"
            )
            js(
                "Array.from(document.querySelectorAll('.mobile-setting-list button')).find(b=>b.textContent==='无').click()"
            )
            waitJs("document.querySelector('.mobile-setting-list') === null")
            js("document.querySelector('.mobile-table-settings').requestSubmit()")
            waitJs("document.querySelector('.mobile-table-settings') === null")
            js("window.eidosManageTables('edit')")
            waitJs(
                "document.querySelector('button[aria-label=内容字段]')?.textContent.includes('无') === true"
            )
        } finally {
            compose.runOnUiThread {
                compose.activity.setContent {}
                model.viewModelScope.cancel()
            }
            runBlocking { repository.close() }
            root.deleteRecursively()
        }
    }

    @Test
    fun gridAttachmentSheetImportsAndPersistsFile() {
        val app = compose.activity.application
        app.getSharedPreferences("editor", 0).edit().putBoolean("web", true).commit()
        val id = "grid-import-${UUID.randomUUID()}"
        val repository = SpaceRepository(app, id)
        val root = File(app.filesDir, "spaces/$id")
        val path = "Attachments.eidos"
        NativeRuntime.call(
            File(root, path).path,
            "create",
            org.json.JSONObject(
                """{"title":"Attachments","fields":[{"clientKey":"file","name":"附件","kind":"file","position":"0"},{"clientKey":"title","name":"标题","kind":"text","position":"1"}]}"""
            ),
        )
        val page = runBlocking { repository.loadEidos(path) }
        runBlocking {
            repository.mutate(page, null, mapOf(page.table!!.labelFieldId to "Import target"))
        }
        val fixture = File(app.cacheDir, "test-share/$id").apply { mkdirs() }
        val attachment = File(fixture, "cover.png")
        val bitmap =
            android.graphics.Bitmap.createBitmap(320, 480, android.graphics.Bitmap.Config.ARGB_8888)
        bitmap.eraseColor(android.graphics.Color.rgb(0, 110, 120))
        android.graphics
            .Canvas(bitmap)
            .drawText(
                "Preview",
                32f,
                240f,
                android.graphics.Paint().apply {
                    color = android.graphics.Color.WHITE
                    textSize = 48f
                },
            )
        attachment.outputStream().use {
            bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it)
        }
        bitmap.recycle()
        val instrumentation =
            androidx.test.platform.app.InstrumentationRegistry.getInstrumentation()
        val result =
            android.content
                .Intent()
                .setData(
                    androidx.core.content.FileProvider.getUriForFile(
                        app,
                        "${app.packageName}.testshare",
                        attachment,
                    )
                )
        val filter =
            android.content.IntentFilter(android.content.Intent.ACTION_OPEN_DOCUMENT).apply {
                addCategory(android.content.Intent.CATEGORY_OPENABLE)
                addDataType("*/*")
            }
        val monitor =
            instrumentation.addMonitor(
                filter,
                android.app.Instrumentation.ActivityResult(android.app.Activity.RESULT_OK, result),
                true,
            )
        lateinit var model: EidosModel
        try {
            compose.runOnUiThread {
                model = EidosModel(app, repository)
                compose.activity.setContent { EidosApp(model) }
            }
            compose.waitUntil(15_000) { !model.state.value.busy }
            compose.runOnUiThread { model.open(runBlocking { repository.file(path) }) }
            waitJs(
                "document.querySelector('canvas')?.textContent.includes('Import target') === true"
            )
            val point =
                org.json.JSONObject(
                    org.json
                        .JSONTokener(
                            js(
                                "JSON.stringify((()=>{const r=document.querySelector('canvas').getBoundingClientRect();return {x:r.left+100,y:r.top+60,width:innerWidth}})())"
                            )
                        )
                        .nextValue() as String
                )
            val origin = IntArray(2)
            var scale = 1f
            compose.runOnUiThread {
                val web = findWeb(compose.activity.window.decorView)!!
                web.getLocationOnScreen(origin)
                scale = web.width / point.getDouble("width").toFloat()
            }
            val now = android.os.SystemClock.uptimeMillis()
            for (action in
                listOf(android.view.MotionEvent.ACTION_DOWN, android.view.MotionEvent.ACTION_UP)) {
                val event =
                    android.view.MotionEvent.obtain(
                        now,
                        android.os.SystemClock.uptimeMillis(),
                        action,
                        origin[0] + point.getDouble("x").toFloat() * scale,
                        origin[1] + point.getDouble("y").toFloat() * scale,
                        0,
                    )
                event.source = android.view.InputDevice.SOURCE_TOUCHSCREEN
                instrumentation.sendPointerSync(event)
                event.recycle()
            }
            waitJs("document.querySelector('.eidos-mobile-cell-sheet') !== null")
            screenshot("attachment-import-choices.png")
            val photoIntent =
                androidx.activity.result.contract.ActivityResultContracts.PickMultipleVisualMedia()
                    .createIntent(
                        app,
                        androidx.activity.result.PickVisualMediaRequest(
                            androidx.activity.result.contract.ActivityResultContracts
                                .PickVisualMedia
                                .ImageOnly
                        ),
                    )
            val photoMonitor =
                instrumentation.addMonitor(
                    android.content.IntentFilter(photoIntent.action).apply {
                        addDataType("image/*")
                    },
                    android.app.Instrumentation.ActivityResult(
                        android.app.Activity.RESULT_CANCELED,
                        null,
                    ),
                    true,
                )
            try {
                js(
                    "Array.from(document.querySelectorAll('.eidos-mobile-cell-sheet button')).find(b=>/Add from photos|从相册添加/.test(b.textContent)).click()"
                )
                compose.waitUntil(15000) { photoMonitor.hits > 0 }
                waitJs(
                    "Array.from(document.querySelectorAll('.eidos-mobile-cell-sheet button')).some(b=>/Add files|添加文件/.test(b.textContent) && !b.disabled)"
                )
            } finally {
                instrumentation.removeMonitor(photoMonitor)
            }
            js(
                "Array.from(document.querySelectorAll('.eidos-mobile-cell-sheet button')).find(b=>/Add files|添加文件/.test(b.textContent)).click()"
            )
            compose.waitUntil(15_000) { monitor.hits > 0 }
            waitJs(
                "document.querySelector('.eidos-mobile-cell-sheet').textContent.includes('cover.png')"
            )
            js(
                "Array.from(document.querySelectorAll('.eidos-mobile-cell-sheet button')).find(b=>b.getAttribute('aria-label')?.includes('cover.png') && /Preview|预览/.test(b.getAttribute('aria-label'))).click()"
            )
            waitJs("document.querySelector('[data-eidos-file-attachment-preview]') !== null")
            waitJs(
                "Array.from(document.querySelectorAll('[data-eidos-file-attachment-preview] img')).some(img=>img.complete && img.naturalWidth === 320)"
            )
            assertEquals(
                "true",
                js(
                    "(()=>{const preview=document.querySelector('[data-eidos-file-attachment-preview]');const sheet=document.querySelector('.eidos-mobile-cell-sheet');const button=preview.querySelector('button');const r=button.getBoundingClientRect();return Number(getComputedStyle(preview).zIndex)>Number(getComputedStyle(sheet).zIndex) && button.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))})()"
                ),
            )
            screenshot("mobile-attachment-preview-layer.png")
            assertEquals(
                "true",
                js(
                    "(()=>{const preview=document.querySelector('[data-eidos-file-attachment-preview]');const r=preview.getBoundingClientRect();return r.top>=0 && r.bottom<=innerHeight && Array.from(preview.querySelectorAll('button')).every(b=>{const p=b.getBoundingClientRect();return p.top>=0 && p.bottom<=innerHeight})})()"
                ),
            )
            js("document.querySelector('[data-eidos-file-attachment-preview] button').click()")
            waitJs("document.querySelector('[data-eidos-file-attachment-preview]') === null")
            js(
                "Array.from(document.querySelectorAll('.eidos-mobile-cell-sheet button')).find(b=>/^(Done|完成)$/.test(b.getAttribute('aria-label') || '')).click()"
            )
            val field = page.fields.single { it.name == "附件" }
            compose.waitUntil(15_000) {
                runBlocking { repository.loadEidos(path) }
                    .rows
                    .single()
                    .values[field.id]
                    .toString()
                    .contains("cover.png")
            }
            assertEquals(1, File(root, "assets").walkTopDown().count { it.isFile })
        } finally {
            instrumentation.removeMonitor(monitor)
            compose.runOnUiThread {
                compose.activity.setContent {}
                model.viewModelScope.cancel()
            }
            runBlocking { repository.close() }
            root.deleteRecursively()
            fixture.deleteRecursively()
        }
    }

    @Test
    fun markdownImportsImageAndFileThroughSystemPicker() {
        val app = compose.activity.application
        app.getSharedPreferences("editor", 0).edit().putBoolean("web", true).commit()
        val id = "picker-${UUID.randomUUID()}"
        val repository = SpaceRepository(app, id)
        val root = File(app.filesDir, "spaces/$id")
        val note = runBlocking { repository.create("", "Attachments", "markdown") }
        File(root, note).writeText("# Attachments\n\nExisting text\n")
        val fixture = File(app.cacheDir, "test-share/$id").apply { mkdirs() }
        val image = File(fixture, "picture.png")
        android.graphics.Bitmap.createBitmap(120, 80, android.graphics.Bitmap.Config.ARGB_8888)
            .let { bitmap ->
                bitmap.eraseColor(android.graphics.Color.BLUE)
                image.outputStream().use {
                    bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it)
                }
                bitmap.recycle()
            }
        val attachment = File(fixture, "report.txt").apply { writeText("Local attachment") }
        val instrumentation =
            androidx.test.platform.app.InstrumentationRegistry.getInstrumentation()
        lateinit var model: EidosModel
        fun pick(file: File, label: String) {
            val result =
                android.content
                    .Intent()
                    .setData(
                        androidx.core.content.FileProvider.getUriForFile(
                            app,
                            "${app.packageName}.testshare",
                            file,
                        )
                    )
            val filter =
                if (label == "图片") {
                    val intent =
                        androidx.activity.result.contract.ActivityResultContracts
                            .PickMultipleVisualMedia()
                            .createIntent(
                                app,
                                androidx.activity.result.PickVisualMediaRequest(
                                    androidx.activity.result.contract.ActivityResultContracts
                                        .PickVisualMedia
                                        .ImageOnly
                                ),
                            )
                    assertTrue(intent.action != android.content.Intent.ACTION_OPEN_DOCUMENT)
                    android.content.IntentFilter(intent.action).apply { addDataType("image/*") }
                } else {
                    android.content
                        .IntentFilter(android.content.Intent.ACTION_OPEN_DOCUMENT)
                        .apply {
                            addCategory(android.content.Intent.CATEGORY_OPENABLE)
                            addDataType("*/*")
                        }
                }
            val monitor =
                instrumentation.addMonitor(
                    filter,
                    android.app.Instrumentation.ActivityResult(
                        android.app.Activity.RESULT_OK,
                        result,
                    ),
                    true,
                )
            try {
                js("document.querySelector('button[aria-label=插入内容]').click()")
                waitJs("document.querySelector('button[aria-label=$label]') !== null")
                js("document.querySelector('button[aria-label=$label]').click()")
                compose.waitUntil(15_000) { monitor.hits > 0 }
                compose.waitUntil(15_000) { File(root, note).readText().contains(file.name) }
            } finally {
                instrumentation.removeMonitor(monitor)
            }
        }
        try {
            compose.runOnUiThread {
                model = EidosModel(app, repository)
                compose.activity.setContent { EidosApp(model) }
            }
            compose.waitUntil(15_000) { !model.state.value.busy }
            compose.runOnUiThread { model.open(runBlocking { repository.file(note) }) }
            waitJs("document.querySelector('[contenteditable=true]') !== null")
            pick(image, "图片")
            waitJs("Array.from(document.images).some(i=>i.naturalWidth===120)")
            pick(attachment, "文件")
            val saved = File(root, note).readText()
            assertTrue(saved.contains("![picture.png]"))
            assertTrue(saved.contains("[report.txt](assets/import-"))
            assertTrue(saved.contains("Existing text"))
            assertEquals(2, File(root, "assets").walkTopDown().count { it.isFile })
            assertEquals(
                "true",
                js(
                    "document.querySelector('[contenteditable=true]').getBoundingClientRect().width > 200"
                ),
            )
            js("document.activeElement.blur()")
            instrumentation.waitForIdleSync()
            android.os.SystemClock.sleep(1000)
            screenshot("editor-imported-attachments.png")
            js("document.querySelector('[data-efm-image-block]').scrollIntoView({block:'center'})")
            touchCanvas(20f, 20f, 700L, "[data-efm-image-block]")
            waitJs("document.querySelector('.eme-mobile-image-sheet')?.open === true")
            screenshot("markdown-image-actions.png")
            js(
                "(()=>{const input=document.querySelectorAll('.eme-mobile-image-sheet input')[1];Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Updated cover');input.dispatchEvent(new Event('input',{bubbles:true}));})()"
            )
            js("document.querySelector('.eme-mobile-image-sheet form').requestSubmit()")
            waitJs("document.querySelector('.eme-mobile-image-sheet') === null")
            compose.waitUntil(10000) { File(root, note).readText().contains("![Updated cover]") }
            touchCanvas(20f, 20f, 700L, "[data-efm-image-block]")
            waitJs("document.querySelector('.eme-mobile-image-sheet')?.open === true")
            js(
                "Array.from(document.querySelectorAll('.eme-mobile-image-sheet button')).find(b=>b.textContent==='删除图片').click()"
            )
            waitJs("document.querySelector('[data-efm-image-block]') === null")
            compose.waitUntil(10000) { !File(root, note).readText().contains("![Updated cover]") }
            assertTrue(File(root, note).readText().contains("Existing text"))
            assertEquals(
                "true",
                js("document.activeElement?.getAttribute('contenteditable') === 'true'"),
            )
            js(
                "Array.from(document.querySelectorAll('.eme-mobile-tools button')).find(b=>/^(Undo|撤销)$/.test(b.getAttribute('aria-label') || '')).click()"
            )
            waitJs("document.querySelector('[data-efm-image-block]') !== null")
            compose.waitUntil(10000) { File(root, note).readText().contains("![Updated cover]") }
        } finally {
            compose.runOnUiThread {
                compose.activity.setContent {}
                model.viewModelScope.cancel()
            }
            runBlocking { repository.close() }
            root.deleteRecursively()
            fixture.deleteRecursively()
        }
    }

    @Test
    fun gridDragDoesNotOpenDateEditorButTapDoes() {
        val app = compose.activity.application
        val preferences = app.getSharedPreferences("editor", 0)
        val previousWeb = preferences.getBoolean("web", true)
        preferences.edit().putBoolean("web", true).commit()
        val id = "grid-touch-${UUID.randomUUID()}"
        val repository = SpaceRepository(app, id)
        val root = File(app.filesDir, "spaces/$id")
        val path = "Touch.eidos"
        NativeRuntime.call(
            File(root, path).path,
            "create",
            org.json.JSONObject(
                """{"title":"Touch","fields":[
                  {"clientKey":"date","name":"日期","kind":"date","position":"0"},
                  {"clientKey":"title","name":"标题","kind":"text","position":"1"}
                ]}"""
            ),
        )
        val page = runBlocking { repository.loadEidos(path) }
        runBlocking {
            repository.mutate(page, null, mapOf(page.table!!.labelFieldId to "Touch test"))
        }
        lateinit var model: EidosModel
        try {
            compose.runOnUiThread {
                model = EidosModel(app, repository)
                compose.activity.setContent { EidosApp(model) }
            }
            compose.waitUntil(30_000) {
                model.state.value.files.isNotEmpty() && !model.state.value.busy
            }
            compose.runOnUiThread { model.open(runBlocking { repository.file(path) }) }
            waitJs("document.querySelector('canvas')?.getBoundingClientRect().height > 60")
            // Wait for the first data row, not just the canvas shell.
            waitJs("document.querySelector('canvas')?.textContent.includes('Touch test') === true")
            val point =
                org.json.JSONObject(
                    org.json
                        .JSONTokener(
                            js(
                                "JSON.stringify((()=>{const r=document.querySelector('canvas').getBoundingClientRect();return {x:r.left+100,y:r.top+60,width:innerWidth}})())"
                            )
                        )
                        .nextValue() as String
                )
            val origin = IntArray(2)
            var scale = 1f
            compose.runOnUiThread {
                val web = findWeb(compose.activity.window.decorView)!!
                web.getLocationOnScreen(origin)
                scale = web.width / point.getDouble("width").toFloat()
            }
            val x = origin[0] + point.getDouble("x").toFloat() * scale
            val y = origin[1] + point.getDouble("y").toFloat() * scale
            val instrumentation =
                androidx.test.platform.app.InstrumentationRegistry.getInstrumentation()
            fun gesture(distance: Float) {
                val start = android.os.SystemClock.uptimeMillis()
                fun send(action: Int, offset: Float) {
                    val event =
                        android.view.MotionEvent.obtain(
                            start,
                            android.os.SystemClock.uptimeMillis(),
                            action,
                            x,
                            y + offset,
                            0,
                        )
                    event.source = android.view.InputDevice.SOURCE_TOUCHSCREEN
                    instrumentation.sendPointerSync(event)
                    event.recycle()
                }
                send(android.view.MotionEvent.ACTION_DOWN, 0f)
                for (step in 1..4) {
                    android.os.SystemClock.sleep(16)
                    send(android.view.MotionEvent.ACTION_MOVE, distance * step / 4)
                }
                send(android.view.MotionEvent.ACTION_UP, distance)
                instrumentation.waitForIdleSync()
            }
            gesture(12 * scale)
            assertEquals("true", js("document.querySelector('.eidos-mobile-cell-sheet') === null"))
            screenshot("grid-touch-after-drag.png")
            gesture(0f)
            waitJs("document.querySelector('.eidos-mobile-date-editor button[name=day]') !== null")
            assertEquals(
                "true",
                js(
                    "(()=>{const r=document.querySelector('.eidos-mobile-cell-sheet').getBoundingClientRect();return r.height>120 && Math.abs(r.bottom-innerHeight)<2})()"
                ),
            )
            // DOM layout can finish before WebView submits its next visible frame.
            val rendered = CountDownLatch(1)
            compose.runOnUiThread {
                val web = findWeb(compose.activity.window.decorView)!!
                web.postVisualStateCallback(
                    1,
                    object : WebView.VisualStateCallback() {
                        override fun onComplete(requestId: Long) {
                            web.postOnAnimation { web.postOnAnimation { rendered.countDown() } }
                        }
                    },
                )
            }
            assertTrue(rendered.await(30, TimeUnit.SECONDS))
            waitJs(
                "Boolean(document.elementFromPoint(innerWidth/2, innerHeight-100)?.closest('.eidos-mobile-cell-sheet'))"
            )
            instrumentation.waitForIdleSync()
            // Allow the emulator display compositor to present the submitted WebView frame.
            android.os.SystemClock.sleep(1000)
            screenshot("grid-touch-date-sheet.png")
        } finally {
            compose.runOnUiThread {
                compose.activity.setContent {}
                model.viewModelScope.cancel()
            }
            runBlocking { repository.close() }
            preferences.edit().putBoolean("web", previousWeb).commit()
            root.deleteRecursively()
        }
    }

    @Test
    fun markdownViewportEndsAtKeyboardAndHasNoBlockControls() {
        val app = compose.activity.application
        app.getSharedPreferences("editor", 0).edit().putBoolean("web", true).commit()
        val id = "viewport-${UUID.randomUUID()}"
        val repository = SpaceRepository(app, id)
        val note = runBlocking { repository.create("", "Viewport", "markdown") }
        File(app.filesDir, "spaces/$id/$note").writeText("# Title\n\nEditable paragraph\n")
        lateinit var model: EidosModel
        try {
            compose.runOnUiThread {
                model = EidosModel(app, repository)
                compose.activity.setContent { EidosApp(model) }
            }
            compose.waitUntil(15000) { !model.state.value.busy }
            compose.runOnUiThread { model.open(runBlocking { repository.file(note) }) }
            waitJs("document.querySelector('[contenteditable=true]') !== null")
            js("document.querySelector('[contenteditable=true]').focus()")
            touchCanvas(35f, 35f, target = "[contenteditable=true]")
            compose.runOnUiThread {
                val web = findWeb(compose.activity.window.decorView)!!
                web.requestFocus()
                val keyboard =
                    app.getSystemService(android.content.Context.INPUT_METHOD_SERVICE)
                        as android.view.inputmethod.InputMethodManager
                keyboard.showSoftInput(
                    web,
                    android.view.inputmethod.InputMethodManager.SHOW_IMPLICIT,
                )
            }
            val measured = waitForKeyboardViewport()
            assertEquals(
                "true",
                js("document.querySelector('.eme-insert-trigger, .eme-block-drag-handle') === null"),
            )
            assertEquals(
                "true",
                js(
                    "Math.abs(document.querySelector('.eme-mobile-dock').getBoundingClientRect().bottom - innerHeight) <= 2"
                ),
            )
            assertTrue(measured.isNotEmpty())
        } finally {
            compose.runOnUiThread {
                compose.activity.setContent {}
                model.viewModelScope.cancel()
            }
            runBlocking { repository.close() }
            File(app.filesDir, "spaces/$id").deleteRecursively()
        }
    }

    @Test
    fun returningToFilesIsImmediateAndDoesNotBlockTheNextNavigation() {
        val app = compose.activity.application
        app.getSharedPreferences("editor", 0).edit().putBoolean("web", true).commit()
        val id = "return-test-${UUID.randomUUID()}"
        val repository = SpaceRepository(app, id)
        val root = File(app.filesDir, "spaces/$id")
        val note = runBlocking { repository.create("", "Note", "markdown") }
        val folder = runBlocking { repository.create("", "Folder", "folder") }
        val noteFile = runBlocking { repository.file(note) }
        val folderFile = runBlocking { repository.file(folder) }
        lateinit var model: EidosModel
        try {
            compose.runOnUiThread { model = EidosModel(app, repository) }
            compose.waitUntil(15_000) {
                model.state.value.files.isNotEmpty() && !model.state.value.busy
            }
            compose.runOnUiThread { model.open(noteFile) }
            compose.waitUntil(15_000) {
                model.state.value.webFile != null && !model.state.value.busy
            }
            compose.runOnUiThread {
                val cached = model.state.value.files
                model.leaveWebEditor()
                assertNull(model.state.value.webFile)
                assertFalse(model.state.value.busy)
                assertSame(cached, model.state.value.files)
                // A tap during metadata refresh must be accepted, and its new folder
                // must not be replaced by the old directory's late refresh result.
                model.open(folderFile)
            }
            compose.waitUntil(15_000) {
                model.state.value.folder == folder && !model.state.value.busy
            }
            compose.runOnIdle {
                assertTrue(model.state.value.files.isEmpty())
                assertNull(model.state.value.error)
            }
        } finally {
            compose.runOnUiThread { model.viewModelScope.cancel() }
            runBlocking { repository.close() }
            root.deleteRecursively()
        }
    }

    private fun createMobileView(type: String) {
        js("document.querySelector('.mobile-view-switcher').click()")
        waitJs("document.querySelector('button[aria-label=新建视图]') !== null")
        js("document.querySelector('button[aria-label=新建视图]').click()")
        waitJs("document.querySelector('[data-create-view=\"$type\"]') !== null")
        js("window.eidosLeave('back')")
        waitJs("document.querySelector('[data-create-view]') === null")
        js("document.querySelector('button[aria-label=新建视图]').click()")
        waitJs("document.querySelector('[data-create-view=\"$type\"]') !== null")
        screenshot("mobile-new-view.png")
        js("document.querySelector('[data-create-view=\"$type\"]').click()")
        waitJs("document.querySelector('[data-create-view]') === null")
    }

    private fun swipeFieldList() {
        val point =
            org.json.JSONObject(
                org.json
                    .JSONTokener(
                        js(
                            "JSON.stringify((()=>{const r=document.querySelector('.eidos-mobile-fields-list').getBoundingClientRect();return {x:r.left+r.width*0.6,y:r.bottom-60,distance:Math.min(250,r.height-120),width:innerWidth}})())"
                        )
                    )
                    .nextValue() as String
            )
        val origin = IntArray(2)
        var scale = 1f
        compose.runOnUiThread {
            val web = findWeb(compose.activity.window.decorView)!!
            web.getLocationOnScreen(origin)
            scale = web.width / point.getDouble("width").toFloat()
        }
        val instrumentation =
            androidx.test.platform.app.InstrumentationRegistry.getInstrumentation()
        val start = android.os.SystemClock.uptimeMillis()
        for (step in 0..12) {
            val action =
                if (step == 0) android.view.MotionEvent.ACTION_DOWN
                else if (step == 12) android.view.MotionEvent.ACTION_UP
                else android.view.MotionEvent.ACTION_MOVE
            val event =
                android.view.MotionEvent.obtain(
                    start,
                    android.os.SystemClock.uptimeMillis(),
                    action,
                    origin[0] + point.getDouble("x").toFloat() * scale,
                    origin[1] +
                        (point.getDouble("y") - point.getDouble("distance") * step / 12).toFloat() *
                            scale,
                    0,
                )
            event.source = android.view.InputDevice.SOURCE_TOUCHSCREEN
            instrumentation.sendPointerSync(event)
            event.recycle()
            android.os.SystemClock.sleep(20)
        }
    }

    private fun waitForKeyboardViewport(): String {
        var measured = ""
        try {
            compose.waitUntil(15000) {
                var fits = false
                compose.runOnUiThread {
                    val decor = compose.activity.window.decorView
                    val web = findWeb(decor)!!
                    val insets = androidx.core.view.ViewCompat.getRootWindowInsets(decor)!!
                    val ime = androidx.core.view.WindowInsetsCompat.Type.ime()
                    val navigation = androidx.core.view.WindowInsetsCompat.Type.navigationBars()
                    val keyboard = insets.getInsets(ime).bottom
                    // Floating IMEs are visible with zero occlusion; the navigation bar
                    // remains the viewport edge. Docked IMEs replace that edge.
                    val bottomInset = maxOf(keyboard, insets.getInsets(navigation).bottom)
                    val location = IntArray(2)
                    web.getLocationOnScreen(location)
                    val origin = IntArray(2)
                    decor.getLocationOnScreen(origin)
                    val gap = origin[1] + decor.height - bottomInset - location[1] - web.height
                    measured = "keyboard=$keyboard, gap=$gap, height=${web.height}"
                    fits = insets.isVisible(ime) && kotlin.math.abs(gap) <= 2 && web.height > 0
                }
                fits
            }
        } catch (failure: androidx.compose.ui.test.ComposeTimeoutException) {
            throw AssertionError("Keyboard viewport: $measured", failure)
        }
        return measured
    }

    private fun findWeb(view: View): WebView? {
        if (view is WebView) return view
        if (view is ViewGroup)
            for (i in 0 until view.childCount) findWeb(view.getChildAt(i))?.let {
                return it
            }
        return null
    }

    private fun touchCanvas(dx: Float, dy: Float, duration: Long = 60L, target: String = "canvas") {
        val point =
            org.json.JSONObject(
                org.json
                    .JSONTokener(
                        js(
                            "JSON.stringify((()=>{const r=document.querySelector('$target').getBoundingClientRect();return {x:r.left+$dx,y:r.top+$dy,width:innerWidth}})())"
                        )
                    )
                    .nextValue() as String
            )
        val origin = IntArray(2)
        var scale = 1f
        compose.runOnUiThread {
            val web = findWeb(compose.activity.window.decorView)!!
            web.getLocationOnScreen(origin)
            scale = web.width / point.getDouble("width").toFloat()
        }
        val instrumentation =
            androidx.test.platform.app.InstrumentationRegistry.getInstrumentation()
        val start = android.os.SystemClock.uptimeMillis()
        for (action in
            listOf(android.view.MotionEvent.ACTION_DOWN, android.view.MotionEvent.ACTION_UP)) {
            val pointer =
                android.view.MotionEvent.PointerProperties().apply {
                    id = 0
                    toolType = android.view.MotionEvent.TOOL_TYPE_FINGER
                }
            val coordinates =
                android.view.MotionEvent.PointerCoords().apply {
                    x = origin[0] + point.getDouble("x").toFloat() * scale
                    y = origin[1] + point.getDouble("y").toFloat() * scale
                    pressure = 1f
                    size = 1f
                }
            val event =
                android.view.MotionEvent.obtain(
                    start,
                    android.os.SystemClock.uptimeMillis(),
                    action,
                    1,
                    arrayOf(pointer),
                    arrayOf(coordinates),
                    0,
                    0,
                    1f,
                    1f,
                    0,
                    0,
                    android.view.InputDevice.SOURCE_TOUCHSCREEN,
                    0,
                )
            instrumentation.sendPointerSync(event)
            event.recycle()
            if (action == android.view.MotionEvent.ACTION_DOWN)
                android.os.SystemClock.sleep(duration)
        }
        instrumentation.waitForIdleSync()
    }

    private fun js(script: String): String {
        val latch = CountDownLatch(1)
        var result = ""
        compose.runOnUiThread {
            val web = findWeb(compose.activity.window.decorView)
            // WebView can drop evaluation callbacks while navigating to the initial document.
            if (web == null || web.progress < 100) {
                result = "false"
                latch.countDown()
            } else
                web.evaluateJavascript(script) {
                    result = it
                    latch.countDown()
                }
        }
        assertTrue(latch.await(10, TimeUnit.SECONDS))
        return result
    }

    private fun waitJs(expression: String) {
        try {
            compose.waitUntil(30_000) { js(expression) == "true" }
        } catch (error: androidx.compose.ui.test.ComposeTimeoutException) {
            throw AssertionError(
                "$expression\n" +
                    js(
                        "document.body.innerText + '\\n' + JSON.stringify(Array.from(document.querySelectorAll('input')).map(i=>({value:i.value,disabled:i.disabled,readOnly:i.readOnly})))"
                    ),
                error,
            )
        }
    }

    private fun screenshot(name: String) {
        val frame = CountDownLatch(1)
        compose.runOnUiThread {
            val web = findWeb(compose.activity.window.decorView)
            if (web == null) frame.countDown()
            else
                web.postVisualStateCallback(
                    0,
                    object : WebView.VisualStateCallback() {
                        override fun onComplete(requestId: Long) {
                            web.postOnAnimation { web.postOnAnimation { frame.countDown() } }
                        }
                    },
                )
        }
        assertTrue(frame.await(10, TimeUnit.SECONDS))
        // Wait for the submitted WebView frame to reach the emulator compositor.
        android.os.SystemClock.sleep(500)
        androidx.test.platform.app.InstrumentationRegistry.getInstrumentation()
            .uiAutomation
            .takeScreenshot()
            .let { bitmap ->
                File(compose.activity.getExternalFilesDir(null), name).outputStream().use {
                    bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it)
                }
                bitmap.recycle()
            }
    }

    @Test
    fun sharedEditorsPersistToLocalFilesAndIgnoreRetiredNativePreference() {
        val app = compose.activity.application
        app.getSharedPreferences("editor", 0).edit().putBoolean("web", false).commit()
        val id = "web-test-${UUID.randomUUID()}"
        val repository = SpaceRepository(app, id)
        val root = File(app.filesDir, "spaces/$id")
        val note = runBlocking { repository.create("", "Web note", "markdown") }
        File(root, note).writeText("# Shared Markdown\n\nOriginal text\n")
        val data = runBlocking { repository.create("", "Web data", "eidos") }
        lateinit var model: EidosModel
        try {
            compose.runOnUiThread {
                model = EidosModel(app, repository)
                compose.activity.setContent { EidosApp(model) }
            }
            compose.waitUntil(15_000) {
                model.state.value.files.isNotEmpty() && !model.state.value.busy
            }
            compose.runOnUiThread { model.open(runBlocking { repository.file(note) }) }
            compose.waitUntil(15_000) { model.state.value.webFile != null }
            waitJs(
                "document.querySelector('[contenteditable=true]') !== null && document.querySelector('.eme-mobile-toolbar') !== null"
            )
            assertTrue(js("document.body.innerText").contains("Shared Markdown"))
            var firstWeb: WebView? = null
            compose.runOnUiThread { firstWeb = findWeb(compose.activity.window.decorView) }
            js("window.editorShellMarker = 'retained'")
            assertEquals("true", js("document.querySelector('.markdown-page > .tools') === null"))
            compose.runOnUiThread { findWeb(compose.activity.window.decorView)!!.requestFocus() }
            js(
                "(()=>{const t=document.querySelector('[contenteditable=true] p').firstChild;const r=document.createRange();r.selectNodeContents(t);getSelection().removeAllRanges();getSelection().addRange(r);document.dispatchEvent(new Event('selectionchange'));})()"
            )
            js("document.querySelector('button[aria-label=文字格式]').click()")
            waitJs("document.querySelector('.eme-mobile-panel') !== null")
            js("document.querySelector('button[aria-label=加粗]').click()")
            compose.waitUntil(15_000) { File(root, note).readText().contains("**Original text**") }
            js(
                """
                (() => {
                  const native = window.EidosAndroid;
                  window.markdownSaveCount = 0;
                  window.EidosAndroid = { postMessage(raw) {
                    const message = JSON.parse(raw);
                    window.lastSession = message.session;
                    if (message.method === 'markdown.save') window.markdownSaveCount++;
                    native.postMessage(raw);
                  }};
                  const editor = document.querySelector('[contenteditable=true]');
                  editor.focus();
                  const range = document.createRange(); range.selectNodeContents(editor); range.collapse(false);
                  getSelection().removeAllRanges(); getSelection().addRange(range);
                  let count = 0;
                  const type = () => {
                    document.execCommand('insertText', false, 'z');
                    if (++count < 12) setTimeout(type, 10); else window.typingDone = true;
                  };
                  type();
                })()
            """
                    .trimIndent()
            )
            waitJs("window.typingDone === true")
            compose.waitUntil(15_000) { File(root, note).readText().contains("zzzzzzzzzzzz") }
            assertEquals("1", js("window.markdownSaveCount"))
            js("document.execCommand('insertText', false, 'background-flushed')")
            compose.activityRule.scenario.moveToState(androidx.lifecycle.Lifecycle.State.CREATED)
            runBlocking {
                kotlinx.coroutines.withTimeout(15_000) {
                    while (!File(root, note).readText().contains("background-flushed")) kotlinx
                        .coroutines
                        .delay(20)
                }
            }
            compose.activityRule.scenario.moveToState(androidx.lifecycle.Lifecycle.State.RESUMED)
            compose.runOnUiThread {
                assertSame(firstWeb, findWeb(compose.activity.window.decorView))
            }
            js(
                "document.querySelector('[contenteditable=true]').focus(); const r = document.createRange(); r.selectNodeContents(document.querySelector('[contenteditable=true]')); r.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(r)"
            )
            assertEquals(
                "true",
                js("document.querySelector('main').getBoundingClientRect().height > 100"),
            )
            screenshot("embedded-markdown.png")
            assertEquals(
                "true",
                js(
                    "document.querySelector('.eme-mobile-toolbar').getBoundingClientRect().bottom <= innerHeight + 1"
                ),
            )
            js(
                "window.retiredSession = window.lastSession; document.execCommand('insertText', false, 'exit-flushed'); window.eidosLeave('back')"
            )
            compose.waitUntil(15_000) { model.state.value.webFile == null }
            assertTrue(File(root, note).readText().contains("Original text"))
            assertTrue(File(root, note).readText().contains("**"))
            assertTrue(File(root, note).readText().contains("exit-flushed"))
            compose.runOnUiThread { model.open(runBlocking { repository.file(data) }) }
            compose.waitUntil(15_000) {
                model.state.value.webFile?.path == data && !model.state.value.busy
            }
            waitJs("document.querySelector('.mobile-view-switcher') !== null")
            compose.runOnUiThread {
                assertSame(firstWeb, findWeb(compose.activity.window.decorView))
            }
            assertEquals("\"retained\"", js("window.editorShellMarker"))
            js(
                """
                (() => {
                  const reply = window.eidosReply;
                  const activeSession = window.lastSession;
                  window.eidosReply = (id, result) => {
                    if (id === 'session-check') window.sessionChecked = true;
                    else reply(id, result);
                  };
                  window.EidosAndroid.postMessage(JSON.stringify({id:'stale-leave',session:window.retiredSession,method:'leave',params:{mode:'back'}}));
                  window.EidosAndroid.postMessage(JSON.stringify({id:'session-check',session:activeSession,method:'editor.ready'}));
                })()
            """
                    .trimIndent()
            )
            waitJs("window.sessionChecked === true")
            assertEquals(data, model.state.value.webFile?.path)
            createMobileView("gallery")
            waitJs(
                "document.querySelector('.mobile-view-switcher')?.textContent.includes('画廊') === true"
            )
            assertEquals("null", js("document.querySelector('[role=alert]')?.textContent ?? null"))
            js("document.querySelector('button[aria-label=新记录]').click()")
            waitJs("document.querySelector('textarea[aria-label=标题]')?.disabled === false")
            assertEquals(
                "true",
                js("document.querySelector('main').getBoundingClientRect().height > 100"),
            )
            compose.runOnUiThread { findWeb(compose.activity.window.decorView)!!.requestFocus() }
            js(
                "(()=>{const t=document.querySelector('textarea[aria-label=标题]');t.focus();Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,'WebView record');t.dispatchEvent(new Event('input',{bubbles:true}));})()"
            )
            waitJs("document.querySelector('textarea[aria-label=标题]')?.title === 'WebView record'")
            assertEquals(
                "true",
                js("document.activeElement === document.querySelector('textarea[aria-label=标题]')"),
            )
            js("document.activeElement.blur()")
            waitJs("document.querySelector('textarea[aria-label=标题]')?.value === 'WebView record'")
            waitJs("document.querySelector('[role=alert]') === null")
            screenshot("embedded-record.png")
            // Read through the same serialized canonical Runtime transport, without ending its
            // session.
            val snapshot = runBlocking {
                repository.embeddedRuntime(data, "getSnapshot", org.json.JSONObject())
            }
            assertNotNull(snapshot)
            js("window.eidosLeave('back')")
            waitJs("document.querySelector('textarea[aria-label=标题]') === null")
            js("window.eidosLeave('back')")
            compose.waitUntil(15_000) { model.state.value.webFile == null }
            val saved = runBlocking { repository.loadEidos(data) }
            assertEquals(1, saved.rows.size)
            assertTrue(saved.views.any { it.name == "画廊" })
            assertTrue(saved.rows.toString().contains("WebView record"))
            File(root, "broken.eidos").writeText("not a SQLite database")
            compose.runOnUiThread { model.open(runBlocking { repository.file("broken.eidos") }) }
            compose.waitUntil(15_000) { model.state.value.webFile?.path == "broken.eidos" }
            waitJs("Boolean(document.querySelector('[role=alert]')?.textContent)")
            compose.waitUntil(15_000) {
                compose
                    .onAllNodes(
                        SemanticsMatcher.keyIsDefined(
                            androidx.compose.ui.semantics.SemanticsProperties.ProgressBarRangeInfo
                        )
                    )
                    .fetchSemanticsNodes()
                    .isEmpty()
            }
            compose.onNodeWithContentDescription("返回文件").performClick()
            compose.waitUntil(15_000) { model.state.value.webFile == null }
        } finally {
            compose.runOnUiThread { model.viewModelScope.cancel() }
            runBlocking { repository.close() }
            root.deleteRecursively()
            app.getSharedPreferences("editor", 0).edit().putBoolean("web", true).commit()
        }
    }
}
