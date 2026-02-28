import type { MultilineElementTransformer } from "@lexical/markdown"
import { BlockWithAlignableContents } from "@lexical/react/LexicalBlockWithAlignableContents"
import type { SerializedDecoratorBlockNode } from "@lexical/react/LexicalDecoratorBlockNode"
import { DecoratorBlockNode } from "@lexical/react/LexicalDecoratorBlockNode"
import type {
  EditorConfig,
  ElementFormatType,
  LexicalEditor,
  LexicalNode,
  NodeKey,
  Spread,
} from "lexical"

import type {
  DataSourceConfig,
  DataTransform,
} from "@/components/chart/config-form/types"

import { ChartBlock } from "./component"

export type SerializedChartNode = Spread<
  {
    config: string
    dataSource: DataSourceConfig
    transforms: DataTransform[]
    id: string
  },
  SerializedDecoratorBlockNode
>

export class ChartNode extends DecoratorBlockNode {
  __config: string
  __dataSource: DataSourceConfig
  __transforms: DataTransform[]
  __id: string

  static getType(): string {
    return "chart"
  }

  static clone(node: ChartNode): ChartNode {
    return new ChartNode(
      node.__config,
      node.__format,
      node.__key,
      node.__dataSource,
      node.__transforms,
      node.__id
    )
  }

  constructor(
    config: string,
    format?: ElementFormatType,
    key?: NodeKey,
    dataSource: DataSourceConfig = { type: "raw" },
    transforms: DataTransform[] = [],
    id: string = crypto.randomUUID()
  ) {
    super(format, key)
    this.__config = config
    this.__dataSource = dataSource
    this.__transforms = transforms
    this.__id = id
  }

  setConfig(config: string) {
    const writable = this.getWritable()
    writable.__config = config
  }

  setDataSource(dataSource: DataSourceConfig) {
    const writable = this.getWritable()
    writable.__dataSource = dataSource
  }

  setTransforms(transforms: DataTransform[]) {
    const writable = this.getWritable()
    writable.__transforms = transforms
  }

  createDOM(): HTMLElement {
    return document.createElement("div")
  }

  updateDOM(): false {
    return false
  }

  getId(): string {
    return this.__id
  }

  setId(id: string): void {
    const writable = this.getWritable()
    writable.__id = id
  }

  exportJSON(): SerializedChartNode {
    return {
      ...super.exportJSON(),
      config: this.__config,
      dataSource: this.__dataSource,
      transforms: this.__transforms,
      id: this.__id,
      type: "chart",
      version: 1,
    }
  }

  static importJSON(serializedNode: SerializedChartNode): ChartNode {
    const node = $createChartNode(
      serializedNode.config,
      undefined,
      undefined,
      serializedNode.dataSource,
      serializedNode.transforms,
      serializedNode.id
    )
    node.setFormat(serializedNode.format)
    return node
  }

  decorate(_editor: LexicalEditor, config: EditorConfig): JSX.Element {
    if (!this.__config || this.__config.length === 0) {
      return <div>Empty Chart Configuration</div>
    }
    const embedBlockTheme = config.theme.embedBlock || {}
    const className = {
      base: embedBlockTheme.base || "",
      focus: embedBlockTheme.focus || "",
    }
    return (
      <BlockWithAlignableContents
        format={this.__format}
        className={className}
        nodeKey={this.__key}
      >
        <ChartBlock
          config={this.__config}
          nodeKey={this.__key}
          id={this.__id}
          dataSource={this.__dataSource}
          transforms={this.__transforms}
        />
      </BlockWithAlignableContents>
    )
  }

  getTextContent(): string {
    return this.__config
  }
}

export function $createChartNode(
  config: string,
  format?: ElementFormatType,
  key?: NodeKey,
  dataSource?: DataSourceConfig,
  transforms?: DataTransform[],
  id?: string
): ChartNode {
  return new ChartNode(config, format, key, dataSource, transforms, id)
}

export function $isChartNode(
  node: LexicalNode | null | undefined
): node is ChartNode {
  return node instanceof ChartNode
}

export const CHART_NODE_TRANSFORMER: MultilineElementTransformer = {
  dependencies: [ChartNode],
  export: (node: LexicalNode, traverseChildren: (node: any) => string) => {
    if (!$isChartNode(node)) {
      return null
    }
    const configContent = node.getTextContent()
    return "<chart>\n" + configContent + "\n</chart>"
  },
  regExpStart: /<chart>/,
  regExpEnd: {
    regExp: /<\/chart>/,
    optional: true,
  },
  replace: (
    rootNode,
    children,
    startMatch,
    endMatch,
    linesInBetween,
    isImport
  ) => {
    const config = linesInBetween?.join("\n").trim()
    if (!config) {
      return false
    }
    const chartNode = $createChartNode(config)
    rootNode.append(chartNode)
    return true
  },
  type: "multiline-element",
}
