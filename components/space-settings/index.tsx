import { useState } from "react"
import { SettingsIcon } from "lucide-react"
import { Link, useNavigate } from "react-router-dom"

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
  const { space } = useCurrentPathInfo()
  const { exportSpace, deleteSpace } = useSpace()
  const navigate = useNavigate()
  const [confirmName, setConfirmName] = useState("")
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

  return (
    <Card className="border-0 p-0">
      <CardHeader>
        <CardTitle>Space Settings</CardTitle>
        <CardDescription>
          Settings only apply to this space. if you want to change settings for
          all spaces, go to{" "}
          <Link to="/settings" className="text-blue-500 underline">
            global settings
          </Link>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-6">
          <div className="grid gap-3">
            <Label htmlFor="name">Name</Label>
            <Input id="name" type="text" disabled defaultValue={space} />
          </div>
          <hr />
          <div className="grid gap-3">
            <Label htmlFor="description">Export</Label>
            <Button
              size="sm"
              className=" max-w-max"
              variant="outline"
              onClick={handleExport}
            >
              Export Space
            </Button>
          </div>
          <div className="grid gap-3">
            <Label htmlFor="description">Danger zone</Label>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" className=" max-w-max" variant="destructive">
                  Delete Space
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete
                    your space{" "}
                    <span className="font-bold text-red-500">{space}</span>.
                    Please type the space name to confirm.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <Input
                  id="confirmName"
                  type="text"
                  placeholder="Type space name"
                  value={confirmName}
                  onChange={(e) => setConfirmName(e.target.value)}
                />
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    disabled={confirmName !== space}
                  >
                    Continue
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
            <SettingsIcon className="pr-2" /> <span>Settings</span>
          </span>
        </Button>
      </DialogTrigger>
      <DialogContent className="h-[90%] p-0 lg:min-w-[800px]" hideCloseButton>
        <Settings />
      </DialogContent>
    </Dialog>
  )
}
