@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package space.eidos.android

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp

@Composable
internal fun CloneSpaceSheet(
    busy: Boolean,
    progress: DownloadProgress? = null,
    dismiss: () -> Unit,
    download: (String, String, String) -> Unit,
) {
    var name by rememberSaveable { mutableStateOf("") }
    var url by rememberSaveable { mutableStateOf("") }
    var token by remember { mutableStateOf("") }
    ModalBottomSheet(onDismissRequest = { if (!busy) dismiss() }) {
        Column(
            Modifier.fillMaxWidth()
                .imePadding()
                .verticalScroll(rememberScrollState())
                .padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text("下载远程 Space", style = MaterialTheme.typography.titleLarge)
            Text("将远程文件和附件下载到新的本地 Space，完成后即可离线使用。", style = MaterialTheme.typography.bodySmall)
            OutlinedTextField(
                name,
                { name = it },
                label = { Text("Space 名称") },
                singleLine = true,
                enabled = !busy,
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                url,
                { url = it },
                label = { Text("远程地址") },
                singleLine = true,
                enabled = !busy,
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                token,
                { token = it },
                label = { Text("访问令牌（可选）") },
                visualTransformation = PasswordVisualTransformation(),
                singleLine = true,
                enabled = !busy,
                modifier = Modifier.fillMaxWidth(),
            )
            DownloadProgressView(progress)
            Button(
                onClick = { download(name, url, token) },
                enabled = !busy && name.isNotBlank() && url.isNotBlank(),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("下载到本机")
            }
        }
    }
}
