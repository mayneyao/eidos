import BackgroundTasks
import UIKit

enum BackgroundSync {
    static let identifier = "space.eidos.ios.sync"
    static func enabled(_ space: LocalSpace) -> Bool { UserDefaults.standard.bool(forKey: "background-sync:" + LocalSpace.storageIdentity(space.root)) }
    static func setEnabled(_ enabled: Bool, space: LocalSpace) throws {
        if enabled {
            guard try SyncAccount.profile(space) != nil else { throw LocalError.message(tr("请先连接云端 Space")) }
        }
        UserDefaults.standard.set(enabled, forKey: "background-sync:" + LocalSpace.storageIdentity(space.root))
        if enabled { schedule() }
    }
    static func register() {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: identifier, using: nil) { task in
            guard let task = task as? BGProcessingTask else { task.setTaskCompleted(success: false); return }
            let operation = UUID().uuidString
            guard eidos_ios_cancellation(operation, 0) else { task.setTaskCompleted(success: false); return }
            task.expirationHandler = { _ = eidos_ios_cancellation(operation, 1) }
            // Cancel when the user resumes editing; file operations remain serialized until it exits.
            let observer = NotificationCenter.default.addObserver(forName: UIApplication.willEnterForegroundNotification, object: nil, queue: nil) { _ in
                _ = eidos_ios_cancellation(operation, 1)
            }
            if UIApplication.shared.applicationState == .active { _ = eidos_ios_cancellation(operation, 1) }
            LocalSpace.io.async {
                Runtime.cancellation = operation
                var success = true
                do {
                    let catalog = try SpaceCatalog()
                    for entry in catalog.spaces {
                        let space = try LocalSpace(root: catalog.root(entry))
                        guard enabled(space) else { continue }
                        do {
                            guard !DraftStore.shared.hasDraft(under: space.root), !RecordDraftStore.hasDraft(space) else { throw LocalError.message(tr("有待保存草稿，后台同步已暂停")) }
                            try SyncAccount.sync(space)
                            UserDefaults.standard.set(tr("已完成后台同步"), forKey: "background-result:" + entry.id)
                        } catch {
                            success = false
                            UserDefaults.standard.set(error.localizedDescription, forKey: "background-result:" + entry.id)
                        }
                    }
                } catch { success = false }
                Runtime.cancellation = nil
                _ = eidos_ios_cancellation(operation, 2)
                NotificationCenter.default.removeObserver(observer)
                task.setTaskCompleted(success: success)
                schedule()
            }
        }
    }
    static func schedule() {
        guard UserDefaults.standard.dictionaryRepresentation().contains(where: { $0.key.hasPrefix("background-sync:") && $0.value as? Bool == true }) else {
            BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: identifier)
            return
        }
        let request = BGProcessingTaskRequest(identifier: identifier)
        request.requiresNetworkConnectivity = true
        request.earliestBeginDate = Date().addingTimeInterval(15 * 60)
        // iOS decides when to run; an unavailable scheduler does not block local work.
        try? BGTaskScheduler.shared.submit(request)
    }
}
