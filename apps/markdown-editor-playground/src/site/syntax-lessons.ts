/** Teaching copy belongs to the site, not the package's normative contracts. */
export const syntaxLessons: Record<string, { en: string; zh: string }> =
  Object.fromEntries(
    [
      [
        "paragraph",
        "Separate paragraphs with a blank line. A single source newline is a soft break and may display as a space.",
        "用空行分隔段落。源码中的单个换行是软换行，显示时可能合并为空格。",
      ],
      [
        "heading",
        "Start a line with one to six # characters followed by a space. More # characters mean a deeper heading level.",
        "在行首输入一至六个 #，后面加空格。# 越多，标题层级越深。",
      ],
      [
        "setext",
        "Underline text with = for a level-one heading or - for level two. Use ATX syntax for deeper levels.",
        "在文字下一行使用 = 表示一级标题，使用 - 表示二级标题。更深层级请使用 # 写法。",
      ],
      [
        "quote",
        "Prefix quoted lines with >. Add another > to nest a quotation; keep the marker on blank lines inside it.",
        "在引用行前加 >，增加一个 > 可嵌套引用。引用内部的空行也保留 > 标记。",
      ],
      [
        "bullet-list",
        "Begin each item with - and a space. Indent child items beneath the parent item’s content.",
        "每个列表项以 - 和空格开头。子项缩进到父项内容下方。",
      ],
      [
        "ordered-list",
        "Use a number followed by a period and a space. The first number sets the starting value; rendered numbering continues automatically.",
        "使用数字、句点和空格创建有序列表。首项数字决定起始序号，显示时自动连续编号。",
      ],
      [
        "list-blocks",
        "Indent additional paragraphs and code beneath an item to keep them inside that item. A blank line separates its blocks.",
        "将后续段落和代码缩进到列表项内部，避免它们脱离列表。块之间用空行分隔。",
      ],
      [
        "thematic-break",
        "Place three or more -, * or _ characters on a line of their own. Use surrounding blank lines to avoid confusing a dash line with a heading underline.",
        "单独一行输入至少三个 -、* 或 _。前后留空行，避免横线被识别为标题下划线。",
      ],
      [
        "fenced-code",
        "Wrap code in matching fences of at least three backticks or tildes. A language name after the opening fence can select highlighting.",
        "用至少三个反引号或波浪号包围代码。开始围栏后的语言名称可用于语法高亮。",
      ],
      [
        "indented-code",
        "Indent each code line by four spaces. Unlike a fenced block, this form has no language label.",
        "每行代码缩进四个空格。与围栏代码块不同，这种写法没有语言标签。",
      ],
      [
        "emphasis",
        "Wrap words in * for emphasis or ** for strong emphasis. Keep the markers next to the text, without inner spaces.",
        "用 * 包围文字表示斜体，用 ** 表示粗体。标记应紧贴文字，内侧不要留空格。",
      ],
      [
        "code-span",
        "Wrap inline code in backticks. If the code contains a backtick, use a longer matching run of backticks around it.",
        "用反引号包围行内代码。如果代码本身含反引号，外层使用更多、数量匹配的反引号。",
      ],
      [
        "link",
        "Write [visible text](destination). An optional quoted title follows the destination; use meaningful text for the link.",
        "使用 [显示文字](目标地址)。地址后可附加引号包围的标题，链接文字应说明目标。",
      ],
      [
        "reference-link",
        "Use [text][label] in the paragraph and define [label]: destination elsewhere. Multiple links can reuse one definition.",
        "正文使用 [文字][标识]，在其他位置定义 [标识]: 地址。多个链接可复用同一定义。",
      ],
      [
        "autolink",
        "Enclose an absolute URL or email address in angle brackets to turn it into a link without a separate label.",
        "用尖括号包围完整 URL 或电子邮件地址，可直接生成链接，无需另写显示文字。",
      ],
      [
        "image",
        "Use ![alternative text](image URL). Alternative text describes the image; local resource loading is supplied by the host application.",
        "使用 ![替代文字](图片地址)。替代文字用于描述图片，本地资源由宿主应用负责加载。",
      ],
      [
        "hard-break",
        "End a line with two spaces or a backslash to force a visible line break without starting a new paragraph.",
        "在行尾添加两个空格或反斜杠，可强制换行，而不开始新段落。",
      ],
      [
        "escapes",
        "Put a backslash before Markdown punctuation when you want to display the marker rather than apply its formatting.",
        "在 Markdown 标点前加反斜杠，可显示标记本身，而不是触发格式。",
      ],
      [
        "entities",
        "Character references such as &amp; and numeric references represent characters. Inside code spans and fenced code they stay literal.",
        "&amp; 等字符引用以及数字引用表示对应字符。在行内代码和围栏代码中，它们保留原样。",
      ],
      [
        "html",
        "HTML can express structures beyond Markdown. This editor uses a restricted preview; scripts and active content remain inert.",
        "HTML 可表达 Markdown 之外的结构。本编辑器仅提供受限预览，脚本和主动内容不会执行。",
      ],
      [
        "table",
        "Separate cells with | and add a delimiter row below the header. Colons in that row set left, center or right alignment. Escape a literal pipe as \\|.",
        "用 | 分隔单元格，在表头下添加分隔行。分隔行中的冒号控制左、中、右对齐。文字中的竖线写成 \\|。",
      ],
      [
        "task-list",
        "Start a list item with [ ] for an open task or [x] for a completed task. Click the checkbox in the live editor to toggle it.",
        "在列表项开头使用 [ ] 表示未完成任务，[x] 表示已完成。可在实时编辑器中点击复选框切换状态。",
      ],
      [
        "strikethrough",
        "Wrap text in ~~ to mark it as removed while keeping it readable. Remove the markers to restore ordinary text.",
        "用 ~~ 包围文字，表示删除但保留可读内容。移除标记即可恢复普通文字。",
      ],
      [
        "extended-autolink",
        "Bare web and email addresses can become links without angle brackets. For explicit link text, use the regular [text](URL) form.",
        "裸写的网址和邮箱可自动成为链接，无需尖括号。需要自定义文字时使用 [文字](地址)。",
      ],
      [
        "tag-filter",
        "Some HTML tags are deliberately displayed as text instead of rendered. This protects the document; it is not permission to run HTML scripts.",
        "部分 HTML 标签会被故意显示为文字，而非执行渲染。这是安全限制，不代表允许运行 HTML 脚本。",
      ],
      [
        "frontmatter",
        "Place YAML between --- lines at the very start of the document. Use it for metadata rather than visible paragraph content.",
        "在文档最开头用两行 --- 包围 YAML。它用于存储元数据，而不是正文段落。",
      ],
      [
        "footnote",
        "Insert [^label] at the reference and define [^label]: note separately. The visual note appears at the end, regardless of the definition’s source position.",
        "正文插入 [^标识]，另写 [^标识]: 注释。无论定义位于源码何处，注释都集中显示在文末。",
      ],
      [
        "inline-math",
        "Wrap TeX in single $ markers for an equation within a sentence. Keep display equations in their own block instead.",
        "用单个 $ 包围 TeX，在句子中插入公式。独立展示的公式应使用块级写法。",
      ],
      [
        "block-math",
        "Place TeX between $$ lines for a standalone equation. Edit the source to change the expression; rendering uses the supported TeX subset.",
        "将 TeX 放在两行 $$ 之间，创建独立公式。修改源码即可改变表达式，渲染支持 TeX 的子集。",
      ],
      [
        "highlight",
        "Wrap important text in == to highlight it. This is an extension, so use emphasis if the destination only supports basic Markdown.",
        "用 == 包围重点文字进行高亮。这是扩展语法；目标工具只支持基础 Markdown 时可改用强调。",
      ],
      [
        "wikilink",
        "Use [[Note]] to link to a note, or [[Note|label]] for custom text. Resolving the target requires the host’s document index.",
        "使用 [[笔记]] 链接笔记，或 [[笔记|文字]] 自定义显示文字。目标解析依赖宿主的文档索引。",
      ],
      [
        "obsidian-image",
        "Use ![[image.png]] for a vault attachment. Optional sizing follows a pipe; the host must resolve the attachment path.",
        "使用 ![[image.png]] 引用笔记库附件，可在竖线后添加尺寸。附件路径需要宿主解析。",
      ],
      [
        "relative-link",
        "Relative destinations are resolved from the current document, not the website root. Moving a file may require updating these links.",
        "相对地址以当前文档为基准，而不是网站根目录。移动文件后可能需要更新这些链接。",
      ],
      [
        "embed",
        "Prefix a wiki link with ! to request an embedded note or block. This demo preserves the reference; a host is required to load the target content.",
        "在双链前加 ! 请求嵌入笔记或块。本演示保留引用，实际加载目标内容需要宿主支持。",
      ],
      [
        "callout",
        "Start a quotation with [!note] or another callout type. Put the title on that line and the body on subsequent quoted lines.",
        "在引用开头添加 [!note] 等提示块类型。同一行写标题，后续引用行写正文。",
      ],
      [
        "tag",
        "Use #topic within text to mark a tag. A # followed by a space at the start of a line is a heading instead.",
        "在文字中使用 #主题 标记标签。行首 # 后跟空格则表示标题，而不是标签。",
      ],
      [
        "comment",
        "Wrap private drafting notes in %% markers to hide them in the visual text. They remain in the Markdown file, so they are not a privacy boundary.",
        "用 %% 包围草稿注释，可在可视正文中隐藏。内容仍保留在 Markdown 文件中，不构成隐私保护。",
      ],
      [
        "block-id",
        "Append ^identifier to give a block a stable reference target. Other notes can refer to it using a block link; resolution belongs to the host.",
        "在块末尾添加 ^标识，作为稳定引用目标。其他笔记可通过块链接引用，具体解析由宿主负责。",
      ],
      [
        "inline-footnote",
        "Write ^[note text] to place a note directly in the source sentence. This differs from a named footnote with a separate definition.",
        "使用 ^[注释文字] 将注释直接写在源码句子中。它不同于需要独立定义的命名脚注。",
      ],
    ].map(([id, en, zh]) => [id, { en, zh }])
  )
