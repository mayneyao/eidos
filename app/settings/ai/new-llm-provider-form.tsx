import { useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/react-hook-form/form"

import { LLMProvider, llmProviderSchema } from "./store"

interface ILLMProviderManageProps {
  onAdd: (data: LLMProvider) => void
}

export const UpdateLLMProviderForm = ({
  value,
  onChange,
  children,
}: LLMProviderFormProps & {
  children?: React.ReactNode
}) => {
  const [open, setOpen] = useState(false)
  const handleChange = (data: LLMProvider) => {
    onChange?.(data)
    setOpen(false)
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Update LLM Provider</DialogTitle>
        </DialogHeader>
        <LLMProviderForm value={value} onChange={handleChange} />
      </DialogContent>
    </Dialog>
  )
}

export const NewLLMProviderForm = ({ onAdd }: ILLMProviderManageProps) => {
  const [open, setOpen] = useState(false)
  const handleAdd = (data: LLMProvider) => {
    onAdd(data)
    setOpen(false)
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary">
          Add Provider
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>New LLM Provider</DialogTitle>
          <DialogDescription>
            Add a new LLM provider to the list of providers.
          </DialogDescription>
        </DialogHeader>
        <LLMProviderForm onAdd={handleAdd} />
      </DialogContent>
    </Dialog>
  )
}

interface LLMProviderFormProps {
  value?: LLMProvider
  onChange?: (value: LLMProvider) => void
  onAdd?: (data: LLMProvider) => void
}

export const LLMProviderForm = ({
  onAdd,
  value,
  onChange,
}: LLMProviderFormProps) => {
  const form = useForm<LLMProvider>({
    resolver: zodResolver(llmProviderSchema),
    defaultValues: value || {
      name: "",
      type: "openai",
      apiKey: "",
      baseUrl: "",
      models: "",
    },
  })

  function onSubmit(data: LLMProvider) {
    onChange ? onChange(data) : onAdd?.(data)
  }

  function handleSubmit() {
    const data = form.getValues()
    onSubmit(data)
  }

  const mode = onChange ? "Update" : "Add"

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  autoComplete="off"
                  placeholder="openai/ollama/groq/moonshoot..."
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          name="type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Type</FormLabel>
              <FormControl>
                <Select
                  {...field}
                  onValueChange={(value) => {
                    form.setValue("type", value as any)
                  }}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="openai">OpenAI</SelectItem>
                    <SelectItem value="google">Google</SelectItem>
                  </SelectContent>
                </Select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {
          // only show the following fields if the type is openai
          form.watch("type") === "openai" && (
            <FormField
              name="baseUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Base URL</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="https://api.openai.com/v1" />
                  </FormControl>
                  <FormDescription>
                    This is the base URL used to access the OpenAI API or API
                    compatible service.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          )
        }
        <FormField
          name="apiKey"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Api Key</FormLabel>
              <FormControl>
                <Input {...field} type="password" />
              </FormControl>
              <FormDescription>
                This is the key used to access the API.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          name="models"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Models</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  placeholder="llama3-70b-8192,mixtral-8x7b-32768"
                />
              </FormControl>
              <FormDescription>
                add models to use, comma separated.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button onClick={handleSubmit}>{mode}</Button>
      </form>
    </Form>
  )
}
