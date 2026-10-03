@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package space.eidos.android

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp

@Composable
fun SyncConnectionSheet(
    currentUrl: String?,
    busy: Boolean,
    dismiss: () -> Unit,
    connect: (String, String) -> Unit,
) {
    var url by rememberSaveable { mutableStateOf(currentUrl.orEmpty()) }
    // Never put a token in Android's saved instance state.
    var token by remember { mutableStateOf("") }
    ModalBottomSheet(onDismissRequest = { if (!busy) dismiss() }) {
        Column(
            Modifier.verticalScroll(rememberScrollState()).padding(24.dp).imePadding(),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text("手动连接 Graft 远程", style = MaterialTheme.typography.titleLarge)
            Text(
                "输入远程 Space 的 HTTPS 地址和访问令牌。配置保存后，由你选择同步或发布本机版本。",
                style = MaterialTheme.typography.bodyMedium,
            )
            OutlinedTextField(
                url,
                { url = it },
                Modifier.fillMaxWidth(),
                label = { Text("远程地址") },
                singleLine = true,
                enabled = !busy,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
            )
            OutlinedTextField(
                token,
                { token = it },
                Modifier.fillMaxWidth(),
                label = { Text("访问令牌（可选）") },
                singleLine = true,
                enabled = !busy,
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            )
            Text(
                "令牌使用 Android Keystore 加密保存在本机，不会写入 Space 文件。留空会清除旧令牌。",
                style = MaterialTheme.typography.bodySmall,
            )
            Button(
                onClick = { connect(url, token) },
                enabled = !busy && url.isNotBlank(),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("保存连接")
            }
        }
    }
}
