import { useEffect, useState } from "react"
import {
  CogIcon,
  CommandIcon,
  Download,
  Github,
  HomeIcon,
  Keyboard,
  MailIcon,
  MoreHorizontal,
  PackageIcon,
  RefreshCw,
  ScanTextIcon,
  Trash2Icon,
} from "lucide-react"
import { useTranslation } from "react-i18next"
import { Link, useNavigate } from "react-router-dom"

import { BGEM3 } from "@/lib/ai/llm_vendors/bge"
import { DOMAINS } from "@/lib/const"
import { EIDOS_VERSION, isDesktopMode } from "@/lib/env"
import { useAppRuntimeStore } from "@/lib/store/runtime-store"
import { useCurrentNode } from "@/hooks/use-current-node"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useEmbedding } from "@/hooks/use-embedding"
import { useHnsw } from "@/hooks/use-hnsw"
import { useSqlite } from "@/hooks/use-sqlite"
import { useVCardEmail } from "@/hooks/use-vcard-email"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { DiscordIcon } from "@/components/icons/discord"
import { NodeUpdateTime } from "@/components/nav/node-update-time"
import { useExperimentConfigStore } from "@/apps/web-app/settings/experiment/store"

import { CopyShowHide } from "../copy-show-hide"
import { NodeMoveInto } from "../node-menu/move-into"
import { NodeExport } from "../node-menu/node-export"
import { Switch } from "../ui/switch"
import { useToast } from "../ui/use-toast"
import { VCardQrCode } from "../vcard-qr-code"
import { UpdateStatusComponent } from "./update-status"

export function NavDropdownMenu() {
  const { t } = useTranslation()
  const router = useNavigate()
  const [open, setOpen] = useState(false)
  const { hasEmbeddingModel, embeddingTexts } = useEmbedding()

  const { deleteNode, toggleNodeFullWidth, toggleNodeLock } = useSqlite()
  const { isKeyboardShortcutsOpen, setKeyboardShortcutsOpen } =
    useAppRuntimeStore()

  const toggleKeyboardShortcuts = () => {
    setKeyboardShortcutsOpen(!isKeyboardShortcutsOpen)
  }

  const { setCmdkOpen, isCmdkOpen, isEmbeddingModeLoaded } =
    useAppRuntimeStore()
  const { getEmail, enabled } = useVCardEmail()
  const node = useCurrentNode()
  const { toast } = useToast()

  const { createEmbedding } = useHnsw()
  const { experiment } = useExperimentConfigStore()
  const { space } = useCurrentPathInfo()
  const toggleCMDK = () => {
    setCmdkOpen(!isCmdkOpen)
  }
  const goSettings = () => {
    router("/settings")
  }

  const deleteCurrentNode = () => {
    if (node) {
      deleteNode(node)
      router(`/${space}`)
    }
  }

  const handleCreateDocEmbedding = async () => {
    if (node) {
      toast({
        title: t("nav.dropdown.menu.creatingEmbedding", { name: node.name }),
      })
      await createEmbedding({
        id: node.id,
        type: "doc",
        model: "bge-m3",
        provider: new BGEM3(embeddingTexts),
      })
      toast({
        title: t("nav.dropdown.menu.embeddingCreated"),
      })
    }
  }

  return (
    <>
      <Dialog>
        <DialogContent className="">
          <DialogHeader>
            <DialogTitle>{t("nav.dropdown.menu.sendMailToEidos")}</DialogTitle>
            {node && (
              <div className="!mt-5 flex w-full flex-col gap-4">
                <div className="flex w-full justify-center">
                  <VCardQrCode
                    firstName={node.name || t("common.untitled")}
                    lastName={space}
                    email={getEmail(node.id, space)}
                  />
                </div>
                <DialogDescription>
                  {node && <CopyShowHide text={getEmail(node.id, space)} />}
                </DialogDescription>
                <p className="p-2">
                  {t("nav.dropdown.menu.emailInstructions")}
                </p>
              </div>
            )}
          </DialogHeader>
        </DialogContent>

        <DropdownMenu open={open} onOpenChange={setOpen}>
          <DropdownMenuTrigger asChild>
            <Button size="xs" variant="ghost">
              <MoreHorizontal className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56">
            <DropdownMenuGroup>
              <DropdownMenuItem onSelect={toggleCMDK}>
                <CommandIcon className="mr-2 h-4 w-4" />
                <span>{t("nav.dropdown.menu.commandPalette")}</span>
                <DropdownMenuShortcut>⌘K</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={toggleKeyboardShortcuts}>
                <Keyboard className="mr-2 h-4 w-4" />
                <span>{t("nav.dropdown.menu.keyboardShortcuts")}</span>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={goSettings}>
                <CogIcon className="mr-2 h-4 w-4" />
                <span>{t("common.settings")}</span>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <Link to="https://github.com/mayneyao/eidos" target="_blank">
              <DropdownMenuItem>
                <Github className="mr-2 h-4 w-4" />
                <span>GitHub</span>
              </DropdownMenuItem>
            </Link>
            <Link to={DOMAINS.DISCORD_INVITE} target="_blank">
              <DropdownMenuItem>
                <DiscordIcon className="mr-2 h-4 w-4" />
                <span>Discord</span>
              </DropdownMenuItem>
            </Link>
            <Link to="/?home=1">
              <DropdownMenuItem>
                <HomeIcon className="mr-2 h-4 w-4" />
                <span>{t("nav.dropdown.menu.website")}</span>
              </DropdownMenuItem>
            </Link>

            {node && (
              <>
                {node.type === "doc" && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="flex justify-between"
                      onClick={(e) => {
                        e.preventDefault()
                        toggleNodeFullWidth(node)
                      }}
                    >
                      {t("nav.dropdown.menu.fullWidth")}
                      <Switch checked={node.is_full_width} />
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="flex justify-between"
                      onClick={(e) => {
                        e.preventDefault()
                        toggleNodeLock(node)
                      }}
                    >
                      {t("nav.dropdown.menu.lock")}
                      <Switch checked={node.is_locked} />
                    </DropdownMenuItem>
                  </>
                )}
                {node.type === "table" && enabled && (
                  <>
                    <DropdownMenuSeparator />
                    <DialogTrigger className="w-full">
                      <DropdownMenuItem>
                        <MailIcon className="pr-2" />
                        {t("nav.dropdown.menu.mail")}
                      </DropdownMenuItem>
                    </DialogTrigger>
                  </>
                )}
                <DropdownMenuSeparator />
                <NodeExport node={node} />
                {node.type === "doc" && (
                  <>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        <PackageIcon className="pr-2" />
                        {t("node.menu.moveInto")}
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="w-48">
                        <NodeMoveInto node={node} />
                      </DropdownMenuSubContent>
                      {experiment.enableRAG && (
                        <DropdownMenuItem
                          onClick={handleCreateDocEmbedding}
                          disabled={!hasEmbeddingModel}
                        >
                          <div className="flex w-full items-center justify-between pr-1">
                            <div className="flex items-center">
                              <ScanTextIcon className="mr-2 h-4 w-4"></ScanTextIcon>
                              {t("nav.dropdown.menu.embedding")}
                            </div>
                          </div>
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuSub>
                  </>
                )}
                <DropdownMenuItem onClick={deleteCurrentNode}>
                  <Trash2Icon className="mr-2 h-4 w-4"></Trash2Icon>
                  <span>{t("common.delete")}</span>
                </DropdownMenuItem>
                <NodeUpdateTime />
              </>
            )}
            <DropdownMenuSeparator />
            <Link to="/download">
              <DropdownMenuItem>
                <Download className="mr-2 h-4 w-4" />
                <span>{t("common.download")}</span>
              </DropdownMenuItem>
            </Link>
            <UpdateStatusComponent />
            <span className="p-2 text-sm text-gray-500">
              {t("nav.dropdown.menu.version", {
                version: EIDOS_VERSION,
                mode: isDesktopMode
                  ? t("nav.dropdown.menu.desktop")
                  : t("nav.dropdown.menu.web"),
              })}
            </span>
          </DropdownMenuContent>
        </DropdownMenu>
      </Dialog>
    </>
  )
}
