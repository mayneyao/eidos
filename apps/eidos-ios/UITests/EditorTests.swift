import XCTest

final class EditorTests: XCTestCase {
    func testFolderNavigationAndLocalVersion() {
        let app = XCUIApplication()
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
        let app = XCUIApplication()
        app.launch()
        app.buttons["添加文件"].coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        app.buttons["新建 Markdown"].tap()
        let source = app.webViews.buttons["源码"]
        XCTAssertTrue(source.waitForExistence(timeout: 30))
        let filename = app.navigationBars.firstMatch.identifier
        XCTAssertTrue(filename.hasSuffix(".md"))
        source.tap()
        let editor = app.webViews.textViews.firstMatch
        XCTAssertTrue(editor.waitForExistence(timeout: 10))
        editor.tap()
        editor.typeText("Offline iOS persisted")
        app.buttons["返回"].tap()
        XCTAssertTrue(app.buttons["添加文件"].waitForExistence(timeout: 10))
        app.terminate()
        app.launch()
        app.buttons[filename].tap()
        XCTAssertTrue(source.waitForExistence(timeout: 10))
        source.tap()
        XCTAssertTrue((editor.value as? String ?? "").contains("Offline iOS persisted"))
    }
    func testDatabaseEditSurvivesRelaunch() {
        let app = XCUIApplication()
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
