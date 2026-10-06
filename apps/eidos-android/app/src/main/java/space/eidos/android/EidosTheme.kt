package space.eidos.android

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

@Composable
internal fun eidosColorScheme() =
    if (isSystemInDarkTheme())
        darkColorScheme(
            primary = Color(0xFFE4E4E7),
            onPrimary = Color(0xFF18181B),
            background = Color(0xFF18181B),
            surface = Color(0xFF18181B),
            surfaceContainer = Color(0xFF242427),
            secondaryContainer = Color(0xFF303034),
        )
    else
        lightColorScheme(
            primary = Color(0xFF242427),
            onPrimary = Color.White,
            background = Color(0xFFFAFAFA),
            surface = Color(0xFFFAFAFA),
            surfaceContainer = Color(0xFFF0F0F1),
            secondaryContainer = Color(0xFFE9E9EB),
        )
