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
        for language in ["en-US", "fr", ""] {
            XCTAssertEqual(AppLanguage.resolve("system", languages: [language, "zh"]), "en")
        }
        XCTAssertEqual(AppLanguage.resolve("system", languages: []), "en")
    }
    func testJapaneseAndKoreanSystemPreferencesAndResources() {
        for (language, region) in [("ja", "ja-JP"), ("ko", "ko-KR")] {
            XCTAssertEqual(AppLanguage.resolve("system", languages: [language]), language)
            XCTAssertEqual(AppLanguage.resolve("system", languages: [region]), language)
            XCTAssertEqual(AppLanguage.resolve(language, languages: ["pt-BR"]), language)
            XCTAssertEqual(AppLanguage.regionalTag(language), region)
            let url = Bundle.main.url(forResource: "InfoPlist", withExtension: "strings", subdirectory: nil, localization: language)
            XCTAssertNotNil(url)
        }
        XCTAssertEqual(AppLanguage.japanese["语言"], "言語")
        XCTAssertEqual(AppLanguage.korean["语言"], "언어")
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
