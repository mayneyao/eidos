# Eidos Publish 文件 1.0

状态：staging 实现配置。本文为说明性译文；英文版本具有规范效力。

本 Adapter/UI 配置定义普通文件及插件文件视图的托管发布，不增加 Eidos File
格式或 Runtime 语义。

## 资源与快照

每个 Publication slug 对应固定网址及一个当前激活的不可变 Version。
同一本地文件可以通过不同 slug 拥有多条发布。
File Driver 为 `org.eidos.driver.file@1.0`，bundle 媒体类型为
`application/vnd.eidos.file`；入口文件自身的媒体类型描述原始字节。
现有 Eidos、Markdown、Form Driver 保持原有语义。

`eidos.publish/source-bundle@1` 保留既有必填字段。File bundle 只能包含一个
入口，不含附件或附件引用。原始下载没有 presentation 字段；插件视图增加：

```json
"presentation": {
  "kind": "plugin-view",
  "pluginPath": "plugins/view.eidos-plugin",
  "viewId": "map"
}
```

必须恰有一个 role 为 `plugin` 的文件对应该路径；其他 Driver 拒绝此角色及
presentation。完整规范化 manifest 决定版本指纹，包括视图标识、依赖摘要、
源文件名和摘要。插件包按租户及内容摘要存储、去重、计入配额，但不自动建立
公开目录条目。相同 bundle 复用当前版本。

## 访问与展示

未指定 presentation 时，固定网址的 GET/HEAD 返回原始文件，以附件方式下载并
保留原始文件名。Range 沿用 Gateway 语义。固定网址不得使用 immutable 缓存；
未知、HTML、脚本文件不得作为网页执行。

指定 presentation 时，固定网址展示选中的交互视图。服务器验证大小受限的
format-2 插件包、3.0.0 插件 API 声明和只读普通文件视图。首期不支持
document/Eidos 能力、本地工作区、连接、设置或持久插件存储。视图发布的源文件、
插件包各限制为 16 MiB，插件解压后也限制为 16 MiB；原始文件沿用 1 GiB
对象上限及账户限额。Free 仍仅支持 Markdown。

插件在不具同源权限的 sandbox iframe 中执行脚本，仅允许声明的浏览器网络
来源和 Worker 能力。禁止请求 Eidos 账户及发布域名。父页面将 RPC 限定到该
iframe 和当前发布文件，提供读取、stat、URL 和不会变化的快照监听；拒绝写入、
目录枚举及其他宿主能力。文件在交给视图前验证大小和 SHA-256。
绑定文件操作接受相对于该文件所在目录的文件名，包括 `./文件名`，并保留
源包入口路径作为别名。这些别名只能指向当前发布文件；其他目录和父目录
穿越路径必须拒绝。

源文件下载与视图页面继承资源当前的 public/password/private 访问规则。
公开文件路由不提供插件依赖下载。授权访问者的浏览器仍会收到视图代码，
这并不提供代码保密。

本地修改、插件升级或卸载不改变已激活版本；只有显式重新发布才更新内容或展示
方式。带版本的文件网址仅解析当前版本，不承诺长期历史下载。下架、保留期、
配额及账户降级规则继续适用。

## 一致性验证

`EP-File-1.0` 要求原始下载、HEAD、Range、依赖归属、指纹、插件能力拒绝、
依赖下载隔离、受保护源文件权限和真实浏览器沙箱读取测试。
