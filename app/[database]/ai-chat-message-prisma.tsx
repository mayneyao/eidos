import Prism from "prismjs";
import {
  DEFAULT_MARKDOWN_RENDERERS,
  Markdown,
  MarkdownRenderers,
} from "react-marked-renderer";
import "prismjs/components/prism-sql";
import "prismjs/themes/prism.css";
import { Button } from "@/components/ui/button";
import { Play } from 'lucide-react'


export const AIMessage = ({ message, onRun }: { message: string, onRun: (sql: string) => void }) => {
  const renderers: MarkdownRenderers = {
    ...DEFAULT_MARKDOWN_RENDERERS,
    codespan: function CodeSpan({ children }) {
      // just so it gets some prism styling
      console.log(children)
      return <code className="language-none">{children}</code>;
    },
    codeblock: function Code(props) {
      const { lang, text } = props;
      const codeHtml = Prism.highlight(text, Prism.languages[lang], lang)
      return (
        <pre className="relative flex w-[calc(100%-24px)]">
          <code className={`language-${lang} w-full overflow-x-auto`} dangerouslySetInnerHTML={{
            __html: codeHtml
          }}>
          </code>
          <Button className=" absolute right-0 top-0" variant='ghost' onClick={() => onRun(text)}>
            <Play className="h-4 w-4" />
          </Button>
        </pre>
      );
    }
  };
  return <Markdown
    markdown={message}
    renderers={renderers}
  />
}