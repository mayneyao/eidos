package space.eidos.android

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp

@Composable
internal fun CustomSyncScreen(state: AppState, model: EidosModel) {
    val context = androidx.compose.ui.platform.LocalContext.current.applicationContext
    val saved = remember { runCatching { CustomSyncClient.saved(context) }.getOrNull() }
    var origin by rememberSaveable { mutableStateOf(saved?.url.orEmpty()) }
    var token by remember { mutableStateOf(saved?.token.orEmpty()) }
    var password by remember { mutableStateOf("") }
    var direct by rememberSaveable { mutableStateOf(false) }
    var downloading by rememberSaveable { mutableStateOf(false) }
    var disconnecting by remember { mutableStateOf(false) }
    val ready = !state.busy && !state.syncing && !state.peerBusy
    val remote = state.graft?.remoteUrl
    DisposableEffect(model) { onDispose { model.cancelCustomSync() } }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).imePadding().padding(bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        SpaceSelector(state, model)
        Text(tr("无需 Eidos 账号。填写与桌面相同的服务器地址和访问密钥，再选择或创建 Space。"), style = MaterialTheme.typography.bodyMedium)
        if (!ready) TextButton(onClick = model::cancelCustomSync) { Text(tr("停止同步")) }
        if (remote != null) {
            Text(syncOverviewTitle(state), style = MaterialTheme.typography.titleMedium)
            Text(remote, style = MaterialTheme.typography.bodySmall)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = { if (state.graft.syncStatus == "needs_merge") model.beginMerge() else model.syncRemote() }, enabled = ready) {
                    Text(if (state.graft.syncStatus == "needs_merge") tr("检查并合并") else tr("立即同步"))
                }
                OutlinedButton(onClick = { disconnecting = true }, enabled = ready) { Text(tr("断开连接")) }
            }
            state.syncMessage?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
            TextButton(onClick = { model.syncRemote(publish = true) }, enabled = ready) { Text(tr("首次发布到空仓库")) }
            Text(tr("仅在远程仓库为空时首次发布。已有远程版本请使用立即同步。"), style = MaterialTheme.typography.bodySmall)
            HorizontalDivider()
        }
        OutlinedTextField(origin, { origin = it; token = ""; model.clearCustomSpaces() }, Modifier.fillMaxWidth(), enabled = ready, label = { Text(tr("服务器地址")) }, placeholder = { Text("https://sync.example.com") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri))
        OutlinedTextField(token, { token = it; model.clearCustomSpaces() }, Modifier.fillMaxWidth(), enabled = ready, label = { Text(tr("服务器访问密钥")) }, singleLine = true, visualTransformation = PasswordVisualTransformation(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password))
        Text(tr("密钥和同步密码使用 Android Keystore 加密保存，不会写入 Space 或发送给编辑器。"), style = MaterialTheme.typography.bodySmall)
        if (origin.trim().startsWith("http://")) Text(tr("加密同步需要 HTTPS；HTTP 仅支持本机回环地址。请为自建服务器配置 HTTPS。"), style = MaterialTheme.typography.bodySmall)
        Button(onClick = { model.loadCustomSpaces(origin, token) }, enabled = ready && origin.isNotBlank() && token.isNotBlank()) { Text(tr("浏览服务器 Space")) }
        state.customSpaces?.let { spaces ->
            OutlinedTextField(password, { password = it }, Modifier.fillMaxWidth(), enabled = ready, label = { Text(tr("Space 同步密码")) }, singleLine = true, visualTransformation = PasswordVisualTransformation(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password))
            Text(tr("已有 Space 使用桌面设置的同步密码；新建 Space 请设置并保留此密码。"), style = MaterialTheme.typography.bodySmall)
            if (remote == null) OutlinedButton(onClick = { model.connectCustomSpace(origin, token, password) }, enabled = ready && password.isNotBlank()) { Text(tr("为当前 Space 开启同步")) }
            if (spaces.isEmpty()) Text(tr("此服务器尚无 Space"), style = MaterialTheme.typography.bodyMedium)
            spaces.forEach { space ->
                HorizontalDivider()
                Text(space.displayName, style = MaterialTheme.typography.titleSmall)
                Text(space.name, style = MaterialTheme.typography.bodySmall)
                if (space.uuid == null) Text(tr("此仓库未加密，请使用高级连接"), style = MaterialTheme.typography.bodySmall)
                else Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = { model.downloadCustomSpace(origin, token, password, space) }, enabled = ready && password.isNotBlank()) { Text(tr("下载到本机")) }
                    if (remote == null || remote == space.url) TextButton(onClick = { model.connectCustomSpace(origin, token, password, space) }, enabled = ready && password.isNotBlank()) { Text(if (remote == space.url) tr("更新连接凭据") else tr("连接当前 Space")) }
                }
            }
        }
        DownloadProgressView(state.downloadProgress)
        HorizontalDivider()
        Text(tr("高级：未加密 Graft 仓库"), style = MaterialTheme.typography.titleSmall)
        Text(tr("用于直接提供 Graft 协议的服务器。需要完整仓库地址；此入口不能打开桌面加密 Space。"), style = MaterialTheme.typography.bodySmall)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            TextButton(onClick = { direct = true }, enabled = ready) { Text(tr("直接连接仓库")) }
            TextButton(onClick = { downloading = true }, enabled = ready) { Text(tr("下载远程 Space")) }
        }
    }
    if (direct) SyncConnectionSheet(remote, !ready, { direct = false }) { url, key -> model.connectRemote(url, key) { direct = false } }
    if (downloading) CloneSpaceSheet(!ready, state.downloadProgress, { downloading = false }) { name, url, key -> model.cloneCustomSpace(name, url, key) { downloading = false } }
    if (disconnecting) AlertDialog(onDismissRequest = { disconnecting = false }, title = { Text(tr("断开此 Space 的服务器连接？")) },
        text = { Text(tr("只清除此手机上的连接和凭证，文件、版本历史和服务器副本会保留。")) },
        confirmButton = { TextButton(onClick = { disconnecting = false; model.disconnectRemote() }, enabled = ready) { Text(tr("断开连接")) } },
        dismissButton = { TextButton(onClick = { disconnecting = false }) { Text(tr("取消")) } })
}
