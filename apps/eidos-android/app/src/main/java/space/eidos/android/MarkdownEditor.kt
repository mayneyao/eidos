package space.eidos.android

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
internal fun MarkdownEditor(
    path: String,
    text: String,
    enabled: Boolean,
    changed: (String) -> Unit,
    insertImage: (String, Int, Int, Uri) -> Unit,
) {
    var value by
        rememberSaveable(path, stateSaver = TextFieldValue.Saver) {
            mutableStateOf(TextFieldValue(text))
        }
    val focus = remember { FocusRequester() }
    var imageText by rememberSaveable(path) { mutableStateOf<String?>(null) }
    var imageStart by rememberSaveable(path) { mutableStateOf(0) }
    var imageEnd by rememberSaveable(path) { mutableStateOf(0) }
    val imagePicker =
        rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
            val original = imageText
            imageText = null
            if (uri != null && original != null) insertImage(original, imageStart, imageEnd, uri)
        }
    // Only reconcile external text changes; selection and IME composition stay local.
    LaunchedEffect(text) {
        if (value.text != text)
            value = TextFieldValue(text, TextRange(value.selection.start.coerceAtMost(text.length)))
    }
    LaunchedEffect(path) { focus.requestFocus() }
    Column(Modifier.fillMaxSize()) {
        OutlinedTextField(
            value,
            { next ->
                value = next
                changed(next.text)
            },
            Modifier.weight(1f).fillMaxWidth().padding(horizontal = 16.dp).focusRequester(focus),
            placeholder = { Text("开始记录…") },
            enabled = enabled,
            textStyle =
                MaterialTheme.typography.bodyLarge.copy(
                    fontFamily = FontFamily.Monospace,
                    lineHeight = 26.sp,
                ),
        )
        Row(
            Modifier.fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = 8.dp)
        ) {
            TextButton(
                enabled = enabled,
                onClick = {
                    imageText = value.text
                    imageStart = value.selection.start
                    imageEnd = value.selection.end
                    imagePicker.launch(arrayOf("image/*"))
                },
            ) {
                Text("图片")
            }
            MarkdownFormat.entries.forEach { format ->
                TextButton(
                    enabled = enabled,
                    onClick = {
                        val edit =
                            formatMarkdown(
                                value.text,
                                value.selection.start,
                                value.selection.end,
                                format,
                            )
                        value = TextFieldValue(edit.text, TextRange(edit.start, edit.end))
                        changed(edit.text)
                        focus.requestFocus()
                    },
                ) {
                    Text(format.label)
                }
            }
        }
    }
}
