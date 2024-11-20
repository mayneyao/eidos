import { Link } from "react-router-dom"

import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"

import { useScriptById } from "../hooks/use-script"

interface ScriptBreadcrumbProps {
  scriptId: string
}

export const ScriptBreadcrumb = ({ scriptId }: ScriptBreadcrumbProps) => {
  const script = useScriptById(scriptId)
  const { space } = useCurrentPathInfo()

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link to={`/${space}/extensions`}>Extensions</Link>
          </BreadcrumbLink>
          <BreadcrumbSeparator />
        </BreadcrumbItem>
        <BreadcrumbItem>
          <BreadcrumbPage>{script?.name}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  )
}
