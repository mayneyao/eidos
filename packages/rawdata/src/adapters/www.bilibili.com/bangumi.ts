import { defineAdapter, $ } from "../../index.js"

interface BangumiItem {
  season_id: number
  media_id: number
  season_type: number
  season_type_name: string
  title: string
  cover: string
  total_count: number
  is_finish: number
  is_started: number
  is_play: number
  badge?: string
  stat?: {
    follow?: number
    view?: number
    danmaku?: number
  }
  rating?: {
    score?: number
    count?: number
  }
  new_ep?: {
    index_show?: string
    pub_time?: string
  }
  publish?: {
    pub_time?: string
    release_date_show?: string
  }
  url?: string
  evaluate?: string
  follow_status: number
  progress?: string
  both_follow?: boolean
  areas?: Array<{ id: number; name: string }>
}

const FOLLOW_STATUS_MAP: Record<number, string> = {
  1: "想看",
  2: "在看",
  3: "看过",
}

export default defineAdapter({
  meta: {
    site: "bilibili",
    name: "bangumi",
    description: "Bilibili Bangumi / Drama",
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
    type: {
      type: "string",
      required: false,
      default: "all",
      description: "Type: 1 = anime, 2 = drama, all = everything",
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

    const types: number[] = []
    const argType = String(ctx.args.type || "all")
    if (argType === "all" || argType === "1") types.push(1)
    if (argType === "all" || argType === "2") types.push(2)

    const batchBase = Date.now()
    const newItems: Array<{
      item: BangumiItem
      type: number
      position: number
    }> = []
    let globalIndex = 0

    for (const type of types) {
      ctx.log(`Syncing bangumi type=${type}`)
      let pn = 1

      while (true) {
        const jsonStr = await browser.evaluate<
          string,
          [string, number, number]
        >(
          async (vmid, pageNum, listType) => {
            try {
              const res = await fetch(
                `https://api.bilibili.com/x/space/bangumi/follow/list?vmid=${vmid}&pn=${pageNum}&ps=30&type=${listType}`,
                { credentials: "include" }
              )
              if (!res.ok) {
                const text = await res.text().catch(() => "")
                throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`)
              }
              const json = (await res.json()) as any
              const safe = {
                code: json.code,
                message: json.message,
                total: json.data?.total ?? 0,
                list:
                  json.data?.list?.map((m: any) => ({
                    season_id: m.season_id,
                    media_id: m.media_id,
                    season_type: m.season_type,
                    season_type_name: m.season_type_name,
                    title: m.title,
                    cover: m.cover,
                    total_count: m.total_count,
                    is_finish: m.is_finish,
                    is_started: m.is_started,
                    is_play: m.is_play,
                    badge: m.badge,
                    stat: m.stat
                      ? {
                          follow: m.stat.follow,
                          view: m.stat.view,
                          danmaku: m.stat.danmaku,
                        }
                      : undefined,
                    rating: m.rating
                      ? { score: m.rating.score, count: m.rating.count }
                      : undefined,
                    new_ep: m.new_ep
                      ? {
                          index_show: m.new_ep.index_show,
                          pub_time: m.new_ep.pub_time,
                        }
                      : undefined,
                    publish: m.publish
                      ? {
                          pub_time: m.publish.pub_time,
                          release_date_show: m.publish.release_date_show,
                        }
                      : undefined,
                    url: m.url,
                    evaluate: m.evaluate,
                    follow_status: m.follow_status,
                    progress: m.progress,
                    both_follow: m.both_follow,
                    areas: m.areas,
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
          dedeUserID,
          pn,
          type
        )

        let result: any
        try {
          result = JSON.parse(jsonStr)
        } catch (e: any) {
          throw new Error(
            `Failed to parse bangumi data: ${e.message}, raw: ${jsonStr.slice(0, 200)}`
          )
        }

        if (result?.code !== 0) {
          ctx.log(
            `Failed to fetch bangumi list (type=${type} page=${pn}): ${result?.message}`
          )
          break
        }

        const list: BangumiItem[] = result.list || []
        if (list.length === 0) break

        const allExists = list.every((item) =>
          ctx.sync?.exists(String(item.season_id))
        )
        if (allExists) {
          ctx.log(`Type ${type}: all items on page ${pn} already exist`)
          break
        }

        for (const item of list) {
          const id = String(item.season_id)
          if (!ctx.sync?.exists(id)) {
            const position = globalIndex - batchBase
            newItems.push({ item, type, position })
            globalIndex++
          }
        }

        if (list.length < 30) break
        pn++
        await browser.settle(800)
      }
    }

    ctx.log(`Fetched ${newItems.length} new bangumi items`)

    return newItems.map(({ item, type, position }) => ({
      entityType: "bangumi",
      entityId: String(item.season_id),
      data: {
        seasonId: item.season_id,
        mediaId: item.media_id,
        title: item.title,
        url:
          item.url ||
          `https://www.bilibili.com/bangumi/play/ss${item.season_id}`,
        cover: item.cover,
        evaluate: item.evaluate || "",
        seasonType: item.season_type,
        seasonTypeName: item.season_type_name || (type === 1 ? "番剧" : "追剧"),
        totalCount: item.total_count || 0,
        isFinish: item.is_finish === 1,
        badge: item.badge || "",
        followStatus: item.follow_status,
        followStatusText: FOLLOW_STATUS_MAP[item.follow_status] || "未知",
        progress: item.progress || "",
        bothFollow: item.both_follow ?? false,
        ratingScore: item.rating?.score || null,
        ratingCount: item.rating?.count || 0,
        newestEp: item.new_ep?.index_show || "",
        pubTime: item.publish?.pub_time || item.new_ep?.pub_time || null,
        releaseDateShow: item.publish?.release_date_show || "",
        areas: item.areas?.map((a) => a.name).join(", ") || "",
        playCount: item.stat?.view || 0,
        followCount: item.stat?.follow || 0,
        danmakuCount: item.stat?.danmaku || 0,
        _syncPosition: position,
      },
      meta: { position },
    }))
  },

  transform(raw) {
    const data = raw.data
    const position = raw.meta?.position ?? 0
    const bangumiId = $.id("bili_bangumi", String(data.seasonId))
    const platformId = "bilibili-bangumi"

    return {
      agents: [
        {
          id: platformId,
          role: "platform" as const,
          name: "Bilibili 番剧",
          fingerprints: $.fingerprint("domain", "www.bilibili.com"),
        },
      ],

      goods: [
        {
          id: bangumiId,
          category: "movie" as const,
          title: $.string(data, "title", "Untitled"),
          summary: $.string(data, "evaluate", ""),
          producedBy: platformId,
          fingerprints: $.fingerprint(
            "bilibili",
            data.seasonId,
            "url",
            data.url
          ),
          useValue: {
            url: data.url,
            cover: data.cover,
            seasonTypeName: data.seasonTypeName,
            totalCount: data.totalCount,
            isFinish: data.isFinish,
            badge: data.badge,
            newestEp: data.newestEp,
            pubTime: data.pubTime,
            releaseDateShow: data.releaseDateShow,
            areas: data.areas,
          },
          exchangeValue: {
            ratingScore: data.ratingScore || 0,
            ratingCount: data.ratingCount || 0,
            play: data.playCount || 0,
            follow: data.followCount || 0,
            danmaku: data.danmakuCount || 0,
          },
        },
      ],

      relations: [
        {
          type: "CONSUMES" as const,
          subject_type: "agent" as const,
          subject_id: "me",
          object_type: "good" as const,
          object_id: bangumiId,
          context: {
            source: "bilibili/bangumi",
            position,
            followStatus: data.followStatus,
            followStatusText: data.followStatusText,
            progress: data.progress,
            bothFollow: data.bothFollow,
          },
        },
      ],
    }
  },

  queries: {
    raw: `
      -- @search {title, evaluate}
      -- [title:text]
      -- [season_type_name:text]
      -- [rating_score:number]
      -- [rating_count:number]
      -- [url:url]
      -- [cover:file]
      -- [is_finish:boolean]
      SELECT 
        id,
        json_extract(data, '$.title') as title,
        json_extract(data, '$.evaluate') as description,
        json_extract(data, '$.seasonTypeName') as season_type_name,
        json_extract(data, '$.followStatusText') as follow_status_text,
        json_extract(data, '$.ratingScore') as rating_score,
        json_extract(data, '$.ratingCount') as rating_count,
        json_extract(data, '$.playCount') as play_count,
        json_extract(data, '$.followCount') as follow_count,
        json_extract(data, '$.totalCount') as total_count,
        json_extract(data, '$.isFinish') as is_finish,
        json_extract(data, '$.badge') as badge,
        json_extract(data, '$.areas') as areas,
        json_extract(data, '$.url') as url,
        json_extract(data, '$.cover') as cover,
        json_extract(data, '$.newestEp') as newest_ep,
        json_extract(data, '$.releaseDateShow') as release_date
      FROM raw.data
      WHERE source = 'bilibili/bangumi'
      ORDER BY json_extract(data, '$._syncPosition') ASC
    `,
  },
})
