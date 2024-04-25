import { startTransition, useRef } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useClickAway } from "ahooks"
import { useForm } from "react-hook-form"
import * as z from "zod"

import { IView, ViewTypeEnum } from "@/lib/store/IView"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/react-hook-form/form"

import { Button } from "../ui/button"
import { useViewOperation } from "./hooks"

const formSchema = z.object({
  name: z.string(),
  type: z.string(),
  query: z.string().optional(),
})

interface IViewEditorProps {
  setEditDialogOpen: (open: boolean) => void
  view: IView
}

export const ViewEditor = ({ setEditDialogOpen, view }: IViewEditorProps) => {
  const ref = useRef<HTMLDivElement>(null)
  const { updateView } = useViewOperation()

  useClickAway(
    (e) => {
      console.log(e.target)
      setEditDialogOpen(false)
    },
    [ref],
    ["mousedown", "touchstart"]
  )
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: view.name,
      type: view.type,
      query: view.query || `SELECT * from tb_${view.table_id};`,
    },
  })
  function onSubmit(values: z.infer<typeof formSchema>) {
    updateView(view.id, {
      query: values.query,
      name: values.name,
    })
  }

  const handleChangeViewType = (type: ViewTypeEnum) => {
    startTransition(() => {
      updateView(view.id, { type })
    })
  }

  return (
    <div
      className="absolute right-0 top-0 z-10 h-full w-[400px] overflow-hidden bg-white p-3 shadow-lg dark:bg-slate-950"
      ref={ref}
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormDescription></FormDescription>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Type</FormLabel>
                <FormDescription>
                  The type of view to use for this table.
                </FormDescription>
                <FormControl>
                  <div className="flex gap-2">
                    <div
                      onClick={() => {
                        field.onChange("grid")
                        handleChangeViewType(ViewTypeEnum.Grid)
                      }}
                      className={cn(
                        "flex h-12 w-12 cursor-pointer items-center justify-center border border-slate-900",
                        field.value === "grid"
                          ? "bg-slate-900 text-white"
                          : "bg-white text-slate-900"
                      )}
                    >
                      grid
                    </div>
                    <div
                      onClick={() => {
                        field.onChange("gallery")
                        handleChangeViewType(ViewTypeEnum.Gallery)
                      }}
                      className={cn(
                        "flex h-12 w-12 cursor-pointer items-center justify-center border border-slate-900",
                        field.value === "gallery"
                          ? "bg-slate-900 text-white"
                          : "bg-white text-slate-900"
                      )}
                    >
                      gallery
                    </div>
                  </div>
                </FormControl>

                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="query"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Query</FormLabel>
                <FormDescription>
                  sql query to use for this view.
                </FormDescription>
                <FormControl>
                  <Input {...field} disabled />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit">update</Button>
        </form>
      </Form>
    </div>
  )
}
