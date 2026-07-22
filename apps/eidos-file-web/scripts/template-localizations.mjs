function exact(translations) {
  return (value) =>
    typeof value === "string" ? (translations[value] ?? value) : value
}

function prefixes(translations) {
  return (value) => {
    if (typeof value !== "string") return value
    for (const [source, target] of Object.entries(translations)) {
      if (value === source) return target
      if (value.startsWith(`${source} · `)) {
        return `${target}${value.slice(source.length)}`
      }
    }
    return value
  }
}

const projectTopics = {
  Runtime: "运行时",
  UI: "界面",
  Interop: "互操作",
  Browser: "浏览器",
  Desktop: "桌面端",
  Tooling: "工具链",
  Milestone: "里程碑",
  Spec: "规范",
}

const habitNames = {
  "Morning walk": "晨间散步",
  "Strength session": "力量训练",
  "Read deeply": "深度阅读",
  Meditate: "冥想",
  "Reset the room": "整理房间",
  "Cook dinner": "做晚餐",
  Sketch: "速写",
  "Write one page": "写一页",
}

const contentTitles = {
  "Why files still matter": "为什么文件依然重要",
  "Inside the runtime": "深入运行时",
  "A calm data workflow": "从容的数据工作流",
  "Meet the builders": "认识构建者",
  "Designing for ownership": "为数据所有权而设计",
  "From SQLite to UI": "从 SQLite 到界面",
}

export const ZH_TEMPLATE_LOCALIZATIONS = [
  {
    source: "project-tracker.eidos",
    output: "project-tracker.zh.eidos",
    tables: {
      Projects: {
        name: "项目",
        description: "连接团队、交付状态和派生规划数据的真实项目组合。",
        fields: {
          Title: "标题",
          Status: "状态",
          Estimate: "预计工作量",
          Priority: "优先级",
          Tags: "标签",
          Due: "截止日期",
          Kickoff: "启动时间",
          Complete: "已完成",
          Reference: "参考链接",
          Brief: "附件",
          Notes: "备注",
          Context: "上下文",
          Team: "团队",
          "Effort score": "工作量分数",
          "Team lead": "团队负责人",
          "Team capacity": "团队容量",
        },
        views: {
          Grid: "表格",
          "By status": "按状态",
          "Project cards": "项目卡片",
          "Active roadmap": "进行中路线图",
        },
        options: {
          Status: { Backlog: "待规划", Active: "进行中", Done: "已完成" },
          Tags: projectTopics,
        },
        rows: {
          Title: (value) => {
            if (value === "Ship Eidos File Web Editor") {
              return "发布 Eidos File Web 编辑器"
            }
            return typeof value === "string"
              ? value.replace(/^Project (\d+)$/, "项目 $1")
              : value
          },
          Notes: exact({
            "Review with the Eidos File runtime and UI owners.":
              "与 Eidos File 运行时和界面负责人一起评审。",
          }),
        },
      },
      Teams: {
        name: "团队",
        description: "为项目关联和查找字段提供负责人及容量数据。",
        fields: {
          Name: "名称",
          Lead: "负责人",
          Focus: "方向",
          Capacity: "容量",
          Active: "启用",
          "Team page": "团队主页",
          Projects: "项目",
          "Project count": "项目数",
          "Total effort": "总工作量",
        },
        views: { Grid: "表格", "Capacity cards": "容量卡片" },
        options: { Focus: projectTopics },
        rows: {
          Name: exact({
            "Runtime Core": "运行时核心",
            "Web Editor": "Web 编辑器",
            "File Format": "文件格式",
            "Browser & WASM": "浏览器与 WASM",
            "Desktop Adapter": "桌面端适配器",
            "Developer Experience": "开发者体验",
          }),
        },
      },
    },
  },
  {
    source: "personal-crm.eidos",
    output: "personal-crm.zh.eidos",
    tables: {
      Companies: {
        name: "公司",
        fields: {
          Name: "名称",
          Industry: "行业",
          Website: "网站",
          Tier: "优先级",
          Active: "活跃",
          People: "联系人",
          "Contact count": "联系人数",
          "Average relationship": "平均关系分",
        },
        views: { Grid: "表格", "Company cards": "公司卡片" },
        options: {
          Industry: {
            Technology: "科技",
            Design: "设计",
            Education: "教育",
            Healthcare: "医疗健康",
          },
        },
      },
      People: {
        name: "联系人",
        fields: {
          Name: "姓名",
          Role: "角色",
          Relationship: "关系",
          Tags: "标签",
          "Relationship score": "关系分",
          "Last contacted": "最近联系",
          "Follow up": "需要跟进",
          Profile: "个人主页",
          Notes: "备注",
          Company: "公司",
          Engagement: "关系活跃度",
          "Company industry": "公司行业",
          "Company website": "公司网站",
        },
        views: {
          Grid: "表格",
          "Relationship board": "关系看板",
          "People cards": "联系人卡片",
          "Follow ups": "待跟进",
        },
        options: {
          Relationship: { New: "新认识", Warm: "熟悉", Close: "亲近" },
          Tags: {
            Friend: "朋友",
            Client: "客户",
            Mentor: "导师",
            Community: "社区",
          },
        },
        rows: {
          Role: exact({
            Founder: "创始人",
            Designer: "设计师",
            Engineer: "工程师",
            Researcher: "研究员",
          }),
          Notes: exact({
            "Reconnect around the next milestone.":
              "在下一个里程碑前重新联系。",
          }),
        },
      },
      Interactions: {
        name: "互动记录",
        fields: {
          Subject: "主题",
          Type: "类型",
          Date: "日期",
          "Follow up": "需要跟进",
          Notes: "备注",
          Person: "联系人",
          "Person role": "联系人角色",
        },
        views: { Grid: "表格", "By interaction": "按互动类型" },
        options: {
          Type: {
            Call: "电话",
            Meeting: "会议",
            Message: "消息",
            Event: "活动",
          },
        },
        rows: {
          Subject: prefixes({
            "Catch up": "近况交流",
            "Project review": "项目回顾",
            Introduction: "介绍认识",
            Coffee: "咖啡聊天",
          }),
          Notes: exact({
            "Capture the next concrete step.": "记录下一项具体行动。",
          }),
        },
      },
    },
  },
  {
    source: "household-finance.eidos",
    output: "household-finance.zh.eidos",
    tables: {
      Accounts: {
        name: "账户",
        fields: {
          Name: "名称",
          Type: "类型",
          "Opening balance": "期初余额",
          Active: "启用",
          Transactions: "流水",
          "Current activity": "当前变动",
        },
        views: { Grid: "表格" },
        options: {
          Type: {
            Checking: "活期",
            Savings: "储蓄",
            Card: "信用卡",
            Cash: "现金",
          },
        },
        rows: {
          Name: exact({
            "Daily checking": "日常活期",
            "Rainy day": "备用金",
            "Everyday card": "日常信用卡",
            Wallet: "钱包",
          }),
        },
      },
      Categories: {
        name: "分类",
        fields: {
          Name: "名称",
          Kind: "类别",
          "Monthly budget": "月度预算",
          Essential: "必要支出",
          Transactions: "流水",
          "Transaction count": "流水数",
          "Net activity": "净变动",
        },
        views: { Grid: "表格", "Budget cards": "预算卡片" },
        options: {
          Kind: {
            Needs: "必需",
            Wants: "可选",
            Savings: "储蓄",
            Income: "收入",
          },
        },
        rows: {
          Name: exact({
            Home: "居住",
            Food: "餐饮",
            Transport: "交通",
            Health: "健康",
            Leisure: "休闲",
            Travel: "旅行",
            "Long-term savings": "长期储蓄",
            Salary: "工资",
          }),
        },
      },
      Transactions: {
        name: "流水",
        fields: {
          Merchant: "商户",
          Date: "日期",
          Direction: "收支方向",
          Amount: "金额",
          Flow: "流向系数",
          Cleared: "已入账",
          Tags: "标签",
          Receipt: "凭证",
          Notes: "备注",
          Account: "账户",
          Category: "分类",
          "Signed amount": "带符号金额",
          "Category kind": "分类类别",
          "Category budget": "分类预算",
          "Account type": "账户类型",
        },
        views: { Grid: "表格", "Money flow": "资金流向", Uncleared: "未入账" },
        options: {
          Direction: { Expense: "支出", Income: "收入" },
          Tags: {
            Recurring: "固定",
            Shared: "共同",
            Travel: "旅行",
            Work: "工作",
          },
        },
        rows: {
          Merchant: exact({
            "Market basket": "市场采购",
            "Metro pass": "地铁通票",
            "Home utilities": "家庭水电",
            "Neighborhood café": "社区咖啡馆",
            "Book shop": "书店",
            Pharmacy: "药店",
            "Studio membership": "工作室会员",
            "Monthly salary": "月度工资",
          }),
          Notes: exact({
            "Review during the monthly close.": "月度结账时复核。",
          }),
        },
      },
    },
  },
  {
    source: "reading-library.eidos",
    output: "reading-library.zh.eidos",
    tables: {
      Authors: {
        name: "作者",
        fields: {
          Name: "姓名",
          Country: "国家",
          Website: "网站",
          Books: "书籍",
          "Book count": "书籍数",
          "Pages collected": "总页数",
        },
        views: { Grid: "表格" },
        rows: {
          Country: exact({
            "United States": "美国",
            Italy: "意大利",
            "United Kingdom": "英国",
            Argentina: "阿根廷",
          }),
        },
      },
      Books: {
        name: "书籍",
        fields: {
          Title: "书名",
          Status: "阅读状态",
          Genre: "类型",
          Pages: "页数",
          "Pages read": "已读页数",
          Rating: "评分",
          Started: "开始日期",
          Finished: "完成日期",
          Reference: "参考链接",
          Review: "短评",
          Author: "作者",
          Progress: "阅读进度",
          "Author country": "作者国家",
        },
        views: {
          Grid: "表格",
          "Reading shelf": "阅读书架",
          "Book cards": "书籍卡片",
        },
        options: {
          Status: { "Want to read": "想读", Reading: "在读", Finished: "读完" },
          Genre: {
            Fiction: "小说",
            Essays: "随笔",
            Science: "科学",
            History: "历史",
            Design: "设计",
          },
        },
        rows: {
          Review: exact({
            "A short note on what changed my mind.":
              "简记这本书如何改变了我的想法。",
          }),
        },
      },
      Highlights: {
        name: "摘录",
        fields: {
          Excerpt: "原文",
          Page: "页码",
          Captured: "摘录日期",
          Favorite: "收藏",
          Note: "笔记",
          Book: "书籍",
          "Book status": "阅读状态",
        },
        views: { Grid: "表格", Favorites: "收藏摘录" },
        rows: {
          Excerpt: (value) =>
            typeof value === "string"
              ? value.replace(
                  /^Highlight (\d+): an idea worth returning to$/,
                  "摘录 $1：一个值得反复思考的观点"
                )
              : value,
          Note: exact({
            "Connect this with another note.": "把它与另一条笔记关联起来。",
          }),
        },
      },
    },
  },
  {
    source: "habit-journal.eidos",
    output: "habit-journal.zh.eidos",
    tables: {
      Habits: {
        name: "习惯",
        fields: {
          Name: "名称",
          Area: "领域",
          "Target minutes": "目标分钟",
          Active: "启用",
          Why: "原因",
          Resource: "资源",
          Logs: "日志",
          Sessions: "完成次数",
          "Total minutes": "总分钟",
          "Average quality": "平均质量",
        },
        views: { Grid: "表格", "Habit cards": "习惯卡片" },
        options: {
          Area: { Body: "身体", Mind: "心智", Home: "居家", Creative: "创作" },
        },
        rows: {
          Name: exact(habitNames),
          Why: exact({
            "Make the good choice easier to repeat.":
              "让正确的选择更容易重复。",
          }),
        },
      },
      "Daily logs": {
        name: "每日日志",
        fields: {
          Entry: "记录",
          Date: "日期",
          Minutes: "分钟",
          Quality: "质量",
          Completed: "已完成",
          Mood: "状态",
          Notes: "备注",
          Habit: "习惯",
          "Focus score": "专注分数",
          Target: "目标",
          Area: "领域",
        },
        views: { Grid: "表格", "By mood": "按状态", Completed: "已完成" },
        options: {
          Mood: { Low: "低落", Steady: "平稳", Energized: "充满活力" },
        },
        rows: {
          Entry: prefixes(habitNames),
          Notes: exact({
            "Notice what made this session easier.":
              "留意是什么让这次行动更容易。",
          }),
        },
      },
    },
  },
  {
    source: "content-calendar.eidos",
    output: "content-calendar.zh.eidos",
    tables: {
      Channels: {
        name: "渠道",
        fields: {
          Name: "名称",
          Format: "形式",
          Audience: "受众",
          Homepage: "主页",
        },
        views: { Grid: "表格" },
        options: {
          Format: {
            Article: "文章",
            Video: "视频",
            Newsletter: "通讯",
            Social: "社交媒体",
          },
        },
        rows: {
          Name: exact({
            "Field Notes": "产品手记",
            "Studio Sessions": "工作室访谈",
            "Sunday Letter": "周日来信",
            "Community Feed": "社区动态",
            "Research Dispatch": "研究简报",
          }),
          Audience: exact({
            "Curious builders": "好奇的构建者",
            "Product teams": "产品团队",
            "Independent creators": "独立创作者",
            "Open-source community": "开源社区",
            "Technical leaders": "技术负责人",
          }),
        },
      },
      Campaigns: {
        name: "营销活动",
        fields: {
          Name: "名称",
          Owner: "负责人",
          Goal: "目标",
          Start: "开始日期",
          End: "结束日期",
          Active: "进行中",
          Content: "内容",
          "Item count": "内容数",
          "Total effort": "总工作量",
        },
        views: { Grid: "表格", "Campaign cards": "活动卡片" },
        rows: {
          Name: exact({
            "Eidos File launch": "Eidos File 发布",
            "Summer field guide": "夏季实践指南",
            "Local-first stories": "本地优先故事",
            "Builder interviews": "构建者访谈",
            "Runtime deep dive": "运行时深度解析",
            "Community week": "社区周",
            "Desktop craft": "桌面端打磨",
            "Year in review": "年度回顾",
          }),
          Goal: exact({
            "Teach the open format": "介绍开放格式",
            "Grow the newsletter": "扩大通讯影响力",
            "Share user workflows": "分享用户工作流",
            "Bring practitioners together": "连接实践者",
            "Explain interoperability": "解释互操作性",
            "Celebrate contributors": "感谢贡献者",
            "Show the full application": "展示完整应用",
            "Synthesize what changed": "总结年度变化",
          }),
        },
      },
      Content: {
        name: "内容",
        fields: {
          Title: "标题",
          Stage: "阶段",
          Topics: "主题",
          "Publish date": "发布日期",
          Effort: "工作量",
          Priority: "优先级",
          "Brief ready": "需求已就绪",
          Draft: "草稿",
          Notes: "备注",
          Channel: "渠道",
          Campaign: "营销活动",
          Workload: "工作量分数",
          "Channel format": "渠道形式",
          "Campaign owner": "活动负责人",
        },
        views: {
          Grid: "表格",
          "Editorial board": "编辑看板",
          "Content cards": "内容卡片",
          Published: "已发布",
        },
        options: {
          Stage: {
            Idea: "想法",
            Draft: "草稿",
            Review: "审核",
            Scheduled: "已排期",
            Published: "已发布",
          },
          Topics: {
            Product: "产品",
            Education: "教育",
            Community: "社区",
            Research: "研究",
          },
        },
        rows: {
          Title: prefixes(contentTitles),
          Notes: exact({
            "Confirm examples and final call to action.":
              "确认示例与最终行动号召。",
          }),
        },
      },
    },
  },
]
