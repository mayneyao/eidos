import { defineAdapter, $ } from "../../index.js"

export default defineAdapter({
  meta: {
    site: "github",
    name: "repos",
    description: "GitHub Repositories",
    domain: "github.com",
    version: "1.0",
  },

  protocol: {
    strategy: "auth",
    cli: true,
  },

  sync: {
    incremental: true,
  },

  async fetch(ctx) {
    const batchBase = Date.now()
    const perPage = 100
    const newRepos: any[] = []
    let page = 1
    let globalIndex = 0

    while (true) {
      const { stdout, stderr, exitCode } = await ctx.exec!.run("gh", [
        "api",
        `/user/repos?affiliation=owner&sort=updated&direction=desc&per_page=${perPage}&page=${page}`,
      ])

      if (exitCode !== 0) {
        throw new Error(`gh api failed: ${stderr || stdout}`)
      }

      const pageData: any[] = JSON.parse(stdout)
      if (!Array.isArray(pageData) || pageData.length === 0) {
        break
      }

      // Incremental stop: if the entire page already exists, no new data further back
      const allExists = pageData.every((item) =>
        ctx.sync?.exists(String(item.id || item.full_name))
      )
      if (allExists) {
        break
      }

      for (const item of pageData) {
        const id = String(item.id || item.full_name)
        if (!ctx.sync?.exists(id)) {
          const position = globalIndex - batchBase
          newRepos.push({ item, position })
          globalIndex++
        }
      }

      if (pageData.length < perPage) {
        break
      }
      page++
    }

    ctx.log(`Fetched ${newRepos.length} new repos`)

    return newRepos.map(({ item, position }) => ({
      entityType: "repo",
      entityId: String(item.id || item.full_name),
      data: {
        name: item.name,
        description: item.description,
        url: item.html_url,
        stargazerCount: item.stargazers_count,
        forkCount: item.forks_count,
        primaryLanguage: item.language ? { name: item.language } : null,
        owner: item.owner,
        isPrivate: item.private,
        isFork: item.fork,
        updatedAt: item.updated_at,
        createdAt: item.created_at,
        _syncPosition: position,
      },
      meta: { position },
    }))
  },

  transform(raw) {
    const repo = raw.data
    const position = raw.meta?.position ?? 0

    const ownerName = $.string(repo.owner, "login", "unknown")
    const ownerId = $.id("github_user", ownerName)
    const repoId = $.id(
      "repo",
      String(repo.id || `${ownerName}/${repo.name}` || position)
    )

    return {
      agents: [
        {
          id: ownerId,
          role: "producer" as const,
          name: ownerName,
          fingerprints: $.fingerprint("github", ownerName),
        },
      ],

      goods: [
        {
          id: repoId,
          category: "folder" as const,
          title: $.string(repo, "name", "无标题"),
          summary: $.string(repo, "description", ""),
          producedBy: ownerId,
          fingerprints: $.fingerprint(
            "github",
            repo.id,
            "full_name",
            `${ownerName}/${repo.name}`
          ),
          useValue: {
            language: $.string(repo.primaryLanguage, "name", ""),
            url: $.string(repo, "url", ""),
            isPrivate: repo.isPrivate ?? false,
            isFork: repo.isFork ?? false,
          },
          exchangeValue: {
            stars: repo.stargazerCount || 0,
            forks: repo.forkCount || 0,
          },
        },
      ],

      relations: [
        {
          type: "OWNS" as const,
          subject_type: "agent" as const,
          subject_id: ownerId,
          object_type: "good" as const,
          object_id: repoId,
          context: {
            source: "github/repos",
            position,
            createdAt: repo.createdAt,
            updatedAt: repo.updatedAt,
          },
        },
      ],
    }
  },

  queries: {
    raw: `
      -- @search {title, description}
      -- [title:text]
      -- [stars:number]
      -- [forks:number]
      -- [language:text]
      -- [url:url]
      -- [is_private:boolean]
      SELECT 
        id,
        json_extract(data, '$.name') as title,
        json_extract(data, '$.description') as description,
        json_extract(data, '$.primaryLanguage.name') as language,
        json_extract(data, '$.stargazerCount') as stars,
        json_extract(data, '$.forkCount') as forks,
        json_extract(data, '$.url') as url,
        json_extract(data, '$.isPrivate') = 1 as is_private
      FROM raw.data
      WHERE source = 'github/repos'
      ORDER BY json_extract(data, '$._syncPosition') ASC
    `,
  },
})
