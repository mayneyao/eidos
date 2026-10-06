import XCTest

final class EditorTests: XCTestCase {
    private func chineseApp() -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-app-language", "zh"]
        return app
    }
    /// Seed only the disposable simulator device with testSeedUnpairRegressionFixture first.
    func testConfirmUnpairRemovesSelectedFixture() throws {
        continueAfterFailure = false
        let app = chineseApp()
        app.launchArguments += ["-sync-selected-device", "unpair-regression-fixture"]
        app.launch()
        XCTAssertTrue(app.buttons["main-tab-sync"].waitForExistence(timeout: 10))
        app.buttons["main-tab-sync"].tap()
        guard app.staticTexts["Unpair regression fixture"].waitForExistence(timeout: 10) else {
            throw XCTSkip("Requires the isolated unpair fixture")
        }
        app.buttons["设备操作"].tap()
        app.buttons["解除配对"].tap()
        XCTAssertTrue(app.alerts.firstMatch.waitForExistence(timeout: 5))
        app.alerts.firstMatch.buttons["取消"].tap()
        XCTAssertTrue(app.staticTexts["Unpair regression fixture"].exists)
        app.buttons["设备操作"].tap()
        app.buttons["解除配对"].tap()
        let alert = app.alerts.firstMatch
        XCTAssertTrue(alert.waitForExistence(timeout: 5))
        alert.buttons["解除配对"].tap()
        let removed = NSPredicate(format: "exists == false")
        expectation(for: removed, evaluatedWith: app.staticTexts["Unpair regression fixture"])
        waitForExpectations(timeout: 20)
        app.terminate(); app.launch()
        XCTAssertTrue(app.buttons["main-tab-sync"].waitForExistence(timeout: 10))
        app.buttons["main-tab-sync"].tap()
        XCTAssertFalse(app.staticTexts["Unpair regression fixture"].waitForExistence(timeout: 3))
    }
    /// Seed an isolated Space with Scroll-00.md through Scroll-39.md.
    func testFileRowsAllowScrollingAndActions() throws {
        XCUIDevice.shared.orientation = .portrait
        let app = chineseApp(); app.launch()
        XCTAssertTrue(app.buttons["main-tab-files"].waitForExistence(timeout: 10))
        app.buttons["main-tab-files"].tap()
        let first = app.buttons["Scroll-00.md"]
        guard first.waitForExistence(timeout: 10) else { throw XCTSkip("Requires the isolated scroll fixture Space") }
        XCTAssertTrue(first.isEnabled)
        let originalY = first.frame.minY
        let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.4, dy: 0.7))
        let end = app.coordinate(withNormalizedOffset: CGVector(dx: 0.4, dy: 0.25))
        start.press(forDuration: 0.05, thenDragTo: end)
        XCTAssertTrue(!first.isHittable || first.frame.minY < originalY - 50, "Dragging on a file row must scroll the list")
        XCTAssertFalse(app.buttons["重命名"].exists, "Scrolling must not open file actions")
        app.swipeDown()
        for _ in 0..<4 where !first.isHittable { app.swipeDown() }
        XCTAssertTrue(first.isHittable)
        first.press(forDuration: 1)
        XCTAssertTrue(app.buttons["重命名"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["返回"].exists, "Long press must not also open the editor")
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = "File row actions after scrolling"; attachment.lifetime = .keepAlways; add(attachment)
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.95, dy: 0.95)).tap()
        first.tap()
        XCTAssertTrue(app.buttons["返回"].waitForExistence(timeout: 10), "A normal tap must still open the file")
        app.buttons["返回"].tap()
        XCTAssertTrue(app.buttons["main-tab-files"].waitForExistence(timeout: 5))
    }

    func testCancelSpaceDeletionPreservesCurrentSpace() {
        let app = chineseApp(); app.launch()
        XCTAssertTrue(app.buttons["main-tab-files"].waitForExistence(timeout: 10))
        app.buttons["main-tab-files"].tap()
        app.buttons["切换 Space"].tap()
        app.buttons["删除此 Space 的本地数据"].tap()
        XCTAssertTrue(app.buttons["验证身份并删除"].waitForExistence(timeout: 5))
        app.buttons["取消"].tap()
        XCTAssertTrue(app.buttons["切换 Space"].exists)
        XCTAssertFalse(app.buttons["验证身份并删除"].exists)
    }
    func testPairedComputerHierarchy() throws {
        XCUIDevice.shared.orientation = .portrait
        let app = chineseApp(); app.launch()
        XCTAssertTrue(app.buttons["main-tab-sync"].waitForExistence(timeout: 10))
        app.buttons["main-tab-sync"].tap()
        let picker = app.buttons["sync-device-selector"]
        guard picker.waitForExistence(timeout: 5) else { throw XCTSkip("Requires a paired simulator computer") }
        XCTAssertTrue(app.staticTexts["这台电脑的 Spaces"].exists)
        XCTAssertFalse(app.buttons["扫描配对二维码"].exists)
        XCTAssertFalse(app.buttons["管理此设备"].exists)
        app.buttons["设备操作"].tap()
        app.buttons["解除配对"].tap()
        XCTAssertTrue(app.alerts.firstMatch.waitForExistence(timeout: 5))
        app.alerts.buttons["取消"].tap()
        XCTAssertTrue(picker.exists)
        let screen = XCTAttachment(screenshot: app.screenshot())
        screen.name = "iOS device spaces"; screen.lifetime = .keepAlways; add(screen)
        picker.tap()
        XCTAssertTrue(app.buttons["连接新设备"].waitForExistence(timeout: 5))
        let sheet = XCTAttachment(screenshot: app.screenshot())
        sheet.name = "iOS device picker"; sheet.lifetime = .keepAlways; add(sheet)
    }
    private func showPairing(_ app: XCUIApplication) {
        let picker = app.buttons["sync-device-selector"]
        if picker.waitForExistence(timeout: 2) {
            picker.tap()
            if !app.buttons["连接新设备"].isHittable { app.swipeUp() }
            if !app.buttons["连接新设备"].isHittable { app.swipeUp() }
            app.buttons["连接新设备"].tap()
        }
    }
    func testScannerFallbackAndCancellationPreserveSyncInput() {
        let app = chineseApp(); app.launch()
        XCTAssertTrue(app.buttons["main-tab-sync"].waitForExistence(timeout: 10))
        app.buttons["main-tab-sync"].tap()
        showPairing(app)
        app.buttons["使用配对码"].tap()
        app.swipeUp()
        let input = app.descendants(matching: .any)["peer-pairing-code"].firstMatch
        XCTAssertTrue(input.waitForExistence(timeout: 5))
        input.tap(); input.typeText("unfinished-pairing")
        app.buttons["返回"].tap()
        app.buttons["扫描配对二维码"].tap()
        XCTAssertTrue(app.buttons["peer-scanner-manual"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["当前设备无法使用相机"].waitForExistence(timeout: 5))
        let capture = XCTAttachment(screenshot: app.screenshot())
        capture.name = "iOS QR scanner fallback"; capture.lifetime = .keepAlways; add(capture)
        app.buttons["取消"].tap()
        app.buttons["使用配对码"].tap()
        XCTAssertTrue(input.waitForExistence(timeout: 5))
        XCTAssertEqual(input.value as? String, "unfinished-pairing")
        app.buttons["返回"].tap()
        app.buttons["扫描配对二维码"].tap()
        app.buttons["peer-scanner-manual"].tap()
        XCTAssertEqual(input.value as? String, "unfinished-pairing")
        app.buttons["返回"].tap()
        if app.buttons["返回同步"].exists { app.buttons["返回同步"].tap() }
        app.buttons["main-tab-files"].tap()
    }
    func testSyncScannerWithLargeTextAndLandscape() {
        let app = chineseApp()
        app.launchArguments += ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"]
        app.launch()
        defer { XCUIDevice.shared.orientation = .portrait }
        XCTAssertTrue(app.buttons["main-tab-sync"].waitForExistence(timeout: 10))
        app.buttons["main-tab-sync"].tap()
        showPairing(app)
        let scan = app.buttons["扫描配对二维码"]
        XCTAssertTrue(scan.waitForExistence(timeout: 10))
        if !scan.isHittable { app.swipeUp() }
        scan.tap()
        XCUIDevice.shared.orientation = .landscapeLeft
        let landscape = NSPredicate { _, _ in app.frame.width > app.frame.height }
        expectation(for: landscape, evaluatedWith: app)
        waitForExpectations(timeout: 5)
        XCTAssertTrue(app.buttons["peer-scanner-manual"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["peer-scanner-manual"].isHittable)
        XCTAssertTrue(app.buttons["取消"].isHittable)
        let manual = app.buttons["peer-scanner-manual"]
        let settled = NSPredicate { _, _ in app.frame.contains(manual.frame) && manual.frame.width > 0 }
        expectation(for: settled, evaluatedWith: manual)
        waitForExpectations(timeout: 5)
        let capture = XCTAttachment(screenshot: app.screenshot())
        capture.name = "iOS scanner large text landscape"; capture.lifetime = .keepAlways; add(capture)
        app.buttons["peer-scanner-manual"].tap()
        app.swipeUp()
        XCTAssertTrue(app.descendants(matching: .any)["peer-pairing-code"].firstMatch.waitForExistence(timeout: 5))
    }
    func testAndroidAlignedLayoutScreens() {
        let app = chineseApp(); app.launch()
        XCTAssertTrue(app.buttons["main-tab-files"].waitForExistence(timeout: 10))
        func capture(_ name: String) {
            let shot = XCTAttachment(screenshot: app.screenshot()); shot.name = name; shot.lifetime = .keepAlways; add(shot)
        }
        capture("Aligned files")
        let files = app.buttons["main-tab-files"], sync = app.buttons["main-tab-sync"]
        XCTAssertEqual(files.frame.midY, sync.frame.midY, accuracy: 2)
        XCTAssertGreaterThanOrEqual(files.frame.height, 44)
        sync.tap()
        XCTAssertTrue(app.staticTexts["连接你的电脑"].waitForExistence(timeout: 10))
        XCTAssertFalse(app.buttons["登录 Eidos 账号"].exists)
        capture("Aligned sync")
        files.tap()
        app.buttons["Space 操作"].coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        app.buttons["插件"].tap()
        XCTAssertTrue(app.buttons["已安装"].waitForExistence(timeout: 10))
        XCTAssertFalse(files.isHittable)
        capture("Aligned plugin manager")
        app.buttons["返回"].tap()
        XCTAssertTrue(files.waitForExistence(timeout: 10))
        let more = app.buttons.matching(NSPredicate(format: "label BEGINSWITH '更多 '")).firstMatch
        if more.exists {
            more.tap()
            XCTAssertTrue(app.buttons["重命名"].waitForExistence(timeout: 5))
            capture("Aligned file actions")
        }
    }
    func testBottomTabsPreserveDirectoryAndSyncInput() {
        let app = chineseApp()
        app.launch()
        XCTAssertTrue(app.buttons["main-tab-files"].waitForExistence(timeout: 10))
        app.buttons["添加文件"].coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        XCTAssertTrue(app.buttons["新建文件夹"].waitForExistence(timeout: 5))
        app.buttons["新建文件夹"].tap()
        let name = "Tabs-" + String(UUID().uuidString.prefix(6))
        let input = app.textFields["名称"]
        XCTAssertTrue(input.waitForExistence(timeout: 5))
        input.tap(); input.typeText(name)
        app.buttons["保存"].tap()
        XCTAssertTrue(app.buttons[name].waitForExistence(timeout: 10))
        app.buttons[name].tap()
        XCTAssertTrue(app.buttons["上一级"].waitForExistence(timeout: 5))
        app.buttons["main-tab-sync"].tap()
        XCTAssertTrue(app.buttons["使用配对码"].waitForExistence(timeout: 10))
        app.buttons["main-tab-files"].tap()
        XCTAssertTrue(app.buttons["上一级"].waitForExistence(timeout: 5))
        app.buttons["main-tab-sync"].tap()
        XCTAssertTrue(app.buttons["使用配对码"].waitForExistence(timeout: 10))
        app.buttons["main-tab-files"].tap()
        app.buttons["添加文件"].coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        XCTAssertTrue(app.buttons["新建 Markdown"].waitForExistence(timeout: 5))
        app.buttons["新建 Markdown"].tap()
        XCTAssertTrue(app.buttons["返回"].waitForExistence(timeout: 10))
        XCTAssertFalse(app.buttons["main-tab-sync"].isHittable)
        let editorCapture = XCTAttachment(screenshot: app.screenshot())
        editorCapture.name = "Compact editor header"; editorCapture.lifetime = .keepAlways; add(editorCapture)
        app.buttons["返回"].tap()
        XCTAssertTrue(app.buttons["上一级"].waitForExistence(timeout: 10))
        app.buttons["上一级"].tap()
        app.buttons[name].press(forDuration: 1.2)
        app.buttons["移到回收站"].tap()
    }
    func testInstalledJournalsNavigationEntry() throws {
        let app = chineseApp()
        app.launch()
        let journals = app.buttons["Journals"]
        if !journals.waitForExistence(timeout: 3) {
            app.buttons["Space 操作"].tap()
            app.buttons["插件"].tap()
            let enabled = app.switches["启用 Journals"]
            try XCTSkipUnless(enabled.waitForExistence(timeout: 10), "Install the published Journals plugin")
            if enabled.value as? String == "0" {
                enabled.tap()
                XCTAssertTrue(app.alerts["启用插件"].waitForExistence(timeout: 5))
                app.alerts["启用插件"].buttons["启用"].tap()
                expectation(for: NSPredicate(format: "value == '1'"), evaluatedWith: enabled)
                waitForExpectations(timeout: 10)
            }
            app.buttons["返回"].tap()
        }
        XCTAssertTrue(journals.waitForExistence(timeout: 10))
        journals.tap()
        XCTAssertTrue(app.navigationBars["Journals"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.webViews.firstMatch.waitForExistence(timeout: 10))
        app.buttons["main-tab-files"].tap()
        XCTAssertTrue(journals.waitForExistence(timeout: 10))
        let capture = XCTAttachment(screenshot: app.screenshot())
        capture.name = "iOS plugin navigation entry"; capture.lifetime = .keepAlways; add(capture)
    }
    func testSyncHidesAccountAndCloudActions() {
        let app = chineseApp(); app.launch()
        XCTAssertTrue(app.buttons["main-tab-sync"].waitForExistence(timeout: 10))
        app.buttons["main-tab-sync"].tap()
        showPairing(app)
        XCTAssertTrue(app.buttons["扫描配对二维码"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["这台手机"].exists)
        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = "Device relationship onboarding"; screenshot.lifetime = .keepAlways; add(screenshot)
        XCTAssertFalse(app.buttons["登录 Eidos 账号"].exists)
        XCTAssertFalse(app.buttons["查看云端 Space"].exists)
        XCTAssertFalse(app.switches["后台自动同步"].exists)
        if app.buttons["返回同步"].exists { app.buttons["返回同步"].tap() }
        app.buttons["main-tab-files"].tap()
        let more = app.buttons.matching(NSPredicate(format: "label BEGINSWITH '更多 '")).firstMatch
        if more.exists { more.tap(); XCTAssertFalse(app.buttons["发布"].exists) }
    }
    func testSpaceSelectionAndSyncScreenSurviveRelaunch() {
        let app = chineseApp()
        app.launch()
        let picker = app.buttons["切换 Space"]
        XCTAssertTrue(picker.waitForExistence(timeout: 10))
        picker.tap()
        app.buttons["新建 Space"].tap()
        let name = "iOS QA " + String(UUID().uuidString.prefix(6))
        app.alerts.textFields.firstMatch.typeText(name)
        app.alerts.buttons["创建"].tap()
        XCTAssertTrue(app.buttons["添加文件"].waitForExistence(timeout: 10))
        app.terminate(); app.launch()
        XCTAssertTrue(picker.waitForExistence(timeout: 10))
        XCTAssertTrue(app.navigationBars.staticTexts[name].exists)
        app.buttons["main-tab-sync"].tap()
        XCTAssertTrue(app.buttons["使用配对码"].waitForExistence(timeout: 10))
        XCTAssertFalse(app.buttons["登录 Eidos 账号"].exists)
        app.buttons["使用配对码"].tap()
        XCTAssertTrue(app.buttons["连接电脑"].exists)
        let input = app.descendants(matching: .any)["peer-pairing-code"].firstMatch
        XCTAssertTrue(input.waitForExistence(timeout: 5))
        input.tap(); input.typeText("unfinished-pairing")
        app.buttons["main-tab-files"].tap()
        app.buttons["main-tab-sync"].tap()
        XCTAssertEqual(input.value as? String, "unfinished-pairing")
        let capture = XCTAttachment(screenshot: app.screenshot())
        capture.name = "iOS LAN sync"
        capture.lifetime = .keepAlways; add(capture)
        app.buttons["main-tab-files"].tap()
        XCTAssertTrue(app.buttons["添加文件"].waitForExistence(timeout: 10))
    }
    func testMobileFieldsAndTableHeader() {
        let app = chineseApp()
        app.launch()
        app.buttons["添加文件"].coordinate(withNormalizedOffset:CGVector(dx:0.5,dy:0.5)).tap()
        app.buttons["新建 Eidos File"].tap()
        XCTAssertTrue(app.buttons["切换数据表"].waitForExistence(timeout:30))
        let fields = app.webViews.descendants(matching: .any)["管理字段"].firstMatch
        XCTAssertTrue(fields.waitForExistence(timeout:10))
        fields.tap()
        XCTAssertTrue(app.webViews.buttons["编辑笔记属性"].waitForExistence(timeout:10))
        app.webViews.buttons["编辑笔记属性"].tap()
        XCTAssertTrue(app.webViews.staticTexts["字段属性"].waitForExistence(timeout:10))
        let capture = XCTAttachment(screenshot:app.screenshot())
        capture.name = "Mobile field properties and native table header"
        capture.lifetime = .keepAlways
        add(capture)
        app.webViews.buttons["返回"].tap()
        XCTAssertTrue(app.webViews.buttons["编辑笔记属性"].waitForExistence(timeout:5))
        app.webViews.buttons["关闭"].tap()
        app.buttons["切换数据表"].tap()
        XCTAssertFalse(app.webViews.staticTexts["Runtime 操作失败"].exists)
    }
    func testFileBrowserToolbarAndSortMenu() {
        let app = chineseApp()
        app.launch()
        let search = app.buttons["搜索"]
        let create = app.buttons["添加文件"]
        XCTAssertTrue(search.waitForExistence(timeout:10))
        XCTAssertEqual(search.frame.midY, create.frame.midY, accuracy:2)
        search.tap()
        XCTAssertTrue(app.textFields["搜索文件、笔记与记录"].waitForExistence(timeout:5))
        app.buttons["完成"].tap()
        app.buttons["Space 操作"].coordinate(withNormalizedOffset:CGVector(dx:0.5,dy:0.5)).tap()
        app.buttons["排序"].tap()
        XCTAssertTrue(app.buttons["修改时间"].exists)
        XCTAssertTrue(app.buttons["类型"].exists)
        app.buttons["修改时间"].tap()
    }
    func testPluginManagerUsesNativeControls() {
        let app = chineseApp()
        app.launch()
        app.buttons["Space 操作"].coordinate(withNormalizedOffset:CGVector(dx:0.5,dy:0.5)).tap()
        app.buttons["插件"].tap()
        XCTAssertTrue(app.buttons["已安装"].waitForExistence(timeout:10))
        XCTAssertTrue(app.buttons["发现"].exists)
        XCTAssertEqual(app.webViews.count,0)
        XCTAssertTrue(app.buttons["插件更多操作"].exists)
        let capture = XCTAttachment(screenshot:app.screenshot())
        capture.name = "Native plugin manager"
        capture.lifetime = .keepAlways
        add(capture)
        app.buttons["返回"].tap()
        XCTAssertTrue(app.buttons["Space 操作"].waitForExistence(timeout:5))
    }
    func testPluginWorkbenchOpensOffline() {
        let app = chineseApp()
        app.launch()
        app.buttons["Space 操作"].coordinate(withNormalizedOffset: CGVector(dx:0.5,dy:0.5)).tap()
        app.buttons["插件"].tap()
        let ready = app.webViews.buttons["浏览插件市场"].waitForExistence(timeout:20)
        if !ready { print(app.debugDescription) }
        XCTAssertTrue(ready)
        XCTAssertTrue(app.webViews.buttons["导入插件包"].exists)
        app.navigationBars.buttons["返回"].tap()
        XCTAssertTrue(app.buttons["Space 操作"].waitForExistence(timeout:5))
    }
    func testFolderNavigationAndLocalVersion() {
        let app = chineseApp()
        app.launch()
        app.buttons["添加文件"].coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        app.buttons["新建文件夹"].tap()
        let name = "Folder-" + String(UUID().uuidString.prefix(6))
        let input = app.textFields["名称"]
        XCTAssertTrue(input.waitForExistence(timeout: 5))
        input.tap(); input.typeText(name)
        app.buttons["保存"].tap()
        XCTAssertTrue(app.buttons[name].waitForExistence(timeout: 10))
        app.buttons[name].tap()
        app.buttons["添加文件"].coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        app.buttons["新建 Markdown"].tap()
        XCTAssertTrue(app.webViews.buttons["源码"].waitForExistence(timeout: 20))
        app.buttons["返回"].tap()
        XCTAssertTrue(app.buttons["上一级"].waitForExistence(timeout: 10))
        app.buttons["上一级"].tap()
        app.buttons[name].press(forDuration: 1.2)
        app.buttons["移到回收站"].tap()
        XCTAssertFalse(app.buttons[name].exists)
        app.buttons["Space 操作"].coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        app.buttons["回收站"].tap()
        XCTAssertTrue(app.staticTexts[name].waitForExistence(timeout: 10))
        app.buttons["恢复"].firstMatch.tap()
        app.buttons["完成"].tap()
        XCTAssertTrue(app.buttons[name].waitForExistence(timeout: 10))
        app.buttons["Space 操作"].coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        app.buttons["本地版本"].tap()
        let save = app.buttons["保存本机版本"]
        XCTAssertTrue(save.waitForExistence(timeout: 10))
        let enabled = NSPredicate(format: "enabled == true")
        expectation(for: enabled, evaluatedWith: save)
        waitForExpectations(timeout: 10)
        save.tap()
        XCTAssertTrue(app.staticTexts["本机版本已保存"].waitForExistence(timeout: 30))
        let capture = XCTAttachment(screenshot: app.screenshot())
        capture.name = "iOS local versions"
        capture.lifetime = .keepAlways
        add(capture)
    }
    func testMarkdownSaveAndReopen() {
        let app = chineseApp()
        app.launch()
        app.buttons["添加文件"].coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        app.buttons["新建 Markdown"].tap()
        let editor = app.webViews.descendants(matching: .any)["Markdown editor"].firstMatch
        XCTAssertTrue(editor.waitForExistence(timeout: 30))
        let filename = app.navigationBars.firstMatch.identifier
        XCTAssertTrue(filename.hasSuffix(".md"))
        XCTAssertTrue(editor.waitForExistence(timeout: 10))
        editor.tap()
        editor.typeText("Offline iOS persisted")
        app.buttons["返回"].tap()
        XCTAssertTrue(app.buttons["添加文件"].waitForExistence(timeout: 10))
        app.terminate()
        app.launch()
        app.buttons[filename].tap()
        XCTAssertTrue(editor.waitForExistence(timeout: 10))
        XCTAssertTrue((editor.value as? String ?? "").contains("Offline iOS persisted"))
    }
    func testDatabaseEditSurvivesRelaunch() {
        let app = chineseApp()
        app.launch()
        app.buttons["添加文件"].coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        app.buttons["新建 Eidos File"].tap()
        XCTAssertTrue(app.webViews.buttons["新增"].waitForExistence(timeout: 30))
        let filename = app.navigationBars.firstMatch.identifier
        XCTAssertTrue(filename.hasSuffix(".eidos"))
        XCTAssertFalse(app.webViews.staticTexts["Runtime 操作失败"].exists)
        app.webViews.buttons["新增"].tap()
        XCTAssertTrue(app.webViews.staticTexts["标题"].firstMatch.waitForExistence(timeout: 15))
        let title = app.webViews.textViews["标题"].firstMatch
        XCTAssertTrue(title.waitForExistence(timeout: 10))
        title.tap()
        title.typeText("iOS record saved")
        app.buttons["返回"].tap()
        XCTAssertTrue(app.buttons["添加文件"].waitForExistence(timeout: 10))
        app.terminate()
        app.launch()
        app.buttons[filename].tap()
        XCTAssertTrue(app.webViews.buttons["新增"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.webViews.staticTexts["iOS record saved"].firstMatch.waitForExistence(timeout: 10))
        let capture = XCTAttachment(screenshot: app.screenshot())
        capture.name = "Eidos File record editor"
        capture.lifetime = .keepAlways
        add(capture)
    }
}
