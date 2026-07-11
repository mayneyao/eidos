import React, { createContext, useContext } from "react"

export type MarkdownLinkKind = "markdown" | "wiki" | "wiki-embed"

export interface MarkdownLinkActivation {
  href: string
  kind: MarkdownLinkKind
  label?: string
  target?: string
}

export interface MarkdownImageRenderProps {
  src: string
  resolvedSrc: string
  alt: string
  title?: string
  kind: "markdown" | "wiki-embed"
  target?: string
}

export interface MarkdownRenderingOptions {
  resolveImageSrc?: (src: string) => string
  resolveWikiLink?: (target: string) => string
  renderImage?: (image: MarkdownImageRenderProps) => React.ReactNode
  onImageActivate?: (
    image: MarkdownImageRenderProps,
    event: React.MouseEvent<HTMLElement>
  ) => void
  onLinkActivate?: (
    link: MarkdownLinkActivation,
    event: React.MouseEvent<HTMLElement>
  ) => void
}

const MarkdownRenderingContext = createContext<MarkdownRenderingOptions>({})

export function MarkdownRenderingProvider({
  options,
  children,
}: {
  options: MarkdownRenderingOptions
  children: React.ReactNode
}) {
  return (
    <MarkdownRenderingContext.Provider value={options}>
      {children}
    </MarkdownRenderingContext.Provider>
  )
}

export function useMarkdownRendering(): MarkdownRenderingOptions {
  return useContext(MarkdownRenderingContext)
}

export function MarkdownImageView({
  src,
  alt,
  title,
  kind,
  target,
}: Omit<MarkdownImageRenderProps, "resolvedSrc">) {
  const rendering = useMarkdownRendering()
  const resolvedSrc = rendering.resolveImageSrc?.(src) ?? src
  const image: MarkdownImageRenderProps = {
    src,
    resolvedSrc,
    alt,
    title,
    kind,
    target,
  }
  const interactive = rendering.onImageActivate !== undefined
  const content = rendering.renderImage?.(image) ?? (
    <img
      alt={alt}
      className="eidos-md-image"
      decoding="async"
      loading="lazy"
      src={resolvedSrc}
      title={title}
    />
  )

  const activate = (event: React.MouseEvent<HTMLElement>) => {
    rendering.onImageActivate?.(image, event)
  }

  return (
    <span
      className="eidos-md-image-frame"
      data-image-kind={kind}
      onClick={activate}
      onKeyDown={(event) => {
        if (!interactive || (event.key !== "Enter" && event.key !== " ")) {
          return
        }
        event.preventDefault()
        rendering.onImageActivate?.(
          image,
          event as unknown as React.MouseEvent<HTMLElement>
        )
      }}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
    >
      {content}
    </span>
  )
}
