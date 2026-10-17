import { RepositoryDurableObject as GraftRepositoryDurableObject } from "@eidos.space/graft-remote-cloudflare"

interface PendingUploadRow {
  [key: string]: SqlStorageValue
  path: string
  upload_id: string
}

export class RepositoryDurableObject extends GraftRepositoryDurableObject {
  async purgeForDeletion(repositoryId: string): Promise<void> {
    if (!/^u-[0-9a-f]{24}\/[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(repositoryId))
      throw new TypeError("Invalid repository identity")
    if (
      !this.ctx.id.equals(this.env.GRAFT_REPOSITORIES.idFromName(repositoryId))
    )
      throw new TypeError("Repository identity does not match this object")
    // Maintenance is pinned to graft-remote-cloudflare 0.2.5. Abort its R2
    // multipart resources before clearing SQL; encrypted staging objects are
    // removed by the directory's repository-prefix cleanup.
    const exists =
      this.ctx.storage.sql
        .exec(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'multipart_uploads'"
        )
        .toArray().length > 0
    if (exists) {
      for (const row of this.ctx.storage.sql
        .exec<PendingUploadRow>("SELECT path, upload_id FROM multipart_uploads")
        .toArray()) {
        await this.env.GRAFT_OBJECTS.resumeMultipartUpload(
          "repositories/" + repositoryId + "/objects/" + row.path,
          row.upload_id
        ).abort()
        await this.deleteMultipartUpload(row.path, row.upload_id)
      }
    }
    await this.ctx.storage.deleteAll()
  }
}
