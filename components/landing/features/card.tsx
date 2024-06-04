import { useTheme } from "next-themes"

import { cn } from "@/lib/utils"

export interface IFeatureCard {
  title: string
  description: string | JSX.Element
  lightImageUrl: string
  imgCls?: string
  darkImageUrl?: string
  even?: boolean
}

export const FeatureCard = ({
  lightImageUrl,
  darkImageUrl,
  title,
  description,
  imgCls,
  even,
}: IFeatureCard) => {
  const theme = useTheme()

  const imgUrl =
    theme.resolvedTheme === "dark"
      ? darkImageUrl ?? lightImageUrl
      : lightImageUrl
  return (
    <div
      className={cn("flex flex-col gap-5 sm:flex-row", {
        "sm:flex-row-reverse": even,
      })}
    >
      <div className="w-full sm:w-[40%]">
        <div className="grid gap-1">
          <h2 className="pb-4 text-3xl font-bold">{title}</h2>
          <div className="text-gray-500 dark:text-gray-400 md:text-xl">
            {description}
          </div>
        </div>
      </div>
      <div
        className={cn(
          "w-full rounded-md border object-cover shadow-sm sm:w-[60%]",
          imgCls
        )}
      >
        <img className="object-cover" src={imgUrl}></img>
      </div>
    </div>
  )
}
