import { Octokit } from "@octokit/rest"

import { BaseBackupServer } from "./base"

export class GithubBackupServer extends BaseBackupServer {
  octokit: Octokit

  constructor(
    private token: string,
    private owner: string,
    private repo: string
  ) {
    super()
    this.octokit = new Octokit({
      auth: this.token,
    })
  }

  async getFile(path: string): Promise<File | null> {
    const { data } = await this.octokit.repos.getContent({
      owner: this.owner,
      repo: this.repo,
      path,
    })

    const download_url = "download_url" in data && data.download_url
    if (!download_url) {
      return null
    }
    const response = await fetch(download_url)
    const content = await response.blob()
    const filename = path.split("/").pop()
    return new File([content], filename!)
    // // Decode the base64 file
    // const decodedData = atob(content)

    // // Transform the decoded data into a Uint8Array
    // const arrayBuffer = new Uint8Array(decodedData.length)
    // for (let i = 0; i < decodedData.length; i++) {
    //   arrayBuffer[i] = decodedData.charCodeAt(i)
    // }
    // // Create a blob from the Uint8Array
    // const blob = new Blob([arrayBuffer])
    // console.log(blob)
    // // Create a file from the blob
    // const filename = path.split("/").pop()
    // console.log(filename)
    // const file = new File([blob], filename!)
    // console.log(file)
    // return file
  }

  async deleteFile(path: string): Promise<void> {
    try {
      const { data } = await this.octokit.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path,
      })
      if ((data as any).type !== "file") {
        console.log(`Not a file ${path}`)
        return
      }
      const sha = (data as any).sha
      await this.octokit.repos.deleteFile({
        owner: this.owner,
        repo: this.repo,
        path,
        sha,
        message: `delete file ${path}`, // commit message
      })
      console.log(`Deleted file ${path}`)
    } catch (error) {
      console.error(error)
    }
  }

  async getLastModifiedTime(file: string): Promise<Date | null> {
    try {
      const { data } = await this.octokit.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path: file,
      })
      const sha = (data as any).sha
      const { data: commitData } = await this.octokit.repos.getCommit({
        owner: this.owner,
        repo: this.repo,
        ref: "main",
      })
      return new Date(commitData.commit.committer!.date!)
    } catch (error) {
      console.error(error)
      return null
    }
  }

  async dirExists(path: string) {
    try {
      await this.octokit.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path,
      })
      return true
    } catch (error) {
      if ((error as any).status === 404) {
        return false
      }
      throw error
    }
  }

  async walk(directory: string): Promise<string[]> {
    const isExist = await this.dirExists(directory)
    if (!isExist) {
      return []
    }
    return this._walk(directory)
  }

  async _walk(directory: string): Promise<string[]> {
    const { data } = await this.octokit.repos.getContent({
      owner: this.owner,
      repo: this.repo,
      path: directory,
    })
    // walk github dir
    const paths: string[] = []
    if (!Array.isArray(data)) {
      return paths
    }
    for (let item of data) {
      if (item.type === "file") {
        paths.push(item.path)
      } else if (item.type === "dir") {
        const subPaths = await this.walk(item.path)
        paths.push(...subPaths)
      }
    }
    return paths
  }

  uploadFile(path: string, file: File): Promise<void> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = async () => {
        const content = btoa(reader.result as string)
        let sha: string | undefined
        try {
          const { data } = await this.octokit.repos.getContent({
            owner: this.owner,
            repo: this.repo,
            path: path,
          })
          if (data && "sha" in data) {
            sha = data.sha
          }
        } catch (error) {
          // File probably doesn't exist, we'll try to create it
        }
        try {
          await this.octokit.repos.createOrUpdateFileContents({
            owner: this.owner,
            repo: this.repo,
            content,
            path: path,
            message: "Upload a file",
            sha,
          })
          resolve()
        } catch (error) {
          reject(error)
        }
      }
      reader.onerror = (error) => reject(error)
      reader.readAsBinaryString(file)
    })
  }
}
