import SwiftUI

enum AppLanguage {
    static let key = "app-language"
    static let defaults = UserDefaults(suiteName: "group.space.eidos.ios") ?? .standard
    static let choices = ["system", "zh", "en"]
    static func resolve(_ preference: String, languages: [String]) -> String {
        if ["zh", "en"].contains(preference) { return preference }
        let language = languages.first?.lowercased().split(whereSeparator: { $0 == "-" || $0 == "_" }).first
        return language == "zh" ? "zh" : "en"
    }
    static var locale: String {
        resolve(defaults.string(forKey: key) ?? "system", languages: Locale.preferredLanguages)
    }
    static let english: [String: String] = {
        guard let url = Bundle.main.url(forResource: "en", withExtension: "json", subdirectory: "locales"),
              let data = try? Data(contentsOf: url),
              let result = try? JSONDecoder().decode([String: String].self, from: data) else { return [:] }
        return result
    }()
}

func tr(_ source: String, _ arguments: Any...) -> String {
    let template = AppLanguage.locale == "en" ? AppLanguage.english[source] ?? source : source
    let pattern = try! NSRegularExpression(pattern: "\\{(\\d+)\\}")
    let result = NSMutableString(string: template)
    for match in pattern.matches(in: template, range: NSRange(template.startIndex..., in: template)).reversed() {
        let index = Int((template as NSString).substring(with: match.range(at: 1)))!
        if arguments.indices.contains(index) { result.replaceCharacters(in: match.range, with: String(describing: arguments[index])) }
    }
    return result as String
}

struct LanguageSettings: View {
    @AppStorage(AppLanguage.key, store: AppLanguage.defaults) private var language = "system"
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            Form {
                Picker(tr("语言"), selection: $language) {
                    Text(tr("跟随系统")).tag("system")
                    Text("中文").tag("zh")
                    Text("English").tag("en")
                }.pickerStyle(.inline)
            }
            .navigationTitle(tr("语言"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button(tr("完成")) { dismiss() } } }
        }
    }
}
