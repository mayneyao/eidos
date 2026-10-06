package space.eidos.android

import android.content.ComponentName
import android.content.pm.ActivityInfo
import androidx.test.core.app.ActivityScenario
import androidx.test.platform.app.InstrumentationRegistry
import com.journeyapps.barcodescanner.CaptureActivity
import org.junit.Assert.assertEquals
import org.junit.Test

class PeerScannerOrientationTest {
    @Test
    fun scannerRespectsSystemOrientationInsteadOfForcingLandscape() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val orientation = context.resources.configuration.orientation
        val info = context.packageManager.getActivityInfo(ComponentName(context, CaptureActivity::class.java), 0)
        assertEquals(ActivityInfo.SCREEN_ORIENTATION_FULL_USER, info.screenOrientation)
        ActivityScenario.launch<CaptureActivity>(peerScanOptions().createScanIntent(context)).use { scenario ->
            scenario.onActivity { activity ->
                assertEquals(ActivityInfo.SCREEN_ORIENTATION_FULL_USER, activity.requestedOrientation)
                assertEquals(orientation, activity.resources.configuration.orientation)
            }
        }
    }
}
