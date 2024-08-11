import { useExtensions } from "@/apps/web-app/extensions/hooks/use-extensions"

export const useAllApps = () => {
  const { extensions } = useExtensions()
  return extensions
}
