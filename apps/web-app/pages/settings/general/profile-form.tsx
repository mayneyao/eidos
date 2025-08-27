"use client"

import { useEffect, useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { Check, X } from "lucide-react"
import { useForm, type ControllerRenderProps } from "react-hook-form"
import { useTranslation } from "react-i18next"
import * as z from "zod"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { toast } from "@/components/ui/use-toast"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/react-hook-form/form"
import { useActivationCodeStore } from "@/apps/web-app/hooks/use-activation"
import { useEidosFileSystemManager } from "@/apps/web-app/hooks/use-fs"

import { useConfigStore } from "../store"

const profileFormSchema = z.object({
  username: z
    .string()
    .min(2, {
      message: "Username must be at least 2 characters.",
    })
    .max(30, {
      message: "Username must not be longer than 30 characters.",
    }),
  userId: z.string().optional(),
  avatar: z.string().optional(),
})

export type ProfileFormValues = z.infer<typeof profileFormSchema>

// This can come from your database or API.
const defaultValues: Partial<ProfileFormValues> = {}

export function ProfileForm() {
  const { setProfile, profile } = useConfigStore()
  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      ...defaultValues,
      ...profile,
    },
    mode: "onChange",
  })
  const { clientId } = useActivationCodeStore()
  const { efsManager } = useEidosFileSystemManager()
  const { t } = useTranslation()

  // State to track if username has changed
  const [usernameChanged, setUsernameChanged] = useState(false)

  // Effect to detect username changes
  useEffect(() => {
    const subscription = form.watch((value, { name }) => {
      if (name === "username") {
        setUsernameChanged(value.username !== profile?.username)
      }
    })
    return () => subscription.unsubscribe()
  }, [form, profile?.username])

  const handleChangeAvatar = async (
    field: ControllerRenderProps<
      {
        username: string
        userId?: string | undefined
        avatar?: string | undefined
      },
      "avatar"
    >
  ) => {
    try {
      const [fileHandle] = await (window as any).showOpenFilePicker({
        types: [
          {
            description: "Images",
            accept: {
              "image/*": [".png", ".gif", ".jpeg", ".jpg"],
            },
          },
        ],
        excludeAcceptAllOption: true,
        multiple: false,
      })
      const file = await fileHandle.getFile()

      const res = await efsManager?.addFile(["static"], file)
      if (!res) {
        throw new Error("Failed to upload avatar.")
      }
      const url = "/" + res?.join("/")
      field.onChange(url)

      const currentProfile = form.getValues()
      setProfile({ ...currentProfile, avatar: url })

      toast({
        title: t("settings.profile.avatarUpdateSuccess"),
      })
    } catch (error) {
      console.error("Error changing avatar:", error)
      toast({
        title: t("settings.profile.avatarUpdateError"),
        variant: "destructive",
      })
    }
  }

  function onSubmit(data: ProfileFormValues) {
    setProfile(data)
    setUsernameChanged(false) // Reset change state after submit
    toast({
      title: t("settings.profile.updateSuccess"), // Use i18n key
    })
  }

  const handleRevertUsername = () => {
    form.setValue("username", profile?.username ?? "")
    setUsernameChanged(false)
  }

  const handleSaveUsername = () => {
    // Trigger form validation and submission specifically for username
    form.handleSubmit(onSubmit)()
  }

  return (
    <Form {...form}>
      <form onSubmit={(e) => e.preventDefault()} className="space-y-8">
        <div className="flex items-center gap-4">
          <FormField
            control={form.control}
            name="avatar"
            render={({ field }) => (
              <FormItem>
                <Avatar
                  className="h-[64px] w-[64px]"
                  onClick={() => handleChangeAvatar(field as any)}
                >
                  <AvatarImage src={field.value} className=" object-cover" />
                  <AvatarFallback>
                    {form.getValues("username")?.[0]?.toUpperCase() ?? "E"}
                  </AvatarFallback>
                </Avatar>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="username"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("common.name")}</FormLabel>
                <div className="flex items-center gap-2">
                  <FormControl>
                    <Input placeholder="yahaha" {...field} />
                  </FormControl>
                  {usernameChanged && (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={handleSaveUsername}
                        aria-label={t("common.save")}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={handleRevertUsername}
                        aria-label={t("common.cancel")}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormItem className="flex items-baseline gap-2">
          <FormLabel className="  whitespace-nowrap">
            {t("settings.general.clientId")}
          </FormLabel>
          <FormControl>
            <Input disabled value={clientId} />
          </FormControl>
          <FormMessage />
        </FormItem>

        <FormField
          control={form.control}
          name="userId"
          render={({ field }) => (
            <FormItem className="hidden">
              <FormLabel>ID</FormLabel>
              <FormControl>
                <Input {...field} disabled />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </form>
    </Form>
  )
}
