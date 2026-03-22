import React, { useState } from "react"
import type { IBindings } from "@/packages/core/types/IExtension"

import { LogoLoading } from "../loading"

import { WebViewBlock } from "./webview-block"

export interface BlockRendererRef {
  getHeight: () => number
}

interface BlockRendererProps {
  code: string
  compiledCode: string
  blockId?: string
  env?: Record<string, string>
  bindings?: IBindings
  width?: string | number
  height?: string | number
  defaultProps?: Record<string, any>
  rerenderOnDefaultPropsChange?: boolean
  hash?: string
  slug?: string
}

export const BlockRenderer = React.forwardRef<
  BlockRendererRef,
  BlockRendererProps
>(
  (
    {
      blockId,
      width,
      height,
      defaultProps = {},
      rerenderOnDefaultPropsChange,
      hash,
    },
    ref
  ) => {
    const [isLoading] = useState(false)

    const style: React.CSSProperties = {
      width: width
        ? typeof width === "number"
          ? `${width}px`
          : width
        : "100%",
      height: height
        ? typeof height === "number"
          ? `${height}px`
          : height
        : "100%",
      border: "none",
    }

    if (isLoading) {
      return (
        <div className="flex items-center justify-center" style={style}>
          <LogoLoading />
        </div>
      )
    }

    return (
      <WebViewBlock
        blockId={blockId!}
        defaultProps={defaultProps}
        width={width}
        height={height}
        rerenderOnDefaultPropsChange={rerenderOnDefaultPropsChange}
        hash={hash}
      />
    )
  }
)

BlockRenderer.displayName = "BlockRenderer"
