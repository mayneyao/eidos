import XCTest

final class AppLanguageUITests: XCTestCase {
    func testLanguageSwitchAndPersistence() {
        let app = XCUIApplication()
        app.launch()
        func openLanguages() {
            let english = app.buttons["Space actions"]
            let chinese = app.buttons["Space 操作"]
            XCTAssertTrue(english.waitForExistence(timeout: 3) || chinese.waitForExistence(timeout: 3))
            (english.exists ? english : chinese).tap()
            let language = app.buttons["Language"]
            (language.exists ? language : app.buttons["语言"]).tap()
        }
        openLanguages()
        app.buttons["English"].tap()
        app.buttons["Done"].tap()
        XCTAssertTrue(app.buttons["Space actions"].exists)
        app.terminate()
        app.launch()
        XCTAssertTrue(app.buttons["Space actions"].waitForExistence(timeout: 5))
        openLanguages()
        app.buttons["中文"].tap()
        app.buttons["完成"].tap()
        XCTAssertTrue(app.buttons["Space 操作"].exists)
        openLanguages()
        app.buttons["跟随系统"].tap()
        let done = app.buttons["Done"]
        (done.exists ? done : app.buttons["完成"]).tap()
    }
}
