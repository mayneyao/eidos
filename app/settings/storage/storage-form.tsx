"use client"

import { useEffect, useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { Check, ChevronsUpDown } from "lucide-react"
import { useForm } from "react-hook-form"
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

const fsTypes = [
  { label: "OPFS", value: FileSystemType.OPFS },
  { label: "Native File System", value: FileSystemType.NFS },
] as const

const storageFormSchema = z.object({
  fsType: z.enum([FileSystemType.OPFS, FileSystemType.NFS]),
  localPath: z.string().optional(),
  autoBackupGap: z.number().default(15),
})

type StorageFormValues = z.infer<typeof storageFormSchema>

export function StorageForm() {
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
          title: "Local path not selected",
          description: "You need to select a local path to store your files.",
        })
        return
      }
      if (!isGranted) {
        toast({
          title: "Permission denied",
          description: "You need to grant permission to access the directory.",
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
      title: "Settings updated",
    })
  }

  // get current fsType
  const currentFsType = form.watch("fsType")

  return (
    <Form {...form}>
      <form className="space-y-8">
        <FormField
          control={form.control}
          name="fsType"
          render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel>File System</FormLabel>
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
                        : "Select File System"}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </FormControl>
                </PopoverTrigger>
                <PopoverContent className="w-[200px] p-0">
                  <Command>
                    <CommandInput placeholder="Search type..." />
                    <CommandEmpty>No type found.</CommandEmpty>
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
                which file system to store your files. <br /> OPFS stores files
                in the browser's storage, while Native File System stores files
                in a local directory on your device.
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
                  <FormLabel>Local Path</FormLabel>
                  <div className="flex gap-1">
                    <div className="flex w-full items-center rounded-sm border p-1 px-3">
                      {localPath?.name}
                    </div>
                    <div className="flex gap-2">
                      <Button type="button" onClick={handleSelectLocalPath}>
                        Select
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        onClick={clearLocalPath}
                      >
                        Clear
                      </Button>
                    </div>
                  </div>
                  <FormDescription>
                    the local path where your files will be stored.
                    {isGranted ? (
                      <span className="text-green-500">
                        {" "}
                        Permission granted.
                      </span>
                    ) : (
                      <div className=" inline-flex items-center gap-2">
                        <span className="text-red-500">
                          {" "}
                          Permission denied.
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
                            Grant Permission
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
                  <FormLabel>Auto backup gap(minutes)</FormLabel>
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
                      ? "Disable auto save."
                      : `backup data every ${field.value} minutes, 0 means disable auto
                  save.`}
                    <div className="my-2">
                      backup every space's database to the local path. keep data
                      more secure.
                    </div>
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </>
        )}
        <Button type="button" className="mt-4" onClick={() => onSubmit()}>
          Update
        </Button>
      </form>
    </Form>
  )
}
