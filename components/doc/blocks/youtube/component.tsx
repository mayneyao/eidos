import { BlockWithAlignableContents } from "@lexical/react/LexicalBlockWithAlignableContents"
import { ElementFormatType, NodeKey } from "lexical"

type YouTubeComponentProps = Readonly<{
  className: Readonly<{
    base: string
    focus: string
  }>
  format: ElementFormatType | null
  nodeKey: NodeKey
  videoID: string
}>

export function YouTubeComponent({
  className,
  format,
  nodeKey,
  videoID,
}: YouTubeComponentProps) {
  return (
    <BlockWithAlignableContents
      className={className}
      format={format}
      nodeKey={nodeKey}
    >
      <iframe
        width="560"
        height="315"
        className="mx-auto"
        src={`https://www.youtube-nocookie.com/embed/${videoID}`}
        frameBorder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen={true}
        title="YouTube video"
      />
    </BlockWithAlignableContents>
  )
}
