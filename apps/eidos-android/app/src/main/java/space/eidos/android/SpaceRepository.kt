package space.eidos.android

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import android.util.AtomicFile
import java.io.File
import java.io.FileOutputStream
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

data class SpaceFile(
    val path: String,
    val name: String,
    val directory: Boolean,
    val modified: Long,
    val bytes: Long,
) {
    val markdown
        get() = name.endsWith(".md", true) || name.endsWith(".markdown", true)

    val eidos
        get() = name.endsWith(".eidos", true)
}

data class TextDocument(
    val path: String,
    val text: String,
    val digest: String,
    val recovered: Boolean = false,
)

data class EidosTable(val id: String, val name: String, val labelFieldId: String)

data class Favorite(val path: String, val name: String, val tableId: String? = null) {
    val key: String
        get() = JSONArray(listOf(path, tableId)).toString()
}

data class EidosField(
    val id: String,
    val name: String,
    val kind: String,
    val writable: Boolean,
    val nullable: Boolean,
    val settings: JSONObject,
    val valueType: Any = kind,
) {
    // UI availability follows the Runtime's public TypeRef, including computed fields.
    val sortable
        get() =
            valueType in
                setOf(
                    "text",
                    "url",
                    "select",
                    "row-id",
                    "integer",
                    "number",
                    "checkbox",
                    "date",
                    "datetime",
                )

    val editable
        get() =
            writable &&
                kind in
                    setOf(
                        "text",
                        "url",
                        "integer",
                        "number",
                        "checkbox",
                        "date",
                        "datetime",
                        "select",
                        "multi-select",
                        "file",
                    )
}

data class EidosRecord(
    val id: String,
    val values: Map<String, Any>,
    val relationLabels: Map<String, Map<String, String>> = emptyMap(),
)

data class SearchMatch(
    val file: SpaceFile,
    val query: String,
    val tableId: String? = null,
    val tableName: String? = null,
    val preview: String? = null,
) {
    val key
        get() = JSONArray(listOf(file.path, tableId)).toString()
}

data class SearchResults(val matches: List<SearchMatch>, val skipped: List<String>)

data class CapturedFiles(val paths: List<String>, val failures: List<String>)

class AttachmentCommitUncertain(cause: Exception) :
    IllegalStateException(tr("无法确认记录是否已保存。附件已保留，请重新打开表格检查后再分享。"), cause)

data class EidosSort(val fieldId: String, val descending: Boolean = false)

data class EidosView(
    val id: String,
    val name: String,
    val query: String,
    val layout: String,
    val supported: Boolean,
    val position: Long = 0,
)

data class EidosFilter(val fieldId: String, val op: String, val value: Any? = null) {
    fun json(): JSONObject =
        JSONObject().put("fieldId", fieldId).put("op", op).also {
            if (value != null) it.put("value", value)
        }
}

data class EidosPage(
    val path: String,
    val tables: List<EidosTable>,
    val table: EidosTable?,
    val fields: List<EidosField>,
    val rows: List<EidosRecord>,
    val revision: String,
    val nextCursor: String?,
    val query: String,
    val sort: EidosSort? = null,
    val filters: List<EidosFilter> = emptyList(),
    val views: List<EidosView> = emptyList(),
    val view: EidosView? = null,
)

class SpaceRepository(
    private val context: Context,
    val spaceId: String = "personal",
    private val storageSpace: StorageSpace = StorageSpace(),
) {
    init {
        require(spaceId.matches(Regex("[A-Za-z0-9_-]+"))) { tr("无效的 Space 标识") }
    }

    // Android can expose filesDir through /data/user/0 while canonical paths
    // resolve to /data/data. Relative identities must use the same root.
    private val root = File(context.filesDir, "spaces/$spaceId").canonicalFile
    // Same filesystem for atomic moves, outside the versioned Space so a crash
    // cannot add an incomplete write/import to the next Graft checkpoint.
    private val staging = File(context.filesDir, "staging/$spaceId").apply { mkdirs() }
    private val local = LocalFiles(root, staging, storageSpace)
    private val drafts =
        File(context.filesDir, if (spaceId == "personal") "drafts" else "drafts-$spaceId").apply {
            mkdirs()
        }
    // Share intents can open a second Activity with its own repository object.
    // Keep file hash checks, writes, and sync atomic across those instances.
    private val lock = nativeLock
    private val preferences =
        context.getSharedPreferences(
            if (spaceId == "personal") "space" else "space-$spaceId",
            Context.MODE_PRIVATE,
        )
    private val syncProfiles = SyncProfileStore(context, spaceId)

    private companion object {
        // JNI owns one active Graft session. Keep a complete multi-call operation
        // atomic even when two Activities are working in different Spaces.
        val nativeLock = Mutex()
    }

    private suspend fun <T> io(action: suspend () -> T): T =
        withContext(Dispatchers.IO) { lock.withLock { action() } }

    suspend fun close() = io {
        NativeGraft.call(root.path, "close")
        Unit
    }

    internal suspend fun deleteLocalSpace() = io {
        val catalog = SpaceCatalog(context)
        require(catalog.spaces().any { it.id == spaceId }) { tr("Space 已不存在") }
        require(catalog.activeId() != spaceId) { tr("请先关闭此 Space") }
        NativeGraft.call(root.path, "close")
        // Quarantine atomically before removing the catalog entry. Never follow symlinks.
        val quarantine = File(context.filesDir, "deleted-space-${java.util.UUID.randomUUID()}")
        val moved = root.exists()
        if (moved) check(root.renameTo(quarantine)) { tr("无法删除 Space，本地文件未更改") }
        try {
            catalog.removeLocal(spaceId)
        } catch (error: Exception) {
            if (moved && catalog.spaces().any { it.id == spaceId }) quarantine.renameTo(root)
            throw error
        }
        syncProfiles.clear()
        for (directory in listOf(quarantine, staging, drafts, File(context.filesDir, "trash-$spaceId"))) {
            if (directory.exists())
                Files.walk(directory.toPath()).use { paths ->
                    paths.sorted(Comparator.reverseOrder()).forEach { Files.delete(it) }
                }
        }
        context.deleteSharedPreferences(if (spaceId == "personal") "space" else "space-$spaceId")
        listOf(
                "publications-$spaceId",
                "automatic-sync-$spaceId",
                "background-sync-$spaceId",
                "background-sync-$spaceId-auto",
            )
            .forEach { context.deleteSharedPreferences(it) }
    }

    internal suspend fun embeddedRuntime(path: String, method: String, request: JSONObject): Any? =
        io {
            require(path.endsWith(".eidos", true))
            val envelope =
                JSONObject(
                    NativeRuntime.execute(
                        local.resolve(path).path,
                        "web:$method",
                        request.toString(),
                    )
                )
            check(envelope.optBoolean("ok")) { envelope.optString("error", tr("数据操作失败")) }
            envelope.opt("value")
        }

    internal suspend fun embeddedImage(
        document: String,
        relative: String,
    ): Pair<String, ByteArray> = io {
        val folder = document.substringBeforeLast('/', "")
        val target = local.resolve(if (folder.isEmpty()) relative else "$folder/$relative")
        val mime =
            when (target.extension.lowercase()) {
                "png" -> "image/png"
                "jpg",
                "jpeg" -> "image/jpeg"
                "gif" -> "image/gif"
                "webp" -> "image/webp"
                "avif" -> "image/avif"
                else -> error(tr("不支持的图片格式"))
            }
        require(target.isFile && target.length() <= 16 * 1024 * 1024)
        mime to target.readBytes()
    }

    internal suspend fun publishFile(
        file: SpaceFile,
        session: PublishSession,
        slug: String,
        access: String,
        password: String,
        binding: PublicationBinding?,
        remove: Boolean,
        report: (JSONObject) -> Unit,
    ): PublicationBinding = io {
        val store = PublicationStore(context, spaceId, session.subject)
        val host = session.tenant.getString("canonicalHost")
        val request =
            JSONObject()
                .put("origin", SyncEnvironment.publish)
                .put("token", session.token)
                .put("path", file.path)
                .put("slug", slug)
                .put("access", access)
                .put("password", password)
        binding?.let { request.put("publicationId", it.id) }
        val result =
            NativePublish.call(root.path, if (remove) "unpublish" else "publish", request, report) {
                store.save(file.path, publicationBinding(it, slug, host))
            }
        publicationBinding(result, slug, host).also { store.save(file.path, it) }
    }

    private fun graftState(result: JSONObject) =
        GraftState(
            initialized = result.getBoolean("initialized"),
            remoteUrl = syncProfiles.load()?.url,
            dirty =
                result.optJSONObject("status")?.let {
                    it.getBoolean("dirty") || (it.optJSONArray("staged_changes")?.length() ?: 0) > 0
                } ?: false,
            syncStatus = syncStatus(result),
        )

    private fun syncStatus(result: JSONObject): String {
        val profile = syncProfiles.load() ?: return "local"
        val status = result.optJSONObject("status")
        val outcome = preferences.getString("sync.outcome", null)
        if (outcome in setOf("failed", "interrupted", "needs_merge")) return checkNotNull(outcome)
        if (outcome == "running") return "interrupted"
        val head = status?.optString("current_head")
        return if (
            status?.optBoolean("dirty") == false &&
                (status.optJSONArray("staged_changes")?.length() ?: 0) == 0 &&
                !head.isNullOrBlank() &&
                head != "null" &&
                head == preferences.getString("sync.head", null) &&
                profile.url == preferences.getString("sync.url", null)
        )
            "completed"
        else "pending"
    }

    private fun syncOutcome(value: String) {
        check(preferences.edit().putString("sync.outcome", value).commit()) { tr("无法保存同步状态") }
    }

    private fun syncCompleted(url: String, result: JSONObject) {
        check(
            preferences
                .edit()
                .putString("sync.outcome", "completed")
                .putString("sync.head", result.optJSONObject("status")?.optString("current_head"))
                .putString("sync.url", url)
                .commit()
        ) {
            tr("无法保存同步状态")
        }
    }

    suspend fun graftStatus(): GraftState = io { graftState(NativeGraft.call(root.path, "status")) }

    suspend fun localVersions(): List<LocalVersion> = io {
        if (!root.resolve(".graft").exists()) return@io emptyList()
        val commits = NativeGraft.call(root.path, "history").getJSONArray("commits")
        (0 until commits.length()).map { index ->
            val commit = commits.getJSONObject(index)
            LocalVersion(commit.getString("id"), commit.optString("message", tr("本地版本")))
        }
    }

    suspend fun checkpoint(): GraftState = io {
        graftState(NativeGraft.call(root.path, "checkpoint"))
    }

    suspend fun mergeReview(): MergeReview? = io { mergeReviewLocked() }

    private fun mergeReviewLocked(): MergeReview? {
        if (!File(root, ".graft").exists()) return null
        val state = NativeGraft.call(root.path, "mergeStatus")
        if (state.getString("state") == "none") return null
        val token = state.getString("state_token")
        val files = mutableListOf<MergeFile>()
        var after: String? = null
        do {
            val page =
                NativeGraft.call(
                    root.path,
                    "mergePaths",
                    JSONObject().put("stateToken", token).put("after", after),
                )
            val items = page.getJSONArray("items")
            for (i in 0 until items.length()) {
                val item = items.getJSONObject(i)
                files.add(
                    MergeFile(
                        item.getString("path"),
                        item.getString("state") == "resolved",
                        item.getBoolean("has_ours"),
                        item.getBoolean("has_theirs"),
                    )
                )
            }
            after = page.optString("next_cursor").takeUnless { it.isBlank() || it == "null" }
        } while (after != null)
        return MergeReview(token, files, state.getInt("unmerged_count"))
    }

    suspend fun beginMerge(): MergeReview? = io {
        NativeGraft.cancellable { id ->
            val profile = checkNotNull(syncProfiles.load()) { tr("请先连接远程 Space") }
            authorize(profile, id)
            NativeGraft.call(root.path, "checkpoint", cancellationId = id)
            NativeGraft.call(root.path, "fetch", cancellationId = id)
            val applied = NativeGraft.call(root.path, "beginMerge", cancellationId = id)
            val state = applied.getJSONObject("merge")
            if (state.getString("state") == "merging")
                NativeGraft.call(
                    root.path,
                    "mergeMetadata",
                    JSONObject().put("stateToken", state.getString("state_token")),
                    id,
                )
        }
        mergeReviewLocked()
    }

    suspend fun chooseMerge(review: MergeReview, path: String, side: String): MergeReview? = io {
        NativeGraft.call(
            root.path,
            "chooseMergePath",
            JSONObject().put("stateToken", review.token).put("path", path).put("side", side),
        )
        mergeReviewLocked()
    }

    suspend fun finishMerge(review: MergeReview, abort: Boolean) = io {
        NativeGraft.call(
            root.path,
            if (abort) "abortMerge" else "continueMerge",
            JSONObject().put("stateToken", review.token),
        )
        if (!abort) syncOutcome("pending")
        Unit
    }

    suspend fun compareMerge(review: MergeReview, path: String): MergeComparison = io {
        fun read(side: String): String {
            val content =
                NativeGraft.call(
                        root.path,
                        "mergeText",
                        JSONObject()
                            .put("stateToken", review.token)
                            .put("path", path)
                            .put("side", side),
                    )
                    .getJSONObject("content")
            return when (content.getString("state")) {
                "utf8" -> content.getString("content")
                "absent" -> tr("此版本中没有这个文件")
                "too_large" -> tr("文件超过预览大小（32 KB）")
                else -> tr("此文件不支持文本预览")
            }
        }
        MergeComparison(path, read("ours"), read("theirs"))
    }

    private fun authorize(profile: SyncProfile, cancellationId: String? = null) {
        NativeGraft.call(root.path, "clearCredentials", cancellationId = cancellationId)
        val request =
            JSONObject()
                .put(
                    "url",
                    if (profile.url.startsWith("http:")) "graft+${profile.url}" else profile.url,
                )
        val token = SyncAccount(context).resolve(profile)
        if (token.isNotEmpty()) request.put("token", token)
        NativeGraft.call(root.path, "configureRemote", request, cancellationId)
    }

    suspend fun connectRemote(url: String, token: String): GraftState = io {
        val profile = syncProfiles.validate(url, token)
        authorize(profile)
        syncProfiles.save(profile)
        syncOutcome("pending")
        check(preferences.edit().remove("sync.head").commit()) { tr("无法更新同步状态") }
        graftState(NativeGraft.call(root.path, "status"))
    }

    suspend fun cloneRemote(
        url: String,
        token: String,
        progress: (String, Long) -> Unit = { _, _ -> },
    ): GraftState = io {
        progress(tr("正在验证连接"), 0)
        val profile = syncProfiles.validate(url, token)
        check(root.listFiles()?.isEmpty() == true) { tr("下载目标必须是空 Space") }
        val request =
            JSONObject()
                .put(
                    "url",
                    if (profile.url.startsWith("http:")) "graft+${profile.url}" else profile.url,
                )
        val accessToken = SyncAccount(context).resolve(profile)
        if (accessToken.isNotEmpty()) request.put("token", accessToken)
        NativeGraft.cancellable(onDownload = { bytes -> progress(tr("正在下载并写入文件"), bytes) }) { id ->
            NativeGraft.call(root.path, "clone", request, id)
            currentCoroutineContext().ensureActive()
        }
        progress(tr("正在保存同步配置"), 0)
        syncProfiles.save(profile)
        val status = NativeGraft.call(root.path, "status")
        syncCompleted(profile.url, status)
        graftState(status)
    }

    /** Roll back only a freshly allocated clone that has not entered the catalog. */
    internal suspend fun discardPendingClone(clearCredentials: Boolean = true) = io {
        check(SpaceCatalog(context).spaces().none { it.id == spaceId }) { tr("不能清理已注册的 Space") }
        NativeGraft.call(root.path, "close")
        if (clearCredentials) syncProfiles.clear()
        if (root.exists())
            Files.walk(root.toPath()).use { paths ->
                paths.sorted(Comparator.reverseOrder()).forEach { Files.delete(it) }
            }
        staging.delete()
        drafts.delete()
        context.deleteSharedPreferences("space-$spaceId")
    }

    suspend fun disconnectRemote(): GraftState = io {
        syncProfiles.clear()
        NativeGraft.call(root.path, "clearCredentials")
        graftState(NativeGraft.call(root.path, "status"))
    }

    /** Called only with editors closed; all worktree replacement uses this IO lock. */
    suspend fun syncRemote(publish: Boolean = false): String = io { syncRemoteLocked(publish) {} }

    internal suspend fun syncPeer(
        connection: PeerConnection,
        transfer: (Long, Long) -> Unit = { _, _ -> },
        graftTransfer: (JSONObject) -> Unit = {},
        progress: (String) -> Unit,
    ) =
        connection.cancellable {
            io {
                NativeRuntime.close()
                connection.tunnel(transfer).use { tunnel ->
                    NativeGraft.cancellable(onTransfer = graftTransfer) { cancellationId ->
                        var hasHead = false
                        val configured = root.resolve(".graft").exists()
                        // Hydrating an existing snapshot may read remote segments. Its
                        // persisted loopback address belongs to the previous tunnel.
                        NativeGraft.call(
                            root.path,
                            "peerConfigure",
                            JSONObject()
                                .put("url", tunnel.remoteUrl)
                                .put("token", connection.token),
                            cancellationId,
                        )
                        if (configured) {
                            val status =
                                NativeGraft.call(
                                        root.path,
                                        "status",
                                        cancellationId = cancellationId,
                                    )
                                    .getJSONObject("status")
                            if (!status.isNull("current_head")) {
                                hasHead = true
                                progress(tr("保存本地版本"))
                                NativeGraft.call(
                                    root.path,
                                    "checkpoint",
                                    cancellationId = cancellationId,
                                )
                            }
                        }
                        if (hasHead) {
                            progress("发送本机版本")
                            NativeGraft.call(
                                root.path,
                                "peerPublish",
                                JSONObject()
                                    .put(
                                        "url",
                                        tunnel.remoteUrl.replace("/peer/space", "/peer/incoming"),
                                    )
                                    .put("token", connection.token),
                                cancellationId,
                            )
                        }
                        currentCoroutineContext().ensureActive()
                        progress(tr("电脑正在合并版本"))
                        val prepared =
                            connection.call("/sync", JSONObject().put("incoming", hasHead))
                        check(prepared.optInt("protocol") == 2) { tr("请更新电脑端后再同步。本机文件已保留。") }
                        check(prepared.optString("state") == "ready") {
                            tr("双方版本已保留。请到电脑的「同步」处理冲突，完成后回到手机点击「同步」。")
                        }
                        progress("获取清单")
                        NativeGraft.call(root.path, "peerFetch", cancellationId = cancellationId)
                        currentCoroutineContext().ensureActive()
                        progress("写入文件")
                        val outcome =
                            NativeGraft.call(
                                root.path,
                                "peerFastForward",
                                cancellationId = cancellationId,
                            )
                        check(outcome.getString("outcome") != "needs_merge") {
                            tr("电脑版本有新变化，本机文件已保留。请重新同步；如仍有冲突，请到电脑处理。")
                        }
                    }
                }
            }
        }

    // Sync copies files without interpreting their Eidos contents. Opening a
    // document is responsible for checking format and host capabilities.
    internal suspend fun finalizePeerDownload(progress: (String) -> Unit = {}): Unit = io {
        progress("正在完成下载")
        root
            .walkTopDown()
            .onEnter {
                check(!Files.isSymbolicLink(it.toPath())) { tr("下载包含不支持的符号链接") }
                !it.name.startsWith(".")
            }
            .forEach { file ->
                currentCoroutineContext().ensureActive()
                check(!Files.isSymbolicLink(file.toPath())) { tr("下载包含不支持的符号链接") }
            }
        SpaceCatalog(context).recordDownloadWarnings(spaceId, emptyList())
    }

    suspend fun syncInBackground(progress: suspend (String) -> Unit): String = io {
        check(SpaceCatalog(context).spaces().any { it.id == spaceId }) { tr("Space 已不存在") }
        if (BackgroundSyncGate.blocked()) "deferred" else syncRemoteLocked(false, progress)
    }

    private suspend fun syncRemoteLocked(
        publish: Boolean,
        progress: suspend (String) -> Unit,
    ): String =
        try {
            syncOutcome("running")
            NativeGraft.cancellable { cancellationId ->
                val profile = checkNotNull(syncProfiles.load()) { tr("请先连接远程 Space") }
                currentCoroutineContext().ensureActive()
                authorize(profile, cancellationId)
                if (
                    NativeGraft.call(root.path, "mergeStatus", cancellationId = cancellationId)
                        .getString("state") == "merging"
                )
                    return@cancellable "needs_merge".also { syncOutcome(it) }
                progress(tr("保存本地版本"))
                currentCoroutineContext().ensureActive()
                NativeGraft.call(root.path, "checkpoint", cancellationId = cancellationId)
                if (!publish) {
                    progress(tr("获取远程更新"))
                    currentCoroutineContext().ensureActive()
                    NativeGraft.call(root.path, "fetch", cancellationId = cancellationId)
                    progress(tr("更新本地文件"))
                    currentCoroutineContext().ensureActive()
                    if (
                        NativeGraft.call(root.path, "fastForward", cancellationId = cancellationId)
                            .getString("outcome") == "needs_merge"
                    )
                        return@cancellable "needs_merge".also { syncOutcome(it) }
                }
                progress(tr("上传本地版本"))
                currentCoroutineContext().ensureActive()
                NativeGraft.call(root.path, "push", cancellationId = cancellationId)
                syncCompleted(
                    profile.url,
                    NativeGraft.call(root.path, "status", cancellationId = cancellationId),
                )
                "synced"
            }
        } catch (error: Exception) {
            try {
                syncOutcome(
                    if (error is kotlinx.coroutines.CancellationException) "interrupted"
                    else "failed"
                )
            } catch (stateError: Exception) {
                error.addSuppressed(stateError)
            }
            throw error
        }

    private fun entry(file: File) =
        SpaceFile(
            file.relativeTo(root).invariantSeparatorsPath,
            file.name,
            file.isDirectory,
            file.lastModified(),
            file.length(),
        )

    private fun visible(file: File) =
        !Files.isSymbolicLink(file.toPath()) &&
            !file.name.startsWith('.') &&
            !file.name.endsWith("-wal") &&
            !file.name.endsWith("-shm")

    suspend fun files(folder: String): List<SpaceFile> = io { listFolder(folder) }

    suspend fun shareFolders(folder: String): List<SpaceFile> = io {
        if (folder == "收件箱" && !local.resolve(folder).exists()) emptyList()
        else {
            val folders = listFolder(folder).filter { it.directory || it.eidos }
            if (folder.isEmpty() && !local.resolve("收件箱").exists())
                listOf(SpaceFile("收件箱", "收件箱", true, 0, 0)) + folders
            else folders
        }
    }

    private fun listFolder(folder: String): List<SpaceFile> {
        val directory = local.resolve(folder)
        require(directory.isDirectory) { tr("目录不存在") }
        return directory
            .listFiles()
            .orEmpty()
            .filter(::visible)
            .map(::entry)
            .sortedWith(compareBy<SpaceFile> { !it.directory }.thenBy { it.name.lowercase() })
    }

    suspend fun recent(): List<SpaceFile> = io {
        val paths = JSONArray(preferences.getString("recent", "[]"))
        (0 until paths.length())
            .map { local.resolve(paths.getString(it)) }
            .filter { it.isFile }
            .take(5)
            .map(::entry)
    }

    private fun readFavorites(): List<Favorite> {
        val saved = JSONArray(preferences.getString("personal.favorites", "[]"))
        return (0 until saved.length()).map {
            val item = saved.getJSONObject(it)
            Favorite(
                item.getString("path"),
                item.getString("name"),
                item.optString("tableId").takeIf(String::isNotEmpty),
            )
        }
    }

    suspend fun favorites(): List<Favorite> = io { readFavorites() }

    suspend fun favoriteFiles(favorites: List<Favorite>): Map<String, SpaceFile> = io {
        favorites
            .map { it.path }
            .distinct()
            .mapNotNull { path ->
                runCatching {
                        val target = local.resolve(path)
                        if (target.exists() && visible(target)) path to entry(target) else null
                    }
                    .getOrNull()
            }
            .toMap()
    }

    suspend fun setFavorite(favorite: Favorite, selected: Boolean): List<Favorite> = io {
        // Removing an unavailable target must work without opening or validating it.
        if (selected) require(local.resolve(favorite.path).exists()) { tr("收藏的文件不存在") }
        val next =
            readFavorites()
                .filter { it.key != favorite.key }
                .let { if (selected) it + favorite else it }
        val saved =
            JSONArray(
                next.map {
                    JSONObject()
                        .put("path", it.path)
                        .put("name", it.name)
                        .put("tableId", it.tableId)
                }
            )
        check(preferences.edit().putString("personal.favorites", saved.toString()).commit()) {
            tr("无法保存收藏，请重试")
        }
        next
    }

    suspend fun file(path: String): SpaceFile = io {
        val file = local.resolve(path)
        check(file.exists() && visible(file)) { tr("文件暂时不可用：{0}", path) }
        entry(file)
    }

    private fun remember(path: String) {
        val previous = JSONArray(preferences.getString("recent", "[]"))
        val paths =
            listOf(path) +
                (0 until previous.length()).map { previous.getString(it) }.filter { it != path }
        preferences.edit().putString("recent", JSONArray(paths.take(12)).toString()).apply()
    }

    suspend fun search(query: String): SearchResults {
        val coroutine = currentCoroutineContext()
        return io {
            val matches = mutableListOf<SearchMatch>()
            val skipped = mutableListOf<String>()
            if (query.isBlank()) return@io SearchResults(matches, skipped)
            for (file in root.walkTopDown().onEnter { it == root || visible(it) }) {
                coroutine.ensureActive()
                if (matches.size >= 100) break
                if (!file.isFile || !visible(file)) continue
                val item = entry(file)
                try {
                    if (
                        file.name.contains(query, true) ||
                            (item.markdown &&
                                file.length() <= LocalFiles.MAX_TEXT_BYTES &&
                                local.readText(item.path).first.contains(query, true))
                    ) {
                        matches.add(SearchMatch(item, query))
                    }
                    if (!item.eidos) continue
                    val schema =
                        NativeRuntime.call(local.resolve(item.path).path, "searchSchema")
                            .getJSONArray("objects")
                    val objects = (0 until schema.length()).map(schema::getJSONObject)
                    for (table in objects.filter { it.optString("object") == "table" }) {
                        coroutine.ensureActive()
                        if (matches.size >= 100) break
                        val tableId = table.getString("id")
                        val fields =
                            objects
                                .filter {
                                    it.optString("object") == "field" &&
                                        it.optString("tableId") == tableId &&
                                        it.isNull("systemRole")
                                }
                                .map { it.getString("id") }
                        val rows =
                            NativeRuntime.call(
                                    file.path,
                                    "searchRows",
                                    JSONObject()
                                        .put("tableId", tableId)
                                        .put("limit", 1)
                                        .put(
                                            "query",
                                            JSONObject()
                                                .put(
                                                    "search",
                                                    JSONObject()
                                                        .put("text", query)
                                                        .put("fields", JSONArray(fields)),
                                                ),
                                        )
                                        .put(
                                            "projection",
                                            JSONObject()
                                                .put(
                                                    "fields",
                                                    JSONArray().put(table.getString("labelFieldId")),
                                                )
                                                .put("resolveRelations", JSONArray()),
                                        ),
                                )
                                .getJSONArray("rows")
                        if (rows.length() > 0) {
                            val label = rows.getJSONObject(0).getJSONArray("values").opt(0)
                            matches.add(
                                SearchMatch(
                                    item,
                                    query,
                                    tableId,
                                    table.getString("name"),
                                    label?.takeUnless { it == JSONObject.NULL }?.toString(),
                                )
                            )
                        }
                    }
                } catch (error: kotlinx.coroutines.CancellationException) {
                    throw error
                } catch (_: Exception) {
                    skipped.add(item.path)
                }
            }
            SearchResults(matches, skipped)
        }
    }

    private fun draftFile(path: String) =
        AtomicFile(File(drafts, UUID.nameUUIDFromBytes(path.toByteArray()).toString()))

    suspend fun pluginWriteText(path: String, text: String) = io {
        require(!path.endsWith(".eidos", true)) { tr("请通过 Runtime 修改 Eidos 文件") }
        val target = local.resolve(path)
        check(target.parentFile!!.isDirectory || target.parentFile!!.mkdirs())
        local.writeText(path, text, if (target.exists()) local.digest(target) else null)
        Unit
    }

    suspend fun pluginReadBinary(path: String): ByteArray = io {
        val file = local.resolve(path)
        require(file.isFile && visible(file)) { tr("文件暂时不可用") }
        file.inputStream().use { input ->
            val output = java.io.ByteArrayOutputStream()
            val buffer = ByteArray(64 * 1024)
            while (true) {
                val count = input.read(buffer)
                if (count < 0) break
                require(output.size() + count <= 16 * 1024 * 1024) { tr("插件文件超过 16 MiB") }
                output.write(buffer, 0, count)
            }
            output.toByteArray()
        }
    }

    // Plugin previews receive committed bytes only, never editor recovery drafts.
    suspend fun pluginTextSnapshot(path: String): TextDocument = io {
        val file = local.resolve(path)
        require(file.isFile && visible(file) && file.length() <= 2 * 1024 * 1024) {
            tr("插件预览仅支持不超过 2 MiB 的 UTF-8 文本文件")
        }
        val (text, digest) = local.readText(path)
        TextDocument(path, text, digest)
    }

    suspend fun readText(path: String): TextDocument = io {
        val (text, digest) = local.readText(path)
        remember(path)
        val draft = draftFile(path)
        if (draft.baseFile.exists()) {
            val saved = JSONObject(String(draft.readFully(), Charsets.UTF_8))
            if (saved.getString("text") == text) {
                // Recover cleanly if the process stopped after committing the
                // file but before removing its recovery draft.
                draft.delete()
                TextDocument(path, text, digest)
            } else
                TextDocument(
                    path,
                    saved.getString("text"),
                    saved.getString("digest"),
                    recovered = true,
                )
        } else TextDocument(path, text, digest)
    }

    suspend fun markdownImage(document: String, destination: String): ByteArray = io {
        val file = local.resolve(markdownLocalPath(document, destination))
        require(file.isFile) { tr("图片不存在") }
        require(file.length() <= 16 * 1024 * 1024) { tr("图片文件超过 16 MB") }
        file.readBytes()
    }

    suspend fun importEditorFiles(document: String, sources: List<Uri>): JSONArray = io {
        if (sources.isEmpty()) return@io JSONArray()
        require(sources.size <= 100 && sources.all { it.scheme == "content" }) { tr("请选择最多 100 个本地文件") }
        val target = local.resolve(document)
        require(target.isFile) { tr("文档不存在") }
        val parent = document.substringBeforeLast('/', "")
        val assetsPath = if (parent.isEmpty()) "assets" else "$parent/assets"
        var component = root
        assetsPath.split('/').forEach {
            component = File(component, it)
            require(!Files.isSymbolicLink(component.toPath())) { tr("附件目录不能经过符号链接") }
        }
        val assets = local.resolve(assetsPath)
        check(assets.isDirectory || assets.mkdir()) { tr("无法创建附件目录") }
        val batchPath = "$assetsPath/import-${UUID.randomUUID()}"
        val batch = local.resolve(batchPath)
        check(batch.mkdir()) { tr("无法创建附件导入目录") }
        try {
            val entries = JSONArray()
            var remaining = 128L * 1024 * 1024
            sources.distinct().forEach { uri ->
                val copied =
                    local.resolve(
                        copyImport(
                            uri,
                            batchPath,
                            uniqueName = true,
                            maxBytes = minOf(64L * 1024 * 1024, remaining),
                        )
                    )
                remaining -= copied.length()
                val relative = copied.relativeTo(target.parentFile!!).invariantSeparatorsPath
                val entry =
                    JSONObject()
                        .put("name", copied.name)
                        .put("size", copied.length().toString())
                        .put(
                            "mediaType",
                            context.contentResolver.getType(uri) ?: "application/octet-stream",
                        )
                        .put("uri", relative.split('/').joinToString("/") { Uri.encode(it) })
                entries.put(
                    if (document.endsWith(".eidos", true))
                        NativeRuntime.call(target.path, "allocateFileEntry", entry)
                    else entry
                )
            }
            entries
        } catch (error: Exception) {
            // Nothing has been returned to an editor yet, so this batch has no references.
            batch.deleteRecursively()
            throw error
        }
    }

    suspend fun attachmentPreview(document: String, entry: JSONObject): AttachmentPreview = io {
        val database = local.resolve(document)
        NativeRuntime.call(database.path, "allocateFileEntry", entry)
        prepareAttachmentPreview(context, root, document, entry)
    }

    suspend fun filePreview(path: String): AttachmentPreview = io {
        val file = local.resolve(path)
        require(file.isFile) { tr("文件不存在") }
        val name = path.substringAfterLast('/')
        val mediaType =
            android.webkit.MimeTypeMap.getSingleton()
                .getMimeTypeFromExtension(file.extension.lowercase(java.util.Locale.ROOT))
                ?: "application/octet-stream"
        prepareAttachmentPreview(
            context,
            root,
            path,
            JSONObject()
                .put("name", name)
                .put("mediaType", mediaType)
                .put("uri", java.net.URI(null, null, name, null).toASCIIString()),
        )
    }

    suspend fun saveDraft(document: TextDocument) = io {
        local.resolve(document.path)
        val file = draftFile(document.path)
        val stream = file.startWrite()
        try {
            stream.write(
                JSONObject()
                    .put("text", document.text)
                    .put("digest", document.digest)
                    .toString()
                    .toByteArray()
            )
            file.finishWrite(stream)
        } catch (error: Exception) {
            file.failWrite(stream)
            throw error
        }
    }

    suspend fun saveText(document: TextDocument): TextDocument = io {
        val previousText = local.readText(document.path).first
        val digest = local.writeText(document.path, document.text, document.digest)
        draftFile(document.path).delete()
        runFileHooks(document.copy(digest = digest, recovered = false), "document.saved", previousText = previousText)
    }

    private suspend fun runFileHooks(document: TextDocument, type: String, previousText: String? = null, previousPath: String? = null): TextDocument {
        if (!document.path.endsWith(".md", true) && !document.path.endsWith(".markdown", true)) return document
        val store = PluginMarketStore(context)
        val settingsStore = context.getSharedPreferences("mobile-plugin-settings", 0)
        val event = JSONObject().put("type", type).put("source", "local").put("operationId", java.util.UUID.randomUUID().toString())
            .put("path", document.path).put("previousText", previousText).put("previousPath", previousPath)
            .put("document", JSONObject().put("text", document.text).put("version", document.digest))
        for (plugin in store.installed(spaceId).filter { it.enabled }.sortedBy { it.id }) {
            val hooks = plugin.manifest.optJSONArray("hooks") ?: continue
            for (index in 0 until hooks.length()) {
                val hook = hooks.getJSONObject(index)
                val extensions = hook.optJSONArray("extensions") ?: continue
                if (hook.optString("event") != type || !(0 until extensions.length()).any { document.path.endsWith(extensions.getString(it), true) }) continue
                try {
                    val program = store.program(spaceId, plugin.id)
                    val manifest = program.getJSONObject("manifest")
                    val settings = JSONObject()
                    manifest.optJSONObject("settings")?.let { declarations ->
                        for (key in declarations.keys()) {
                            val stored = settingsStore.getString(JSONArray(listOf(spaceId, plugin.id, key)).toString(), null)
                            settings.put(key, stored?.let { JSONArray(it).get(0) } ?: declarations.getJSONObject(key).get("default"))
                        }
                    }
                    fun ids(kind: String): JSONArray {
                        val values = manifest.optJSONArray(kind) ?: JSONArray()
                        return JSONArray((0 until values.length()).map { values.getJSONObject(it).getString("id") })
                    }
                    val input = JSONObject().put("event", event).put("settings", settings).put("hook", hook.getString("id"))
                        .put("hooks", ids("hooks")).put("actions", ids("actions")).put("formatters", ids("formatters"))
                    val result = NativeRuntime.call(root.path, "runFileHook", JSONObject().put("input", input).put("declaration", hook)
                        .put("code", program.getJSONObject("modules").getString(manifest.getString("extension"))))
                    val plan = result.optJSONObject("plan") ?: continue
                    if (!store.installed(spaceId).any { it.id == plugin.id && it.enabled && it.revision == plugin.revision }) continue
                    if (local.readText(document.path).second != document.digest) return document
                    val name = plan.optString("name", local.resolve(document.path).name)
                    val target = File(local.resolve(document.path).parentFile, name)
                    if (target != local.resolve(document.path) && target.exists()) continue
                    var saved = document
                    if (plan.has("text") && plan.getString("text") != document.text) {
                        val text = plan.getString("text")
                        saved = document.copy(text = text, digest = local.writeText(document.path, text, document.digest))
                    }
                    if (target != local.resolve(document.path)) {
                        val moved = renameLocked(document.path, name, false)
                        val (text, version) = local.readText(moved)
                        saved = saved.copy(path = moved, text = text, digest = version)
                    }
                    return saved
                } catch (error: Exception) {
                    android.util.Log.w("EidosFileHook", "Skipped ${plugin.id}/${hook.optString("id")}", error)
                }
            }
        }
        return document
    }

    suspend fun createUntitled(folder: String, kind: String): String = io {
        val extension =
            when (kind) {
                "markdown" -> ".md"
                "eidos" -> ".eidos"
                else -> ""
            }
        var name = "Untitled"
        var index = 2
        while (
            local
                .resolve(if (folder.isEmpty()) name + extension else "$folder/$name$extension")
                .exists()
        ) {
            name = "Untitled ${index++}"
        }
        createEntry(folder, name, kind)
    }

    suspend fun create(folder: String, name: String, kind: String): String = io {
        createEntry(folder, name, kind)
    }

    suspend fun trash(path: String) = io {
        val source = local.resolve(path)
        require(path.isNotBlank() && source.exists() && visible(source)) { tr("文件暂时不可用") }
        val children =
            if (source.isDirectory) source.walkTopDown().filter { it.isFile }.toList()
            else listOf(source)
        check(children.none {
            draftFile(entry(it).path).baseFile.exists() ||
                File(draftFile(entry(it).path).baseFile.path + ".bak").exists()
        }) { tr("请先保存未完成的文本草稿") }
        if (children.any { it.extension.equals("eidos", true) }) {
            check(File(context.filesDir, "record-drafts").listFiles().orEmpty().none { it.isFile }) {
                tr("请先保存未完成的记录草稿")
            }
            NativeRuntime.close()
        }
        local.trash(path, File(context.filesDir, "trash-$spaceId"))
        val retainedFavorites = readFavorites().filter { it.path != path && !it.path.startsWith("$path/") }
        val favorites = JSONArray(retainedFavorites.map {
            JSONObject().put("path", it.path).put("name", it.name).put("tableId", it.tableId)
        })
        check(preferences.edit().putString("personal.favorites", favorites.toString()).commit()) {
            tr("无法保存收藏状态")
        }
    }

    suspend fun rename(path: String, name: String): String = io { renameLocked(path, name, true) }

    private suspend fun renameLocked(path: String, name: String, emitHooks: Boolean): String {
        require(path.isNotBlank()) { tr("不能重命名 Space 根目录") }
        val source = local.resolve(path)
        check(source.exists() && visible(source)) { tr("文件暂时不可用") }
        val cleanName = local.validName(name)
        if (source.name == cleanName) return path
        if (source.isFile && source.extension.lowercase() in listOf("eidos", "md", "markdown")) {
            require(File(cleanName).extension.equals(source.extension, true)) { tr("重命名时请保留原扩展名") }
        }
        val target = File(source.parentFile, cleanName)
        check(!target.exists()) { tr("名称已存在") }
        val children =
            if (source.isDirectory) source.walkTopDown().filter { it.isFile }.toList()
            else listOf(source)
        check(
            children.none {
                draftFile(entry(it).path).baseFile.exists() ||
                    File(draftFile(entry(it).path).baseFile.path + ".bak").exists()
            }
        ) {
            tr("请先保存未完成的文本草稿")
        }
        if (children.any { it.extension.equals("eidos", true) }) {
            check(
                File(context.filesDir, "record-drafts").listFiles().orEmpty().none { it.isFile }
            ) {
                tr("请先保存未完成的记录草稿，再重命名")
            }
            NativeRuntime.close()
        }
        val nextPath = entry(target).path
        fun relocated(value: String) =
            if (value == path) nextPath
            else if (value.startsWith("$path/")) nextPath + value.removePrefix(path) else value
        val favorites =
            JSONArray(
                readFavorites().map { favorite ->
                    JSONObject()
                        .put("path", relocated(favorite.path))
                        .put(
                            "name",
                            if (favorite.path == path && favorite.tableId == null) cleanName
                            else favorite.name,
                        )
                        .put("tableId", favorite.tableId)
                }
            )
        val recent = JSONArray(preferences.getString("recent", "[]"))
        val nextRecent =
            JSONArray((0 until recent.length()).map { relocated(recent.getString(it)) })
        val nextShareTable =
            preferences.getString("share.table", null)?.let {
                JSONObject(it)
                    .also { table -> table.put("path", relocated(table.getString("path"))) }
                    .toString()
            }
        Files.move(source.toPath(), target.toPath())
        if (
            !preferences
                .edit()
                .putString("personal.favorites", favorites.toString())
                .putString("recent", nextRecent.toString())
                .putString(
                    "share.folder",
                    relocated(preferences.getString("share.folder", "") ?: ""),
                )
                .putString("share.table", nextShareTable)
                .commit()
        ) {
            Files.move(target.toPath(), source.toPath())
            error(tr("无法保存新名称，请重试"))
        }
        if (target.isFile && target.extension.lowercase() in listOf("md", "markdown")) {
            try {
                val changes = NativeRuntime.call(root.path, "prepareMarkdownRenameLinks", JSONObject().put("source", path).put("target", nextPath)).getJSONArray("changes")
                for (index in 0 until changes.length()) {
                    val change = changes.getJSONObject(index)
                    val linkedPath = change.getString("path")
                    if (draftFile(linkedPath).baseFile.exists()) continue
                    runCatching { local.writeText(linkedPath, change.getString("text"), change.getString("version")) }
                }
            } catch (error: Exception) { android.util.Log.w("EidosFileHook", "Skipped link maintenance", error) }
        }
        if (emitHooks && target.isFile && target.extension.lowercase() in listOf("md", "markdown")) {
            val (text, digest) = local.readText(nextPath)
            return runFileHooks(TextDocument(nextPath, text, digest), "file.renamed", previousPath = path).path
        }
        return nextPath
    }

    private fun createEntry(folder: String, name: String, kind: String): String {
        val cleanName = local.validName(name)
        val extension =
            when (kind) {
                "eidos" -> ".eidos"
                "markdown" -> ".md"
                else -> ""
            }
        val fullName =
            if (extension.isNotEmpty() && !cleanName.endsWith(extension, true))
                cleanName + extension
            else cleanName
        val path = if (folder.isEmpty()) fullName else "$folder/$fullName"
        val target = local.resolve(path)
        check(!target.exists()) { tr("名称已存在") }
        when (kind) {
            "folder" -> check(target.mkdir()) { tr("无法创建文件夹") }
            "eidos" -> {
                val temporary = File(staging, ".create-${UUID.randomUUID()}.eidos")
                try {
                    NativeRuntime.call(
                        temporary.path,
                        "create",
                        JSONObject().put("title", cleanName.removeSuffix(".eidos")),
                    )
                    Files.move(temporary.toPath(), target.toPath(), StandardCopyOption.ATOMIC_MOVE)
                } finally {
                    temporary.delete()
                }
            }
            else -> local.writeText(path, "")
        }
        return path
    }

    suspend fun shareFolder(): String = io {
        val saved = preferences.getString("share.folder", "收件箱") ?: "收件箱"
        if (runCatching { local.resolve(saved).isDirectory }.getOrDefault(false)) saved else "收件箱"
    }

    suspend fun rememberShareFolder(folder: String) = io {
        require(local.resolve(folder).isDirectory) { tr("目录不存在") }
        check(preferences.edit().putString("share.folder", folder).remove("share.table").commit()) {
            tr("无法保存分享位置")
        }
    }

    suspend fun lastShareTable(): Favorite? = io {
        preferences.getString("share.table", null)?.let {
            val saved = JSONObject(it)
            val path = saved.getString("path")
            if (local.resolve(path).isFile)
                Favorite(path, saved.getString("name"), saved.getString("tableId"))
            else null
        }
    }

    suspend fun rememberShareTable(page: EidosPage) = io {
        val table = checkNotNull(page.table)
        check(
            preferences
                .edit()
                .putString(
                    "share.table",
                    JSONObject()
                        .put("path", page.path)
                        .put("name", table.name)
                        .put("tableId", table.id)
                        .toString(),
                )
                .commit()
        ) {
            tr("无法保存分享位置")
        }
    }

    private fun captureDirectory(folder: String): File {
        val target = local.resolve(folder)
        if (folder == "收件箱") check(target.isDirectory || target.mkdirs()) { tr("无法创建收件箱") }
        require(target.isDirectory) { tr("分享目标文件夹已不存在，请重新选择") }
        return target
    }

    suspend fun capture(text: String, folder: String = "收件箱"): String = io {
        val inbox = captureDirectory(folder)
        val name = "分享-${System.currentTimeMillis()}-${UUID.randomUUID().toString().take(4)}.md"
        val path = File(inbox, name).relativeTo(root).invariantSeparatorsPath
        local.writeText(path, text)
        path
    }

    suspend fun captureFiles(uris: List<Uri>, folder: String = "收件箱"): CapturedFiles = io {
        require(uris.size <= 100) { tr("一次最多分享 100 个文件") }
        captureDirectory(folder)
        val paths = mutableListOf<String>()
        val failures = mutableListOf<String>()
        uris.distinct().forEachIndexed { index, uri ->
            try {
                require(uri.scheme == "content") { tr("仅支持通过 Android 内容提供程序分享的文件") }
                paths.add(copyImport(uri, folder, uniqueName = true))
            } catch (error: Exception) {
                failures.add(tr("文件 {0}：{1}", index + 1, error.message ?: "无法读取"))
            }
        }
        CapturedFiles(paths, failures)
    }

    suspend fun importFile(uri: Uri, folder: String): String = io { copyImport(uri, folder) }

    suspend fun importDirectory(uri: Uri, folder: String): String = io {
        val parent = local.resolve(folder)
        check(parent.isDirectory) { tr("目标文件夹不存在") }
        val temporary = File(staging, "tree-${UUID.randomUUID()}").apply { check(mkdir()) }
        try {
            val name =
                local.validName(
                    DocumentTreeTransfer(context.contentResolver, storageSpace)
                        .import(uri, temporary)
                )
            var target = File(parent, name)
            var index = 2
            while (target.exists()) target = File(parent, "$name (${index++})")
            Files.move(temporary.toPath(), target.toPath(), StandardCopyOption.ATOMIC_MOVE)
            target.relativeTo(root).invariantSeparatorsPath
        } finally {
            temporary.deleteRecursively()
        }
    }

    suspend fun exportDirectory(path: String, uri: Uri) = io {
        val source = local.resolve(path)
        check(source.isDirectory) { tr("目录不存在") }
        NativeRuntime.close()
        DocumentTreeTransfer(context.contentResolver).export(source, uri, source.name)
    }

    private fun copyImport(
        uri: Uri,
        folder: String,
        uniqueName: Boolean = false,
        maxBytes: Long = Long.MAX_VALUE,
    ): String {
        val resolver = context.contentResolver
        val name =
            resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use {
                cursor ->
                if (cursor.moveToFirst()) cursor.getString(0) else null
            } ?: tr("导入文件")
        val safeName = local.validName(name)
        var path = if (folder.isEmpty()) safeName else "$folder/$safeName"
        if (uniqueName) {
            val extension =
                safeName.substringAfterLast('.', "").let { if (it.isEmpty()) "" else ".$it" }
            val stem = safeName.removeSuffix(extension)
            var index = 2
            while (local.resolve(path).exists()) {
                val candidate = "$stem (${index++})$extension"
                path = if (folder.isEmpty()) candidate else "$folder/$candidate"
            }
        }
        val target = local.resolve(path)
        check(!target.exists()) { tr("同名文件已存在，请先重命名后再导入") }
        val temporary = File.createTempFile(".import-", ".tmp", staging)
        try {
            resolver.openInputStream(uri).use { input ->
                checkNotNull(input) { tr("无法读取所选文件") }
                FileOutputStream(temporary).use { output ->
                    val buffer = ByteArray(64 * 1024)
                    var written = 0L
                    while (true) {
                        val count = input.read(buffer)
                        if (count < 0) break
                        written += count
                        check(written <= maxBytes) { tr("附件超过导入大小限制") }
                        storageSpace.requireBytes(staging, count.toLong())
                        output.write(buffer, 0, count)
                    }
                    output.fd.sync()
                }
            }
            Files.move(temporary.toPath(), target.toPath(), StandardCopyOption.ATOMIC_MOVE)
        } finally {
            temporary.delete()
        }
        return path
    }

    suspend fun exportFile(path: String, uri: Uri) = io {
        local.resolve(path).inputStream().use { input ->
            context.contentResolver.openOutputStream(uri, "wt").use { output ->
                checkNotNull(output) { tr("无法写入导出位置") }
                input.copyTo(output)
            }
        }
    }

    fun displayedFields(path: String, table: String): List<String>? {
        val saved = preferences.getString("fields:$path:$table", null) ?: return null
        val values = JSONArray(saved)
        return (0 until values.length()).map(values::getString)
    }

    fun setDisplayedFields(path: String, table: String, fields: List<String>) {
        preferences.edit().putString("fields:$path:$table", JSONArray(fields).toString()).apply()
    }

    suspend fun loadEidos(
        path: String,
        tableId: String? = null,
        query: String = "",
        cursor: String? = null,
        sort: EidosSort? = null,
        filters: List<EidosFilter> = emptyList(),
        viewId: String? = null,
    ): EidosPage = io {
        val file = local.resolve(path)
        val schema = NativeRuntime.call(file.path, "schema")
        val objects = schema.getJSONArray("objects")
        val all = (0 until objects.length()).map(objects::getJSONObject)
        val tables =
            all.filter { it.getString("object") == "table" }
                .map {
                    EidosTable(
                        it.getString("id"),
                        it.getString("name"),
                        it.getString("labelFieldId"),
                    )
                }
        val table =
            if (tableId == null) tables.firstOrNull()
            else checkNotNull(tables.find { it.id == tableId }) { tr("数据表已不存在，请重新选择；原有收藏可以取消") }
        val fields =
            all.filter {
                    it.getString("object") == "field" &&
                        it.optString("tableId") == table?.id &&
                        it.isNull("systemRole")
                }
                .map {
                    EidosField(
                        it.getString("id"),
                        it.getString("name"),
                        it.getString("kind"),
                        it.getBoolean("writable"),
                        it.getBoolean("nullable"),
                        it.getJSONObject("settings"),
                        it.get("valueType"),
                    )
                }
        remember(path)
        val views =
            all.filter { it.optString("object") == "view" && it.optString("tableId") == table?.id }
                .map {
                    EidosView(
                        it.getString("id"),
                        it.getString("name"),
                        it.getJSONObject("query").toString(),
                        it.getJSONObject("layout").toString(),
                        it.optString("queryStatus") != "unsupported",
                        it.getString("position").toLong(),
                    )
                }
        val view = viewId?.let { id -> checkNotNull(views.find { it.id == id }) { tr("视图已不存在，请重新选择") } }
        check(view?.supported != false) { tr("此视图的查询暂不受当前 Runtime 支持") }
        if (table == null)
            return@io EidosPage(
                path,
                tables,
                null,
                fields,
                emptyList(),
                schema.getJSONObject("snapshot").getString("revision"),
                null,
                query,
            )
        val rowQuery = effectiveViewQuery(view, filters, sort)
        if (query.isNotBlank())
            rowQuery.put(
                "search",
                JSONObject().put("text", query).put("fields", JSONArray(fields.map { it.id })),
            )
        val request =
            JSONObject()
                .put("tableId", table.id)
                .put("query", rowQuery)
                .put("limit", 50)
                .put(
                    "projection",
                    JSONObject()
                        .put("fields", JSONArray(fields.map { it.id }))
                        .put(
                            "resolveRelations",
                            JSONArray(fields.filter { it.kind == "relation" }.map { it.id }),
                        ),
                )
        if (cursor != null) request.put("cursor", cursor)
        val page = NativeRuntime.call(file.path, "queryRows", request)
        val columns = page.getJSONArray("columns")
        val rows = page.getJSONArray("rows")
        val records =
            (0 until rows.length()).map { index ->
                val row = rows.getJSONObject(index)
                EidosRecord(
                    row.getString("id"),
                    (0 until columns.length()).associate { column ->
                        columns.getJSONObject(column).getString("fieldId") to
                            row.getJSONArray("values").get(column)
                    },
                    parseRelationLabels(columns, row),
                )
            }
        EidosPage(
            path,
            tables,
            table,
            fields,
            records,
            page.getString("revision"),
            page.optString("nextCursor").takeUnless { it == "null" || it.isEmpty() },
            query,
            sort,
            filters,
            views,
            view,
        )
    }

    suspend fun mutate(
        page: EidosPage,
        row: EidosRecord?,
        changes: Map<String, Any>,
        delete: Boolean = false,
    ) = io { mutateRow(page, row, changes, delete) }

    /** Bytes are published before the canonical row commit, under the same Space IO lock. */
    suspend fun mutateWithAttachments(
        page: EidosPage,
        row: EidosRecord?,
        changes: Map<String, Any>,
        fieldId: String,
        sources: List<Uri>,
    ) = io {
        require(sources.isNotEmpty() && sources.size <= 100) { tr("请选择 1–100 个附件") }
        require(sources.all { it.scheme == "content" }) { tr("仅支持 Android 内容提供程序的附件") }
        require(page.fields.any { it.id == fieldId && it.kind == "file" && it.writable }) {
            tr("目标附件字段不可写入")
        }
        val database = local.resolve(page.path)
        check(
            NativeRuntime.call(database.path, "getSnapshot").getString("revision") == page.revision
        ) {
            tr("数据已变化，请重新打开记录")
        }
        val parent = page.path.substringBeforeLast('/', "")
        val assetPath = if (parent.isEmpty()) "assets" else "$parent/assets"
        local.resolve(assetPath)
        var component = root
        assetPath.split('/').forEach {
            component = File(component, it)
            require(!Files.isSymbolicLink(component.toPath())) { tr("附件目录不能经过符号链接") }
        }
        val assets = local.resolve(assetPath)
        check(assets.isDirectory || assets.mkdir()) { tr("无法创建附件目录") }
        val batchPath = "$assetPath/share-${UUID.randomUUID()}"
        val batch = local.resolve(batchPath)
        check(batch.mkdir()) { tr("无法创建附件导入目录") }
        val published = mutableListOf<File>()
        var mutationStarted = false
        try {
            val previous = changes[fieldId] ?: row?.values?.get(fieldId)
            val entries = if (previous is JSONArray) JSONArray(previous.toString()) else JSONArray()
            var remaining = 128L * 1024 * 1024
            sources.distinct().forEach { uri ->
                val path =
                    copyImport(
                        uri,
                        batchPath,
                        uniqueName = true,
                        maxBytes = minOf(64L * 1024 * 1024, remaining),
                    )
                val file = local.resolve(path)
                published.add(file)
                remaining -= file.length()
                val relative = file.relativeTo(database.parentFile!!).invariantSeparatorsPath
                entries.put(
                    NativeRuntime.call(
                        database.path,
                        "allocateFileEntry",
                        JSONObject()
                            .put("name", file.name)
                            .put("size", file.length().toString())
                            .put(
                                "mediaType",
                                context.contentResolver.getType(uri) ?: "application/octet-stream",
                            )
                            .put("uri", relative.split('/').joinToString("/") { Uri.encode(it) }),
                    )
                )
            }
            mutationStarted = true
            mutateRow(page, row, changes + (fieldId to entries), false)
        } catch (error: Exception) {
            // A transport/close error may follow a committed SQLite transaction. Retain bytes
            // unless the Runtime proves that the original revision is still current.
            val unchanged =
                !mutationStarted ||
                    runCatching {
                            NativeRuntime.call(database.path, "getSnapshot")
                                .getString("revision") == page.revision
                        }
                        .getOrDefault(false)
            if (unchanged) {
                published.forEach { file ->
                    if (!file.delete())
                        error.addSuppressed(IllegalStateException(tr("无法清理附件：{0}", file.name)))
                }
                batch.delete()
            } else {
                throw AttachmentCommitUncertain(error)
            }
            throw error
        }
    }

    private fun mutateRow(
        page: EidosPage,
        row: EidosRecord?,
        changes: Map<String, Any>,
        delete: Boolean,
    ): JSONObject {
        val change =
            JSONObject()
                .put("kind", if (delete) "delete" else if (row == null) "create" else "update")
        if (row == null) change.put("clientKey", UUID.randomUUID().toString())
        else change.put("rowId", row.id)
        if (!delete) change.put("values", JSONObject(changes))
        return NativeRuntime.call(
            local.resolve(page.path).path,
            "mutateRows",
            JSONObject()
                .put("tableId", checkNotNull(page.table).id)
                .put("expectedRevision", page.revision)
                .put("changes", JSONArray().put(change)),
        )
    }
}
