import { SlidersHorizontalIcon, XIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

import {
  NewLLMProviderForm,
  UpdateLLMProviderForm,
} from "./new-llm-provider-form"
import { AIFormValues, LLMProvider } from "./store"

interface ILLMProviderManageProps {
  value: AIFormValues["llmProviders"]
  onChange: (value: AIFormValues["llmProviders"]) => void
}

export const LLMProviderManage = ({
  value,
  onChange,
}: ILLMProviderManageProps) => {
  const { t } = useTranslation()

  const handleAdd = (data: LLMProvider) => {
    const newData = [...value, data]
    onChange(newData)
  }

  const handleUpdate = (index: number) => (data: LLMProvider) => {
    const newData = value.map((provider, i) => (i === index ? data : provider))
    onChange(newData)
  }
  const handleRemove = (index: number) => {
    const newData = value.filter((_, i) => i !== index)
    onChange(newData)
  }
  if (value.length === 0) {
    return <NewLLMProviderForm onAdd={handleAdd} />
  }
  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("settings.ai.provider.name")}</TableHead>
            <TableHead>{t("settings.ai.provider.type")}</TableHead>
            <TableHead className="w-[100px]">{t("settings.ai.provider.actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {value.map((provider, index) => (
            <TableRow key={`${provider.name}-${provider.type}`}>
              <TableCell>{provider.name}</TableCell>
              <TableCell>{provider.type}</TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button size="icon" variant="ghost">
                        <XIcon className="h-4 w-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>{t("settings.ai.provider.confirmDelete")}</DialogTitle>
                        <DialogDescription>
                          {t("settings.ai.provider.deleteConfirmation", {
                            name: (
                              <span className="font-bold">{provider.name}</span>
                            ),
                          })}
                        </DialogDescription>
                      </DialogHeader>
                      <DialogFooter>
                        <Button
                          variant="outline"
                          onClick={() => handleRemove(index)}
                        >
                          {t("settings.ai.provider.confirmDeleteButton")}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                  <UpdateLLMProviderForm
                    value={provider}
                    onChange={handleUpdate(index)}
                  >
                    <Button size="icon" variant="ghost">
                      <SlidersHorizontalIcon className="h-4 w-4" />
                    </Button>
                  </UpdateLLMProviderForm>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="pt-4">
        <NewLLMProviderForm onAdd={handleAdd} />
      </div>
    </div>
  )
}
