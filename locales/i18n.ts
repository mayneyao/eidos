import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import Backend from 'i18next-http-backend';
import LanguageDetector from 'i18next-browser-languagedetector';

import enTranslations from './en.json';
import zhTranslations from './zh.json';

const resources = {
  en: { translation: enTranslations },
  zh: { translation: zhTranslations }
};

const getUserLanguage = () => {
  const appearancePreferences = localStorage.getItem('appearancePreferences');
  if (appearancePreferences) {
    const parsedPreferences = JSON.parse(appearancePreferences)
    return parsedPreferences.language || 'en';
  }
  return 'en';
};

i18n
  .use(Backend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    lng: getUserLanguage(),
    fallbackLng: 'en',
    debug: true,
    interpolation: {
      escapeValue: false,
    },
  }).then(() => {
    console.log('i18n initialized successfully');
    console.log('Current language:', i18n.language);
  }).catch((err) => {
    console.log('Error initializing i18n:', err);
  });



export default i18n;
