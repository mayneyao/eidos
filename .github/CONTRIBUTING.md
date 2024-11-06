## Contributing to Translations

This project uses i18next for internationalization. The translation files are located in the locales directory with the following structure:

```
locales/
  ├── en.json     # English translations
  ├── zh.json     # Chinese translations
  ├── i18n.ts     # i18n configuration
  └── json.d.ts   # Type definitions
```

### Adding a New Language

To add support for a new language:

1. Create a new JSON file in the locales directory named with the language code (e.g., fr.json for French)
2. Copy the content structure from en.json as a template
3. Add the language to the resources configuration in i18n.ts:

```ts
import enTranslations from "./en.json"
import frTranslations from "./fr.json"
import zhTranslations from "./zh.json" // import your new language here

const resources = {
  en: { translation: enTranslations },
  zh: { translation: zhTranslations },
  fr: { translation: frTranslations }, // Add your new language here
}
```
