import XCTest
@testable import EidosIOS

final class AppLanguageTests: XCTestCase {
    func testSystemLanguageAndFallback() {
        for language in ["zh", "zh-CN", "zh-Hant-TW", "ZH_hk"] {
            XCTAssertEqual(AppLanguage.resolve("system", languages: [language]), "zh")
        }
        for language in ["en-US", "ja-JP", "fr", ""] {
            XCTAssertEqual(AppLanguage.resolve("system", languages: [language, "zh"]), "en")
        }
        XCTAssertEqual(AppLanguage.resolve("system", languages: []), "en")
    }
    func testExplicitPreferenceAndPackagedCatalog() {
        XCTAssertEqual(AppLanguage.resolve("en", languages: ["zh-CN"]), "en")
        XCTAssertEqual(AppLanguage.resolve("zh", languages: ["en-US"]), "zh")
        XCTAssertEqual(AppLanguage.resolve("invalid", languages: ["zh"]), "zh")
        XCTAssertEqual(AppLanguage.english["语言"], "Language")
        XCTAssertEqual(AppLanguage.english["删除「{0}」？"], "Delete “{0}”?")
    }
}
