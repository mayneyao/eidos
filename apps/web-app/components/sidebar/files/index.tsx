"use client"

import { useMemo } from "react"
import { useTranslation } from "react-i18next"

import { useMounts } from "@/apps/web-app/hooks/use-mounts"

import FileTree, { type FileTreeNode } from "../../file-tree"

export const FilesSidebar = () => {
  const { t } = useTranslation()
  const { mounts } = useMounts()

  const rootNodes = useMemo<FileTreeNode[]>(() => {
    const nodes: FileTreeNode[] = [
      {
        name: t("sidebar.files.projectRoot", "Project Root"),
        path: "~/",
        parentPath: "",
        kind: "directory",
      },
    ]

    mounts.forEach((mount) => {
      nodes.push({
        name: `@${mount.name}`,
        path: `@/${mount.name}/`,
        parentPath: "",
        kind: "directory",
      })
    })

    return nodes
  }, [mounts, t])

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto">
      <FileTree nodes={rootNodes} baseDir="~/" />
    </div>
  )
}
