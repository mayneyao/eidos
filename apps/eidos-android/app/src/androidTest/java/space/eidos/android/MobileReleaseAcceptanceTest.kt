package space.eidos.android

import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import androidx.activity.compose.setContent
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import androidx.lifecycle.viewModelScope
import java.io.File
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.cancel
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Rule
import org.junit.Test

class MobileReleaseAcceptanceTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()
    private var previousHardwareKeyboardIme: String? = null

    @Before
    fun enableSoftwareKeyboardForViewportChecks() {
        val instrumentation = androidx.test.platform.app.InstrumentationRegistry.getInstrumentation()
        previousHardwareKeyboardIme = android.provider.Settings.Secure.getString(
            instrumentation.targetContext.contentResolver, "show_ime_with_hard_keyboard")
        instrumentation.uiAutomation.executeShellCommand("settings put secure show_ime_with_hard_keyboard 1")
            .use { android.os.ParcelFileDescriptor.AutoCloseInputStream(it).readBytes() }
    }

    @After
    fun restoreSoftwareKeyboardPreference() {
        val command = previousHardwareKeyboardIme?.let {
            "settings put secure show_ime_with_hard_keyboard $it"
        } ?: "settings delete secure show_ime_with_hard_keyboard"
        androidx.test.platform.app.InstrumentationRegistry.getInstrumentation()
            .uiAutomation.executeShellCommand(command)
            .use { android.os.ParcelFileDescriptor.AutoCloseInputStream(it).readBytes() }
    }

    @Test
    fun emptyImageBlockOpensSystemPickerAndCancelPreservesDocument() {
        val app = compose.activity.application
        val id = "image-placeholder-${UUID.randomUUID()}"
        val repository = SpaceRepository(app, id)
        val root = File(app.filesDir, "spaces/$id")
        val path = runBlocking { repository.create("", "Empty image", "markdown") }
        val original = "Before image\n\n![]()\n\nAfter image\n"
        File(root, path).writeText(original)
        val instrumentation = androidx.test.platform.app.InstrumentationRegistry.getInstrumentation()
        lateinit var model: EidosModel
        val intent = androidx.activity.result.contract.ActivityResultContracts.PickMultipleVisualMedia()
            .createIntent(app, androidx.activity.result.PickVisualMediaRequest(
                androidx.activity.result.contract.ActivityResultContracts.PickVisualMedia.ImageOnly))
        val picker = checkNotNull(intent.resolveActivity(app.packageManager))
        val monitor = instrumentation.addMonitor(android.content.IntentFilter(intent.action).apply { addDataType("image/*") }, null, false)
        fun resumed(packageName: String): Boolean = instrumentation.uiAutomation
            .executeShellCommand("dumpsys activity activities")
            .use { android.os.ParcelFileDescriptor.AutoCloseInputStream(it).bufferedReader().readText() }
            .lineSequence().any { (it.contains("topResumedActivity") || it.contains("mResumedActivity")) && it.contains(packageName) }
        try {
            compose.runOnUiThread { model = EidosModel(app, repository); compose.activity.setContent { EidosApp(model) } }
            compose.waitUntil(15_000) { !model.state.value.busy }
            compose.runOnUiThread { model.open(runBlocking { repository.file(path) }) }
            waitJs("document.querySelector('button.eme-efm-image-placeholder') !== null")
            tap("button.eme-efm-image-placeholder")
            compose.waitUntil(15_000) {
                monitor.hits > 0 && resumed(picker.packageName) &&
                    instrumentation.uiAutomation.rootInActiveWindow?.packageName?.toString() == picker.packageName
            }
            android.os.SystemClock.sleep(500)
            val image = instrumentation.uiAutomation.takeScreenshot()
            if (image != null) {
                val evidence = File(app.getExternalFilesDir("release-acceptance"), "empty-block-native-picker.png")
                evidence.outputStream().use { image.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }
                image.recycle()
            }
            instrumentation.sendKeyDownUpSync(android.view.KeyEvent.KEYCODE_BACK)
            compose.waitUntil(15_000) { resumed(app.packageName) }
            waitJs("document.querySelector('button.eme-efm-image-placeholder') !== null")
            assertEquals(original, File(root, path).readText())
            compose.onNodeWithContentDescription("返回文件").performClick()
            compose.waitUntil(15_000) { model.state.value.webFile == null }
            compose.runOnUiThread { model.open(runBlocking { repository.file(path) }) }
            waitJs("document.querySelector('button.eme-efm-image-placeholder') !== null")
            assertEquals(original, runBlocking { repository.readText(path) }.text)
        } finally {
            instrumentation.removeMonitor(monitor)
            compose.runOnUiThread { compose.activity.setContent {}; model.viewModelScope.cancel() }
            runBlocking { repository.close() }
            root.deleteRecursively()
            app.deleteSharedPreferences("space-$id")
        }
    }

    @Test
    fun mobileConversionReviewsNullCountBeforePointerConfirmation() {
        val app = compose.activity.application
        val id = "checkbox-conversion-ui-${UUID.randomUUID()}"
        val repository = SpaceRepository(app, id)
        val root = File(app.filesDir, "spaces/$id")
        check(root.exists() || root.mkdirs())
        val path = "Convert.eidos"
        NativeRuntime.call(File(root, path).path, "create", JSONObject("""{"title":"Mobile conversion","fields":[{"clientKey":"title","name":"标题","kind":"text","position":"0"},{"clientKey":"flag","name":"Flag","kind":"text","position":"1"}]}"""))
        val empty = runBlocking { repository.loadEidos(path) }
        val label = checkNotNull(empty.table).labelFieldId
        val flag = empty.fields.single { it.name == "Flag" }.id
        for ((index, value) in listOf(JSONObject.NULL, "true", "false").withIndex()) {
            runBlocking { repository.mutate(repository.loadEidos(path), null, mapOf(label to "Keep $index", flag to value)) }
        }
        lateinit var model: EidosModel
        try {
            compose.runOnUiThread { model = EidosModel(app, repository); compose.activity.setContent { EidosApp(model) } }
            compose.waitUntil(15_000) { !model.state.value.busy }
            compose.runOnUiThread { model.open(runBlocking { repository.file(path) }) }
            waitJs("document.querySelector('button[aria-label=视图设置]') !== null")
            js("document.querySelector('button[aria-label=视图设置]').click()")
            waitJs("document.querySelector('button[aria-label=管理字段]') !== null")
            js("document.querySelector('button[aria-label=管理字段]').click()")
            waitJs("document.querySelector('button[aria-label=编辑Flag属性]') !== null")
            js("document.querySelector('button[aria-label=编辑Flag属性]').click()")
            waitJs("document.querySelector('[data-eidos-file-detail-panel=field] button[role=combobox]') !== null")
            val beforeReview = File(root, path).readBytes()
            fun review() {
                tap("[data-eidos-file-detail-panel=field] button[role=combobox]")
                waitJs("document.querySelector('[data-eidos-file-field-type=checkbox]') !== null")
                tap("[data-eidos-file-field-type=checkbox]")
                tapPanelButton("^(Apply type|应用类型)$")
                waitJs("document.querySelector('[data-eidos-file-detail-panel=field] [role=status]')?.textContent.includes('1') === true")
                assertArrayEquals(beforeReview, File(root, path).readBytes())
            }
            review()
            tapPanelButton("^(Cancel|取消)$")
            waitJs("document.querySelector('[data-eidos-file-detail-panel=field] [role=status]') === null")
            review()
            tapPanelButton("^(Convert anyway|仍然转换|继续转换)$")
            waitJs("document.querySelector('[data-eidos-file-detail-panel=field] [role=status]') === null")
            val saved = runBlocking { repository.loadEidos(path) }
            val converted = saved.fields.single { it.id == flag }
            assertEquals("checkbox", converted.kind)
            assertFalse(converted.nullable)
            assertEquals(false, saved.rows.single { it.values[label] == "Keep 0" }.values[flag])
            assertEquals(true, saved.rows.single { it.values[label] == "Keep 1" }.values[flag])
            assertEquals(false, saved.rows.single { it.values[label] == "Keep 2" }.values[flag])
        } finally {
            compose.runOnUiThread { compose.activity.setContent {}; model.viewModelScope.cancel() }
            runBlocking { repository.close() }
            root.deleteRecursively()
            app.deleteSharedPreferences("space-$id")
        }
    }

    @Test
    fun mobileFieldCreationRecordTogglesAndShareDraftUseBinaryCheckboxes() {
        val app = compose.activity.application
        val id = "checkbox-mobile-${UUID.randomUUID()}"
        val repository = SpaceRepository(app, id)
        val root = File(app.filesDir, "spaces/$id")
        check(root.exists() || root.mkdirs())
        val path = "Checkbox.eidos"
        NativeRuntime.call(File(root, path).path, "create", JSONObject("""{"title":"Mobile checks","fields":[{"clientKey":"title","name":"标题","kind":"text","position":"0"},{"clientKey":"flag","name":"Flag","kind":"checkbox","position":"1"},{"clientKey":"legacy","name":"Legacy","kind":"checkbox","nullable":true,"position":"2"}]}"""))
        val initial = runBlocking { repository.loadEidos(path) }
        val table = checkNotNull(initial.table)
        val flag = initial.fields.single { it.name == "Flag" }.id
        val legacy = initial.fields.single { it.name == "Legacy" }.id
        runBlocking { repository.mutate(initial, null, mapOf(table.labelFieldId to "Existing", legacy to JSONObject.NULL)) }
        lateinit var model: EidosModel
        try {
            compose.runOnUiThread {
                model = EidosModel(app, repository)
                compose.activity.setContent { EidosApp(model) }
            }
            compose.waitUntil(15_000) { !model.state.value.busy }
            compose.runOnUiThread { model.open(runBlocking { repository.file(path) }) }
            waitJs("document.querySelector('button[aria-label=视图设置]') !== null")
            js("document.querySelector('button[aria-label=视图设置]').click()")
            waitJs("document.querySelector('button[aria-label=管理字段]') !== null")
            js("document.querySelector('button[aria-label=管理字段]').click()")
            waitJs("Array.from(document.querySelectorAll('.eidos-mobile-fields-list button')).find(b=>b.textContent.trim()==='新建字段')?.disabled === false")
            js("(()=>{const b=Array.from(document.querySelectorAll('.eidos-mobile-fields-list button')).find(b=>b.textContent.trim()==='新建字段');b.setAttribute('data-release-create-field','');b.scrollIntoView({block:'center'});})()")
            tap("[data-release-create-field]")
            waitJs("document.querySelector('.eidos-mobile-fields-create form') !== null")
            js("(()=>{const input=document.querySelector('.eidos-mobile-fields-create input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Added');input.dispatchEvent(new Event('input',{bubbles:true}));})()")
            js("document.querySelector('.eidos-mobile-fields-create [data-eidos-file-field-type-trigger]').click()")
            waitJs("document.querySelector('[data-eidos-file-field-type=checkbox]') !== null")
            js("document.querySelector('[data-eidos-file-field-type=checkbox]').click()")
            waitJs("document.querySelector('.eidos-mobile-fields-create [data-eidos-file-field-type-trigger=checkbox]') !== null && document.querySelector('.eidos-mobile-fields-create button[type=submit]')?.disabled === false")
            js("document.activeElement?.blur()")
            compose.runOnUiThread {
                val web = checkNotNull(findWeb(compose.activity.window.decorView))
                val keyboard = app.getSystemService(android.content.Context.INPUT_METHOD_SERVICE) as android.view.inputmethod.InputMethodManager
                keyboard.hideSoftInputFromWindow(web.windowToken, 0)
            }
            waitJs("document.querySelector('.eidos-mobile-fields-create button[type=submit]').getBoundingClientRect().bottom < innerHeight")
            tap(".eidos-mobile-fields-create button[type=submit]")
            waitJs("document.querySelector('button[aria-label=编辑Added属性]') !== null")
            tap("[data-mobile-page]:not([hidden]) > header button[aria-label=关闭]")
            waitJs("document.querySelector('.eidos-mobile-fields-sheet') === null")
            val added = runBlocking { repository.loadEidos(path) }.fields.single { it.name == "Added" }
            assertFalse(added.nullable)
            waitJs("document.querySelector('button.mobile-new-record')?.disabled === false")
            js("document.querySelector('button.mobile-new-record').click()")
            waitJs("document.querySelector('[role=checkbox][aria-label=Flag]')?.getAttribute('aria-checked') === 'false'")
            tap("[role=checkbox][aria-label=Flag]")
            waitJs("document.querySelector('[role=checkbox][aria-label=Flag]')?.getAttribute('aria-checked') === 'true'")
            tap("[role=checkbox][aria-label=Flag]")
            waitJs("document.querySelector('[role=checkbox][aria-label=Flag]')?.getAttribute('aria-checked') === 'false'")
            assertEquals("false", js("document.querySelector('[role=checkbox][aria-label=Flag]').parentElement.querySelector('.eidos-field-clear') !== null"))
            tap("button[aria-label=关闭记录详情]")
            waitJs("document.querySelector('[role=checkbox][aria-label=Flag]') === null")
            js("document.querySelector('.mobile-view-switcher').click()")
            waitJs("document.querySelector('button[aria-label=新建视图]') !== null")
            js("document.querySelector('button[aria-label=新建视图]').click()")
            waitJs("document.querySelector('[data-create-view=form]') !== null")
            tap("[data-create-view=form]")
            waitJs("document.querySelector('.eidos-mobile-form') !== null")
            waitJs("document.querySelector('.eidos-mobile-form button[aria-label=Flag]')?.textContent.includes('未勾选') === true")
            assertEquals("true", js("document.querySelector('.eidos-mobile-form button[aria-label=Added]')?.textContent.includes('未勾选') === true"))
            assertEquals("true", js("document.querySelector('.eidos-mobile-form button[aria-label=Flag]')?.closest('fieldset')?.disabled === true"))
            js("window.eidosLeave('back')")
            compose.waitUntil(15_000) { model.state.value.webFile == null }
            val beforeShare = File(root, path).readBytes()

            compose.runOnUiThread { model.receiveShare(emptyList(), "Shared checkbox") }
            compose.waitUntil(15_000) { !model.state.value.busy && model.state.value.pendingShares.isNotEmpty() }
            compose.runOnUiThread { model.openShareTable(path, table.id) }
            waitJs("document.querySelector('textarea[aria-label=标题]')?.value === 'Shared checkbox'")
            assertEquals("true", js("document.querySelector('[role=checkbox][aria-label=Flag]')?.getAttribute('aria-checked') === 'false'"))
            assertEquals("true", js("document.querySelector('[role=checkbox][aria-label=Added]')?.getAttribute('aria-checked') === 'false'"))
            assertEquals("true", js("document.querySelector('[role=checkbox][aria-label=Legacy]')?.getAttribute('aria-checked') === 'mixed'"))
            compose.onNodeWithContentDescription("返回文件").performClick()
            compose.waitUntil(15_000) { !model.state.value.busy && model.state.value.shareRecord == null }
            assertArrayEquals(beforeShare, File(root, path).readBytes())
            compose.runOnUiThread { model.openShareTable(path, table.id) }
            waitJs("document.querySelector('textarea[aria-label=标题]')?.value === 'Shared checkbox'")
            assertEquals("true", js("document.querySelector('[role=checkbox][aria-label=Flag]')?.getAttribute('aria-checked') === 'false'"))
            tap(".share-record > header > button")
            compose.waitUntil(15_000) { model.state.value.pendingShares.isEmpty() && model.state.value.webFile?.path == path }
            val saved = runBlocking { repository.loadEidos(path) }
            assertEquals(3, saved.rows.size)
            assertTrue(saved.rows.all { it.values[flag] == false && it.values[added.id] == false })
            assertEquals(JSONObject.NULL, saved.rows.single { it.values[table.labelFieldId] == "Existing" }.values[legacy])
            assertEquals(false, saved.rows.single { it.values[table.labelFieldId] == "Shared checkbox" }.values[flag])
            waitJs("document.querySelector('canvas')?.textContent.includes('Shared checkbox') === true")
            compose.onNodeWithContentDescription("返回文件").performClick()
            compose.waitUntil(15_000) { model.state.value.webFile == null }
            compose.runOnUiThread { model.open(runBlocking { repository.file(path) }) }
            waitJs("document.querySelector('canvas')?.textContent.includes('Shared checkbox') === true")
            screenshot("share-saved-reopened.png")

            compose.onNodeWithContentDescription("返回文件").performClick()
            compose.waitUntil(15_000) { model.state.value.webFile == null }
            val longTitle = "Toggled checkbox " + List(45) { "scrollable" }.joinToString(" ")
            compose.runOnUiThread { model.receiveShare(emptyList(), longTitle) }
            compose.waitUntil(15_000) { !model.state.value.busy && model.state.value.pendingShares.isNotEmpty() }
            compose.runOnUiThread { model.openShareTable(path, table.id) }
            waitJs("document.querySelector('textarea[aria-label=标题]')?.value === ${JSONObject.quote(longTitle)}")
            tap("[role=checkbox][aria-label=Flag]")
            waitJs("document.querySelector('[role=checkbox][aria-label=Flag]')?.getAttribute('aria-checked') === 'true'")
            tap("[role=checkbox][aria-label=Flag]")
            waitJs("document.querySelector('[role=checkbox][aria-label=Flag]')?.getAttribute('aria-checked') === 'false'")
            tap("textarea[aria-label=标题]")
            compose.waitUntil(15_000) {
                var visible = false
                compose.runOnUiThread {
                    visible = androidx.core.view.ViewCompat.getRootWindowInsets(compose.activity.window.decorView)
                        ?.isVisible(androidx.core.view.WindowInsetsCompat.Type.ime()) == true
                }
                visible
            }
            waitJs("(()=>{const e=document.querySelector('[data-eidos-file-record-page-scroll]');return e.scrollHeight > e.clientHeight + 20})()")
            js("document.querySelector('[data-eidos-file-record-page-scroll]').scrollTop=0")
            swipeRecordBody()
            waitJs("document.querySelector('[data-eidos-file-record-page-scroll]').scrollTop > 0")
            var previousScroll = ""
            var stableFrames = 0
            compose.waitUntil(10_000) {
                android.os.SystemClock.sleep(250)
                val currentScroll = js("document.querySelector('[data-eidos-file-record-page-scroll]').scrollTop")
                stableFrames = if (currentScroll == previousScroll) stableFrames + 1 else 0
                previousScroll = currentScroll
                stableFrames >= 3
            }
            waitJs("(()=>{const r=document.querySelector('.share-record > header > button').getBoundingClientRect();return r.top >= 0 && r.bottom < innerHeight})()")
            screenshot("share-ime-body-scrolled.png")
            tap(".share-record > header > button")
            try {
                compose.waitUntil(15_000) { model.state.value.pendingShares.isEmpty() && model.state.value.webFile?.path == path }
            } catch (error: androidx.compose.ui.test.ComposeTimeoutException) {
                screenshot("share-ime-after-save.png")
                throw AssertionError(js("document.body.innerText") + "\n" + model.state.value, error)
            }
            val toggled = runBlocking { repository.loadEidos(path) }
            assertEquals(4, toggled.rows.size)
            assertEquals(false, toggled.rows.single { it.values[table.labelFieldId] == longTitle }.values[flag])
            assertEquals(JSONObject.NULL, toggled.rows.single { it.values[table.labelFieldId] == "Existing" }.values[legacy])
        } finally {
            compose.runOnUiThread { compose.activity.setContent {}; model.viewModelScope.cancel() }
            runBlocking { repository.close() }
            root.deleteRecursively()
            app.deleteSharedPreferences("space-$id")
        }
    }

    @Test
    fun createsFormulaFromMobileFieldsAndRecalculatesOnRecordEdit() {
        val app = compose.activity.application
        val id = "formula-mobile-${UUID.randomUUID()}"
        val repository = SpaceRepository(app, id)
        val root = File(app.filesDir, "spaces/$id")
        check(root.exists() || root.mkdirs())
        val path = "Formula.eidos"
        NativeRuntime.call(File(root, path).path, "create", JSONObject(
            """{"title":"Formula QA","fields":[{"clientKey":"title","name":"标题","kind":"text","position":"0"},{"clientKey":"quantity","name":"Quantity","kind":"integer","position":"1"}]}"""
        ))
        val initial = runBlocking { repository.loadEidos(path) }
        val table = checkNotNull(initial.table)
        val quantity = initial.fields.single { it.name == "Quantity" }.id
        runBlocking { repository.mutate(initial, null, mapOf(table.labelFieldId to "One item", quantity to "5")) }
        val row = runBlocking { repository.loadEidos(path) }.rows.single()
        lateinit var model: EidosModel
        try {
            compose.runOnUiThread { model = EidosModel(app, repository); compose.activity.setContent { EidosApp(model) } }
            compose.waitUntil(15_000) { !model.state.value.busy }
            compose.runOnUiThread { model.open(runBlocking { repository.file(path) }) }
            tap("button[aria-label=视图设置]")
            tap("button[aria-label=管理字段]")
            waitJs("!![...document.querySelectorAll('.eidos-mobile-fields-list button')].find(b=>b.textContent.trim()==='新建字段' && !b.disabled)")
            js("[...document.querySelectorAll('.eidos-mobile-fields-list button')].find(b=>b.textContent.trim()==='新建字段').setAttribute('data-create-formula-test','')")
            tap("[data-create-formula-test]")
            tap(".eidos-mobile-fields-create [data-eidos-file-field-type-trigger]")
            tap("[data-eidos-file-field-type=formula]")
            waitJs("!!document.querySelector('[data-eidos-file-formula-composer]')")
            js("(()=>{const input=document.querySelector('.eidos-mobile-fields-create form input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Doubled');input.dispatchEvent(new Event('input',{bubbles:true}));})()")
            tap(".eidos-file-formula-display-select")
            tap("[role=option]:has([data-eidos-file-field-type-icon=integer])")
            tap("[data-formula-reference$=':$quantity']")
            waitJs("document.querySelector('textarea[aria-label=\"Formula expression\"]')?.value === '\"Quantity\"'")
            fun appendExpression(text: String) {
                js("(()=>{const e=document.querySelector('textarea[aria-label=\"Formula expression\"]');e.focus();e.setSelectionRange(e.value.length,e.value.length);return document.execCommand('insertText',false,${JSONObject.quote(text)});})()")
            }
            appendExpression(" *")
            waitJs("!!document.querySelector('[data-eidos-file-formula-status=error]')")
            assertEquals("true", js("document.querySelector('.eidos-mobile-fields-create button[type=submit]')?.disabled"))
            appendExpression(" 2")
            waitJs("document.querySelector('[data-eidos-file-formula-status=valid]')?.textContent.trim() === '10'")
            waitJs("(()=>{const b=document.querySelector('.eidos-mobile-fields-create button[type=submit]');const r=b.getBoundingClientRect();return !b.disabled && b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))})()")
            screenshot("formula-preview-valid.png")
            tap(".eidos-mobile-fields-create button[type=submit]")
            waitJs("!!document.querySelector('button[aria-label=编辑Doubled属性]')")
            tap("[data-mobile-page]:not([hidden]) > header button[aria-label=关闭]")
            waitJs("!document.querySelector('.eidos-mobile-fields-content')")
            val recordRoute = "#/records/" + listOf(path, table.id, row.id).joinToString("/") { android.net.Uri.encode(it) }
            js("location.hash=${JSONObject.quote(recordRoute)}")
            waitJs("document.querySelector('[data-mobile-record-page]')?.innerText.includes('Doubled') === true")
            waitJs("[...document.querySelectorAll('.eidos-mobile-record-value')].some(e=>e.textContent.trim()==='10')")

            tap("input[aria-label=Quantity]")
            js("(()=>{const input=document.querySelector('input[aria-label=Quantity]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'7');input.dispatchEvent(new Event('input',{bubbles:true}));})()")
            js("document.querySelector('input[aria-label=Quantity]').blur()")
            waitJs("[...document.querySelectorAll('.eidos-mobile-record-value')].some(e=>e.textContent.trim()==='14')")
            screenshot("formula-record-recalculated.png")
            js("location.hash=''")
            waitJs("!!document.querySelector('button[aria-label=视图设置]')")
            compose.onNodeWithContentDescription("返回文件").performClick()
            compose.waitUntil(15_000) { model.state.value.webFile == null }
            compose.runOnUiThread { model.open(runBlocking { repository.file(path) }) }
            waitJs("!!document.querySelector('button[aria-label=视图设置]')")
            js("location.hash=${JSONObject.quote(recordRoute)}")
            waitJs("document.querySelector('[data-mobile-record-page]')?.innerText.includes('Doubled') === true")
            waitJs("[...document.querySelectorAll('.eidos-mobile-record-value')].some(e=>e.textContent.trim()==='14')")
            val reopened = runBlocking { repository.loadEidos(path) }
            val formula = reopened.fields.single { it.name == "Doubled" }
            assertEquals("formula", formula.kind)
            assertEquals("14", reopened.rows.single().values[formula.id].toString())
            screenshot("formula-reopened.png")
        } finally {
            compose.runOnUiThread { compose.activity.setContent {}; model.viewModelScope.cancel() }
            runBlocking { repository.close() }
            root.deleteRecursively()
            app.deleteSharedPreferences("space-$id")
        }
    }

    private fun findWeb(view: View): WebView? {
        if (view is WebView) return view
        if (view is ViewGroup) for (i in 0 until view.childCount) findWeb(view.getChildAt(i))?.let { return it }
        return null
    }

    private fun js(script: String): String {
        val latch = CountDownLatch(1)
        var result = "false"
        compose.runOnUiThread {
            val web = findWeb(compose.activity.window.decorView)
            if (web == null || web.progress < 100) latch.countDown()
            else web.evaluateJavascript(script) { result = it; latch.countDown() }
        }
        assertTrue(latch.await(10, TimeUnit.SECONDS))
        return result
    }

    private fun waitJs(expression: String) {
        try {
            compose.waitUntil(30_000) { js(expression) == "true" }
        } catch (error: androidx.compose.ui.test.ComposeTimeoutException) {
            throw AssertionError(expression + "\n" + js("document.body.innerText"), error)
        }
    }

    private fun tap(selector: String) {
        val quoted = JSONObject.quote(selector)
        waitJs("(()=>{const e=document.querySelector($quoted);return e !== null && e.disabled !== true && e.getAttribute('aria-disabled') !== 'true'})()")
        js("document.querySelector($quoted).scrollIntoView({block:'center',inline:'nearest'})")
        val frame = CountDownLatch(1)
        compose.runOnUiThread {
            val web = checkNotNull(findWeb(compose.activity.window.decorView))
            web.postVisualStateCallback(1, object : WebView.VisualStateCallback() {
                override fun onComplete(requestId: Long) {
                    web.postOnAnimation { web.postOnAnimation { frame.countDown() } }
                }
            })
        }
        assertTrue(frame.await(10, TimeUnit.SECONDS))
        // Read coordinates after keyboard/scroll animations reach the compositor.
        android.os.SystemClock.sleep(500)
        val geometry = js("JSON.stringify((()=>{const e=document.querySelector($quoted);const r=e.getBoundingClientRect();const x=r.left+r.width/2,y=r.top+r.height/2;const top=document.elementFromPoint(x,y);return {x,y,width:innerWidth,hit:e.contains(top),cover:top?.outerHTML.slice(0,300)}})())")
        val point = JSONObject(org.json.JSONTokener(geometry).nextValue() as String)
        if (!point.getBoolean("hit")) screenshot("covered-target.png")
        assertTrue("tap target is covered: $selector $point", point.getBoolean("hit"))
        if (selector == ".share-record > header > button") screenshot("share-save-ready.png")
        val origin = IntArray(2)
        var scale = 1f
        compose.runOnUiThread {
            val web = checkNotNull(findWeb(compose.activity.window.decorView))
            web.getLocationOnScreen(origin)
            scale = web.width / point.getDouble("width").toFloat()
        }
        val instrumentation = androidx.test.platform.app.InstrumentationRegistry.getInstrumentation()
        val x = origin[0] + point.getDouble("x").toFloat() * scale
        val y = origin[1] + point.getDouble("y").toFloat() * scale
        val down = android.os.SystemClock.uptimeMillis()
        val press = android.view.MotionEvent.obtain(down, down, android.view.MotionEvent.ACTION_DOWN, x, y, 0)
        try { instrumentation.sendPointerSync(press) } finally { press.recycle() }
        android.os.SystemClock.sleep(80)
        val release = android.view.MotionEvent.obtain(down, android.os.SystemClock.uptimeMillis(), android.view.MotionEvent.ACTION_UP, x, y, 0)
        try { instrumentation.sendPointerSync(release) } finally { release.recycle() }
    }

    private fun tapPanelButton(labelPattern: String) {
        val quoted = JSONObject.quote(labelPattern)
        js("(()=>{document.querySelectorAll('[data-release-action]').forEach(e=>e.removeAttribute('data-release-action'));const b=Array.from(document.querySelectorAll('[data-eidos-file-detail-panel=field] button')).find(b=>new RegExp($quoted).test(b.textContent));if(!b)throw Error('missing conversion action');b.setAttribute('data-release-action','conversion');b.scrollIntoView({block:'center'});})()")
        waitJs("document.querySelector('[data-release-action=conversion]') !== null")
        tap("[data-release-action=conversion]")
    }

    private fun swipeRecordBody() {
        val geometry = js("JSON.stringify((()=>{const r=document.querySelector('[data-eidos-file-record-page-scroll]').getBoundingClientRect();return {x:r.right-10,y:r.bottom-24,distance:r.height-64,width:innerWidth}})())")
        val point = JSONObject(org.json.JSONTokener(geometry).nextValue() as String)
        assertTrue(point.getDouble("distance") > 40)
        val origin = IntArray(2)
        var scale = 1f
        compose.runOnUiThread {
            val web = checkNotNull(findWeb(compose.activity.window.decorView))
            web.getLocationOnScreen(origin)
            scale = web.width / point.getDouble("width").toFloat()
        }
        val instrumentation = androidx.test.platform.app.InstrumentationRegistry.getInstrumentation()
        val start = android.os.SystemClock.uptimeMillis()
        for (step in 0..12) {
            val action = when (step) {
                0 -> android.view.MotionEvent.ACTION_DOWN
                12 -> android.view.MotionEvent.ACTION_UP
                else -> android.view.MotionEvent.ACTION_MOVE
            }
            val event = android.view.MotionEvent.obtain(start, android.os.SystemClock.uptimeMillis(), action,
                origin[0] + point.getDouble("x").toFloat() * scale,
                origin[1] + (point.getDouble("y") - point.getDouble("distance") * step / 12).toFloat() * scale, 0)
            event.source = android.view.InputDevice.SOURCE_TOUCHSCREEN
            try { instrumentation.sendPointerSync(event) } finally { event.recycle() }
            android.os.SystemClock.sleep(20)
        }
    }

    private fun screenshot(name: String) {
        val image = androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().uiAutomation.takeScreenshot() ?: return
        File(compose.activity.getExternalFilesDir("release-acceptance"), name).outputStream().use {
            image.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it)
        }
        image.recycle()
    }
}
