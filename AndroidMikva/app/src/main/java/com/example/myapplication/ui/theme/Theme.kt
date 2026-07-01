package com.example.myapplication.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val DarkColorScheme = darkColorScheme(
    primary = ForestLight,
    secondary = SageLight,
    tertiary = Clay,
    background = Color(0xFF101915),
    surface = Color(0xFF18251F),
)

private val LightColorScheme = lightColorScheme(
    primary = Forest,
    secondary = Sage,
    tertiary = Clay,
    background = Sand,
    surface = Color.White,
    onBackground = Ink,
    onSurface = Ink,
    surfaceVariant = Color(0xFFE8EFEB),
    outline = Color(0xFF80958B),
    /*
    onPrimary = Color.White,
    */
)

@Composable
fun MyApplicationTheme(
    darkTheme: Boolean = false,
    content: @Composable () -> Unit
) {
    val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme

    MaterialTheme(
        colorScheme = colorScheme,
        typography = Typography,
        content = content
    )
}
