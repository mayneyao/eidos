"use client"

import { useEffect, useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { Check, ChevronsUpDown } from "lucide-react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import * as z from "zod"

import { FileSystemType } from "@/lib/storage/eidos-file-system"
import { cn } from "@/lib/utils"
import { useIndexedDB } from "@/hooks/use-indexed-db"
import { useSqlite } from "@/hooks/use-sqlite"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
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

const getFsTypes = (t: (key: string) => string) => [
  { label: "OPFS", value: FileSystemType.OPFS },
  { label: t("settings.storage.nativeFileSystem"), value: FileSystemType.NFS },
] as const

const storageFormSchema = z.object({
  fsType: z.enum([FileSystemType.OPFS, FileSystemType.NFS]),
  localPath: z.string().optional(),
  autoBackupGap: z.number().default(15),
})

type StorageFormValues = z.infer<typeof storageFormSchema>

export function StorageForm() {
  const { t } = useTranslation()
  const [localPath, setLocalPath] =
    useIndexedDB<FileSystemDirectoryHandle | null>("kv", "localPath", null)
  const [fsType, setFsType] = useIndexedDB("kv", "fs", FileSystemType.OPFS)
  const [autoBackupGap, setAutoBackupGap] = useIndexedDB(
    "kv",
    "autoBackupGap",
    15
  )

  const updateAutoBackupGap = (value: number) => {
    if (value >= 10) {
      setAutoBackupGap(value)
    }
  }
  const [isGranted, setIsGranted] = useState(false)
  const { sqlite } = useSqlite()

  const form = useForm<StorageFormValues>({
    resolver: zodResolver(storageFormSchema),
  })

  const clearLocalPath = () => {
    setLocalPath(null)
    setIsGranted(false)
  }

  useEffect(() => {
    if (localPath) {
      const checkPermission = async () => {
        const res = await localPath.requestPermission({
          mode: "readwrite",
        })
        setIsGranted(res === "granted")
      }
      checkPermission()
    }
  }, [localPath])

  useEffect(() => {
    form.setValue("fsType", fsType)
  }, [form, fsType])

  useEffect(() => {
    form.setValue("localPath", localPath?.name)
  }, [form, localPath])

  useEffect(() => {
    form.setValue("autoBackupGap", autoBackupGap)
  }, [form, autoBackupGap])

  const handleSelectLocalPath = async () => {
    const dirHandle = await window.showDirectoryPicker()
    // store this dirHandle to indexedDB
    setLocalPath(dirHandle)
    if (dirHandle) {
      await dirHandle.requestPermission({
        mode: "readwrite",
      })
    }
  }

  async function onSubmit() {
    const data = form.getValues()

    if (data.fsType === FileSystemType.NFS) {
      if (!localPath) {
        toast({
          title: t("settings.storage.dataFolderNotSelected"),
          description: t("settings.storage.selectDataFolder"),
        })
        return
      }
      if (!isGranted) {
        toast({
          title: t("common.error"),
          description: t("settings.storage.permissionDenied"),
        })
        return
      }
    }
    const sourceFs = fsType
    const targetFs = data.fsType
    sqlite?.transformFileSystem(sourceFs, targetFs)
    setFsType(data.fsType)
    setAutoBackupGap(data.autoBackupGap)
    toast({
      title: t("settings.storage.settingsUpdated"),
    })
  }

  // get current fsType
  const currentFsType = form.watch("fsType")

  // Use the function to get fsTypes when needed
  const fsTypes = getFsTypes(t)

  return (
    <Form {...form}>
      <form className="space-y-8">
        <FormField
          control={form.control}
          name="fsType"
          render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel>{t("settings.storage.fileSystem")}</FormLabel>
              <Popover>
                <PopoverTrigger asChild>
                  <FormControl>
                    <Button
                      variant="outline"
                      role="combobox"
                      className={cn(
                        "w-[200px] justify-between",
                        !field.value && "text-muted-foreground"
                      )}
                    >
                      {field.value
                        ? fsTypes.find((fsType) => fsType.value === field.value)
                            ?.label
                        : t("settings.storage.selectFileSystem")}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </FormControl>
                </PopoverTrigger>
                <PopoverContent className="w-[200px] p-0">
                  <Command>
                    <CommandInput
                      placeholder={t("settings.storage.searchType")}
                    />
                    <CommandEmpty>
                      {t("settings.storage.noTypeFound")}
                    </CommandEmpty>
                    <CommandGroup>
                      {fsTypes.map((type) => (
                        <CommandItem
                          value={type.value}
                          key={type.value}
                          onSelect={(value: any) => {
                            form.setValue("fsType", value as FileSystemType)
                            form.trigger("fsType")
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              type.value === field.value
                                ? "opacity-100"
                                : "opacity-0"
                            )}
                          />
                          {type.label}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </Command>
                </PopoverContent>
              </Popover>
              <FormDescription>
                {t("settings.storage.fileSystemDescription")}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        {currentFsType === FileSystemType.NFS && (
          <>
            <FormField
              control={form.control}
              name="localPath"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>{t("settings.storage.dataFolder")}</FormLabel>
                  <div className="flex gap-1">
                    <div className="flex w-full items-center rounded-sm border p-1 px-3">
                      {localPath?.name ||
                        t("settings.storage.dataFolderNotSelected")}
                    </div>
                    <div className="flex gap-2">
                      <Button type="button" onClick={handleSelectLocalPath}>
                        {t("common.select")}
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        onClick={clearLocalPath}
                      >
                        {t("common.cancel")}
                      </Button>
                    </div>
                  </div>
                  <FormDescription>
                    {t("settings.storage.dataFolderDescription")}
                    {isGranted ? (
                      <span className="text-green-500">
                        {" "}
                        {t("settings.storage.permissionGranted")}
                      </span>
                    ) : (
                      <div className=" inline-flex items-center gap-2">
                        <span className="text-red-500">
                          {" "}
                          {t("settings.storage.permissionDenied")}
                        </span>
                        {localPath && (
                          <Button
                            variant="outline"
                            size="xs"
                            onClick={(e) => {
                              e.preventDefault()
                              localPath?.requestPermission({
                                mode: "readwrite",
                              })
                            }}
                          >
                            {t("settings.storage.grantPermission")}
                          </Button>
                        )}
                      </div>
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="autoBackupGap"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("settings.storage.autoBackupGap")}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="10"
                      autoComplete="off"
                      type="number"
                      min={10}
                      value={autoBackupGap}
                      onChange={(e) => {
                        updateAutoBackupGap(e.target.valueAsNumber)
                      }}
                    />
                  </FormControl>
                  <FormDescription>
                    {autoBackupGap == 0
                      ? t("settings.storage.autoBackupDisabled")
                      : t("settings.storage.autoBackupDescription", {
                          minutes: field.value,
                        })}
                    <div className="my-2">
                      {t("settings.storage.autoBackupExplanation")}
                    </div>
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </>
        )}
        <Button type="button" className="mt-4" onClick={() => onSubmit()}>
          {t("common.update")}
        </Button>
      </form>
    </Form>
  )
}
