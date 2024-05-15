import { Loader2, SparklesIcon } from "lucide-react"

export const Loading = () => <Loader2 className="h-5 w-5 animate-spin" />

export const TwinkleSparkle = () => {
  return <SparklesIcon className="h-6 w-6 animate-pulse text-purple-500" />
}
