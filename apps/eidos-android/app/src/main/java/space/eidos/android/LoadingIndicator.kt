package space.eidos.android

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay

/** Keep content geometry unchanged when loading starts or finishes. */
@Composable
internal fun LoadingIndicator(loading: Boolean, modifier: Modifier = Modifier) {
    var visible by remember(loading) { mutableStateOf(false) }
    LaunchedEffect(loading) {
        visible = false
        if (loading) {
            delay(200)
            visible = true
        }
    }
    Box(modifier.fillMaxWidth().height(4.dp)) {
        if (loading && visible) LinearProgressIndicator(Modifier.matchParentSize())
    }
}
