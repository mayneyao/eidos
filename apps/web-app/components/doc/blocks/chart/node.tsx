import { BlockWithAlignableContents } from "@lexical/react/LexicalBlockWithAlignableContents"
import {
  BaseChartNode,
  createChartTransformer,
  type SerializedChartNode,
} from "@eidos.space/lexical"
import {
  type EditorConfig,
  type ElementFormatType,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
} from "lexical"

import type {
  DataSourceConfig,
  DataTransform,
} from "@/components/chart/config-form/types"

import { ChartBlock } from "./component"

export class ChartNode extends BaseChartNode {
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
    dataSource?: DataSourceConfig,
    transforms?: DataTransform[],
    id?: string
  ) {
    super(config, format, key, dataSource, transforms, id)
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

export const CHART_NODE_TRANSFORMER = createChartTransformer(
  ChartNode,
  (config) => $createChartNode(config)
)
