import { defineAdapter, $ } from "../../index.js"

const X_PUBLIC_BEARER =
  "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA"

const BOOKMARKS_QUERY_ID = "Z9GWmP0kP2dajyckAaDUBw"
const BOOKMARKS_OPERATION = "Bookmarks"

const GRAPHQL_FEATURES = {
  graphql_timeline_v2_bookmark_timeline: true,
  rweb_tipjar_consumption_enabled: true,
  responsive_web_graphql_exclude_directive_enabled: true,
  verified_phone_label_enabled: false,
  creator_subscriptions_tweet_preview_api_enabled: true,
  responsive_web_graphql_timeline_navigation_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  communities_web_enable_tweet_community_results_fetch: true,
  c9s_tweet_anatomy_moderator_badge_enabled: true,
  articles_preview_enabled: true,
  responsive_web_edit_tweet_api_enabled: true,
  tweetypie_unmention_optimization_enabled: true,
  responsive_web_uc_gql_enabled: true,
  vibe_api_enabled: true,
  responsive_web_text_conversations_enabled: false,
  freedom_of_speech_not_reach_fetch_enabled: true,
  longform_notetweets_rich_text_read_enabled: true,
  longform_notetweets_inline_media_enabled: true,
  responsive_web_enhance_cards_enabled: false,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
  responsive_web_media_download_video_enabled: false,
}

function buildBookmarkUrl(cursor?: string): string {
  const variables: Record<string, unknown> = { count: 20 }
  if (cursor) variables.cursor = cursor
  const params = new URLSearchParams({
    variables: JSON.stringify(variables),
    features: JSON.stringify(GRAPHQL_FEATURES),
  })
  return `https://x.com/i/api/graphql/${BOOKMARKS_QUERY_ID}/${BOOKMARKS_OPERATION}?${params}`
}

function parseBookmarksResponse(json: any): {
  tweets: any[]
  nextCursor: string | null
} {
  const instructions =
    json?.data?.bookmark_timeline_v2?.timeline?.instructions ?? []
  const entries: any[] = []
  for (const inst of instructions) {
    if (inst.type === "TimelineAddEntries" && Array.isArray(inst.entries)) {
      entries.push(...inst.entries)
    }
  }

  const tweets: any[] = []
  let nextCursor: string | null = null

  for (const entry of entries) {
    if (entry.entryId?.startsWith("cursor-bottom")) {
      nextCursor = entry.content?.value ?? null
      continue
    }
    const tweetResult = entry?.content?.itemContent?.tweet_results?.result
    if (tweetResult) tweets.push(tweetResult)
  }

  return { tweets, nextCursor }
}

export default defineAdapter({
  meta: {
    site: "x",
    name: "bookmarks",
    description: "X (Twitter) Bookmarks 同步",
    domain: "x.com",
    version: "1.0",
  },

  protocol: {
    strategy: "cookie",
    browser: true,
    entryPoint: "https://x.com/i/bookmarks",
  },

  sync: {
    incremental: true,
  },

  async fetch(ctx) {
    await ctx.browser.navigate("https://x.com/i/bookmarks")
    await ctx.browser.settle(3000)

    // Check login status by looking for ct0 cookie (CSRF token)
    const csrfToken = await ctx.browser.evaluate<string, []>(() => {
      // @ts-ignore
      return document.cookie.match(/ct0=([^;]+)/)?.[1] || ""
    })

    if (!csrfToken) {
      throw new Error("Not logged in to X. Please log in to x.com first.")
    }

    ctx.log("CSRF token found, starting bookmark sync...")

    const batchBase = Date.now()
    const newTweets: Array<{ tweetResult: any; position: number }> = []
    let cursor: string | null = null
    let pageCount = 0
    let globalIndex = 0

    while (true) {
      const url = buildBookmarkUrl(cursor ?? undefined)

      const result: any = await ctx.browser.evaluate<
        any,
        [string, string, string]
      >(
        async (fetchUrl, token, bearer) => {
          const res = await fetch(fetchUrl, {
            credentials: "include",
            headers: {
              authorization: `Bearer ${bearer}`,
              "x-csrf-token": token,
              "x-twitter-auth-type": "OAuth2Session",
              "x-twitter-active-user": "yes",
              "content-type": "application/json",
            },
          })
          if (!res.ok) {
            const text = await res.text().catch(() => "")
            throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`)
          }
          return await res.json()
        },
        url,
        csrfToken,
        X_PUBLIC_BEARER
      )

      const { tweets, nextCursor } = parseBookmarksResponse(result)
      pageCount++
      ctx.log(`Page ${pageCount}: fetched ${tweets.length} tweets`)

      if (tweets.length === 0) {
        break
      }

      // Incremental stop: if the entire page already exists, no new data further back
      const allExists = tweets.every((t) => {
        const id = t?.legacy?.id_str ?? t?.rest_id
        return ctx.sync?.exists(id)
      })
      if (allExists) {
        ctx.log("All tweets on this page already exist, stopping.")
        break
      }

      for (const tweetResult of tweets) {
        const tweetId = tweetResult?.legacy?.id_str ?? tweetResult?.rest_id
        if (!ctx.sync?.exists(tweetId)) {
          const position = globalIndex - batchBase
          newTweets.push({ tweetResult, position })
          globalIndex++
        }
      }

      if (!nextCursor) {
        break
      }

      cursor = nextCursor

      // Rate limiting: delay between pages to avoid 429
      await ctx.browser.settle(1200)
    }

    ctx.log(`Fetched ${newTweets.length} new bookmarked tweets`)

    return newTweets.map(({ tweetResult, position }) => {
      const tweet = tweetResult.tweet ?? tweetResult
      const legacy = tweet?.legacy ?? {}
      const tweetId = legacy.id_str ?? tweet?.rest_id ?? String(position)
      const userResult = tweet?.core?.user_results?.result
      const authorHandle =
        userResult?.legacy?.screen_name ?? userResult?.core?.screen_name

      return {
        entityType: "tweet",
        entityId: String(tweetId),
        data: {
          id: String(tweetId),
          text: legacy.full_text ?? legacy.text ?? "",
          url: `https://x.com/${authorHandle ?? "_"}/status/${tweetId}`,
          authorHandle,
          authorName:
            userResult?.legacy?.name ?? userResult?.core?.name ?? null,
          authorProfileImageUrl:
            userResult?.legacy?.profile_image_url_https ??
            userResult?.avatar?.image_url ??
            null,
          postedAt: legacy.created_at
            ? new Date(legacy.created_at).toISOString()
            : null,
          lang: legacy.lang ?? null,
          favoriteCount: legacy.favorite_count ?? 0,
          retweetCount: legacy.retweet_count ?? 0,
          replyCount: legacy.reply_count ?? 0,
          quoteCount: legacy.quote_count ?? 0,
          media:
            legacy?.extended_entities?.media?.map((m: any) => ({
              type: m.type,
              url: m.media_url_https ?? m.media_url,
            })) ?? [],
          rawJson: tweetResult,
          _syncPosition: position,
        },
        meta: { position },
      }
    })
  },

  transform(raw) {
    const data = raw.data
    const position = raw.meta?.position ?? 0

    const authorHandle = data.authorHandle || "unknown"
    const authorId = $.id("x_user", authorHandle)
    const tweetId = $.id("x_tweet", data.id || String(position))

    return {
      agents: [
        {
          id: authorId,
          role: "producer" as const,
          name: data.authorName || authorHandle,
          fingerprints: $.fingerprint("x", authorHandle),
          description: data.authorName || undefined,
        },
      ],

      goods: [
        {
          id: tweetId,
          category: "post" as const,
          title:
            data.text.length > 120
              ? data.text.slice(0, 117) + "..."
              : data.text || "无标题",
          summary: data.text,
          producedBy: authorId,
          fingerprints: $.fingerprint("x", data.id, "url", data.url),
          useValue: {
            url: data.url,
            authorHandle,
            authorName: data.authorName,
            authorProfileImageUrl: data.authorProfileImageUrl,
            postedAt: data.postedAt,
            lang: data.lang,
            media: data.media,
          },
          exchangeValue: {
            likes: data.favoriteCount || 0,
            retweets: data.retweetCount || 0,
            replies: data.replyCount || 0,
            quotes: data.quoteCount || 0,
          },
        },
      ],

      relations: [
        {
          type: "OWNS" as const,
          subject_type: "agent" as const,
          subject_id: "me",
          object_type: "good" as const,
          object_id: tweetId,
          context: {
            source: "x/bookmarks",
            position,
            bookmarkedAt: data.postedAt,
          },
        },
      ],
    }
  },

  queries: {
    raw: `
      -- @search {title, author_name}
      -- [title:text]
      -- [author_name:text]
      -- [likes:number]
      -- [retweets:number]
      -- [replies:number]
      -- [quotes:number]
      -- [url:url]
      -- [media:file]
      SELECT 
        id,
        COALESCE(
          json_extract(data, '$.mediaUrls'),
          (SELECT GROUP_CONCAT(json_extract(value, '$.url')) FROM json_each(json_extract(data, '$.media')))
        ) as media,
        json_extract(data, '$.text') as title,
        json_extract(data, '$.authorName') as author_name,
        json_extract(data, '$.authorHandle') as author_handle,
        json_extract(data, '$.postedAt') as posted_at,
        json_extract(data, '$.favoriteCount') as likes,
        json_extract(data, '$.retweetCount') as retweets,
        json_extract(data, '$.replyCount') as replies,
        json_extract(data, '$.url') as url
      FROM raw.data
      WHERE source = 'x/bookmarks'
      ORDER BY json_extract(data, '$._syncPosition') ASC
    `,
  },
})
