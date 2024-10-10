"use client"

import { useEffect, useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "@/components/ui/use-toast"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/react-hook-form/form"

const storageFormSchema = z.object({
  dataFolder: z.string().nonempty("Data folder is required"),
})

type StorageFormValues = z.infer<typeof storageFormSchema>

export function StorageForm() {
  const [dataFolder, setDataFolder] = useState<string | null>(null)

  const form = useForm<StorageFormValues>({
    resolver: zodResolver(storageFormSchema),
  })

  useEffect(() => {
    const loadConfig = async () => {
      const dataFolder = await window.eidos.config.get("dataFolder")
      setDataFolder(dataFolder || "")
    }

    loadConfig()
  }, [])

  useEffect(() => {
    form.setValue("dataFolder", dataFolder || "")
  }, [form, dataFolder])

  const handleSelectDataFolder = async () => {
    const selectedFolder = await window.eidos.selectFolder()
    if (selectedFolder) {
      setDataFolder(selectedFolder)
    }
  }

  async function onSubmit() {
    const data = form.getValues()

    if (!data.dataFolder) {
      toast({
        title: "Data folder not selected",
        description: "You need to select a data folder.",
      })
      return
    }

    await window.eidos.config.set("dataFolder", data.dataFolder)

    toast({
      title: "Settings updated",
    })
    await window.eidos.reloadApp()
  }

  return (
    <Form {...form}>
      <form className="space-y-8">
        <FormField
          control={form.control}
          name="dataFolder"
          render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel>Data Folder</FormLabel>
              <div className="flex gap-1">
                <FormControl>
                  <Input
                    {...field}
                    placeholder="Select a data folder"
                    readOnly
                  />
                </FormControl>
                <Button type="button" onClick={handleSelectDataFolder}>
                  Select
                </Button>
              </div>
              <FormDescription>
                The folder where your data will be stored.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="button" className="mt-4" onClick={() => onSubmit()}>
          Update
        </Button>
      </form>
    </Form>
  )
}
