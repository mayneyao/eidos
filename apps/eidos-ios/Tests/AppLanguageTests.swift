import XCTest
@testable import EidosIOS

final class AppLanguageTests: XCTestCase {
    func testSystemLanguageAndFallback() {
        for language in ["zh", "zh-CN", "zh-Hant-TW", "ZH_hk"] {
            XCTAssertEqual(AppLanguage.resolve("system", languages: [language]), "zh")
        }
        for language in ["pt-BR", "pt", "pt-PT", "PT_br"] {
            XCTAssertEqual(AppLanguage.resolve("system", languages: [language]), "pt-BR")
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
        XCTAssertEqual(AppLanguage.resolve("pt-BR", languages: ["en-US"]), "pt-BR")
        XCTAssertEqual(AppLanguage.portuguese["语言"], "Idioma")
        XCTAssertEqual(AppLanguage.portuguese["删除「{0}」？"], "Excluir “{0}”?")
    }
}
