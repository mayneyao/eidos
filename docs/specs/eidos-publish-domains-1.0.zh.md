# Eidos Publish 自有域名 1.0

状态：由部署配置控制的可选 Publish 服务配置。
本文是英文规范的信息性翻译，不改变 Eidos File 或 Runtime 语义。

## 绑定与路由

有效 Publish Pro tenant 可将一个精确的客户 hostname 绑定到整个 Publish
站点，保留全部 publication 路径。hostname 唯一映射到稳定 tenant ID 和新的
binding ID，不依赖 handle。根域名和 www 是不同绑定。本配置不增加根路径目录、
单 publication 根路径挂载或通配域名。

服务将国际化域名转换为 ASCII，拒绝 URL、IP、非公共名称及 Eidos 控制和发布
域名，并为验证记录预留 DNS 名称长度。域名认领和 tenant 名额必须串行处理。
失效或删除的绑定不得授权新的绑定代次。

未知 Host 在内容、共享资源、Runtime、管理及发现 API 之前拒绝。管理 API
保持在官方控制源。所有域名保留公开、密码、仅发布者访问的私有模式，以及
要求登录的 Form 规则。

## 所有权与证书

每次认领生成新的、绑定账号的 `_eidos-publish.<hostname>` TXT；现有 CNAME
或证书不能充当账号所有权证明。用户需保留 TXT 供定期复验。Cloudflare 域名
验证、证书验证和 Eidos 所有权证明分别管理。

Eidos 证明通过前不创建供应商 hostname。必须配置并验证 Delegated DCV 的
`_acme-challenge` CNAME，不能同时展示冲突的证书订单 TXT 指令。本配置依赖
委托续期，不依赖应用转发 HTTP challenge。

应用分别保存 pending_dns、pending_tls、ready、active、suspended、removing
和 removed。激活要求有效 Pro、两端认领匹配、Eidos TXT、DCV 委托、供应商
hostname 和 SSL 均 active，以及 DNS 指向指定目标。ready 不自动开放路由。

活跃绑定每六小时检测，成功验证的租约最长 24 小时。暂时失败不能延长租约；
所有权丢失或 DNS/TLS 无效必须停止路由。每次公开访问还要按既有刷新期限
检查权益。连续非活跃七天后清理，先前活跃的时间不能缩短恢复窗口。移除先持久撤销路由，再删除供应商
资源；失败需重试，清理完成前不得重用。创建结果不确定时，先按 hostname
对账，不能重复创建证书订单。

## 源、会话与内容

URL 使用实际验证过的 hostname。自有域名的 Runtime ticket、查看者/密码/
填表者会话及 Form intent 同时绑定 hostname 和 binding ID；Runtime 代理
还需检查当前 hostname 到 tenant 的映射。官方域名的 audience 保持兼容。

登录保留在官方账号源。账号服务通过受信 Publish 服务确认回跳目标，拒绝旧
binding ID，签发短期、单次使用且绑定代次的授权码。Cookie 保留 Secure、
HttpOnly 和 host-only，不向客户源分享账号凭据。本配置不增加成员名单 ACL。

资源、附件下载、Form 和 Runtime 保持同源及版本/访问控制检查。自有域名 HTML
不得共享缓存，受保护内容保持 private, no-store。官方地址继续作为别名；公开
canonical 元数据和发布结果优先使用激活的自有域名，不统一重定向管理/API。
已经下载或被浏览器缓存的公开内容无法撤回。

发布插件 View 不得连接当前发布源或其他已注册的活跃发布源。该限制在现有
产物被访问时同样检查，不能仅在最初发布时检查。

## DNS 与验证

子域名用 CNAME 指向 SaaS 目标。根域名需要 DNS flattening/ALIAS；不得把
普通根域名 CNAME 或手工复制的 Cloudflare IP 当成通用方案。仅 A 记录接入
需要单独签约和验证的 Apex Proxying 部署。

Worker 测试覆盖标准化、并发 tenant 分配、重复认领、DNS/TLS/激活分离、绑定
代次会话、Runtime/Form、权益失效、清理失败和重新认领。账号测试覆盖回跳
验证和单次使用的代次授权码。真实 DNS、签发/续期、O2O 与边缘路由共存属于
部署验收；不得用本地模拟测试宣称这些能力已验证。
