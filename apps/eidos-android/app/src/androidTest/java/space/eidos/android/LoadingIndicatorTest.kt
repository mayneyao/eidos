package space.eidos.android

import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.unit.dp
import org.junit.Rule
import org.junit.Test

class LoadingIndicatorTest {
    @get:Rule val compose = createComposeRule()

    @Test
    fun fastLoadsStayQuietAndSlowLoadsKeepTheSameGeometry() {
        val loading = mutableStateOf(true)
        compose.mainClock.autoAdvance = false
        compose.setContent { LoadingIndicator(loading.value, Modifier.testTag("slot")) }
        val progress = SemanticsMatcher.keyIsDefined(SemanticsProperties.ProgressBarRangeInfo)
        compose.onNodeWithTag("slot").assertHeightIsEqualTo(4.dp)
        compose.onAllNodes(progress).assertCountEquals(0)
        compose.mainClock.advanceTimeBy(100)
        compose.runOnUiThread { loading.value = false }
        compose.mainClock.advanceTimeByFrame()
        compose.mainClock.advanceTimeBy(300)
        compose.onAllNodes(progress).assertCountEquals(0)
        compose.runOnUiThread { loading.value = true }
        compose.mainClock.advanceTimeByFrame()
        compose.onAllNodes(progress).assertCountEquals(0)
        compose.mainClock.advanceTimeBy(250)
        compose.onAllNodes(progress).assertCountEquals(1)
        compose.onNodeWithTag("slot").assertHeightIsEqualTo(4.dp)
        compose.runOnUiThread { loading.value = false }
        compose.mainClock.advanceTimeByFrame()
        compose.onAllNodes(progress).assertCountEquals(0)
        compose.onNodeWithTag("slot").assertHeightIsEqualTo(4.dp)
    }
}
