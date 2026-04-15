import { defineAdapter, $ } from "../../index.js"

export default defineAdapter({
  meta: {
    site: "bilibili",
    name: "favorites",
    description: "Bilibili Favorites",
    domain: "www.bilibili.com",
    version: "1.0",
  },

  protocol: {
    strategy: "cookie",
    browser: true,
    entryPoint: "https://www.bilibili.com",
  },

  sync: {
    incremental: true,
  },

  args: {
    folder_id: {
      type: "string",
      required: false,
      description:
        "Favorite folder ID (media_id). Syncs all folders if not specified.",
    },
  },

  async fetch(ctx) {
    const { browser } = ctx
    await browser.navigate("https://www.bilibili.com")
    await browser.settle(2000)

    const dedeUserID = await browser.evaluate<string, []>(() => {
      // @ts-ignore
      return document.cookie.match(/DedeUserID=([^;]+)/)?.[1] || ""
    })

    if (!dedeUserID) {
      throw new Error(
        "Not logged in to Bilibili. Please log in to www.bilibili.com first."
      )
    }

    ctx.log(`User ID: ${dedeUserID}`)

    // Fetch favorite folders (small payload, return object directly)
    const foldersResult = await browser.evaluate<any, [string]>(
      async (upMid) => {
        try {
          const res = await fetch(
            `https://api.bilibili.com/x/v3/fav/folder/created/list-all?up_mid=${upMid}`,
            { credentials: "include" }
          )
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          return await res.json()
        } catch (e: any) {
          return { code: -1, message: e?.message || String(e) }
        }
      },
      dedeUserID
    )

    if (foldersResult?.code !== 0) {
      throw new Error(
        `Failed to fetch favorite folders: ${foldersResult?.message || "unknown"}`
      )
    }

    const allFolders = (foldersResult.data?.list || []).filter(
      (f: any) => f.media_count > 0
    )

    let targetFolders = allFolders
    const argFolderId = ctx.args.folder_id
    if (argFolderId) {
      targetFolders = allFolders.filter(
        (f: any) => String(f.id) === argFolderId
      )
      if (targetFolders.length === 0) {
        throw new Error(`未找到指定的收藏夹 ID: ${argFolderId}`)
      }
    }

    ctx.log(`Found ${targetFolders.length} favorite folder(s) to sync`)

    const batchBase = Date.now()
    const newVideos: Array<{ data: any; folder: any; position: number }> = []
    let globalIndex = 0

    for (const folder of targetFolders) {
      ctx.log(`Syncing folder: ${folder.title} (${folder.media_count} videos)`)
      let pn = 1

      while (true) {
        // Return JSON string to avoid Electron IPC serialization issues
        const jsonStr = await browser.evaluate<string, [number, number]>(
          async (mediaId, pageNum) => {
            try {
              const res = await fetch(
                `https://api.bilibili.com/x/v3/fav/resource/list?media_id=${mediaId}&pn=${pageNum}&ps=20&platform=web`,
                { credentials: "include" }
              )
              if (!res.ok) {
                const text = await res.text().catch(() => "")
                throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`)
              }
              const json = (await res.json()) as any
              // Extract only necessary fields, then JSON.stringify
              const safe = {
                code: json.code,
                message: json.message,
                has_more: json.data?.has_more ?? false,
                medias:
                  json.data?.medias?.map((m: any) => ({
                    id: m.id,
                    type: m.type,
                    title: m.title,
                    cover: m.cover,
                    bvid: m.bvid,
                    intro: m.intro,
                    duration: m.duration,
                    pubtime: m.pubtime,
                    fav_time: m.fav_time,
                    upper: m.upper
                      ? {
                          mid: m.upper.mid,
                          name: m.upper.name,
                          face: m.upper.face,
                        }
                      : undefined,
                    cnt_info: m.cnt_info
                      ? {
                          play: m.cnt_info.play,
                          danmaku: m.cnt_info.danmaku,
                          collect: m.cnt_info.collect,
                        }
                      : undefined,
                  })) || [],
              }
              return JSON.stringify(safe)
            } catch (e: any) {
              return JSON.stringify({
                code: -1,
                message: e?.message || String(e),
              })
            }
          },
          folder.id,
          pn
        )

        // Parse JSON string in Node side
        let listResult: any
        try {
          listResult = JSON.parse(jsonStr)
        } catch (e: any) {
          throw new Error(
            `Failed to parse favorite data: ${e.message}, raw: ${jsonStr.slice(0, 200)}`
          )
        }

        if (listResult?.code !== 0) {
          ctx.log(
            `Failed to fetch favorite contents (${folder.title} page ${pn}): ${listResult?.message}`
          )
          break
        }

        const medias = listResult.medias || []
        const hasMore = listResult.has_more ?? false

        if (medias.length === 0) break

        const allExists = medias.every((m: any) =>
          ctx.sync?.exists(String(m.bvid || m.id))
        )
        if (allExists) {
          ctx.log(
            `Folder ${folder.title}: all items on page ${pn} already exist`
          )
          break
        }

        for (const media of medias) {
          const id = String(media.bvid || media.id)
          if (!ctx.sync?.exists(id)) {
            const position = globalIndex - batchBase
            newVideos.push({ data: media, folder, position })
            globalIndex++
          }
        }

        if (!hasMore || medias.length < 20) break
        pn++
        await browser.settle(800)
      }
    }

    ctx.log(`Fetched ${newVideos.length} new favorite videos`)

    return newVideos.map(({ data, folder, position }) => ({
      entityType: "video",
      entityId: String(data.bvid || data.id),
      data: {
        id: data.id,
        bvid: data.bvid,
        title: data.title,
        url: `https://www.bilibili.com/video/${data.bvid}`,
        cover: data.cover,
        intro: data.intro || "",
        duration: data.duration || 0,
        pubtime: data.pubtime
          ? new Date(data.pubtime * 1000).toISOString()
          : null,
        favTime: data.fav_time
          ? new Date(data.fav_time * 1000).toISOString()
          : null,
        upperMid: data.upper?.mid,
        upperName: data.upper?.name,
        upperFace: data.upper?.face,
        playCount: data.cnt_info?.play || 0,
        danmakuCount: data.cnt_info?.danmaku || 0,
        folderId: folder.id,
        folderTitle: folder.title,
        _syncPosition: position,
      },
      meta: { position, folderId: folder.id },
    }))
  },

  transform(raw) {
    const data = raw.data
    const position = raw.meta?.position ?? 0

    const upperName = data.upperName || "unknown"
    const upperId = $.id("bili_upper", String(data.upperMid || upperName))
    const videoId = $.id("bili_video", data.bvid || String(raw.entityId))

    return {
      agents: [
        {
          id: upperId,
          role: "producer" as const,
          name: upperName,
          avatar_url: data.upperFace || undefined,
          fingerprints: $.fingerprint(
            "bilibili",
            data.upperMid,
            "name",
            upperName
          ),
        },
      ],

      goods: [
        {
          id: videoId,
          category: "video" as const,
          title: $.string(data, "title", "Untitled"),
          summary: $.string(data, "intro", ""),
          producedBy: upperId,
          fingerprints: $.fingerprint("bilibili", data.bvid, "url", data.url),
          useValue: {
            url: data.url,
            cover: data.cover,
            duration: data.duration,
            pubtime: data.pubtime,
            upperName,
            upperFace: data.upperFace,
          },
          exchangeValue: {
            play: data.playCount || 0,
            danmaku: data.danmakuCount || 0,
          },
        },
      ],

      relations: [
        {
          type: "OWNS" as const,
          subject_type: "agent" as const,
          subject_id: "me",
          object_type: "good" as const,
          object_id: videoId,
          context: {
            source: "bilibili/favorites",
            position,
            favTime: data.favTime,
            folderId: data.folderId,
            folderTitle: data.folderTitle,
          },
        },
      ],
    }
  },

  queries: {
    raw: `
      -- @search {title, upper_name}
      -- [title:text]
      -- [upper_name:text]
      -- [play:number]
      -- [danmaku:number]
      -- [url:url]
      -- [cover:file]
      SELECT 
        id,
        json_extract(data, '$.title') as title,
        json_extract(data, '$.intro') as description,
        json_extract(data, '$.upperName') as upper_name,
        json_extract(data, '$.playCount') as play,
        json_extract(data, '$.danmakuCount') as danmaku,
        json_extract(data, '$.url') as url,
        json_extract(data, '$.cover') as cover,
        json_extract(data, '$.folderTitle') as folder_title,
        json_extract(data, '$.favTime') as fav_time
      FROM raw.data
      WHERE source = 'bilibili/favorites'
      ORDER BY json_extract(data, '$._syncPosition') ASC
    `,
  },
})
