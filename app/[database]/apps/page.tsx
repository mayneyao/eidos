import { useParams } from "react-router-dom"

import { ExtensionContainer } from "@/app/extensions/container"

export const AppPage = () => {
  const params = useParams()
  if (!params.id) {
    return (
      <div>
        <h1>App not found</h1>
      </div>
    )
  }
  return <ExtensionContainer ext={params.id} />
}
