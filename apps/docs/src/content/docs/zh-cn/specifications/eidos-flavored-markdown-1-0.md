---
title: "Eidos Flavored Markdown 1.0"
description: "Eidos Flavored Markdown 1.0 的说明性中文参考。英文规范文本拥有最终解释权。"
sidebar:
  order: 50
---

> **来源说明：** 本页由仓库中的说明性中文译本生成。发生冲突时，以英文规范为准。

状态：Eidos 标准草案
版本：1.0
发布日期：2026-09-02
编辑者与变更控制者：Eidos Project
唯一规范语言：English

## 摘要

Eidos Flavored Markdown 1.0（EFM）定义一种用于结构化文本交换的、可移植且有版本的
Markdown 方言。它组合 CommonMark 0.31.2、明确列出的 GitHub Flavored Markdown
扩展、YAML frontmatter、脚注和受限的 LaTeX 数学 profile。

本规范定义源码编码、文档 profile、解析优先级、语法语义、安全渲染要求、序列化、
diagnostic 和 conformance。它独立于任何编辑器框架、存储容器、文件系统布局、宿主
应用或渲染 library。

## 1. 状态与规范性语言

本中文文档是 informative reference。发生歧义或冲突时，以
[英文规范](/specifications/eidos-flavored-markdown-1-0/)为准。发布本规范只定义 conformance
目标，不表示任何现有实现已经符合它。

仅当 **MUST**、**MUST NOT**、**REQUIRED**、**SHALL**、**SHALL NOT**、
**SHOULD**、**SHOULD NOT**、**RECOMMENDED**、**NOT RECOMMENDED**、**MAY** 与
**OPTIONAL** 使用大写时，才按 BCP 14 解释。

标记为 informative 的示例和实现建议不是要求。本文的语法规则、优先级、语义要求、
安全规则和 conformance vector 是 normative。

## 2. 设计目标、范围与术语

### 2.1 设计目标

EFM 的设计目标是：

- **可移植性**：普通 Markdown 在任何特定实现之外仍然可读、可用；
- **确定性**：相同源码具有相同语法解释；
- **源码可读性**：扩展语法作为纯文本仍然容易理解；
- **安全呈现**：解析内容不会授予其执行权限；
- **实现中立**：conformance 由可观察结果决定，而不是由 parser、editor、AST library
  或 rendering engine 决定。

### 2.2 范围

本规范定义：

- EFM 源码与文档模型；
- 引入的 CommonMark 和 GFM 行为；
- YAML frontmatter、脚注和数学公式扩展；
- 解析优先级与语法语义；
- 最低安全渲染行为；
- 稳定序列化要求；
- conformance label、diagnostic 与测试。

本规范不定义：

- EFM 源文本以外的持久化格式；
- 文件扩展名、目录结构、workspace、附件存储或 base URL；
- document identity、block identity、backlink、mention 或 transclusion；
- 编辑器布局、字体、工具栏、selection、scroll 或 fold；
- 特定 AST shape、HTML vocabulary、CSS theme 或 accessibility tree；
- 语法高亮算法；
- 完整 LaTeX document、package、编译或操作系统访问。

### 2.3 术语

- **source**：按照 Section 4 解码得到的一串 Unicode 字符。
- **document**：可以包含文档级 frontmatter 的完整 EFM 输入。
- **fragment**：不包含文档级 frontmatter 的 EFM body。
- **processor**：实现一个或多个 EFM conformance profile 的程序。
- **parser**：把源码转换成 implementation-defined structured representation，同时保留
  EFM 语义的 processor。
- **renderer**：从已解析 EFM 生成呈现结果的 processor。
- **serializer**：把已解析表示转换回 EFM 源码的 processor。
- **source range**：已解码源码中的半开字符区间。
- **diagnostic**：描述语法、安全、资源或实现限制的结构化消息。

## 3. Conformance profiles

Conforming implementation 声明一个或多个 label：

| Label                | 必备能力                                                                         |
| -------------------- | -------------------------------------------------------------------------------- |
| `EFM-Parser-1.0`     | 解码并解析 EFM、应用扩展优先级、保留 source location，并报告 required diagnostic |
| `EFM-Renderer-1.0`   | 全部 Parser 要求，加上每种 EFM construct 的安全呈现                              |
| `EFM-Serializer-1.0` | 全部 Parser 要求，加上每种 EFM construct 的语义保持、稳定序列化                  |

Renderer 与 Serializer 独立扩展 Parser。Processor 可以同时实现两者。

Conforming processor 必须公布：

1. 它的 EFM conformance label；
2. 接受 `document`、`fragment` 还是两个 input profile；
3. 声明 Renderer 时使用的 resource 与 URI policy；
4. 超出 required profile 的数学能力；
5. 低于规范的 size、nesting 或 rendering limit。

使用某个特定 parser、renderer、serializer 或 editor library，既不会自动获得，也不会
妨碍 conformance。

## 4. 源码与文档模型

### 4.1 编码

EFM 源码以 bytes 表示时必须是有效 UTF-8。Parser 可以接受并忽略一个位于开头的
UTF-8 BOM。Serializer 不能输出 BOM。

Parser 必须接受 CommonMark 定义的 LF、CRLF 和 CR 换行。Serializer 应当输出 LF。
只做换行规范化不会改变 EFM 语法语义。

实现可以设置并公开资源限制。触发限制时必须生成 diagnostic，不能生成部分成功结果。

### 4.2 Input profiles

**document profile** 接受一个完整 EFM 文档。它可以 Section 7.1 定义的 YAML
frontmatter envelope 开头。

**fragment profile** 接受 EFM body，并且不能识别 frontmatter。Fragment 开头的
`---` 按普通 Markdown 规则解释。

除 frontmatter 识别外，两个 profile 使用相同语法和语义。

### 4.3 字符与位置模型

除非本文明确另有规定，character、whitespace、line 和 tab 行为遵循 CommonMark。
Diagnostic 必须使用从 1 开始的 line 和 column。Parser 应当保留 parsed construct 的
source range。

## 5. Dialect 组合与优先级

### 5.1 引入的规范

除本文明确扩展或覆盖的部分外，EFM body 语法遵循
[CommonMark 0.31.2](https://spec.commonmark.org/0.31.2/)。

EFM 还引入 [GitHub Flavored Markdown 0.29-gfm](https://github.github.com/gfm/)
中的下列 extension production：

- 表格；
- task list item；
- 删除线；
- 扩展 autolink；
- 禁止 Raw HTML tag 的过滤规则。

不属于已引入 GFM extension production 的冲突由 CommonMark 0.31.2 控制。

图片、引用式链接与图片、fenced code block、blockquote、heading、list 和 Raw HTML
都是 CommonMark 功能。Processor 不能把它们分类为可选的 GFM 或 EFM 扩展。

### 5.2 优先级

Parser 必须按以下顺序处理语法：

1. 仅对 document profile，在源码 offset zero 识别 frontmatter envelope；
2. 识别 CommonMark block structure，包括 indented/fenced code；
3. 在 code 和 Raw HTML 之外的 Markdown 文本中识别 EFM 脚注和数学公式；
4. 应用已引入的 GFM block/inline 扩展；
5. 应用其余 CommonMark inline parsing。

Code span、indented code block，以及语言不是 `math` 的 fenced code block 会禁止脚注
和数学公式识别。Raw HTML 内容中不递归解析 Markdown。

## 6. CommonMark 与 GFM 要求

每个 EFM Parser 必须支持全部 CommonMark 语法族和已引入的 GFM 扩展，包括：

- paragraph、blank line、thematic break、ATX 与 Setext heading；
- blockquote、ordered list、bullet list、nested list 与 task list；
- indented/fenced code block，并保留 info string；
- emphasis、strong emphasis、strikethrough、code span 与 escape；
- inline link、autolink、reference link、image 与 image reference；
- hard/soft line break、character reference 与 Raw HTML；
- 支持可选列对齐的 GFM table。

下面只是代表性示例，并不穷举：

```md
# Heading

Paragraph with **strong**, _emphasis_, ~~deleted text~~, `code`, and
[a link](https://eidos.space).

- bullet
- [x] completed task
- [ ] incomplete task

| Name  | State |
| :---- | ----: |
| Eidos | Ready |

![Alternative text](./assets/image.png "Optional title")

[reference]: https://eidos.space
```

### 6.1 Task list

`[x]` 与 `[X]` 表示已完成任务，`[ ]` 表示未完成任务。Serializer 应当把已完成任务
输出为小写 `[x]`。

Task 是否可交互属于呈现行为，不属于 EFM 语法。改变任务状态会改变对应 source marker。

### 6.2 表格

Table recognition、delimiter row、escaped pipe 与 alignment 遵循 GFM。Alignment 是
语法语义；column width 和视觉布局不是。

### 6.3 Code info string

Fenced code info string 中第一个以空白分隔的 word 是语言 ID。Renderer 可以用它进行
语法高亮，但必须保留代码内容；高亮不能改变 EFM 语义。未知语言按无高亮代码渲染。

## 7. EFM 扩展

### 7.1 YAML frontmatter

YAML frontmatter 只由 document profile 识别。

Frontmatter envelope：

- 必须从源码 offset zero 开始，前面只允许一个已接受的 BOM；
- 开始行必须恰好是 `---`；
- 必须由后续一行恰好为 `---` 的 delimiter 结束；
- 内容必须是 YAML 1.2 mapping 或为空；
- 后面必须是输入结尾或换行。

示例：

```md
---
title: Portable Markdown
tags:
  - eidos
  - markdown
draft: false
---

# Document body
```

重复 mapping key 无效，必须产生 diagnostic。Frontmatter 不生成 Markdown body node。

没有匹配有效 closing delimiter 的 opening `---` 按普通 Markdown 规则解释，不能把剩余
输入全部吞成 frontmatter。

### 7.2 脚注

EFM 使用与 GitHub 兼容的 reference/definition 脚注语法：

```md
This statement has a footnote[^source]. A reference may repeat[^source].

[^source]: The footnote body may contain inline Markdown.
```

Footnote reference 是 `[^`、非空 label 和 `]`。Footnote definition 使用同一 label，
后面跟 `:`。Label 使用 CommonMark reference-label normalization。Normalized label 的
第一个 definition 生效；后续重复 definition 必须产生 diagnostic。

当 continuation block 按 CommonMark container rule 缩进为 definition continuation
时，它属于该脚注。Definition 可以出现在 reference 前后。未定义 reference 保留为
literal source，并且应当产生 diagnostic。

Renderer 按第一次引用的顺序编号，在正文之后呈现 definition，并为每个 reference
提供返回 target。显示编号是派生呈现，不能替换 source label。

### 7.3 LaTeX 数学公式

#### 7.3.1 范围

EFM 支持 LaTeX 风格的数学源码，不支持完整 LaTeX document、任意 package、文件包含、
shell escape、写文件或其他操作系统副作用。

数学 renderer 可以使用 MathJax、KaTeX 或其他兼容引擎。Renderer-specific output 是
派生呈现，不是 EFM source。

#### 7.3.2 行内公式

行内公式在两侧各使用一个未转义的 `$`：

```md
Euler wrote $e^{i\pi} + 1 = 0$.
```

Opening `$` 后面不能紧跟 Unicode whitespace。Closing `$` 前面不能是 Unicode
whitespace，后面不能紧跟 ASCII digit。两个 delimiter 必须位于同一行。`\$` 是 literal
dollar sign。

这些限制用于避免把 `$5 and $10` 等货币文本解释成公式。

#### 7.3.3 块级公式

块级公式使用 opening 和 closing `$$` delimiter line，最多允许三个 leading space：

```md
$$
\int_0^1 x^2\,dx = \frac{1}{3}
$$
```

两个 delimiter 必须各自独占一行。它们之间的内容是数学源码，不解析 Markdown。

语言 ID 恰好为 `math` 的 fenced code block 是等价的块级数学形式：

````md
```math
\sum_{i=1}^{n} i = \frac{n(n+1)}{2}
```
````

Serializer 可以保留任一种已识别输入形式。新建块级数学 node 时，应当使用 `$$`
delimiter line。

#### 7.3.4 错误

未知 command 或 renderer 不支持的功能不会让 EFM 文档在语法上无效。Renderer 必须
呈现安全的源码 fallback，并且应当报告 diagnostic。

## 8. 渲染与资源

### 8.1 渲染模型

EFM 定义语义呈现要求，不要求特定输出格式。Renderer 可以生成 HTML、native UI、
terminal output、文档格式或其他 accessible representation。

Renderer 必须保留 heading、paragraph、list、task state、quote、code、table、link、
image、footnote 和 mathematics 之间的结构区别。视觉样式由实现决定。

### 8.2 Raw HTML

Raw HTML 保留 CommonMark/GFM parsing meaning。解析 Raw HTML 不会授予它执行权限。

EFM Renderer：

- 必须应用已引入的 GFM disallowed-tag filtering；
- 必须进一步 sanitize 或 escape 不受信任的 Raw HTML；
- 不能执行 script、event attribute、active embed 或不安全 style；
- 不能在 Raw HTML 内递归解析 Markdown；
- 元素被拒绝时必须提供可读 fallback content。

Processor 可以提供另行命名的 trusted-HTML 扩展，但该扩展不属于
`EFM-Renderer-1.0`。

### 8.3 URI 与资源

解析 URI 和授权资源是两个独立操作。Parser 把 URI 作为内容保留。Renderer 应用由
实现定义并公开的 resource policy。

默认 resource policy 可以激活：

- 同文档 fragment；
- 相对于已声明 base URI 解析的相对引用；
- `https:` 与 `http:` 链接；
- `mailto:` 链接；
- policy 明确允许的图片来源。

Renderer 不能激活 `javascript:`、`vbscript:`、可执行 `data:` content 或未批准的
`file:` URI。不支持的链接只呈现 label，不激活 destination。不支持的图片呈现 alt
text 或 accessible unresolved-resource placeholder。

没有声明 base URI 时，相对资源保持 unresolved。资源解析必须处于 processor 声明的
authority 内。

## 9. 序列化

`EFM-Serializer-1.0` 实现必须序列化每个 EFM construct，不能丢弃或改变其语法语义。

除非另行声明，不要求逐 byte 复现。Serializer 必须达到稳定表示：

```text
serialize(parse(serialize(parse(source))))
  = serialize(parse(source))
```

上述等式指应用 Serializer 声明的换行规范化后，字符完全相等。Serializer 必须保留：

- 文本内容与代码内容；
- heading level 与 list nesting；
- task state；
- link/image destination、label、title 与 reference relationship；
- table cell 与 alignment；
- frontmatter data；
- footnote label、reference 与 definition；
- 数学源码和 inline/display 区别。

生成新源码时，Serializer 应当使用：

- marker 后有一个空格的 ATX heading；
- `-` 作为 bullet list marker；
- `1.` 作为新 ordered list 的第一个 marker；
- 小写 `[x]` 表示已完成 task；
- `**` 表示 strong、`_` 表示 emphasis、`~~` 表示 strikethrough；
- backtick fenced code block；
- `---` 表示 thematic break；
- pipe-delimited GFM table；
- `$$` delimiter line 表示 display mathematics。

这些建议不限制 Parser 输入。

## 10. Diagnostics

Diagnostic 必须至少包含：

```ts
interface EfmDiagnostic {
  code: string
  severity: "info" | "warning" | "error"
  message: string
  start: { line: number; column: number }
  end?: { line: number; column: number }
}
```

必须包含以下 diagnostic family：

- malformed frontmatter 与重复 mapping key；
- 重复和未定义 footnote label；
- 未闭合 display mathematics；
- 被拒绝或 unresolved resource；
- 不安全 Raw HTML 与 URI scheme；
- processor resource-limit failure。

Diagnostic 不能授权修改输入源码。

## 11. 不包含的语法与扩展机制

EFM 1.0 不为以下内容赋予特殊语法含义：

- Wikilink，例如 `[[Note]]`；
- transclusion，例如 `![[Note]]`；
- block identifier，例如 `^block-id`；
- highlight delimiter，例如 `==text==`；
- percent comment，例如 `%%comment%%`；
- callout，例如 `> [!note]`；
- directive，例如 `:::details`；
- MDX、JSX、template expression 或 executable code cell。

这些文本遵循引入的 CommonMark/GFM 规则。Processor 可以通过另行命名和版本化的
extension profile 实现额外语法。在 EFM conformance 测试中，不能把该行为声称为 EFM
1.0，也不能静默启用它。

折叠 heading 或 list item 是普通 EFM 结构上的呈现状态，不是 EFM 语法。

## 12. Conformance tests

EFM conformance suite 必须包含：

1. 适用的 CommonMark 0.31.2 example；
2. 每个已引入 GFM 0.29-gfm extension example；
3. document 与 fragment 的 frontmatter vector；
4. footnote definition、重复引用、continuation、duplicate 与 undefined vector；
5. inline math、货币、escape、code suppression、display math 与 unterminated math vector；
6. Raw HTML 与危险 URI security vector；
7. 有无 base URI 时的相对资源行为；
8. Serializer 稳定性与 semantic round-trip vector；
9. 已声明 resource limit 的 vector。

实现可以使用不同 library。只有共享 vector 产生等价的语法语义、diagnostic、安全呈现
和序列化效果时，它们才符合规范。

## 13. 变更策略

兼容性澄清可以增加 example、diagnostic 或 test，但不能改变已有有效文档的解释。新增
原本按普通文本解析的语法、改变 delimiter precedence 或改变文档语义，都需要升级
EFM version。

可选 extension profile 必须使用自己的名称与版本，不能静默修改 EFM 1.0。

## 附录 A：源码保留型编辑器（informative）

源码保留型编辑器可以只支持 EFM 的一个 visual subset，同时保护自己无法建模的文档。
稳健的实现通常会对每个 construct 选择以下一种方式：

1. 在语义上表示并序列化；
2. 在 opaque node 中保留原始 source range；
3. 让受影响内容保持 source mode。

Selection、caret、scroll、fold、syntax highlighting 和 active editing mode 都是呈现
状态。它们不应序列化为 EFM，也不应让内容显示为已修改。Copy、export 与 serialize
应当包含仅因呈现状态而隐藏的内容。
