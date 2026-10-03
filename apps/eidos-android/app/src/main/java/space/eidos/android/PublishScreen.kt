@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package space.eidos.android

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp

@Composable
fun PublishScreen(state: AppState, model: EidosModel) {
    val page = checkNotNull(state.publish)
    val context = LocalContext.current
    var slug by
        rememberSaveable(page.file.path) { mutableStateOf(page.file.path.substringBeforeLast('.')) }
    var access by
        rememberSaveable(page.file.path, page.binding?.id) {
            mutableStateOf(page.binding?.access ?: "public")
        }
    // Secrets never enter saved instance state or the publication registry.
    var password by remember(page.file.path) { mutableStateOf("") }
    var confirmRemoval by remember { mutableStateOf(false) }
    var copied by remember { mutableStateOf(false) }
    val binding = page.binding
    BackHandler { if (!state.busy) model.closePublish() }
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (binding == null) "发布" else "管理发布") },
                navigationIcon = {
                    IconButton(onClick = model::closePublish, enabled = !state.busy) {
                        Icon(Icons.AutoMirrored.Outlined.ArrowBack, "返回文件")
                    }
                },
            )
        }
    ) { padding ->
        Column(
            Modifier.padding(padding)
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 24.dp)
        ) {
            Text(
                page.file.name,
                style = MaterialTheme.typography.titleLarge,
                modifier = Modifier.padding(top = 16.dp),
            )
            Text(
                "将当前文件和引用的本地附件发布到网页。修改本地文件后，需要再次发布才会更新网页。",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 8.dp, bottom = 24.dp),
            )
            if (state.account == null) {
                Text("登录 Eidos 账号后即可发布。")
                Button(
                    onClick = {
                        model.signIn { context.startActivity(Intent(Intent.ACTION_VIEW, it)) }
                    },
                    enabled = !state.busy,
                    modifier = Modifier.fillMaxWidth().padding(top = 16.dp),
                ) {
                    Text("登录 Eidos")
                }
            } else {
                Text(
                    if (page.plan == "free") "Publish Free · ${state.account.name}"
                    else "${state.account.name} · Publish",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (BuildConfig.DEBUG)
                    Text("Staging · 开发环境", style = MaterialTheme.typography.labelSmall)
                HorizontalDivider(Modifier.padding(vertical = 20.dp))
                if (binding != null) {
                    Text(
                        if (binding.active) "网页已发布" else "网页未发布",
                        style = MaterialTheme.typography.titleMedium,
                    )
                    Text(
                        binding.url,
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.padding(top = 8.dp),
                    )
                    if (binding.active)
                        Row(Modifier.padding(top = 8.dp)) {
                            TextButton(
                                onClick = {
                                    (context.getSystemService(Context.CLIPBOARD_SERVICE)
                                            as ClipboardManager)
                                        .setPrimaryClip(ClipData.newPlainText("发布链接", binding.url))
                                    copied = true
                                }
                            ) {
                                Text(if (copied) "已复制" else "复制链接")
                            }
                            TextButton(
                                onClick = {
                                    context.startActivity(
                                        Intent.createChooser(
                                            Intent(Intent.ACTION_SEND).apply {
                                                type = "text/plain"
                                                putExtra(Intent.EXTRA_TEXT, binding.url)
                                            },
                                            "分享发布链接",
                                        )
                                    )
                                }
                            ) {
                                Text("分享")
                            }
                        }
                    HorizontalDivider(Modifier.padding(vertical = 16.dp))
                } else {
                    OutlinedTextField(
                        value = slug,
                        onValueChange = { slug = it },
                        label = { Text("发布路径") },
                        supportingText = { Text(page.host?.let { "https://$it/" } ?: "正在获取发布地址") },
                        enabled = page.ready && !state.busy,
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                Text(
                    "谁可以访问",
                    style = MaterialTheme.typography.titleSmall,
                    modifier = Modifier.padding(top = 20.dp, bottom = 8.dp),
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("public" to "所有人", "password" to "持有密码", "private" to "仅自己").forEach {
                        (value, label) ->
                        FilterChip(
                            selected = access == value,
                            onClick = { access = value },
                            label = { Text(label) },
                            enabled =
                                page.ready &&
                                    !state.busy &&
                                    (value == "public" || page.privateAccess),
                        )
                    }
                }
                Text(
                    when (access) {
                        "private" -> "需要登录当前 Eidos 账号才能打开网页。"
                        "password" -> "访问者需要输入密码才能打开网页。"
                        else -> "任何拿到链接的人都可以访问。"
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (access == "password")
                    OutlinedTextField(
                        value = password,
                        onValueChange = { password = it },
                        label = {
                            Text(if (binding?.access == "password") "新密码（留空保留原密码）" else "访问密码")
                        },
                        supportingText = { Text("8–128 个字符") },
                        visualTransformation = PasswordVisualTransformation(),
                        enabled = !state.busy,
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
                    )
                if (page.plan == "free")
                    Text(
                        if (page.file.eidos) "发布 .eidos 文件需要 Publish Pro。"
                        else "密码访问和私有网页需要 Publish Pro。",
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.padding(top = 16.dp),
                    )
                // One stable progress area owns every phase; controls do not move when it appears.
                Column(Modifier.fillMaxWidth().heightIn(min = 88.dp).padding(top = 20.dp)) {
                    if (state.busy) {
                        val event = page.progress
                        val bytes = event?.optString("kind") == "bytes"
                        if (bytes)
                            LinearProgressIndicator(
                                progress = {
                                    (event!!.optDouble("percent") / 100).toFloat().coerceIn(0f, 1f)
                                },
                                modifier = Modifier.fillMaxWidth(),
                            )
                        else LinearProgressIndicator(Modifier.fillMaxWidth())
                        Text(
                            if (bytes)
                                "${event!!.optString("currentBytes")} / ${event.optString("totalBytes")} bytes"
                            else "正在准备或发布，请保持应用打开…",
                            style = MaterialTheme.typography.bodySmall,
                            modifier = Modifier.padding(top = 8.dp),
                        )
                    } else if (page.complete)
                        Text(
                            if (binding?.active == true) "发布完成，链接已更新。" else "已取消发布，本地文件仍保留。",
                            style = MaterialTheme.typography.bodyMedium,
                        )
                }
                page.error?.let {
                    Text(
                        it,
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.padding(bottom = 12.dp),
                    )
                }
                if (!page.ready && !state.busy)
                    OutlinedButton(
                        onClick = model::refreshPublish,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text("重新加载")
                    }
                Button(
                    onClick = {
                        val mode =
                            if (
                                access == "password" &&
                                    password.isEmpty() &&
                                    binding?.access == "password"
                            )
                                "unchanged"
                            else access
                        model.publishFile(binding?.slug ?: slug, mode, password)
                        password = ""
                    },
                    enabled =
                        !state.busy &&
                            page.ready &&
                            (binding != null || slug.isNotBlank()) &&
                            !(page.file.eidos && page.plan == "free") &&
                            (access != "password" ||
                                password.length in 8..128 ||
                                (password.isEmpty() && binding?.access == "password")),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(if (binding?.active == true) "更新网页" else "发布网页")
                }
                if (binding?.active == true)
                    TextButton(
                        onClick = { confirmRemoval = true },
                        enabled = !state.busy,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text("取消发布")
                    }
            }
            Spacer(Modifier.height(24.dp))
        }
    }
    if (confirmRemoval)
        AlertDialog(
            onDismissRequest = { confirmRemoval = false },
            title = { Text("取消发布？") },
            text = { Text("链接将无法访问。本地文件不会被删除。") },
            confirmButton = {
                TextButton(
                    onClick = {
                        confirmRemoval = false
                        model.publishFile(
                            checkNotNull(binding).slug,
                            "unchanged",
                            "",
                            remove = true,
                        )
                    }
                ) {
                    Text("取消发布")
                }
            },
            dismissButton = { TextButton(onClick = { confirmRemoval = false }) { Text("保留网页") } },
        )
}
