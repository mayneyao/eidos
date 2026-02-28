import { FormControl, FormItem, FormLabel } from "@/components/ui/form"
import { Input } from "@/components/ui/input"

interface ColorSelectProps {
  value: string | undefined
  onChange: (value: string) => void
  label: string
}

export function ColorSelect({ value, onChange, label }: ColorSelectProps) {
  return (
    <FormItem>
      <FormLabel>{label}</FormLabel>
      <FormControl>
        <div className="flex gap-2">
          <Input
            type="color"
            value={value?.startsWith("hsl") ? "#000000" : value || "#000000"}
            onChange={(e) => onChange(e.target.value)}
            className="w-[60px]"
          />
        </div>
      </FormControl>
    </FormItem>
  )
}
