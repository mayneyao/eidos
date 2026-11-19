import XCTest

final class AppLanguageUITests: XCTestCase {
    func testBrazilianSystemLanguageReachesEmbeddedEditor() {
        let app = XCUIApplication()
        app.launchArguments = ["-app-language", "system", "-AppleLanguages", "(pt-BR)"]
        app.launch()
        XCTAssertTrue(app.buttons["Ações do Space"].waitForExistence(timeout: 10))
        let addFile = app.buttons["Adicionar arquivo"]
        XCTAssertTrue(addFile.waitForExistence(timeout: 10))
        addFile.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        app.buttons["Novo arquivo .eidos"].tap()
        let newRecord = app.webViews.buttons["Novo registro"].firstMatch
        XCTAssertTrue(newRecord.waitForExistence(timeout: 30))
        let capture = XCTAttachment(screenshot: app.screenshot())
        capture.name = "Brazilian Portuguese Eidos File editor"
        capture.lifetime = .keepAlways
        add(capture)
    }

    func testLanguageSwitchAndPersistence() {
        let app = XCUIApplication()
        app.launch()
        func openLanguages() {
            let english = app.buttons["Space actions"]
            let chinese = app.buttons["Space 操作"]
            let portuguese = app.buttons["Ações do Space"]
            XCTAssertTrue(english.waitForExistence(timeout: 3) || chinese.exists || portuguese.exists)
            (english.exists ? english : chinese.exists ? chinese : portuguese).tap()
            let language = app.buttons["Language"]
            let chineseLanguage = app.buttons["语言"]
            (language.exists ? language : chineseLanguage.exists ? chineseLanguage : app.buttons["Idioma"]).tap()
        }
        openLanguages()
        app.buttons["English"].tap()
        app.buttons["Done"].tap()
        XCTAssertTrue(app.buttons["Space actions"].exists)
        app.terminate()
        app.launch()
        XCTAssertTrue(app.buttons["Space actions"].waitForExistence(timeout: 5))
        openLanguages()
        app.buttons["Português (Brasil)"].tap()
        let settings = XCTAttachment(screenshot: app.screenshot())
        settings.name = "Brazilian Portuguese language settings"
        settings.lifetime = .keepAlways
        add(settings)
        app.buttons["Concluído"].tap()
        XCTAssertTrue(app.buttons["Ações do Space"].exists)
        app.terminate()
        app.launch()
        XCTAssertTrue(app.buttons["Ações do Space"].waitForExistence(timeout: 5))
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
