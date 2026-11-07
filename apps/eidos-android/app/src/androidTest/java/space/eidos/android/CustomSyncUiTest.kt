package space.eidos.android

import androidx.activity.compose.setContent
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.graphics.asAndroidBitmap
import org.junit.Rule
import org.junit.Test

class CustomSyncUiTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()
    @Test fun customServerEntryIsAvailableWithoutAnAccount() {
        val app = compose.activity.application
        val model = EidosModel(app)
        compose.activity.setContent { androidx.compose.material3.MaterialTheme(colorScheme = eidosColorScheme()) { SyncScreen(AppState(graft = GraftState(false, false)), model) } }
        compose.onNodeWithText(tr("自定义服务器")).assertIsDisplayed().performClick()
        compose.onNodeWithText(tr("服务器地址")).assertIsDisplayed()
        compose.onNodeWithText(tr("服务器访问密钥")).assertIsDisplayed()
        compose.onNodeWithText(tr("浏览服务器 Space")).assertIsDisplayed()
        java.io.File(app.filesDir, "custom-sync-screen.png").outputStream().use {
            compose.onRoot().captureToImage().asAndroidBitmap().compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it)
        }
    }
}
