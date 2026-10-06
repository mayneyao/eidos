package space.eidos.android

/** Existing UI journeys use Chinese selectors; language tests can override this fixture. */
class EidosTestRunner : androidx.test.runner.AndroidJUnitRunner() {
    private var originalLanguage: String? = null
    private var appContext: android.content.Context? = null
    override fun callApplicationOnCreate(app: android.app.Application) {
        super.callApplicationOnCreate(app)
        appContext = app
        originalLanguage = AppLanguage.selected()
        AppLanguage.set(app, androidx.test.platform.app.InstrumentationRegistry.getArguments().getString("eidosTestLanguage", "zh"))
    }
    override fun finish(resultCode: Int, results: android.os.Bundle?) {
        appContext?.let { context -> originalLanguage?.let { AppLanguage.set(context, it) } }
        super.finish(resultCode, results)
    }
}
