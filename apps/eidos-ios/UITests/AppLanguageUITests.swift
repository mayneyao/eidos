import XCTest

final class AppLanguageUITests: XCTestCase {
    func testJapaneseSystemLanguageReachesEmbeddedEditors() {
        verifySystemEditors(
            region: "ja-JP", actions: "Space の操作", addFile: "ファイルを追加",
            table: "新しい .eidos ファイル", record: "新しいレコード",
            back: "戻る", note: "新しいノート", markdown: "Markdown エディタ"
        )
    }

    func testKoreanSystemLanguageReachesEmbeddedEditors() {
        verifySystemEditors(
            region: "ko-KR", actions: "Space 작업", addFile: "파일 추가",
            table: "새 .eidos 파일", record: "새 레코드",
            back: "뒤로", note: "새 노트", markdown: "Markdown 편집기"
        )
    }

    private func verifySystemEditors(
        region: String, actions: String, addFile: String, table: String,
        record: String, back: String, note: String, markdown: String
    ) {
        let app = XCUIApplication()
        app.launchArguments = ["-app-language", "system", "-AppleLanguages", "(\(region))"]
        app.launch()
        XCTAssertTrue(app.buttons[actions].waitForExistence(timeout: 10))
        let addButton = app.buttons[addFile]
        XCTAssertTrue(addButton.waitForExistence(timeout: 10))
        addButton.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        app.buttons[table].tap()
        XCTAssertTrue(app.webViews.buttons[record].firstMatch.waitForExistence(timeout: 30))
        let capture = XCTAttachment(screenshot: app.screenshot())
        capture.name = "\(region) Eidos File editor"
        capture.lifetime = .keepAlways
        add(capture)
        app.buttons[back].tap()
        XCTAssertTrue(addButton.waitForExistence(timeout: 10))
        addButton.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        app.buttons[note].tap()
        let editor = app.webViews.descendants(matching: .any)[markdown].firstMatch
        XCTAssertTrue(editor.waitForExistence(timeout: 30), app.webViews.firstMatch.debugDescription)
    }

    func testJapaneseAndKoreanManualSelectionPersists() {
        let app = XCUIApplication()
        app.launch()
        let actions = ["Space actions", "Space 操作", "Ações do Space", "Space の操作", "Space 작업"]
        let languages = ["Language", "语言", "Idioma", "言語", "언어"]
        func openLanguages() {
            let actionsButton = app.buttons.matching(NSPredicate(format: "label IN %@", actions)).firstMatch
            XCTAssertTrue(actionsButton.waitForExistence(timeout: 10))
            actionsButton.tap()
            app.buttons.matching(NSPredicate(format: "label IN %@", languages)).firstMatch.tap()
        }
        for (name, action, done) in [
            ("日本語", "Space の操作", "完了"),
            ("한국어", "Space 작업", "완료"),
        ] {
            openLanguages()
            app.buttons[name].tap()
            let capture = XCTAttachment(screenshot: app.screenshot())
            capture.name = "\(name) language selection"
            capture.lifetime = .keepAlways
            add(capture)
            app.buttons[done].tap()
            XCTAssertTrue(app.buttons[action].waitForExistence(timeout: 5))
            app.terminate()
            app.launch()
            XCTAssertTrue(app.buttons[action].waitForExistence(timeout: 10))
        }
        openLanguages()
        app.buttons["English"].tap()
        app.buttons["Done"].tap()
    }

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
