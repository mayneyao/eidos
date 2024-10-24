import { useState } from "react"
import { SettingsIcon } from "lucide-react"
import { Link, useNavigate } from "react-router-dom"
import { useTranslation } from "react-i18next"

import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useSpace } from "@/hooks/use-space"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { Button } from "../ui/button"

export function Settings() {
  const { t } = useTranslation()
  const { space } = useCurrentPathInfo()
  const { exportSpace, deleteSpace, rebuildIndex } = useSpace()
  const navigate = useNavigate()
  const [confirmName, setConfirmName] = useState("")
  const [isRebuilding, setIsRebuilding] = useState(false)

  const handleExport = () => {
    exportSpace(space)
  }

  const handleDelete = async () => {
    if (confirmName === space) {
      await deleteSpace(space)
      navigate("/")
      window.location.reload()
    } else {
      alert("The space name does not match.")
    }
  }

  const handleRebuildIndex = async () => {
    setIsRebuilding(true)
    try {
      await rebuildIndex()
      alert("Index rebuilt successfully!")
    } catch (error) {
      console.error("Error rebuilding index:", error)
      alert("Failed to rebuild index. Please try again.")
    } finally {
      setIsRebuilding(false)
    }
  }

  return (
    <Card className="border-0 p-0">
      <CardHeader>
        <CardTitle>{t('space.settings.title')}</CardTitle>
        <CardDescription>
          {t('space.settings.description')}{" "}
          <Link to="/settings" className="text-blue-500 underline">
            {t('space.settings.globalSettings')}
          </Link>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-6">
          <div className="grid gap-3">
            <Label htmlFor="name">{t('common.name')}</Label>
            <Input id="name" type="text" disabled defaultValue={space} />
          </div>
          <hr />
          <div className="grid gap-3">
            <Label htmlFor="description">{t('common.export')}</Label>
            <p className="text-sm text-muted-foreground">
              {t('space.settings.exportDescription')}
            </p>
            <Button
              size="sm"
              className="max-w-max"
              variant="outline"
              onClick={handleExport}
            >
              {t('space.settings.exportSpace')}
            </Button>
          </div>
          <div className="grid gap-3">
            <Label htmlFor="rebuild-index">{t('space.settings.rebuildIndex')}</Label>
            <p className="text-sm text-muted-foreground">
              {t('space.settings.rebuildIndexDescription')}
            </p>
            <Button
              size="sm"
              className="max-w-max"
              variant="outline"
              onClick={handleRebuildIndex}
              disabled={isRebuilding}
            >
              {isRebuilding ? t('space.settings.rebuilding') : t('space.settings.rebuildIndex')}
            </Button>
          </div>
          <div className="grid gap-3">
            <Label htmlFor="description">{t('space.settings.dangerZone')}</Label>
            <p className="text-sm text-muted-foreground">
              {t('space.settings.deleteSpaceDescription')}
            </p>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" className=" max-w-max" variant="destructive">
                  {t('space.settings.deleteSpace')}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('common.areYouAbsolutelySure')}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t('space.settings.deleteSpaceWarning', { spaceName: space })}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <Input
                  id="confirmName"
                  type="text"
                  placeholder={t('space.settings.typeSpaceName')}
                  value={confirmName}
                  onChange={(e) => setConfirmName(e.target.value)}
                />
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    disabled={confirmName !== space}
                  >
                    {t('common.continue')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export const SpaceSettings = () => {
  const { t } = useTranslation()
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant={"ghost"}
          size="sm"
          className="w-full cursor-pointer justify-start font-normal"
          asChild
        >
          <span>
            <SettingsIcon className="pr-2" /> <span>{t('common.settings')}</span>
          </span>
        </Button>
      </DialogTrigger>
      <DialogContent className="h-[90%] p-0 lg:min-w-[800px]" hideCloseButton>
        <Settings />
      </DialogContent>
    </Dialog>
  )
}
