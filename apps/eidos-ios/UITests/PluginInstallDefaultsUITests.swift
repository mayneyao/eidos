import XCTest

final class PluginInstallDefaultsUITests: XCTestCase {
    /// Seed Default Handler.canvas in the selected Space and Canvas 0.5.7 in the app's Documents folder.
    func testCanvasInstallConfirmationAndDefaultFileOpening() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["-app-language", "zh"]
        app.launch()
        let canvas = app.buttons["Default Handler.canvas"]
        try XCTSkipUnless(canvas.waitForExistence(timeout: 10), "Requires the isolated Canvas UI fixture")
        let checkbox = app.switches["plugin-install-file-defaults"]

        func capture(_ name: String) {
            let attachment = XCTAttachment(screenshot: app.screenshot())
            attachment.name = name
            attachment.lifetime = .keepAlways
            add(attachment)
        }
        func importCanvas() {
            app.buttons["插件更多操作"].tap()
            app.buttons["导入插件包"].tap()
            let archive = app.descendants(matching: .any).matching(NSPredicate(format: "label BEGINSWITH %@", "eidos.canvas-0.5.7")).firstMatch
            if !archive.waitForExistence(timeout: 3) {
                let browse = app.buttons["Browse"]
                if browse.exists { browse.tap() }
                let local = app.descendants(matching: .any)["On My iPhone"].firstMatch
                if local.exists { local.tap() }
                let folder = app.descendants(matching: .any)["Eidos"].firstMatch
                if folder.exists { folder.tap() }
            }
            XCTAssertTrue(archive.waitForExistence(timeout: 10), app.debugDescription)
            archive.tap()
            XCTAssertTrue(app.navigationBars["确认安装"].waitForExistence(timeout: 20))
        }

        app.buttons["Space 操作"].tap()
        app.buttons["插件"].tap()
        XCTAssertTrue(app.buttons["已安装"].waitForExistence(timeout: 8))
        importCanvas()
        XCTAssertTrue(checkbox.exists)
        XCTAssertEqual(checkbox.value as? String, "0")
        capture("Canvas install review unchecked")
        checkbox.tap()
        XCTAssertEqual(checkbox.value as? String, "1")
        app.navigationBars["确认安装"].buttons["取消"].tap()

        importCanvas()
        XCTAssertEqual(checkbox.value as? String, "0")
        checkbox.tap()
        XCTAssertEqual(checkbox.value as? String, "1")
        capture("Canvas install review checked")
        app.buttons["安装"].tap()
        XCTAssertTrue(app.navigationBars["插件"].buttons["返回"].waitForExistence(timeout: 10))

        importCanvas()
        XCTAssertFalse(checkbox.exists)
        app.navigationBars["确认安装"].buttons["取消"].tap()
        app.navigationBars["插件"].buttons["返回"].tap()

        canvas.tap()
        let canvasSave = app.webViews.buttons["保存"]
        XCTAssertTrue(canvasSave.waitForExistence(timeout: 15))
        capture("File row opens Canvas automatically")
        app.navigationBars.buttons["返回"].tap()

        let actions = app.buttons["更多 Default Handler.canvas"].firstMatch
        XCTAssertTrue(actions.waitForExistence(timeout: 10))
        actions.tap()
        app.buttons["打开方式"].tap()
        XCTAssertTrue(app.buttons["内置打开方式"].exists)
        let restore = app.buttons["为 .canvas 文件恢复内置打开方式"]
        XCTAssertTrue(restore.exists)
        capture("Canvas restore built-in option")
        restore.tap()
        XCTAssertTrue(canvas.waitForExistence(timeout: 10))
        canvas.tap()
        XCTAssertFalse(canvasSave.waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["Copy"].waitForExistence(timeout: 5), app.debugDescription)
        capture("File row uses built-in after reset")
    }
}
