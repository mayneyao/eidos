import type { MultilineElementTransformer } from "@lexical/markdown"
import type { SerializedDecoratorBlockNode } from "@lexical/react/LexicalDecoratorBlockNode"
import { DecoratorBlockNode } from "@lexical/react/LexicalDecoratorBlockNode"
import {
  type EditorConfig,
  type ElementFormatType,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
  type Spread,
} from "lexical"

export type SerializedChartNode = Spread<
  {
    config: string
    dataSource: any
    transforms: any[]
    id: string
  },
  SerializedDecoratorBlockNode
>

export class BaseChartNode extends DecoratorBlockNode {
  public __config: string
  public __dataSource: any
  public __transforms: any[]
  public __id: string

  static getType(): string {
    return "chart"
  }

  static clone(node: BaseChartNode): BaseChartNode {
    return new BaseChartNode(
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
    dataSource: any = { type: "raw" },
    transforms: any[] = [],
    id: string = crypto.randomUUID()
  ) {
    super(format, key)
    this.__config = config
    this.__dataSource = dataSource
    this.__transforms = transforms
    this.__id = id
  }

  static importJSON(serializedNode: SerializedChartNode): BaseChartNode {
    const node = new BaseChartNode(
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

  exportJSON(): SerializedChartNode {
    return {
      ...super.exportJSON(),
      config: this.__config,
      dataSource: this.__dataSource,
      id: this.__id,
      transforms: this.__transforms,
      type: "chart",
      version: 1,
    }
  }

  getConfig(): string {
    return this.__config
  }

  getTextContent(): string {
    return this.__config
  }

  setConfig(config: string) {
    const writable = this.getWritable()
    writable.__config = config
  }

  setDataSource(dataSource: any) {
    const writable = this.getWritable()
    writable.__dataSource = dataSource
  }

  setTransforms(transforms: any[]) {
    const writable = this.getWritable()
    writable.__transforms = transforms
  }

  getId(): string {
    return this.__id
  }

  setId(id: string): void {
    const writable = this.getWritable()
    writable.__id = id
  }

  decorate(_editor: LexicalEditor, _config: EditorConfig): any {
    return null
  }
}

export function $isBaseChartNode(
  node: LexicalNode | null | undefined
): node is BaseChartNode {
  return node instanceof BaseChartNode
}

export function createChartTransformer<T extends typeof LexicalNode>(
  nodeClass: any = BaseChartNode,
  createNode: (config: string) => InstanceType<T> = (config) =>
    new nodeClass(config) as any
): MultilineElementTransformer {
  return {
    dependencies: [nodeClass],
    export: (node: LexicalNode) => {
      if (!(node instanceof nodeClass)) {
        return null
      }
      return `<chart>\n${(node as BaseChartNode).getConfig()}\n</chart>`
    },
    regExpEnd: {
      optional: true,
      regExp: /<\/chart>/,
    },
    regExpStart: /<chart>/,
    replace: (rootNode, _children, _startMatch, _endMatch, linesInBetween) => {
      const config = linesInBetween?.join("\n").trim()
      if (!config) {
        return false
      }
      const chartNode = createNode(config)
      rootNode.append(chartNode)
      return true
    },
    type: "multiline-element",
  }
}

export const CHART_NODE_TRANSFORMER = createChartTransformer()
