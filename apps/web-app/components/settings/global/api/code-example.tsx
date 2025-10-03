"use client"

import { CopyIcon } from "lucide-react"
import { Trans, useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "@/components/ui/use-toast"
import { FormDescription, FormItem } from "@/components/react-hook-form/form"

interface CodeExampleProps {
  space: string
  endpoint: string
  date: string
}

const getExampleCodes = (space: string, endpoint: string, date: string) => ({
  curl: `curl -X POST ${endpoint} \\
    -H "Content-Type: application/json" \\
    -d '{
      "space": "${space}",
      "method": "getDocMarkdown",
      "params": ["${date}"]
    }'`,
  javascript: `const response = await fetch("${endpoint}", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    space: "${space}",
    method: "getDocMarkdown",
    params: ["${date}"],
  }),
})
const data = await response.json()
console.log(data)
`,

  python: `import requests

response = requests.post(
    "${endpoint}",
    json={
        "space": "${space}",
        "method": "getDocMarkdown",
        "params": ["${date}"]
    }
)
data = response.json()
print(data)`,
})

function highlightCode(code: string) {
  return {
    __html: code
      .replace(
        /("(?:https?:\/\/[^\s"]+|[^"]*)")/g,
        '<span class="text-green-500">$1</span>'
      )
      .replace(/('.*?')/g, '<span class="text-green-500">$1</span>')
      .replace(
        /\b(import|print|json)\b/g,
        '<span class="text-purple-500">$1</span>'
      )
      .replace(
        /\b(fetch|then|catch|console|JSON|async|await)\b/g,
        '<span class="text-blue-500">$1</span>'
      )
      .replace(
        /\b(const|let|var|function|try)\b/g,
        '<span class="text-purple-500">$1</span>'
      )
      .replace(
        /\b(error|data|response|params|method|space)\b/g,
        '<span class="text-orange-500">$1</span>'
      )
      .replace(
        /\b(POST|GET|PUT|DELETE)\b/g,
        '<span class="text-yellow-500">$1</span>'
      )
      .replace(/\b(curl|\\)\b/g, '<span class="text-blue-500">$1</span>')
      .replace(/("Content-Type")/g, '<span class="text-purple-500">$1</span>'),
  }
}

export function CodeExample({ space, endpoint, date }: CodeExampleProps) {
  const { t } = useTranslation()
  const exampleCodes = getExampleCodes(space, endpoint, date)

  const handleCopyCode = (e: React.MouseEvent, code: string) => {
    e.preventDefault()
    navigator.clipboard.writeText(code)
    toast({
      title: t("common.copied"),
    })
  }

  return (
    <div className="space-y-2 w-full max-w-[800px]">
      <FormItem className="w-full">
        <Tabs defaultValue="curl" className="w-full [&_*]:min-w-0">
          <TabsList className="w-full flex justify-start">
            <TabsTrigger value="curl">cURL</TabsTrigger>
            <TabsTrigger value="javascript">JavaScript</TabsTrigger>
            <TabsTrigger value="python">Python</TabsTrigger>
          </TabsList>
          {Object.entries(exampleCodes).map(([lang, code]) => (
            <TabsContent key={lang} value={lang} className="min-w-0">
              <div className="relative">
                <pre className="rounded-lg bg-secondary p-4 overflow-x-auto w-full">
                  <code
                    className="text-sm font-mono whitespace-pre-wrap break-all"
                    dangerouslySetInnerHTML={highlightCode(code)}
                  />
                </pre>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute top-2 right-2"
                  onClick={(e) => handleCopyCode(e, code)}
                >
                  <CopyIcon className="h-4 w-4" />
                </Button>
              </div>
            </TabsContent>
          ))}
        </Tabs>
        <FormDescription>
          <Trans
            i18nKey="settings.api.exampleDescription"
            values={{
              space,
              date,
            }}
            components={[
              <span className="font-medium text-foreground" />,
              <span className="font-medium text-foreground" />,
            ]}
          />
        </FormDescription>
      </FormItem>
    </div>
  )
}
