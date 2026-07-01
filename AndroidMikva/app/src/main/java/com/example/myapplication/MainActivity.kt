package com.example.myapplication

import android.Manifest
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.runtime.CompositionLocalProvider
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.myapplication.ui.CalendarScreen
import com.example.myapplication.ui.MikvaViewModel
import com.example.myapplication.ui.theme.MyApplicationTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            MyApplicationTheme {
                val vm: MikvaViewModel = viewModel()

                val permLauncher = rememberLauncher { vm.refreshLocation() }
                LaunchedEffect(Unit) {
                    permLauncher.launch(
                        arrayOf(
                            Manifest.permission.ACCESS_FINE_LOCATION,
                            Manifest.permission.ACCESS_COARSE_LOCATION,
                        )
                    )
                    vm.refreshLocation()
                }

                // כל האפליקציה מימין-לשמאל
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                    CalendarScreen(vm)
                }
            }
        }
    }
}

@androidx.compose.runtime.Composable
private fun rememberLauncher(onResult: () -> Unit) =
    androidx.activity.compose.rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { onResult() }
