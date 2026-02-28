import { isDesktopMode } from "@/lib/env"

export function useDesktopClient() {
  return {
    isDesktop: isDesktopMode,
    isLoading: false,
  }
}
