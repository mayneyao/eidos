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
import org.json.JSONObject

enum class MainTab {
    Files,
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
    val peerWaitingComputer: String? = null,
    val peerProgress: PeerSyncProgress? = null,
    val peerDevices: List<PeerDevice> = emptyList(),
    val peerAvailability: Map<String, PeerAvailability> = emptyMap(),
    val peerChecking: Boolean = false,
    val peerSpaces: List<PeerSpace> = emptyList(),
    val peerLocalSpaces: List<PeerLocalSpace> = emptyList(),
    val pluginGeneration: Int = 0,
    val pluginFile: PluginFileSession? = null,
    val webFile: SpaceFile? = null,
    val editorGeneration: Int = 0,
    val webTableId: String? = null,
    val webQuery: String = "",
    val webAddRecord: Boolean = false,
    val publish: PublishPage? = null,
    val account: SyncAccountView? = null,
    val cloudSpaces: List<CloudSpace>? = null,
    val spaceId: String = "personal",
    val spaceName: String = tr("个人 Space"),
    val spaces: List<LocalSpace> = emptyList(),
    val pendingClone: PendingClone? = null,
    val downloadProgress: DownloadProgress? = null,
    val tab: MainTab = MainTab.Files,
    val folder: String = "",
    val files: List<SpaceFile> = emptyList(),
    val fileSort: FileSort = FileSort(),
    val recent: List<SpaceFile> = emptyList(),
    val favorites: List<Favorite> = emptyList(),
    val favoriteFiles: Map<String, SpaceFile> = emptyMap(),
    val graft: GraftState? = null,
    val localVersions: List<LocalVersion> = emptyList(),
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
    val shareAttachmentFieldId: String? = null,
    val busy: Boolean = false,
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
    val pluginMarket = PluginMarketStore(application)
    val pluginOpenWith
        get() = pluginMarket.registry(mutable.value.spaceId)

    private val filePreferences = application.getSharedPreferences("file-browser", 0)
    private val initialSpaces = catalog.spaces()
    private val mutable =
        MutableStateFlow(
            AppState(
                spaceId = repository.spaceId,
                spaceName = initialSpaces.find { it.id == repository.spaceId }?.name ?: tr("本地 Space"),
                spaces = initialSpaces,
                fileSort =
                    FileSort(
                        filePreferences.getString("sort-by", "name")?.takeIf {
                            it in listOf("name", "modified", "type")
                        } ?: "name",
                        filePreferences.getBoolean("sort-descending", false),
                    ),
            )
        )

    fun sortFiles(sort: FileSort) {
        filePreferences
            .edit()
            .putString("sort-by", sort.by)
            .putBoolean("sort-descending", sort.descending)
            .apply()
        mutable.update { it.copy(fileSort = sort) }
    }

    val state = mutable.asStateFlow()
    private var searchJob: Job? = null
    private var searchVersion = 0
    private var navigationVersion = 0
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
                        mutable.update { it.copy(error = error.message ?: tr("自动同步任务恢复失败")) }
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
                current.peerBusy ||
                current.mergeReview != null ||
                current.webFile != null ||
                current.pluginFile != null ||
                current.pendingShares.isNotEmpty(),
        )
    }

    fun foregroundStarted() {
        foreground = true
        updateBackgroundGate()
        if (
            !mutable.value.busy && mutable.value.webFile == null && mutable.value.pluginFile == null
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
        if (mutable.value.busy || mutable.value.peerBusy) return
        graftRefreshJob?.cancel()
        returnedFilesJob?.cancel()
        viewModelScope.launch {
            mutable.update { it.copy(busy = true, error = null) }
            updateBackgroundGate()
            try {
                action()
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                mutable.update { it.copy(error = error.message ?: tr("操作失败，请重试")) }
            } finally {
                mutable.update { it.copy(busy = false) }
                updateBackgroundGate()
            }
        }
    }

    fun refresh() = launchAction {
        refreshFiles(includeGraft = false)
        recoverMerge()
        if (mutable.value.tab == MainTab.Sync)
            mutable.update { it.copy(graft = repository.graftStatus()) }
        recoverShares()
    }

    // Keep unfinished pairing input across Files/Sync navigation, only in memory.
    internal var peerPairingCode = ""
    internal var peerSelectedDevice: String? = null
    private var peerJob: Job? = null

    fun cancelPeerPairing() {
        peerJob?.cancel()
    }

    fun pairPeer(code: String) {
        if (peerJob?.isActive == true) return
        peerJob =
            viewModelScope.launch {
                mutable.update {
                    it.copy(
                        peerBusy = true,
                        peerWaitingComputer = null,
                        peerProgress = null,
                        peerMessage = tr("正在连接电脑"),
                        error = null,
                    )
                }
                var pairingConnection: PeerConnection? = null
                var accepted = false
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
                    pairingConnection = connection
                    val approved =
                        if (known != null) org.json.JSONObject().put("token", known.token)
                        else
                            connection.cancellable {
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
                                                        .put(
                                                            "name",
                                                            android.os.Build.MODEL.take(80),
                                                        ),
                                                    timeoutMillis = 10_000,
                                                )
                                            }
                                        check(result.optString("state") != "rejected") {
                                            tr("电脑已拒绝此设备，请在电脑上生成新的配对码后重试")
                                        }
                                        if (result.optString("state") != "approved") {
                                            mutable.update {
                                                it.copy(
                                                    peerWaitingComputer = invitation.name,
                                                    peerMessage =
                                                        tr("请到「{0}」的 Eidos Lite 配对弹窗点击「接受」。若未看到弹窗，请点击系统通知，或打开「设置 → 设备」。", invitation.name),
                                                )
                                            }
                                            delay(1000)
                                        }
                                    }
                                    result
                                }
                            }
                    accepted = true
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
                    peerSelectedDevice = trusted.fingerprint
                    mutable.update {
                        it.copy(
                            peerDevices = PeerConnection.devices(getApplication()),
                            peerSpaces =
                                it.peerSpaces.filter { peer ->
                                    peer.fingerprint != trusted.fingerprint
                                } + available,
                            peerMessage = "设备已连接，请选择要同步的 Space",
                        )
                    }
                } catch (error: kotlinx.coroutines.TimeoutCancellationException) {
                    mutable.update { it.copy(peerMessage = tr("等待电脑授权超时，请在电脑上生成新的配对码后重试")) }
                } catch (error: CancellationException) {
                    mutable.update { it.copy(peerMessage = tr("配对已取消")) }
                    throw error
                } catch (error: Exception) {
                    mutable.update {
                        it.copy(
                            error =
                                error.message?.replace(
                                    "Pairing code expired",
                                    tr("配对码已过期，请在电脑上生成新的配对码"),
                                ),
                            peerMessage = tr("配对未完成"),
                        )
                    }
                } finally {
                    if (!accepted)
                        kotlinx.coroutines.withContext(
                            kotlinx.coroutines.NonCancellable + kotlinx.coroutines.Dispatchers.IO
                        ) {
                            runCatching {
                                pairingConnection?.call("/pair/cancel", timeoutMillis = 3000)
                            }
                        }
                    mutable.update { it.copy(peerBusy = false, peerWaitingComputer = null) }
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
                var available: List<PeerSpace>? = null
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
                            val spaces = connection.spaces(timeoutMillis = 2000)
                            available = spaces
                            PeerAvailability(true, spaces.map { it.id }.toSet())
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
                            peerAvailability = it.peerAvailability + (device.fingerprint to result),
                            peerSpaces =
                                available?.let { spaces ->
                                    it.peerSpaces.filter { peer ->
                                        peer.fingerprint != device.fingerprint
                                    } + spaces
                                } ?: it.peerSpaces,
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
                        tr("请先配对设备")
                    }
                val connected = PeerConnection.reconnect(getApplication(), device)
                connected.spaces().also { connected.saveDevice(getApplication()) }
            }
        mutable.update {
            it.copy(
                peerSpaces =
                    it.peerSpaces.filter { peer -> peer.fingerprint != fingerprint } + available,
                peerMessage = if (available.isEmpty()) tr("电脑尚未开放 Space") else tr("选择要同步的 Space"),
            )
        }
    }

    fun forgetPeerDevice(fingerprint: String) = launchAction {
        PeerConnection.forgetDevice(getApplication(), fingerprint)
        mutable.update {
            it.copy(
                peerDevices = PeerConnection.devices(getApplication()),
                peerSpaces = it.peerSpaces.filter { peer -> peer.fingerprint != fingerprint },
            )
        }
    }

    private fun launchPeerSync(
        name: String = mutable.value.spaceName,
        fingerprint: String? = null,
        remoteId: String? = null,
        action: suspend () -> Unit,
    ) {
        if (mutable.value.busy || peerJob?.isActive == true) return
        graftRefreshJob?.cancel()
        peerJob =
            viewModelScope.launch {
                mutable.update {
                    it.copy(
                        peerBusy = true,
                        peerProgress =
                            PeerSyncProgress(
                                spaceName = name,
                                fingerprint = fingerprint,
                                remoteId = remoteId,
                            ),
                        peerMessage = null,
                        error = null,
                    )
                }
                updateBackgroundGate()
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
                                    stage = tr("同步完成"),
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
                                    stage =
                                        if (error is CancellationException) tr("同步已中断") else tr("同步未完成"),
                                    finishedAt = android.os.SystemClock.elapsedRealtime(),
                                    error = error.message ?: tr("请稍后重试"),
                                )
                        )
                    }
                    if (error is CancellationException) throw error
                } finally {
                    mutable.update { it.copy(peerBusy = false) }
                    updateBackgroundGate()
                }
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

    private fun reportGraftTransfer(value: JSONObject) {
        mutable.update { state ->
            val download = value.optJSONObject("download")
            val upload = value.optJSONObject("upload")
            state.copy(
                peerProgress =
                    state.peerProgress?.copy(
                        stage = peerDownloadStage(state.peerProgress.stage, download?.optBoolean("planned") == true),
                        downloadBytes = download?.optLong("transferred") ?: 0,
                        downloadTotal =
                            download?.takeUnless { it.isNull("total") }?.optLong("total"),
                        downloadPlanned = download?.optBoolean("planned") == true,
                        uploadBytes = upload?.optLong("transferred") ?: 0,
                        uploadTotal = upload?.takeUnless { it.isNull("total") }?.optLong("total"),
                        uploadPlanned = upload?.optBoolean("planned") == true,
                    )
            )
        }
    }

    fun connectPeerSpace(space: PeerSpace) =
        launchPeerSync(space.name, space.fingerprint, space.id) {
            check(mutable.value.webFile == null && mutable.value.pluginFile == null) { tr("请先完成编辑") }
            val connection =
                kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
                    val device =
                        checkNotNull(
                            PeerConnection.load(getApplication(), "device-${space.fingerprint}")
                        ) {
                            tr("请先配对设备")
                        }
                    PeerConnection.reconnect(
                        getApplication(),
                        PeerConnection(space.url, device.fingerprint, device.token, device.name),
                        space.id,
                    )
                }
            val local = catalog.getOrCreatePeerSpace(space.fingerprint, space.id, space.name)
            val id = local.id
            connection.save(getApplication(), id)
            connection.saveDevice(getApplication())
            // An initial copy stays outside navigation until all files are
            // received and written to the local worktree.
            val destination = SpaceRepository(getApplication(), id)
            try {
                destination.syncPeer(
                    connection,
                    ::reportPeerTransfer,
                    ::reportGraftTransfer,
                    ::reportPeerStage,
                )
                destination.finalizePeerDownload(::reportPeerStage)
                catalog.completePeerSpace(space.fingerprint, space.id, local)
            } finally {
                destination.close()
            }
            activateSpace(id)
            reportPeerStage(tr("正在刷新本地文件列表"))
            refreshFiles(includeGraft = false)
            mutable.update { it.copy(peerMessage = tr("已同步，可离线使用")) }
        }

    fun syncPeer() = launchPeerSync { syncCurrentPeer() }

    fun syncPeerSpace(id: String) {
        val local = catalog.peerLocalSpaces().firstOrNull { it.id == id } ?: return
        launchPeerSync(local.name, local.fingerprint, local.remoteId) {
            activateSpace(id)
            syncCurrentPeer()
        }
    }

    fun beginPeerPairing() {
        if (!mutable.value.peerBusy)
            mutable.update { it.copy(peerProgress = null, peerMessage = null, error = null) }
    }

    fun openPeerFiles(id: String) = launchAction {
        activateSpace(id)
        mutable.update { it.copy(tab = MainTab.Files, peerProgress = null) }
    }

    private suspend fun syncCurrentPeer() {
        check(mutable.value.webFile == null && mutable.value.pluginFile == null) { tr("请先完成编辑") }
        val connection =
            kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
                PeerConnection.load(getApplication(), repository.spaceId)?.let { saved ->
                    val remoteSpace =
                        checkNotNull(
                            catalog.peerRemoteSpace(saved.fingerprint, repository.spaceId)
                        ) {
                            tr("请从已配对设备中重新选择此 Space")
                        }
                    PeerConnection.reconnect(getApplication(), saved, remoteSpace).also {
                        it.save(getApplication(), repository.spaceId)
                        it.saveDevice(getApplication())
                    }
                }
            }
        checkNotNull(connection) { tr("此 Space 尚未配对电脑") }
        repository.syncPeer(
            connection,
            ::reportPeerTransfer,
            ::reportGraftTransfer,
            ::reportPeerStage,
        )
        reportPeerStage(tr("正在刷新本地文件列表"))
        refreshFiles(includeGraft = false)
        mutable.update { it.copy(peerMessage = tr("已与 {0} 同步", connection.name)) }
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
        check(mutable.value.pendingShares.isEmpty()) { tr("请先完成编辑或分享") }
        BackgroundSync.pauseAutomatic(getApplication(), repository.spaceId, tr("自动同步已暂停：正在处理合并"))
        BackgroundSync.cancel(getApplication(), repository.spaceId)
        try {
            val review = repository.beginMerge()
            mutable.update {
                it.copy(syncMessage = if (review == null) tr("当前没有需要处理的合并") else tr("已准备合并，请检查结果"))
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
                it.copy(syncMessage = if (abort) tr("合并已中止，已恢复本地版本") else tr("合并已保存到本机；点击立即同步上传"))
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
        val favoriteFiles = repository.favoriteFiles(favorites)
        val spaces = catalog.spaces()
        val graft = if (includeGraft) repository.graftStatus() else mutable.value.graft
        mutable.update {
            it.copy(
                files = files,
                graft = graft,
                recent = recent,
                favorites = favorites,
                favoriteFiles = favoriteFiles,
                spaceId = repository.spaceId,
                spaceName =
                    spaces.find { space -> space.id == repository.spaceId }?.name ?: tr("本地 Space"),
                spaces = spaces,
                pendingClone = cloneJournal.pending(),
            )
        }
    }

    fun switchSpace(id: String) = launchAction { activateSpace(id) }

    internal fun deleteLocalSpaceAfterUnlock(id: String) = launchAction {
        require(mutable.value.spaceId == id) { tr("当前 Space 已变更，请重新确认删除") }
        val old = repository
        BackgroundSync.setAutomatic(getApplication(), id, false)
        BackgroundSync.cancel(getApplication(), id)
        val next =
            catalog.spaces().firstOrNull { it.id != id }
                ?: catalog.create(
                    if (mutable.value.spaceName == tr("本机 Space")) tr("新的 Space") else tr("本机 Space")
                )
        activateSpace(next.id)
        try {
            old.deleteLocalSpace()
        } finally {
            mutable.update {
                it.copy(
                    spaces = catalog.spaces(),
                    peerLocalSpaces = catalog.peerLocalSpaces(),
                    peerProgress = null,
                )
            }
        }
        mutable.update { it.copy(captureNotice = tr("已删除本地 Space，电脑上的副本保留")) }
    }

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
                check(session.subject == page.subject) { tr("账号已改变，请重新打开发布页面") }
                check(remove || !page.file.eidos || session.plan != "free") {
                    tr("发布 .eidos 文件需要 Publish Pro")
                }
                check(remove || access !in listOf("private", "password") || session.privateAccess) {
                    tr("当前套餐不支持此访问方式")
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
        check(mutable.value.graft?.remoteUrl == null) { tr("当前 Space 已连接远程") }
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
            it.copy(graft = graft, syncMessage = tr("已连接云端 Space。请进入同步设置，首次发布本机版本，然后使用同步。"))
        }
    }

    fun useAccountForRemote() = launchAction {
        val url = checkNotNull(mutable.value.graft?.remoteUrl)
        val credential =
            kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
                SyncEnvironment.requireRemote(url)
                check(account.repositories().any { it.url == url }) { tr("此云端 Space 不属于当前账号") }
                account.credential()
            }
        val graft = repository.connectRemote(url, credential)
        mutable.update { it.copy(graft = graft, syncMessage = tr("此 Space 已改用账号登录，凭证会自动刷新")) }
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
            mutable.update { it.copy(cloudSpaces = null, captureNotice = tr("云端 Space 已下载，可离线使用")) }
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
            mutable.update { it.copy(captureNotice = tr("远程 Space 已下载到本机，可离线使用")) }
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
                mutable.update { it.copy(captureNotice = tr("远程 Space 已下载到本机，可离线使用")) }
            }
        } finally {
            mutable.update {
                it.copy(pendingClone = cloneJournal.pending(), downloadProgress = null)
            }
        }
    }

    private suspend fun activateSpace(id: String) {
        require(catalog.spaces().any { it.id == id }) { tr("Space 已不存在") }
        if (repository.spaceId == id) return
        navigationVersion++
        searchVersion++
        searchJob?.cancelAndJoinSafely()

        val current = mutable.value

        val next = SpaceRepository(getApplication(), id)
        val files = next.files("")
        val recent = next.recent()
        val favorites = next.favorites()
        val favoriteFiles = next.favoriteFiles(favorites)
        repository.close()
        catalog.select(id)
        repository = next
        documentHistory.clear()

        val spaces = catalog.spaces()
        mutable.value =
            AppState(
                fileSort = current.fileSort,
                tab =
                    if (current.peerProgress?.finishedAt == null && current.peerProgress != null)
                        MainTab.Sync
                    else MainTab.Files,
                peerProgress = current.peerProgress?.takeIf { it.finishedAt == null },
                peerBusy = current.peerBusy,
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
                favoriteFiles = favoriteFiles,
                busy = current.busy,
            )
        recoverMerge()
        recoverShares()
        mutable.update { it.copy(graft = repository.graftStatus()) }
    }

    fun toggleFavorite(favorite: Favorite) = launchAction {
        val selected = mutable.value.favorites.none { it.key == favorite.key }
        val favorites = repository.setFavorite(favorite, selected)
        val favoriteFiles = repository.favoriteFiles(favorites)
        mutable.update { it.copy(favorites = favorites, favoriteFiles = favoriteFiles) }
    }

    fun openFavorite(favorite: Favorite, addRecord: Boolean = false, done: () -> Unit = {}) =
        launchAction {
            openTarget(favorite.path, favorite.tableId, addRecord)
            done()
        }

    fun tab(tab: MainTab) {
        if (mutable.value.busy) return
        mutable.update { it.copy(tab = tab) }
        if (tab == MainTab.Sync) refreshGraft() else graftRefreshJob?.cancel()
    }

    private var graftRefreshJob: Job? = null

    fun refreshGraft() {
        if (mutable.value.busy || graftRefreshJob?.isActive == true) return
        val source = repository
        // A read can queue behind background sync. Keep cached content and navigation usable.
        graftRefreshJob =
            viewModelScope.launch {
                try {
                    val review = source.mergeReview()
                    val graft = source.graftStatus()
                    if (repository !== source || mutable.value.tab != MainTab.Sync) return@launch
                    mutable.update {
                        it.copy(
                            mergeReview = review,
                            mergeComparison = null,
                            graft = graft,
                            syncMessage = null,
                        )
                    }
                } catch (error: CancellationException) {
                    throw error
                } catch (error: Exception) {
                    if (repository === source && mutable.value.tab == MainTab.Sync)
                        mutable.update { it.copy(syncMessage = error.message ?: tr("无法读取同步状态，请重试")) }
                }
            }
    }

    fun checkpoint() = launchAction {
        val graft = repository.checkpoint()
        val versions = repository.localVersions()
        mutable.update { it.copy(graft = graft, localVersions = versions, syncMessage = null) }
    }

    fun refreshLocalVersions() = launchAction {
        val graft = repository.graftStatus()
        val versions = repository.localVersions()
        mutable.update { it.copy(graft = graft, localVersions = versions, syncMessage = null) }
    }

    fun showPeerVersions(id: String) = launchAction {
        activateSpace(id)
        val graft = repository.graftStatus()
        val versions = repository.localVersions()
        mutable.update { it.copy(graft = graft, localVersions = versions, syncMessage = null) }
    }

    fun connectRemote(url: String, token: String, done: () -> Unit) = launchAction {
        val graft = repository.connectRemote(url, token)
        mutable.update { it.copy(graft = graft, syncMessage = tr("连接配置已保存，尚未验证远程访问")) }
        done()
    }

    fun disconnectRemote() = launchAction {
        BackgroundSync.setAutomatic(getApplication(), repository.spaceId, false)
        BackgroundSync.cancel(getApplication(), repository.spaceId)
        val graft = repository.disconnectRemote()
        mutable.update { it.copy(graft = graft, syncMessage = tr("已清除本机同步凭证，文件仍保留在本机")) }
    }

    fun enqueueBackgroundSync() = launchAction {
        check(mutable.value.webFile == null) { tr("请先完成编辑再同步") }
        check(repository.graftStatus().remoteUrl != null) { tr("请先连接远程 Space") }
        BackgroundSync.enqueue(getApplication(), repository.spaceId)
        mutable.update { it.copy(syncMessage = tr("任务已加入后台队列，离开应用后在有网络时运行")) }
    }

    fun cancelBackgroundSync() {
        BackgroundSync.cancel(getApplication(), repository.spaceId)
    }

    fun setAutomaticSync(enabled: Boolean) = launchAction {
        if (enabled) check(repository.graftStatus().remoteUrl != null) { tr("请先连接远程 Space") }
        BackgroundSync.setAutomatic(getApplication(), repository.spaceId, enabled)
    }

    fun syncRemote(publish: Boolean = false) = launchAction {
        check(mutable.value.webFile == null) { tr("请先完成编辑再同步") }
        navigationVersion++

        mutable.update { it.copy(syncMessage = null) }
        mutable.update { it.copy(syncing = true) }
        try {
            val outcome = repository.syncRemote(publish)
            if (outcome == "needs_merge")
                BackgroundSync.pauseAutomatic(
                    getApplication(),
                    repository.spaceId,
                    tr("自动同步已暂停：需要合并本地与远端版本"),
                )
            val graft = repository.graftStatus()
            mutable.update {
                it.copy(
                    graft = graft,
                    syncMessage =
                        if (outcome == "needs_merge") tr("双方都有新版本，需要合并。本地修改和远端版本均已保留，点击检查并合并继续。")
                        else if (publish) tr("本机版本已发布到远程") else tr("本次同步已完成"),
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

    fun openWithPlugin(file: SpaceFile, viewId: String) = launchAction {
        val current = mutable.value
        check((current.webFile == null || current.webFile.path == file.path) && current.pluginFile == null)
        val actual = repository.file(file.path)
        val view = pluginOpenWith.resolve(actual, viewId)
        require(actual.eidos || actual.bytes <= if (view.document) 2 * 1024 * 1024 else 16 * 1024 * 1024) {
            tr("文件超过插件读取大小限制")
        }
        val snapshot = if (view.document) repository.pluginTextSnapshot(actual.path) else null
        val source = pluginMarket.source(current.spaceId, view)
        require(pluginMarket.authorized(current.spaceId, view)) { tr("插件授权已变更") }
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

    fun leaveWebEditor() {
        if (mutable.value.shareRecord != null) {
            closeShareTable()
            return
        }
        if (mutable.value.busy) return
        if (documentHistory.isNotEmpty()) {
            val path = documentHistory.removeAt(documentHistory.lastIndex)
            launchAction { openTarget(path) }
            return
        }
        mutable.update { it.copy(webFile = null) }
        updateBackgroundGate()
        refreshReturnedFiles()
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
                        mutable.update { it.copy(error = error.message ?: tr("文件信息更新失败")) }
                }
            }
    }

    fun openMarkdownLink(source: String, destination: String) = launchAction {
        check(mutable.value.webFile?.path == source) { tr("文档已关闭") }
        val path = markdownLocalPath(source, destination)
        val file = repository.file(path)
        require(file.markdown || file.eidos) { tr("此链接文件暂不支持预览，请从文件列表导出") }
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
        query: String = "",
    ) {
        navigationVersion++
        val file = repository.file(path)
        when {
            file.markdown || file.eidos ->
                mutable.update {
                    it.copy(
                        webFile = file,
                        editorGeneration = it.editorGeneration + 1,
                        webTableId = tableId,
                        webQuery = query,
                        webAddRecord = addRecord,
                    )
                }
            file.directory -> {
                val files = repository.files(path)
                mutable.update { it.copy(folder = path, files = files, tab = MainTab.Files) }
            }
            else ->
                mutable.update { it.copy(attachmentPreview = repository.filePreview(file.path)) }
        }
    }

    fun back() = launchAction {
        navigationVersion++
        val folder = mutable.value.folder.substringBeforeLast('/', "")
        val files = repository.files(folder)
        val recent = repository.recent()
        mutable.update { it.copy(folder = folder, files = files, recent = recent) }
    }

    fun trash(file: SpaceFile) = launchAction {
        repository.trash(file.path)
        documentHistory.removeAll { it == file.path || it.startsWith(file.path + "/") }
        mutable.update {
            if (it.webFile?.path == file.path || it.webFile?.path?.startsWith(file.path + "/") == true)
                it.copy(webFile = null, editorGeneration = it.editorGeneration + 1)
            else it
        }
        refreshFiles()
    }

    fun rename(file: SpaceFile, name: String, done: () -> Unit) = launchAction {
        val path = repository.rename(file.path, name)
        if (mutable.value.webFile?.path == file.path) {
            val renamed = repository.file(path)
            mutable.update { it.copy(webFile = renamed, editorGeneration = it.editorGeneration + 1) }
        }
        refreshFiles()
        done()
    }

    fun create(name: String, kind: String, done: () -> Unit) = launchAction {
        val path =
            if (name.isEmpty()) repository.createUntitled(mutable.value.folder, kind)
            else repository.create(mutable.value.folder, name, kind)
        refreshFiles()
        openTarget(path)
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
                check(repository === owner) { tr("Space 已切换，请重新选择导入文件") }
                mutable.update { it.copy(captureNotice = null) }
                action(folder)
            }
        }
    }

    fun import(uri: Uri) = importResult { folder ->
        val path = repository.importFile(uri, folder)
        mutable.update { it.copy(captureNotice = tr("已导入 {0} 到本机", path.substringAfterLast('/'))) }
        refreshFiles(includeGraft = false)
    }

    fun export(path: String, uri: Uri) = launchAction { repository.exportFile(path, uri) }

    fun importDirectory(uri: Uri) = importResult { folder ->
        repository.importDirectory(uri, folder)
        mutable.update { it.copy(captureNotice = tr("目录已完整导入本机")) }
        refreshFiles(includeGraft = false)
    }

    fun exportDirectory(path: String, uri: Uri) = launchAction {
        check(mutable.value.webFile == null) { tr("请先关闭编辑器") }
        repository.exportDirectory(path, uri)
        mutable.update { it.copy(captureNotice = tr("目录已完整导出")) }
    }

    fun receiveShare(files: List<Uri>, text: String?) {
        val receivingSpace = repository.spaceId
        viewModelScope.launch {
            state.first { !it.busy }
            launchAction {
                val received = ShareInbox(getApplication(), receivingSpace).receive(files, text)
                if (receivingSpace != repository.spaceId) {
                    mutable.update { it.copy(captureNotice = tr("分享已暂存，请切换回接收时的 Space 继续处理")) }
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
        if (saved.isEmpty()) {
            mutable.update { it.copy(pendingShares = emptyList()) }
            return
        }
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
        check(!share.submitting) { tr("请先检查上次保存的结果") }
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
    }

    fun closeShareTable() = launchAction {
        mutable.update { it.copy(shareDatabase = null, shareRecord = null) }

        recoverShares()
    }

    fun openShareTable(path: String, tableId: String? = null) = launchAction {
        val share = mutable.value.pendingShares.firstOrNull() ?: return@launchAction
        require(share.files.isNotEmpty() || !share.text.isNullOrBlank()) { tr("分享内容为空") }

        val page = repository.loadEidos(path, tableId)
        if (tableId == null) {
            mutable.update { it.copy(shareDatabase = page) }
        } else {
            require(page.table?.id == tableId) { tr("目标表已不存在，请重新选择") }
            val field =
                page.fields.firstOrNull {
                    it.id == page.table.labelFieldId &&
                        it.editable &&
                        it.kind in setOf("text", "url")
                } ?: page.fields.firstOrNull { it.editable && it.kind == "text" }
            if (!share.text.isNullOrBlank()) requireNotNull(field) { tr("这张表没有可写入分享文本的字段") }
            val attachmentField = page.fields.firstOrNull { it.kind == "file" && it.writable }
            if (share.files.isNotEmpty())
                requireNotNull(attachmentField) { tr("这张表没有可写入的附件字段，请选择其他表或文件夹") }

            val initial =
                org.json
                    .JSONObject()
                    .apply {
                        if (field != null)
                            put(field.id, share.text?.takeIf { it.isNotBlank() } ?: tr("分享附件"))
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
                    editorGeneration = it.editorGeneration + 1,
                    shareAttachmentFieldId = form.attachmentField,
                )
            }
        }
    }

    suspend fun saveShareRecord(values: Map<String, Any>, expectedRevision: String? = null) {
        val currentPage = checkNotNull(mutable.value.shareRecord)
        val share = checkNotNull(mutable.value.pendingShares.firstOrNull())
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

            // Complete post-commit bookkeeping before replacing the bridge's screen.
            // The file write must not be cancelled by its own successful navigation.
            kotlinx.coroutines.withContext(kotlinx.coroutines.NonCancellable) {
                ShareInbox(getApplication(), repository.spaceId).remove(share.inboxId)
                try {
                    repository.rememberShareTable(page)
                    documentHistory.clear()
                    openTarget(page.path, page.table?.id)
                } finally {
                    mutable.update {
                        it.copy(
                            shareRecord = null,
                            shareDatabase = null,
                            pendingShares = it.pendingShares.drop(1),
                            captureNotice = tr("已保存到{0}", page.table?.name),
                            lastShareTable =
                                Favorite(page.path, checkNotNull(page.table).name, page.table.id),
                        )
                    }
                }
            }
        }
    }

    suspend fun selectShareAttachmentField(fieldId: String) {
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
        committingShare(share, mutable.value.shareFolder.ifEmpty { tr("Space 根目录") }) {
            val folder = mutable.value.shareFolder

            val result = repository.captureFiles(share.files, folder)
            val failures = result.failures.toMutableList()
            val caption =
                try {
                    share.text?.takeIf { it.isNotBlank() }?.let { repository.capture(it, folder) }
                } catch (error: CancellationException) {
                    throw error
                } catch (error: Exception) {
                    failures.add(tr("附带文本：{0}", error.message))
                    null
                }
            documentHistory.clear()
            navigationVersion++
            val count = result.paths.size + if (caption == null) 0 else 1
            if (count == 0) error(failures.joinToString("\n").ifEmpty { tr("分享内容为空") })
            if (failures.isEmpty())
                ShareInbox(getApplication(), repository.spaceId).remove(share.inboxId)
            // Partial imports retain their staged bytes and require review before retrying.
            // Imports have committed. Dismiss before any optional preference or refresh failure
            // so retrying those operations cannot duplicate successful files.
            mutable.update {
                it.copy(
                    tab = MainTab.Files,
                    folder = folder,
                    pendingShares = it.pendingShares.drop(1),
                    captureNotice = tr("已存入{0}：{1} 个文件", folder.ifEmpty { tr("Space 根目录") }, count),
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
        openTarget(match.file.path, match.tableId, query = match.query)
        documentHistory.clear()
    }
}

private suspend fun Job.cancelAndJoinSafely() {
    cancel()
    join()
}
