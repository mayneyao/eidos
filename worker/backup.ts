import { getSpaceDatabaseFileHandle } from "@/lib/opfs"

/**
 * we use cloudflare R2 to backup data, cloudflare free plan gives us 10GB/month, it's enough for personal usage.
 * this solution is pull-push mode and didn't solve the problem of data consistency. but it's simple and easy to implement.
 */
export class SimpleBackUp {
  // record the last backup time of each space
  lastBackupTimeMap: Map<string, number>
  space: string | null
  constructor(
    private backupUrl: string,
    private token: string,
    private autoBackupGap: number
  ) {
    this.lastBackupTimeMap = new Map()
    this.space = null
  }

  public setConfig(backupUrl: string, token: string, autoBackupGap: number) {
    this.backupUrl = backupUrl
    this.token = token
    this.autoBackupGap = autoBackupGap
  }

  private checkConfig() {
    if (!this.backupUrl || !this.token) {
      throw new Error("backup url or token not set")
    }
  }

  public setCurrentSpace(space: string | null) {
    this.space = space
    console.log("set current space", space)
    this.pull(space)
  }

  public async pull(space: string | null, justCreateNew = false) {
    this.checkConfig()
    if (!space) {
      return
    }
    const url = new URL(this.backupUrl)
    url.pathname = `/${space}`
    const res = await fetch(url, {
      headers: {
        "X-Custom-Auth-Key": this.token,
      },
    })
    if (res.ok) {
      const uploaded = res.headers.get("Uploaded")!
      const date = new Date(uploaded)
      const lastBackupTime = date.getTime()
      console.log("last backup time", lastBackupTime)
      this.lastBackupTimeMap.set(space, lastBackupTime)
      const fileHandle = await getSpaceDatabaseFileHandle(space)
      const file = await fileHandle.getFile()
      const lastModified = file.lastModified
      if (justCreateNew) {
        const arrayBuffer = await res.arrayBuffer()
        console.log(arrayBuffer)
        const writable = await fileHandle.createWritable()
        await writable.write(arrayBuffer)
        await writable.close()
        return
      }
      if (lastBackupTime > lastModified) {
        console.log("need to update", file.name)
        // get binary data then write to file
        const arrayBuffer = await res.arrayBuffer()
        console.log(arrayBuffer)
        const writable = await fileHandle.createWritable()
        await writable.write(arrayBuffer)
        await writable.close()
        console.log(`${space} pull success`)
      } else {
        // has conflict
        console.warn("it's seems that there is a conflict", space)
      }
    } else {
      console.log(`${space} pull failed`, res.status, res.statusText)
      // need backup
      await this.push()
    }
  }

  public async push() {
    this.checkConfig()
    const space = this.space
    if (!space) {
      console.log("no space to backup")
      return
    }
    const fileHandle = await getSpaceDatabaseFileHandle(space)
    const file = await fileHandle.getFile()
    const lastBackupTime = this.lastBackupTimeMap.get(space)
    const lastModified = file.lastModified
    if (lastBackupTime && lastModified && lastBackupTime >= lastModified) {
      console.log("no need to backup")
      return
    }
    console.log("start backup")
    const url = new URL(this.backupUrl)
    url.pathname = `/${space}`
    const binary = await file.arrayBuffer()
    const res = await fetch(url, {
      method: "PUT",
      headers: {
        "X-Custom-Auth-Key": this.token,
      },
      body: binary,
    })
    if (res.ok) {
      this.lastBackupTimeMap.set(space, Date.now())
      console.log(`${space} backup success`)
    } else {
      console.log(`${space} backup failed`, res.status, res.statusText)
    }
  }
  init() {
    setInterval(() => {
      this.push()
    }, this.autoBackupGap * 1000 * 60)
  }
}
