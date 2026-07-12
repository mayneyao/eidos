import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import type {
  DefaultValues,
  FieldValues,
  Resolver,
  UseFormReturn,
} from "react-hook-form"

// The resolver and workspace Zod versions otherwise make TypeScript expand
// the complete schema recursively. The runtime contract only needs a schema
// plus the field-value type consumed by react-hook-form.
const resolveZod = zodResolver as unknown as (
  schema: unknown
) => Resolver<FieldValues>
const useUntypedForm = useForm as unknown as (options: {
  resolver: Resolver<FieldValues>
  defaultValues: FieldValues
}) => UseFormReturn<FieldValues>

export function useCompatibleZodForm<T extends FieldValues>(
  schema: unknown,
  defaultValues: DefaultValues<T>
): UseFormReturn<T> {
  return useUntypedForm({
    resolver: resolveZod(schema),
    defaultValues,
  }) as unknown as UseFormReturn<T>
}
