import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"

import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { toast } from "@/components/ui/use-toast"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/react-hook-form/form"

import {
  ExperimentFormValues,
  experimentFormSchema,
  useExperimentConfigStore,
} from "./store"

// This can come from your database or API.
const defaultValues: Partial<ExperimentFormValues> = {
  undoRedo: false,
  enableFileManager: false,
}

export function ExperimentForm() {
  const { experiment, setExperiment } = useExperimentConfigStore()
  const form = useForm<ExperimentFormValues>({
    resolver: zodResolver(experimentFormSchema),
    defaultValues: {
      ...defaultValues,
      ...experiment,
    },
  })

  function onSubmit(data: ExperimentFormValues) {
    setExperiment(data)
    toast({
      title: "Update Experiment Config Success",
    })
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <div>
          <h3 className="mb-4 text-lg font-medium">Feature</h3>
          <h4 className="text-md mb-4 font-light">
            {"POC💡 -> alpha🔨 -> beta🚀 -> release📦"}
          </h4>
          <div className="space-y-4">
            <FormField
              control={form.control}
              name="undoRedo"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">
                      Table undo/redo(alpha🔨)
                    </FormLabel>
                    <FormDescription>
                      Undo and redo your actions in table.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="enableFileManager"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">
                      File Manager(beta🚀)
                    </FormLabel>
                    <FormDescription>
                      manage files you upload to docs and tables, and you can
                      upload files directly to Eidos just like using the
                      system's file manager.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
        </div>
        <Button type="submit">Update</Button>
      </form>
    </Form>
  )
}
