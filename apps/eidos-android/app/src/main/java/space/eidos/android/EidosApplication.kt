package space.eidos.android

class EidosApplication : android.app.Application() {
    override fun onCreate() {
        super.onCreate()
        AppLanguage.initialize(this)
    }
    override fun onConfigurationChanged(newConfig: android.content.res.Configuration) {
        super.onConfigurationChanged(newConfig)
        AppLanguage.updateSystem(newConfig.locales[0].toLanguageTag())
    }
}
