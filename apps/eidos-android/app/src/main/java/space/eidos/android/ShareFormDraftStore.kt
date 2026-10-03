package space.eidos.android

/** A share's form values live in the same durable inbox entry as its attachments. */
class ShareFormDraftStore(private val inbox: ShareInbox, private val id: String) :
    RecordDraftStorage {
    override suspend fun load(path: String, table: String, row: String?): RecordDraft? =
        inbox.form(id, path, table)?.let { RecordDraft(it.revision, it.changes) }

    override suspend fun save(path: String, table: String, row: String?, draft: RecordDraft) {
        inbox.updateForm(id, path, table, draft = draft)
    }

    override suspend fun clear(path: String, table: String, row: String?) {
        inbox.clearForm(id, path, table)
    }
}
