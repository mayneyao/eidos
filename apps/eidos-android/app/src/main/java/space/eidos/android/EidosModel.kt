package space.eidos.android

import android.app.Application
import android.net.Uri
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import java.util.concurrent.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class MainTab {
    Files,
    Search,
    Sync,
}

data class PendingShare(
    val files: List<Uri>,
    val text: String?,
    val inboxId: String,
    val submitting: Boolean = false,
    val destination: String? = null,
    val form: ShareForm? = null,
)

data class AppState(
    val peerBusy: Boolean = false,
    val peerMessage: String? = null,
    val peerProgress: PeerSyncProgress? = null,
    val peerDevices: List<PeerDevice> = emptyList(),
    val peerAvailability: Map<String, PeerAvailability> = emptyMap(),
    val peerChecking: Boolean = false,
    val peerSpaces: List<PeerSpace> = emptyList(),
    val peerLocalSpaces: List<PeerLocalSpace> = emptyList(),
    val pluginGeneration: Int = 0,
    val pluginFile: PluginFileSession? = null,
    val webFile: SpaceFile? = null,
    val publish: PublishPage? = null,
    val account: SyncAccountView? = null,
    val cloudSpaces: List<CloudSpace>? = null,
    val spaceId: String = "personal",
    val spaceName: String = "个人 Space",
    val spaces: List<LocalSpace> = emptyList(),
    val pendingClone: PendingClone? = null,
    val downloadProgress: DownloadProgress? = null,
    val tab: MainTab = MainTab.Files,
    val folder: String = "",
    val files: List<SpaceFile> = emptyList(),
    val recent: List<SpaceFile> = emptyList(),
    val favorites: List<Favorite> = emptyList(),
    val addRecord: Boolean = false,
    val graft: GraftState? = null,
    val syncMessage: String? = null,
    val syncing: Boolean = false,
    val mergeReview: MergeReview? = null,
    val mergeComparison: MergeComparison? = null,
    val backgroundSync: BackgroundSyncState? = null,
    val automaticSync: AutomaticSyncState = AutomaticSyncState(),
    val search: String = "",
    val matches: List<SearchMatch> = emptyList(),
    val searchSkipped: List<String> = emptyList(),
    val searching: Boolean = false,
    val captureNotice: String? = null,
    val attachmentPreview: AttachmentPreview? = null,
    val pendingShares: List<PendingShare> = emptyList(),
    val shareInboxVisible: Boolean = true,
    val shareFolder: String = "收件箱",
    val shareFolders: List<SpaceFile> = emptyList(),
    val lastShareTable: Favorite? = null,
    val shareDatabase: EidosPage? = null,
    val shareRecord: EidosPage? = null,
    val shareInitialValues: String = "{}",
    val shareAttachmentFieldId: String? = null,
    val document: TextDocument? = null,
    val editing: Boolean = false,
    val dirty: Boolean = false,
    val draftSaved: Boolean = false,
    val page: EidosPage? = null,
    val busy: Boolean = false,
    val rowLoading: Boolean = false,
    val error: String? = null,
)

class EidosModel(application: Application, repository: SpaceRepository) :
    AndroidViewModel(application) {
    constructor(
        application: Application
    ) : this(application, SpaceRepository(application, SpaceCatalog(application).activeId()))

    var repository: SpaceRepository = repository
        private set

    private val catalog = SpaceCatalog(application)
    private val cloneJournal = CloneJournal(application)
    private val account = SyncAccount(application)
    private val editorPreferences = application.getSharedPreferences("editor", 0)
    private var useWebEditor = editorPreferences.getBoolean("web", true)
    val pluginMarket = PluginMarketStore(application)
    val pluginOpenWith
        get() = pluginMarket.registry(mutable.value.spaceId)

    private val mutable = MutableStateFlow(AppState())
    val state = mutable.asStateFlow()
    private var draftJob: Job? = null
    private var searchJob: Job? = null
    private var searchVersion = 0
    private var rowJob: Job? = null

    private data class RowRequest(
        val path: String,
        val table: String?,
        val query: String,
        val sort: EidosSort?,
        val filters: List<EidosFilter>,
        val viewId: String? = null,
    )

    private var pendingRows: RowRequest? = null
    private var navigationVersion = 0
    private var shareQueryChanged = false
    private var foreground = false
    private val documentHistory = mutableListOf<String>()

    init {
        mutable.update {
            it.copy(
                peerDevices = PeerConnection.devices(application),
                peerLocalSpaces = catalog.peerLocalSpaces(),
            )
        }
        val unwatchPlugins =
            pluginMarket.watch {
                mutable.update { state ->
                    val open = state.pluginFile
                    state.copy(
                        pluginGeneration = state.pluginGeneration + 1,
                        pluginFile =
                            if (open != null && !pluginMarket.authorized(state.spaceId, open.view))
                                null
                            else open,
                    )
                }
                updateBackgroundGate()
            }
        viewModelScope.coroutineContext[Job]?.invokeOnCompletion { unwatchPlugins() }
        viewModelScope.launch {
            runCatching {
                    kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
                        account.view()
                    }
                }
                .onSuccess { user -> mutable.update { it.copy(account = user) } }
        }
        viewModelScope.coroutineContext[Job]?.invokeOnCompletion { BackgroundSyncGate.remove(this) }
        viewModelScope.launch {
            state
                .map { it.spaceId }
                .distinctUntilChanged()
                .collectLatest { id ->
                    try {
                        BackgroundSync.reconcileAutomatic(getApplication(), id)
                    } catch (error: CancellationException) {
                        throw error
                    } catch (error: Exception) {
                        mutable.update { it.copy(error = error.message ?: "自动同步任务恢复失败") }
                    }
                    val details = BackgroundSyncDetails(getApplication(), id)
                    combine(
                            BackgroundSync.observe(getApplication(), id),
                            BackgroundSync.observeAutomatic(getApplication(), id),
                        ) { infos, automatic ->
                            Pair(infos, automatic)
                        }
                        .collect { (infos, automatic) ->
                            mutable.update {
                                if (it.spaceId == id)
                                    it.copy(
                                        backgroundSync = backgroundSyncState(infos, details),
                                        automaticSync = automatic,
                                    )
                                else it
                            }
                        }
                }
        }
        refresh()
    }

    private fun updateBackgroundGate() {
        val current = mutable.value
        BackgroundSyncGate.update(
            this,
            foreground ||
                current.busy ||
                current.mergeReview != null ||
                current.document != null ||
                current.page != null ||
                current.webFile != null ||
                current.pluginFile != null ||
                current.pendingShares.isNotEmpty(),
        )
    }

    fun foregroundStarted() {
        foreground = true
        updateBackgroundGate()
        if (
            !mutable.value.busy &&
                mutable.value.document == null &&
                mutable.value.page == null &&
                mutable.value.webFile == null &&
                mutable.value.pluginFile == null
        )
            launchAction {
                try {
                    refreshFiles(includeGraft = false)
                } catch (_: IllegalArgumentException) {
                    mutable.update { it.copy(folder = "") }
                    refreshFiles(includeGraft = false)
                }
                if (mutable.value.tab == MainTab.Sync)
                    mutable.update { it.copy(graft = repository.graftStatus()) }
                if (mutable.value.search.isNotBlank()) search(mutable.value.search)
            }
    }

    fun backgroundStarted() {
        foreground = false
        updateBackgroundGate()
    }

    private var returnedFilesJob: Job? = null

    private fun launchAction(action: suspend () -> Unit) {
        if (mutable.value.busy) return
        returnedFilesJob?.cancel()
        viewModelScope.launch {
            mutable.update { it.copy(busy = true, error = null) }
            updateBackgroundGate()
            try {
                action()
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                mutable.update { it.copy(error = error.message ?: "操作失败，请重试") }
            } finally {
                mutable.update { it.copy(busy = false) }
                updateBackgroundGate()
            }
        }
    }

    fun refresh() = launchAction {
        recoverMerge()
        refreshFiles()
        recoverShares()
    }

    private var peerJob: Job? = null

    fun cancelPeerPairing() {
        peerJob?.cancel()
    }

    fun pairPeer(code: String) {
        if (peerJob?.isActive == true) return
        peerJob =
            viewModelScope.launch {
                mutable.update { it.copy(peerBusy = true, peerMessage = "正在连接电脑", error = null) }
                try {
                    val invitation = PeerInvitation.parse(code)
                    val connection =
                        kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
                            PeerConnection(
                                invitation.url,
                                invitation.fingerprint,
                                invitation.ticket,
                                invitation.name,
                            )
                        }
                    val known =
                        kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
                            PeerConnection.load(
                                getApplication(),
                                "device-${invitation.fingerprint}",
                            )
                        }
                    val approved =
                        if (known != null) org.json.JSONObject().put("token", known.token)
                        else
                            kotlinx.coroutines.withTimeout(5 * 60_000L) {
                                var result = org.json.JSONObject()
                                while (result.optString("state") != "approved") {
                                    result =
                                        kotlinx.coroutines.withContext(
                                            kotlinx.coroutines.Dispatchers.IO
                                        ) {
                                            connection.call(
                                                "/pair",
                                                org.json
                                                    .JSONObject()
                                                    .put("name", android.os.Build.MODEL.take(80)),
                                            )
                                        }
                                    if (result.optString("state") != "approved") {
                                        mutable.update { it.copy(peerMessage = "请在电脑上允许此设备") }
                                        delay(1000)
                                    }
                                }
                                result
                            }
                    val trusted =
                        kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
                            PeerConnection(
                                invitation.url,
                                invitation.fingerprint,
                                approved.getString("token"),
                                invitation.name,
                            )
                        }
                    val available =
                        kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
                            val spaces = trusted.spaces()
                            trusted.saveDevice(getApplication())
                            spaces
                        }
                    mutable.update {
                        it.copy(
                            peerDevices = PeerConnection.devices(getApplication()),
                            peerSpaces = available,
                            peerMessage = "设备已连接，请选择要同步的 Space",
                        )
                    }
                } catch (error: CancellationException) {
                    mutable.update { it.copy(peerMessage = "配对已取消") }
                    throw error
                } catch (error: Exception) {
                    mutable.update { it.copy(error = error.message, peerMessage = "配对未完成") }
                } finally {
                    mutable.update { it.copy(peerBusy = false) }
                }
            }
    }

    private val peerAvailabilityLock = kotlinx.coroutines.sync.Mutex()

    fun refreshPeerAvailability() {
        viewModelScope.launch { checkPeerAvailability() }
    }

    suspend fun checkPeerAvailability() {
        if (mutable.value.busy || mutable.value.peerBusy || !peerAvailabilityLock.tryLock()) return
        mutable.update { it.copy(peerChecking = true) }
        try {
            for (device in mutable.value.peerDevices) {
                val result =
                    try {
                        kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
                            val saved =
                                checkNotNull(
                                    PeerConnection.load(
                                        getApplication(),
                                        "device-${device.fingerprint}",
                                    )
                                )
                            val connection = PeerConnection.reconnect(getApplication(), saved)
                            PeerAvailability(
                                true,
                                connection.spaces(timeoutMillis = 2000).map { it.id }.toSet(),
                            )
                        }
                    } catch (error: CancellationException) {
                        throw error
                    } catch (_: Exception) {
                        PeerAvailability(false)
                    }
                mutable.update {
                    if (it.peerDevices.none { peer -> peer.fingerprint == device.fingerprint }) it
                    else
                        it.copy(
                            peerAvailability = it.peerAvailability + (device.fingerprint to result)
                        )
                }
            }
        } finally {
            mutable.update { it.copy(peerChecking = false) }
            peerAvailabilityLock.unlock()
        }
    }

    fun browsePeerSpaces(fingerprint: String) = launchAction {
        val available =
            kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
                val device =
                    checkNotNull(PeerConnection.load(getApplication(), "device-$fingerprint")) {
                        "请先配对设备"
                    }
                val connected = PeerConnection.reconnect(getApplication(), device)
                connected.spaces().also { connected.saveDevice(getApplication()) }
            }
        mutable.update {
            it.copy(
                peerSpaces = available,
                peerMessage = if (available.isEmpty()) "电脑尚未开放 Space" else "选择要同步的 Space",
            )
        }
    }

    fun forgetPeerDevice(fingerprint: String) = launchAction {
        PeerConnection.forgetDevice(getApplication(), fingerprint)
        mutable.update {
            it.copy(
                peerDevices = PeerConnection.devices(getApplication()),
                peerSpaces = emptyList(),
            )
        }
    }

    private fun launchPeerSync(name: String = mutable.value.spaceName, action: suspend () -> Unit) =
        launchAction {
            mutable.update {
                it.copy(peerProgress = PeerSyncProgress(spaceName = name), peerMessage = null)
            }
            try {
                action()
                val graft = repository.graftStatus()
                catalog.recordPeerSync(repository.spaceId)
                mutable.update {
                    it.copy(
                        peerLocalSpaces = catalog.peerLocalSpaces(),
                        graft = graft,
                        peerProgress =
                            it.peerProgress?.copy(
                                stage = "同步完成",
                                finishedAt = android.os.SystemClock.elapsedRealtime(),
                            ),
                    )
                }
            } catch (error: Exception) {
                if (error !is CancellationException) runCatching { recoverMerge() }
                mutable.update {
                    it.copy(
                        peerProgress =
                            it.peerProgress?.copy(
                                stage = if (error is CancellationException) "同步已中断" else "同步未完成",
                                finishedAt = android.os.SystemClock.elapsedRealtime(),
                                error = error.message ?: "请稍后重试",
                            )
                    )
                }
                throw error
            }
        }

    private fun reportPeerTransfer(received: Long, sent: Long) {
        mutable.update { state ->
            state.copy(
                peerProgress =
                    state.peerProgress?.let {
                        it.copy(
                            received = maxOf(it.received, received),
                            sent = maxOf(it.sent, sent),
                        )
                    }
            )
        }
    }

    private fun reportPeerStage(stage: String) {
        mutable.update { it.copy(peerProgress = it.peerProgress?.copy(stage = stage)) }
    }

    fun connectPeerSpace(space: PeerSpace) =
        launchPeerSync(space.name) {
            check(
                mutable.value.webFile == null &&
                    mutable.value.document == null &&
                    mutable.value.page == null &&
                    mutable.value.pluginFile == null
            ) {
                "请先完成编辑"
            }
            val connection =
                kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
                    val device =
                        checkNotNull(
                            PeerConnection.load(getApplication(), "device-${space.fingerprint}")
                        ) {
                            "请先配对设备"
                        }
                    PeerConnection.reconnect(
                        getApplication(),
                        PeerConnection(space.url, device.fingerprint, device.token, device.name),
                        space.id,
                    )
                }
            val id = catalog.getOrCreatePeerSpace(space.fingerprint, space.id, space.name).id
            connection.save(getApplication(), id)
            connection.saveDevice(getApplication())
            activateSpace(id)
            repository.syncPeer(connection, ::reportPeerTransfer, ::reportPeerStage)
            reportPeerStage("正在刷新本地文件列表")
            refreshFiles(includeGraft = false)
            mutable.update { it.copy(peerMessage = "已同步，可离线使用") }
        }

    fun syncPeer() = launchPeerSync { syncCurrentPeer() }

    fun syncPeerSpace(id: String) =
        launchPeerSync(catalog.spaces().firstOrNull { it.id == id }?.name ?: "Space") {
            activateSpace(id)
            syncCurrentPeer()
        }

    fun openPeerFiles(id: String) = launchAction {
        activateSpace(id)
        mutable.update { it.copy(tab = MainTab.Files, peerProgress = null) }
    }

    private suspend fun syncCurrentPeer() {
        check(
            mutable.value.webFile == null &&
                mutable.value.document == null &&
                mutable.value.page == null &&
                mutable.value.pluginFile == null
        ) {
            "请先完成编辑"
        }
        val connection =
            kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
                PeerConnection.load(getApplication(), repository.spaceId)?.let { saved ->
                    val remoteSpace =
                        checkNotNull(
                            catalog.peerRemoteSpace(saved.fingerprint, repository.spaceId)
                        ) {
                            "请从已配对设备中重新选择此 Space"
                        }
                    PeerConnection.reconnect(getApplication(), saved, remoteSpace).also {
                        it.save(getApplication(), repository.spaceId)
                        it.saveDevice(getApplication())
                    }
                }
            }
        checkNotNull(connection) { "此 Space 尚未配对电脑" }
        repository.syncPeer(connection, ::reportPeerTransfer, ::reportPeerStage)
        reportPeerStage("正在刷新本地文件列表")
        refreshFiles(includeGraft = false)
        mutable.update { it.copy(peerMessage = "已与 ${connection.name} 同步") }
    }

    private suspend fun recoverMerge() {
        val review = repository.mergeReview()
        mutable.update {
            it.copy(
                mergeReview = review,
                mergeComparison = null,
                tab = if (review != null) MainTab.Sync else it.tab,
            )
        }
    }

    fun beginMerge() = launchAction {
        check(
            mutable.value.document == null &&
                mutable.value.page == null &&
                mutable.value.pendingShares.isEmpty()
        ) {
            "请先完成编辑或分享"
        }
        BackgroundSync.pauseAutomatic(getApplication(), repository.spaceId, "自动同步已暂停：正在处理合并")
        BackgroundSync.cancel(getApplication(), repository.spaceId)
        try {
            val review = repository.beginMerge()
            mutable.update {
                it.copy(syncMessage = if (review == null) "当前没有需要处理的合并" else "已准备合并，请检查结果")
            }
        } finally {
            recoverMerge()
            refreshFiles()
        }
    }

    fun compareMerge(path: String) = launchAction {
        val review = checkNotNull(mutable.value.mergeReview)
        val comparison = repository.compareMerge(review, path)
        mutable.update { it.copy(mergeComparison = comparison) }
    }

    fun chooseMerge(path: String, side: String) = launchAction {
        try {
            repository.chooseMerge(checkNotNull(mutable.value.mergeReview), path, side)
        } finally {
            recoverMerge()
        }
    }

    fun finishMerge(abort: Boolean) = launchAction {
        try {
            repository.finishMerge(checkNotNull(mutable.value.mergeReview), abort)
            mutable.update {
                it.copy(syncMessage = if (abort) "合并已中止，已恢复本地版本" else "合并已保存到本机；点击立即同步上传")
            }
        } finally {
            recoverMerge()
            refreshFiles()
            mutable.update { it.copy(graft = repository.graftStatus()) }
        }
    }

    fun openAttachment(document: String, entry: org.json.JSONObject) = launchAction {
        val preview = repository.attachmentPreview(document, entry)
        mutable.update { it.copy(attachmentPreview = preview) }
    }

    fun closeAttachment() {
        mutable.update { it.copy(attachmentPreview = null) }
    }

    private suspend fun refreshFiles(includeGraft: Boolean = true) {
        val folder = mutable.value.folder
        val files = repository.files(folder)
        val recent = repository.recent()
        val favorites = repository.favorites()
        val spaces = catalog.spaces()
        val graft = if (includeGraft) repository.graftStatus() else mutable.value.graft
        mutable.update {
            it.copy(
                files = files,
                graft = graft,
                recent = recent,
                favorites = favorites,
                spaceId = repository.spaceId,
                spaceName =
                    spaces.find { space -> space.id == repository.spaceId }?.name ?: "本地 Space",
                spaces = spaces,
                pendingClone = cloneJournal.pending(),
            )
        }
    }

    fun switchSpace(id: String) = launchAction { activateSpace(id) }

    fun openPublish(file: SpaceFile) = launchAction {
        mutable.update { it.copy(publish = PublishPage(file)) }
        loadPublishPage()
    }

    fun closePublish() {
        if (!mutable.value.busy) mutable.update { it.copy(publish = null) }
    }

    fun refreshPublish() = launchAction { loadPublishPage() }

    private suspend fun loadPublishPage() {
        val page = mutable.value.publish ?: return
        try {
            val identity = account.view()
            if (identity == null) {
                mutable.update { it.copy(publish = PublishPage(page.file, ready = true)) }
                return
            }
            val session =
                kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
                    account.publishSession()
                }
            val store = PublicationStore(getApplication(), repository.spaceId, session.subject)
            val saved = store.load(page.file.path)
            val publications = session.tenant.getJSONArray("publications")
            val current =
                saved?.let { binding ->
                    (0 until publications.length())
                        .map { publications.getJSONObject(it) }
                        .find {
                            it.getString("publicationId") == binding.id &&
                                it.getString("slug") == binding.slug
                        }
                        ?.let {
                            publicationBinding(
                                it,
                                binding.slug,
                                session.tenant.getString("canonicalHost"),
                            )
                        }
                }
            current?.let { store.save(page.file.path, it) }
            mutable.update {
                it.copy(
                    publish =
                        PublishPage(
                            page.file,
                            session.subject,
                            session.tenant.getString("canonicalHost"),
                            session.plan,
                            session.privateAccess,
                            current,
                            ready = true,
                        )
                )
            }
        } catch (error: Exception) {
            if (error is CancellationException) throw error
            mutable.update { it.copy(publish = page.copy(error = error.message, ready = false)) }
        }
    }

    fun publishFile(slug: String, access: String, password: String, remove: Boolean = false) =
        launchAction {
            val page = mutable.value.publish ?: return@launchAction
            mutable.update {
                it.copy(
                    publish =
                        page.copy(
                            error = null,
                            complete = false,
                            progress =
                                org.json
                                    .JSONObject()
                                    .put("kind", "stage")
                                    .put("message", "checking Publish account"),
                        )
                )
            }
            try {
                val session =
                    kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
                        account.publishSession()
                    }
                check(session.subject == page.subject) { "账号已改变，请重新打开发布页面" }
                check(remove || !page.file.eidos || session.plan != "free") {
                    "发布 .eidos 文件需要 Publish Pro"
                }
                check(remove || access !in listOf("private", "password") || session.privateAccess) {
                    "当前套餐不支持此访问方式"
                }
                val binding =
                    repository.publishFile(
                        page.file,
                        session,
                        page.binding?.slug ?: slug.trim(),
                        access,
                        password,
                        page.binding,
                        remove,
                    ) { progress ->
                        mutable.update { it.copy(publish = it.publish?.copy(progress = progress)) }
                    }
                mutable.update {
                    it.copy(publish = it.publish?.copy(binding = binding, complete = true))
                }
            } catch (error: Exception) {
                if (error is CancellationException) throw error
                val saved =
                    page.subject?.let {
                        PublicationStore(getApplication(), repository.spaceId, it)
                            .load(page.file.path)
                    }
                mutable.update {
                    it.copy(
                        publish =
                            it.publish?.copy(binding = saved ?: page.binding, error = error.message)
                    )
                }
            } finally {
                mutable.update { it.copy(publish = it.publish?.copy(progress = null)) }
            }
        }

    fun signIn(open: (Uri) -> Unit) = launchAction {
        val uri =
            kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
                account.beginLogin()
            }
        open(uri)
    }

    fun loginCallback(uri: Uri) {
        // A callback must survive an unrelated foreground action; do not silently drop it.
        viewModelScope.launch {
            state.first { !it.busy }
            launchAction {
                try {
                    kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
                        account.finishLogin(uri, registerSync = mutable.value.publish == null)
                    }
                } finally {
                    val user =
                        kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
                            account.view()
                        }
                    mutable.update {
                        it.copy(
                            account = user,
                            cloudSpaces = null,
                            tab = if (it.publish == null) MainTab.Sync else it.tab,
                        )
                    }
                    if (mutable.value.publish != null) loadPublishPage()
                }
            }
        }
    }

    fun signOut() = launchAction {
        kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) { account.signOut() }
        mutable.update { it.copy(account = null, cloudSpaces = null) }
        kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
            val context = getApplication<Application>()
            for (space in catalog.spaces()) {
                if (
                    SyncProfileStore(context, space.id).load()?.token?.startsWith("account:") ==
                        true
                ) {
                    BackgroundSync.cancel(context, space.id)
                    BackgroundSync.setAutomatic(context, space.id, false)
                }
            }
        }
    }

    fun loadCloudSpaces() = launchAction {
        val spaces =
            kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
                account.repositories()
            }
        mutable.update { it.copy(cloudSpaces = spaces) }
    }

    fun enableAccountSync() = launchAction {
        check(mutable.value.graft?.remoteUrl == null) { "当前 Space 已连接远程" }
        val name = mutable.value.spaceName
        val id = repository.spaceId
        val (url, credential) =
            kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
                // Personal is a shared default name, so persist an installation-specific remote id.
                val prefs =
                    getApplication<Application>().getSharedPreferences("cloud-repositories", 0)
                val remoteId =
                    prefs.getString(id, null)
                        ?: java.util.UUID.randomUUID().toString().also {
                            check(prefs.edit().putString(id, it).commit())
                        }
                account.provision(remoteId, name) to account.credential()
            }
        val graft = repository.connectRemote(url, credential)
        mutable.update {
            it.copy(graft = graft, syncMessage = "已连接云端 Space。请进入同步设置，首次发布本机版本，然后使用同步。")
        }
    }

    fun useAccountForRemote() = launchAction {
        val url = checkNotNull(mutable.value.graft?.remoteUrl)
        val credential =
            kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
                SyncEnvironment.requireRemote(url)
                check(account.repositories().any { it.url == url }) { "此云端 Space 不属于当前账号" }
                account.credential()
            }
        val graft = repository.connectRemote(url, credential)
        mutable.update { it.copy(graft = graft, syncMessage = "此 Space 已改用账号登录，凭证会自动刷新") }
    }

    private fun reportDownload(progress: DownloadProgress) {
        mutable.update { current ->
            current.copy(
                downloadProgress =
                    progress.copy(
                        receivedBytes =
                            maxOf(
                                progress.receivedBytes,
                                current.downloadProgress?.receivedBytes ?: 0,
                            )
                    )
            )
        }
    }

    fun downloadCloudSpace(space: CloudSpace) = launchAction {
        mutable.update { it.copy(downloadProgress = DownloadProgress(space.name)) }
        try {
            val credential =
                kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
                    account.credential()
                }
            val local = cloneJournal.download(space.name, space.url, credential, ::reportDownload)
            activateSpace(local.id)
            mutable.update { it.copy(cloudSpaces = null, captureNotice = "云端 Space 已下载，可离线使用") }
        } finally {
            mutable.update {
                it.copy(pendingClone = cloneJournal.pending(), downloadProgress = null)
            }
        }
    }

    fun createSpace(name: String, done: () -> Unit) = launchAction {
        val space = catalog.create(name)
        activateSpace(space.id)
        done()
    }

    fun cloneSpace(name: String, url: String, token: String, done: () -> Unit) = launchAction {
        mutable.update { it.copy(downloadProgress = DownloadProgress(name)) }
        try {
            val space = cloneJournal.download(name, url, token, ::reportDownload)
            activateSpace(space.id)
            mutable.update { it.copy(captureNotice = "远程 Space 已下载到本机，可离线使用") }
            done()
        } finally {
            mutable.update {
                it.copy(pendingClone = cloneJournal.pending(), downloadProgress = null)
            }
        }
    }

    fun recoverClone(id: String, discard: Boolean) = launchAction {
        try {
            if (discard) cloneJournal.discard(id)
            else {
                mutable.update {
                    it.copy(
                        downloadProgress =
                            DownloadProgress(cloneJournal.pending()?.space?.name.orEmpty())
                    )
                }
                val space = cloneJournal.resume(id, ::reportDownload)
                activateSpace(space.id)
                mutable.update { it.copy(captureNotice = "远程 Space 已下载到本机，可离线使用") }
            }
        } finally {
            mutable.update {
                it.copy(pendingClone = cloneJournal.pending(), downloadProgress = null)
            }
        }
    }

    private suspend fun activateSpace(id: String) {
        require(catalog.spaces().any { it.id == id }) { "Space 已不存在" }
        if (repository.spaceId == id) return
        navigationVersion++
        searchVersion++
        searchJob?.cancelAndJoinSafely()
        rowJob?.cancelAndJoinSafely()
        draftJob?.cancelAndJoinSafely()
        val current = mutable.value
        if (current.dirty && current.document != null) repository.saveDraft(current.document)
        val next = SpaceRepository(getApplication(), id)
        val files = next.files("")
        val recent = next.recent()
        val favorites = next.favorites()
        repository.close()
        catalog.select(id)
        repository = next
        documentHistory.clear()
        pendingRows = null
        val spaces = catalog.spaces()
        mutable.value =
            AppState(
                tab =
                    if (current.peerProgress?.finishedAt == null && current.peerProgress != null)
                        MainTab.Sync
                    else MainTab.Files,
                peerProgress = current.peerProgress?.takeIf { it.finishedAt == null },
                peerDevices = current.peerDevices,
                peerAvailability = current.peerAvailability,
                peerChecking = current.peerChecking,
                peerSpaces = current.peerSpaces,
                peerLocalSpaces = catalog.peerLocalSpaces(),
                account = current.account,
                spaceId = id,
                spaceName = spaces.first { it.id == id }.name,
                spaces = spaces,
                pendingClone = cloneJournal.pending(),
                files = files,
                recent = recent,
                favorites = favorites,
                busy = true,
            )
        recoverMerge()
        recoverShares()
        mutable.update { it.copy(graft = repository.graftStatus()) }
    }

    fun toggleFavorite(favorite: Favorite) = launchAction {
        val selected = mutable.value.favorites.none { it.key == favorite.key }
        val favorites = repository.setFavorite(favorite, selected)
        mutable.update { it.copy(favorites = favorites) }
    }

    fun openFavorite(favorite: Favorite, addRecord: Boolean = false, done: () -> Unit = {}) =
        launchAction {
            openTarget(favorite.path, favorite.tableId, addRecord)
            done()
        }

    fun recordRequestHandled() {
        mutable.update { it.copy(addRecord = false) }
    }

    fun tab(tab: MainTab) {
        if (mutable.value.busy) return
        mutable.update { it.copy(tab = tab) }
        if (tab == MainTab.Sync) refreshGraft()
    }

    fun refreshGraft() = launchAction {
        recoverMerge()
        val graft = repository.graftStatus()
        mutable.update { it.copy(graft = graft, syncMessage = null) }
    }

    fun checkpoint() = launchAction {
        val graft = repository.checkpoint()
        mutable.update { it.copy(graft = graft, syncMessage = null) }
    }

    fun connectRemote(url: String, token: String, done: () -> Unit) = launchAction {
        val graft = repository.connectRemote(url, token)
        mutable.update { it.copy(graft = graft, syncMessage = "连接配置已保存，尚未验证远程访问") }
        done()
    }

    fun disconnectRemote() = launchAction {
        BackgroundSync.setAutomatic(getApplication(), repository.spaceId, false)
        BackgroundSync.cancel(getApplication(), repository.spaceId)
        val graft = repository.disconnectRemote()
        mutable.update { it.copy(graft = graft, syncMessage = "已清除本机同步凭证，文件仍保留在本机") }
    }

    fun enqueueBackgroundSync() = launchAction {
        check(
            mutable.value.document == null &&
                mutable.value.page == null &&
                mutable.value.webFile == null
        ) {
            "请先完成编辑再同步"
        }
        check(repository.graftStatus().remoteUrl != null) { "请先连接远程 Space" }
        BackgroundSync.enqueue(getApplication(), repository.spaceId)
        mutable.update { it.copy(syncMessage = "任务已加入后台队列，离开应用后在有网络时运行") }
    }

    fun cancelBackgroundSync() {
        BackgroundSync.cancel(getApplication(), repository.spaceId)
    }

    fun setAutomaticSync(enabled: Boolean) = launchAction {
        if (enabled) check(repository.graftStatus().remoteUrl != null) { "请先连接远程 Space" }
        BackgroundSync.setAutomatic(getApplication(), repository.spaceId, enabled)
    }

    fun syncRemote(publish: Boolean = false) = launchAction {
        check(
            mutable.value.document == null &&
                mutable.value.page == null &&
                mutable.value.webFile == null
        ) {
            "请先完成编辑再同步"
        }
        navigationVersion++
        rowJob?.cancelAndJoinSafely()
        mutable.update { it.copy(syncMessage = null) }
        mutable.update { it.copy(syncing = true) }
        try {
            val outcome = repository.syncRemote(publish)
            if (outcome == "needs_merge")
                BackgroundSync.pauseAutomatic(
                    getApplication(),
                    repository.spaceId,
                    "自动同步已暂停：需要合并本地与远端版本",
                )
            val graft = repository.graftStatus()
            mutable.update {
                it.copy(
                    graft = graft,
                    syncMessage =
                        if (outcome == "needs_merge") "双方都有新版本，需要合并。本地修改和远端版本均已保留，点击检查并合并继续。"
                        else if (publish) "本机版本已发布到远程" else "本次同步已完成",
                )
            }
            try {
                refreshFiles()
            } catch (error: IllegalArgumentException) {
                // A remote update can remove the folder the user last browsed.
                mutable.update { it.copy(folder = "") }
                refreshFiles()
            }
            if (mutable.value.search.isNotBlank()) search(mutable.value.search)
        } finally {
            val graft = runCatching { repository.graftStatus() }.getOrNull()
            mutable.update { it.copy(syncing = false, graft = graft) }
        }
    }

    fun clearError() {
        mutable.update { it.copy(error = null) }
    }

    fun edit() {
        mutable.update { it.copy(editing = true) }
    }

    fun beginRecordEdit() {
        rowJob?.cancel()
        navigationVersion++
    }

    fun openWithPlugin(file: SpaceFile, viewId: String) = launchAction {
        val current = mutable.value
        check(
            current.document == null &&
                current.page == null &&
                current.webFile == null &&
                current.pluginFile == null
        )
        val actual = repository.file(file.path)
        val view = pluginOpenWith.resolve(actual, viewId)
        require(actual.bytes <= if (view.document) 2 * 1024 * 1024 else 16 * 1024 * 1024) {
            "文件超过插件读取大小限制"
        }
        val snapshot = if (view.document) repository.pluginTextSnapshot(actual.path) else null
        val source = pluginMarket.source(current.spaceId, view)
        require(pluginMarket.authorized(current.spaceId, view)) { "插件授权已变更" }
        mutable.update { it.copy(pluginFile = PluginFileSession(view, actual, snapshot, source)) }
    }

    fun closePluginFile() {
        mutable.update { it.copy(pluginFile = null) }
        updateBackgroundGate()
    }

    fun open(file: SpaceFile) = launchAction {
        openTarget(file.path)
        documentHistory.clear()
    }

    fun leaveWebEditor(native: Boolean) {
        val file = mutable.value.webFile ?: return
        if (mutable.value.busy) return
        if (native) {
            launchAction {
                useWebEditor = false
                editorPreferences.edit().putBoolean("web", false).apply()
                openTarget(file.path, native = true)
                mutable.update { it.copy(webFile = null) }
            }
        } else {
            // The bridge has already flushed local writes. Graft is unrelated to
            // the editor lifetime; closing/reopening it here blocks local navigation.
            mutable.update { it.copy(webFile = null) }
            updateBackgroundGate()
            refreshReturnedFiles()
        }
    }

    private fun refreshReturnedFiles() {
        returnedFilesJob?.cancel()
        val owner = repository
        val folder = mutable.value.folder
        val version = navigationVersion
        returnedFilesJob =
            viewModelScope.launch {
                try {
                    val files = owner.files(folder)
                    val recent = owner.recent()
                    mutable.update {
                        if (
                            repository === owner &&
                                it.folder == folder &&
                                navigationVersion == version
                        )
                            it.copy(files = files, recent = recent)
                        else it
                    }
                } catch (error: CancellationException) {
                    throw error
                } catch (error: Exception) {
                    if (repository === owner && navigationVersion == version)
                        mutable.update { it.copy(error = error.message ?: "文件信息更新失败") }
                }
            }
    }

    fun useSharedEditor(path: String) = launchAction {
        val current = mutable.value
        if (current.dirty && current.document != null) repository.saveText(current.document)
        useWebEditor = true
        editorPreferences.edit().putBoolean("web", true).apply()
        openTarget(path)
    }

    fun openMarkdownLink(source: String, destination: String) = launchAction {
        val current = mutable.value
        check(current.document?.path == source && !current.editing) { "请先完成编辑" }
        val path = markdownLocalPath(source, destination)
        val file = repository.file(path)
        require(file.markdown || file.eidos) { "此链接文件暂不支持预览，请从文件列表导出" }
        openTarget(path)
        documentHistory.add(source)
    }

    fun linkError(message: String) {
        mutable.update { it.copy(error = message) }
    }

    private suspend fun openTarget(
        path: String,
        tableId: String? = null,
        addRecord: Boolean = false,
        native: Boolean = false,
    ) {
        navigationVersion++
        rowJob?.cancelAndJoinSafely()
        val file = repository.file(path)
        when {
            !native &&
                useWebEditor &&
                !addRecord &&
                tableId == null &&
                (file.markdown || file.eidos) -> {
                mutable.update {
                    it.copy(
                        webFile = file,
                        document = null,
                        page = null,
                        editing = false,
                        dirty = false,
                    )
                }
            }
            tableId != null -> {
                val page = repository.loadEidos(path, tableId)
                mutable.update { it.copy(page = page, addRecord = addRecord) }
            }
            file.directory -> {
                val files = repository.files(path)
                mutable.update { it.copy(folder = path, files = files, tab = MainTab.Files) }
            }
            file.markdown -> {
                val document = repository.readText(file.path)
                mutable.update {
                    it.copy(
                        document = document,
                        page = null,
                        editing = document.recovered,
                        dirty = document.recovered,
                        draftSaved = document.recovered,
                    )
                }
            }
            file.eidos -> {
                val page = repository.loadEidos(file.path)
                mutable.update {
                    it.copy(page = page, document = null, editing = false, dirty = false)
                }
            }
            else -> {
                val preview = repository.filePreview(file.path)
                mutable.update { it.copy(attachmentPreview = preview) }
            }
        }
    }

    fun back() = launchAction {
        navigationVersion++
        rowJob?.cancel()
        draftJob?.cancelAndJoinSafely()
        val current = mutable.value
        if (current.document != null) {
            if (current.dirty) {
                repository.saveDraft(current.document)
                repository.saveText(current.document)
            }
        }
        if (documentHistory.isNotEmpty()) {
            // A deleted source must not trap the user in an endless Back failure.
            val source = documentHistory.removeAt(documentHistory.lastIndex)
            openTarget(source)
            return@launchAction
        }
        if (current.document != null || current.page != null) {
            mutable.update { it.copy(document = null, page = null, editing = false, dirty = false) }
            refreshReturnedFiles()
            return@launchAction
        }
        val folder = current.folder.substringBeforeLast('/', "")
        val files = repository.files(folder)
        val recent = repository.recent()
        mutable.update {
            it.copy(
                document = null,
                page = null,
                editing = false,
                dirty = false,
                folder = folder,
                files = files,
                recent = recent,
            )
        }
    }

    fun textChanged(text: String) {
        val current = mutable.value
        val document = current.document ?: return
        // Finishing IME composition can deliver a duplicate callback as the
        // editor leaves focus. It must not recreate a draft after committing.
        if (!current.editing || current.busy || text == document.text) return
        val updated = document.copy(text = text)
        mutable.update { it.copy(document = updated, dirty = true, draftSaved = false) }
        val previous = draftJob
        previous?.cancel()
        draftJob =
            viewModelScope.launch {
                kotlinx.coroutines.withContext(kotlinx.coroutines.NonCancellable) {
                    previous?.join()
                }
                delay(150)
                try {
                    val pending = mutable.value.document ?: return@launch
                    repository.saveDraft(pending)
                    if (mutable.value.document == pending)
                        mutable.update { it.copy(draftSaved = true) }
                    delay(600)
                    // Finish a started atomic write and advance the digest even
                    // when another keystroke cancels this debounce job.
                    kotlinx.coroutines.withContext(kotlinx.coroutines.NonCancellable) {
                        val snapshot = mutable.value.document ?: return@withContext
                        val saved = repository.saveText(snapshot)
                        val latest = mutable.value.document ?: return@withContext
                        if (latest.path == saved.path) {
                            val next = latest.copy(digest = saved.digest, recovered = false)
                            val dirty = next.text != saved.text
                            mutable.update {
                                it.copy(document = next, dirty = dirty, draftSaved = false)
                            }
                            if (dirty) {
                                repository.saveDraft(next)
                                if (mutable.value.document == next)
                                    mutable.update { it.copy(draftSaved = true) }
                            }
                        }
                    }
                } catch (error: CancellationException) {
                    throw error
                } catch (error: Exception) {
                    mutable.update { it.copy(error = error.message, draftSaved = false) }
                }
            }
    }

    fun saveDocument() = launchAction {
        draftJob?.cancelAndJoinSafely()
        val current = mutable.value
        val document = current.document ?: return@launchAction
        if (current.dirty) {
            repository.saveDraft(document)
            val saved = repository.saveText(document)
            mutable.update {
                it.copy(document = saved, dirty = false, draftSaved = false, editing = false)
            }
        } else mutable.update { it.copy(editing = false) }
    }

    fun insertMarkdownImage(path: String, text: String, start: Int, end: Int, uri: Uri) =
        launchAction {
            draftJob?.cancelAndJoinSafely()
            val current = mutable.value
            val document = checkNotNull(current.document) { "文档已关闭" }
            check(current.editing && document.path == path && document.text == text) {
                "文档已变化，请重新选择图片"
            }
            val from = minOf(start, end)
            val to = maxOf(start, end)
            require(from >= 0 && to <= text.length) { "插入位置已变化" }
            val markdown = repository.importMarkdownImage(path, uri)
            val updated = document.copy(text = text.replaceRange(from, to, markdown))
            // Preserve the imported bytes if the document commit fails; the recovered
            // draft must never refer to a file that cleanup has removed.
            mutable.update { it.copy(document = updated, dirty = true, draftSaved = false) }
            repository.saveDraft(updated)
            mutable.update { it.copy(draftSaved = true) }
            val saved = repository.saveText(updated)
            mutable.update { it.copy(document = saved, dirty = false, draftSaved = false) }
        }

    fun toggleMarkdownTask(expected: TextDocument, offset: Int, checked: Boolean) = launchAction {
        val current = mutable.value
        check(current.document == expected && !current.editing && !current.dirty) { "内容已变化，请先完成编辑" }
        check(
            expected.text.getOrNull(offset - 1) == '[' && expected.text.getOrNull(offset + 1) == ']'
        ) {
            "任务位置已变化"
        }
        check(expected.text.getOrNull(offset) in if (checked) setOf('x', 'X') else setOf(' ')) {
            "任务状态已变化"
        }
        val updated =
            expected.copy(
                text = expected.text.replaceRange(offset, offset + 1, if (checked) " " else "x")
            )
        val saved = repository.saveText(updated)
        mutable.update { it.copy(document = saved) }
    }

    fun persistDraft() {
        val current = mutable.value
        if (current.dirty && current.document != null) {
            val previous = draftJob
            previous?.cancel()
            draftJob =
                viewModelScope.launch {
                    kotlinx.coroutines.withContext(kotlinx.coroutines.NonCancellable) {
                        previous?.join()
                    }
                    try {
                        mutable.value.document
                            ?.takeIf { mutable.value.dirty }
                            ?.let { repository.saveDraft(it) }
                    } catch (error: Exception) {
                        mutable.update { it.copy(error = error.message) }
                    }
                }
        }
    }

    fun create(name: String, kind: String, done: () -> Unit) = launchAction {
        val path = repository.create(mutable.value.folder, name, kind)
        refreshFiles()
        if (useWebEditor && kind in listOf("markdown", "eidos")) {
            openTarget(path)
            done()
            return@launchAction
        }
        if (kind == "markdown")
            mutable.update {
                it.copy(document = repository.readText(path), editing = true, dirty = false)
            }
        if (kind == "eidos") mutable.update { it.copy(page = repository.loadEidos(path)) }
        done()
    }

    // Activity results may arrive while onStart is refreshing local files. Unlike
    // a disabled UI button, an already selected file must never be silently dropped.
    private fun importResult(action: suspend (String) -> Unit) {
        val owner = repository
        val folder = mutable.value.folder
        viewModelScope.launch {
            state.first { !it.busy }
            launchAction {
                check(repository === owner) { "Space 已切换，请重新选择导入文件" }
                mutable.update { it.copy(captureNotice = null) }
                action(folder)
            }
        }
    }

    fun import(uri: Uri) = importResult { folder ->
        val path = repository.importFile(uri, folder)
        mutable.update { it.copy(captureNotice = "已导入 ${path.substringAfterLast('/')} 到本机") }
        refreshFiles(includeGraft = false)
    }

    fun export(path: String, uri: Uri) = launchAction { repository.exportFile(path, uri) }

    fun importDirectory(uri: Uri) = importResult { folder ->
        repository.importDirectory(uri, folder)
        mutable.update { it.copy(captureNotice = "目录已完整导入本机") }
        refreshFiles(includeGraft = false)
    }

    fun exportDirectory(path: String, uri: Uri) = launchAction {
        check(mutable.value.document == null && mutable.value.page == null) { "请先关闭编辑器" }
        repository.exportDirectory(path, uri)
        mutable.update { it.copy(captureNotice = "目录已完整导出") }
    }

    fun receiveShare(files: List<Uri>, text: String?) {
        val receivingSpace = repository.spaceId
        viewModelScope.launch {
            state.first { !it.busy }
            launchAction {
                val received = ShareInbox(getApplication(), receivingSpace).receive(files, text)
                if (receivingSpace != repository.spaceId) {
                    mutable.update { it.copy(captureNotice = "分享已暂存，请切换回接收时的 Space 继续处理") }
                    return@launchAction
                }
                val folder =
                    if (mutable.value.pendingShares.isEmpty()) repository.shareFolder()
                    else mutable.value.shareFolder
                val folders = shareSubfolders(folder)
                val lastTable = repository.lastShareTable()
                mutable.update {
                    it.copy(
                        pendingShares =
                            it.pendingShares +
                                PendingShare(received.files, received.text, received.id),
                        shareInboxVisible = true,
                        shareFolder = folder,
                        shareFolders = folders,
                        lastShareTable = lastTable,
                    )
                }
            }
        }
    }

    private suspend fun recoverShares() {
        val saved = ShareInbox(getApplication(), repository.spaceId).pending()
        val folder =
            if (mutable.value.pendingShares.isEmpty()) repository.shareFolder()
            else mutable.value.shareFolder
        val folders = shareSubfolders(folder)
        val table = repository.lastShareTable()
        mutable.update {
            it.copy(
                pendingShares =
                    saved.map { item ->
                        PendingShare(
                            item.files,
                            item.text,
                            item.id,
                            item.submitting,
                            item.destination,
                            item.form,
                        )
                    },
                shareFolder = folder,
                shareFolders = folders,
                lastShareTable = table,
            )
        }
    }

    fun showShareInbox(show: Boolean) = launchAction {
        mutable.update {
            it.copy(shareInboxVisible = show, shareRecord = null, shareDatabase = null)
        }
        if (!show) restoreShareQuery()
    }

    fun retryInterruptedShare() = launchAction {
        val share = mutable.value.pendingShares.firstOrNull() ?: return@launchAction
        ShareInbox(getApplication(), repository.spaceId).markSubmitting(share.inboxId, false)
        recoverShares()
    }

    private suspend fun committingShare(
        share: PendingShare,
        destination: String,
        action: suspend () -> Unit,
    ) {
        check(!share.submitting) { "请先检查上次保存的结果" }
        ShareInbox(getApplication(), repository.spaceId)
            .markSubmitting(share.inboxId, true, destination)
        try {
            action()
        } finally {
            kotlinx.coroutines.withContext(kotlinx.coroutines.NonCancellable) { recoverShares() }
        }
    }

    private suspend fun shareSubfolders(folder: String): List<SpaceFile> =
        repository.shareFolders(folder)

    fun browseShareFolder(folder: String) = launchAction {
        val folders = shareSubfolders(folder)
        mutable.update { it.copy(shareFolder = folder, shareFolders = folders) }
    }

    fun cancelShare() = launchAction {
        mutable.value.pendingShares.firstOrNull()?.let {
            ShareInbox(getApplication(), repository.spaceId).remove(it.inboxId)
        }
        mutable.update {
            it.copy(
                pendingShares = it.pendingShares.drop(1),
                shareDatabase = null,
                shareRecord = null,
            )
        }
        restoreShareQuery()
    }

    fun closeShareTable() = launchAction {
        mutable.update { it.copy(shareDatabase = null, shareRecord = null) }
        restoreShareQuery()
        recoverShares()
    }

    private suspend fun restoreShareQuery() {
        if (!shareQueryChanged) return
        // Browsing another file replaces the native query session. Restore a usable cursor
        // for the retained page before returning to it.
        val previous = mutable.value.page
        val restored =
            previous?.let {
                repository.loadEidos(
                    it.path,
                    it.table?.id,
                    it.query,
                    sort = it.sort,
                    filters = it.filters,
                    viewId = it.view?.id,
                )
            }
        mutable.update { it.copy(page = restored) }
        shareQueryChanged = false
    }

    fun openShareTable(path: String, tableId: String? = null) = launchAction {
        val share = mutable.value.pendingShares.firstOrNull() ?: return@launchAction
        require(share.files.isNotEmpty() || !share.text.isNullOrBlank()) { "分享内容为空" }
        rowJob?.cancelAndJoinSafely()
        shareQueryChanged = true
        val page = repository.loadEidos(path, tableId)
        if (tableId == null) {
            mutable.update { it.copy(shareDatabase = page) }
        } else {
            require(page.table?.id == tableId) { "目标表已不存在，请重新选择" }
            val field =
                page.fields.firstOrNull {
                    it.id == page.table.labelFieldId &&
                        it.editable &&
                        it.kind in setOf("text", "url")
                } ?: page.fields.firstOrNull { it.editable && it.kind == "text" }
            if (!share.text.isNullOrBlank()) requireNotNull(field) { "这张表没有可写入分享文本的字段" }
            val attachmentField = page.fields.firstOrNull { it.kind == "file" && it.writable }
            if (share.files.isNotEmpty())
                requireNotNull(attachmentField) { "这张表没有可写入的附件字段，请选择其他表或文件夹" }
            rowJob?.cancelAndJoinSafely()
            draftJob?.cancelAndJoinSafely()
            mutable.value.document?.takeIf { mutable.value.dirty }?.let { repository.saveDraft(it) }
            val initial =
                org.json
                    .JSONObject()
                    .apply {
                        if (field != null)
                            put(field.id, share.text?.takeIf { it.isNotBlank() } ?: "分享附件")
                    }
                    .toString()
            val form =
                ShareInbox(getApplication(), repository.spaceId)
                    .ensureForm(
                        share.inboxId,
                        ShareForm(path, tableId, page.revision, initial, attachmentField?.id),
                    )
            mutable.update {
                it.copy(
                    shareRecord = page,
                    shareInitialValues = initial,
                    shareAttachmentFieldId = form.attachmentField,
                )
            }
        }
    }

    fun saveShareRecord(values: Map<String, Any>, expectedRevision: String? = null) = launchAction {
        val currentPage = mutable.value.shareRecord ?: return@launchAction
        val share = mutable.value.pendingShares.firstOrNull() ?: return@launchAction
        val stored =
            ShareInbox(getApplication(), repository.spaceId)
                .form(share.inboxId, currentPage.path, checkNotNull(currentPage.table).id)
        val page =
            currentPage.copy(
                revision = expectedRevision ?: stored?.revision ?: currentPage.revision
            )
        committingShare(share, "${page.path} / ${page.table?.name}") {
            try {
                if (share.files.isEmpty()) repository.mutate(page, null, values)
                else
                    repository.mutateWithAttachments(
                        page,
                        null,
                        values,
                        checkNotNull(mutable.value.shareAttachmentFieldId),
                        share.files,
                    )
            } catch (error: AttachmentCommitUncertain) {
                mutable.update {
                    it.copy(
                        shareRecord = null,
                        shareDatabase = null,
                        pendingShares = it.pendingShares.drop(1),
                    )
                }
                throw error
            }
            shareQueryChanged = false
            ShareInbox(getApplication(), repository.spaceId).remove(share.inboxId)
            mutable.update {
                it.copy(
                    shareRecord = null,
                    shareDatabase = null,
                    pendingShares = it.pendingShares.drop(1),
                    document = null,
                    page = page,
                    editing = false,
                    dirty = false,
                    addRecord = false,
                    captureNotice = "已保存到${page.table?.name}",
                )
            }
            documentHistory.clear()
            navigationVersion++
            repository.rememberShareTable(page)
            val refreshed = repository.loadEidos(page.path, page.table?.id)
            mutable.update {
                it.copy(
                    page = refreshed,
                    lastShareTable =
                        Favorite(page.path, checkNotNull(page.table).name, page.table.id),
                )
            }
        }
    }

    fun selectShareAttachmentField(fieldId: String) = launchAction {
        if (
            mutable.value.shareRecord?.fields?.any {
                it.id == fieldId && it.kind == "file" && it.writable
            } == true
        ) {
            val page = checkNotNull(mutable.value.shareRecord)
            val share = checkNotNull(mutable.value.pendingShares.firstOrNull())
            ShareInbox(getApplication(), repository.spaceId)
                .updateForm(
                    share.inboxId,
                    page.path,
                    checkNotNull(page.table).id,
                    attachmentField = fieldId,
                )
            mutable.update { it.copy(shareAttachmentFieldId = fieldId) }
        }
    }

    fun saveShare() = launchAction {
        val share = mutable.value.pendingShares.firstOrNull() ?: return@launchAction
        committingShare(share, mutable.value.shareFolder.ifEmpty { "Space 根目录" }) {
            val folder = mutable.value.shareFolder
            rowJob?.cancelAndJoinSafely()
            draftJob?.cancelAndJoinSafely()
            mutable.value.document?.takeIf { mutable.value.dirty }?.let { repository.saveDraft(it) }
            val result = repository.captureFiles(share.files, folder)
            val failures = result.failures.toMutableList()
            val caption =
                try {
                    share.text?.takeIf { it.isNotBlank() }?.let { repository.capture(it, folder) }
                } catch (error: CancellationException) {
                    throw error
                } catch (error: Exception) {
                    failures.add("附带文本：${error.message}")
                    null
                }
            documentHistory.clear()
            navigationVersion++
            val count = result.paths.size + if (caption == null) 0 else 1
            if (count == 0) error(failures.joinToString("\n").ifEmpty { "分享内容为空" })
            if (failures.isEmpty())
                ShareInbox(getApplication(), repository.spaceId).remove(share.inboxId)
            // Partial imports retain their staged bytes and require review before retrying.
            // Imports have committed. Dismiss before any optional preference or refresh failure
            // so retrying those operations cannot duplicate successful files.
            mutable.update {
                it.copy(
                    document = null,
                    page = null,
                    editing = false,
                    dirty = false,
                    tab = MainTab.Files,
                    folder = folder,
                    pendingShares = it.pendingShares.drop(1),
                    captureNotice = "已存入${folder.ifEmpty { "Space 根目录" }}：$count 个文件",
                    error = failures.takeIf { it.isNotEmpty() }?.joinToString("\n"),
                )
            }
            repository.rememberShareFolder(folder)
            refreshFiles()
        }
    }

    fun search(query: String) {
        val version = ++searchVersion
        mutable.update { it.copy(search = query, searching = true) }
        searchJob?.cancel()
        searchJob =
            viewModelScope.launch {
                try {
                    delay(250)
                    val results = repository.search(query)
                    if (searchVersion == version)
                        mutable.update {
                            it.copy(matches = results.matches, searchSkipped = results.skipped)
                        }
                } catch (error: CancellationException) {
                    throw error
                } catch (error: Exception) {
                    mutable.update { it.copy(error = error.message) }
                } finally {
                    if (searchVersion == version) mutable.update { it.copy(searching = false) }
                }
            }
    }

    fun openSearchMatch(match: SearchMatch) = launchAction {
        searchJob?.cancelAndJoinSafely()
        if (match.tableId == null) openTarget(match.file.path)
        else {
            navigationVersion++
            rowJob?.cancelAndJoinSafely()
            val page = repository.loadEidos(match.file.path, match.tableId, match.query)
            mutable.update { it.copy(page = page, document = null, editing = false, dirty = false) }
        }
        documentHistory.clear()
    }

    fun sortRows(query: String, sort: EidosSort?) {
        val page = mutable.value.page ?: return
        requestRows(currentRowRequest(page).copy(query = query, sort = sort))
    }

    fun filterRows(query: String, filters: List<EidosFilter>) {
        val page = mutable.value.page ?: return
        requestRows(currentRowRequest(page).copy(query = query, filters = filters))
    }

    private fun currentRowRequest(page: EidosPage): RowRequest =
        pendingRows?.takeIf { rowJob?.isActive == true && it.path == page.path }
            ?: RowRequest(
                page.path,
                page.table?.id,
                page.query,
                page.sort,
                page.filters,
                page.view?.id,
            )

    fun selectView(id: String?) {
        val page = mutable.value.page ?: return
        requestRows(RowRequest(page.path, page.table?.id, "", null, emptyList(), id))
    }

    fun saveView(name: String, fields: List<String>, done: () -> Unit) = launchAction {
        val page = mutable.value.page ?: return@launchAction
        rowJob?.cancelAndJoinSafely()
        val id = repository.saveView(page, name, fields)
        done()
        val next = repository.loadEidos(page.path, page.table?.id, page.query, viewId = id)
        mutable.update { it.copy(page = next) }
    }

    fun queryRows(query: String, tableId: String? = null) {
        val page = mutable.value.page ?: return
        val current = currentRowRequest(page)
        requestRows(
            if (tableId != null && tableId != current.table)
                RowRequest(page.path, tableId, query, null, emptyList())
            else current.copy(query = query)
        )
    }

    private fun requestRows(request: RowRequest) {
        val version = navigationVersion
        rowJob?.cancel()
        pendingRows = request
        mutable.update { it.copy(rowLoading = true) }
        rowJob =
            viewModelScope.launch {
                try {
                    delay(250)
                    val next =
                        repository.loadEidos(
                            request.path,
                            request.table,
                            request.query,
                            sort = request.sort,
                            filters = request.filters,
                            viewId = request.viewId,
                        )
                    if (version == navigationVersion && mutable.value.page?.path == request.path)
                        mutable.update { it.copy(page = next) }
                } catch (error: CancellationException) {
                    throw error
                } catch (error: Exception) {
                    mutable.update { it.copy(error = error.message) }
                } finally {
                    if (pendingRows === request) mutable.update { it.copy(rowLoading = false) }
                }
            }
    }

    fun nextPage() = launchAction {
        val page = mutable.value.page ?: return@launchAction
        val cursor = page.nextCursor ?: return@launchAction
        rowJob?.cancelAndJoinSafely()
        val next =
            repository.loadEidos(
                page.path,
                page.table?.id,
                page.query,
                cursor,
                page.sort,
                page.filters,
                page.view?.id,
            )
        check(next.revision == page.revision) { "数据已变化，请重新搜索或打开文件" }
        mutable.update { it.copy(page = next.copy(rows = page.rows + next.rows)) }
    }

    fun mutate(
        row: EidosRecord?,
        changes: Map<String, Any>,
        delete: Boolean = false,
        expectedRevision: String? = null,
        done: () -> Unit,
    ) = launchAction {
        val page = mutable.value.page ?: return@launchAction
        rowJob?.cancelAndJoinSafely()
        repository.mutate(
            page.copy(revision = expectedRevision ?: page.revision),
            row,
            changes,
            delete,
        )
        try {
            RecordDraftStore(getApplication(), repository.spaceId)
                .clear(page.path, checkNotNull(page.table).id, row?.id)
        } finally {
            done() // The mutation committed even if draft cleanup or the following refresh fails.
        }
        mutable.update {
            it.copy(
                page =
                    repository.loadEidos(
                        page.path,
                        page.table?.id,
                        page.query,
                        sort = page.sort,
                        filters = page.filters,
                        viewId = page.view?.id,
                    )
            )
        }
    }
}

private suspend fun Job.cancelAndJoinSafely() {
    cancel()
    join()
}
