"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { ControllerRenderProps, useForm } from "react-hook-form"
import * as z from "zod"

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/react-hook-form/form"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "@/components/ui/use-toast"
import { useActivationCodeStore } from "@/hooks/use-activation"

import { useEidosFileSystemManager } from "@/hooks/use-fs"
import { useConfigStore } from "./store"

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
    const res = await efsManager.addFile(["static"], file)
    const url = "/" + res?.join("/")
    field.onChange(url)
  }

  function onSubmit(data: ProfileFormValues) {
    setProfile(data)
    toast({
      title: "Profile updated.",
    })
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <div className="flex items-center gap-4">
          <FormField
            control={form.control}
            name="avatar"
            render={({ field }) => (
              <FormItem>
                <Avatar
                  className="h-[64px] w-[64px]"
                  onClick={() => handleChangeAvatar(field)}
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
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input placeholder="yahaha" {...field} />
                </FormControl>
                {/* <FormDescription>
                  {`When you visit other's shared pages, others will see this display name.`}
                </FormDescription> */}
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormItem className="flex items-baseline gap-2">
          <FormLabel className="  whitespace-nowrap">Client ID</FormLabel>
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
        <Button type="submit">Update</Button>
      </form>
    </Form>
  )
}
