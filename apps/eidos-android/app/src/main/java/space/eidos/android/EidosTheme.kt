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
            onBackground = Color(0xFFE4E4E7),
            onSurface = Color(0xFFE4E4E7),
            onSurfaceVariant = Color(0xFFA1A1AA),
            surfaceTint = Color(0xFFE4E4E7),
            surfaceContainerLow = Color(0xFF202023),
            surfaceContainerHigh = Color(0xFF2C2C30),
            surfaceContainerHighest = Color(0xFF343438),
            outline = Color(0xFF71717A),
            outlineVariant = Color(0xFF3F3F46),
            secondaryContainer = Color(0xFF303034),
            onSecondaryContainer = Color(0xFFE4E4E7),
        )
    else
        lightColorScheme(
            primary = Color(0xFF242427),
            onPrimary = Color.White,
            background = Color(0xFFFAFAFA),
            surface = Color(0xFFFAFAFA),
            surfaceContainer = Color(0xFFF0F0F1),
            onBackground = Color(0xFF242427),
            onSurface = Color(0xFF242427),
            onSurfaceVariant = Color(0xFF62626B),
            surfaceTint = Color(0xFF242427),
            surfaceContainerLow = Color(0xFFF5F5F5),
            surfaceContainerHigh = Color(0xFFE9E9EB),
            surfaceContainerHighest = Color(0xFFE4E4E7),
            outline = Color(0xFF71717A),
            outlineVariant = Color(0xFFD4D4D8),
            secondaryContainer = Color(0xFFE9E9EB),
            onSecondaryContainer = Color(0xFF242427),
        )
