import { useEffect, useState } from "react"
import { useTheme } from "next-themes"

import { cn } from "@/lib/utils"
import {
  Carousel,
  CarouselApi,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel"

export interface IFeatureCard {
  title: string
  description: string | JSX.Element | (string | JSX.Element)[]
  lightImageUrls: string[]
  imgCls?: string
  darkImageUrls?: string[]
  even?: boolean
}

export const FeatureCard = ({
  lightImageUrls,
  darkImageUrls,
  title,
  description,
  imgCls,
  even,
}: IFeatureCard) => {
  const theme = useTheme()
  const [api, setApi] = useState<CarouselApi>()
  const [current, setCurrent] = useState(0)
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!api) {
      return
    }

    setCount(api.scrollSnapList().length)
    setCurrent(api.selectedScrollSnap() + 1)

    api.on("select", () => {
      setCurrent(api.selectedScrollSnap() + 1)
    })
  }, [api])
  const imgUrls =
    theme.resolvedTheme === "dark"
      ? darkImageUrls ?? lightImageUrls
      : lightImageUrls

  const currentDescription = Array.isArray(description)
    ? description[current - 1]
    : description

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
            {currentDescription}
          </div>
        </div>
      </div>
      <div className="w-full sm:w-[60%]">
        <Carousel
          setApi={setApi}
          opts={{
            loop: true,
          }}
        >
          <CarouselContent>
            {imgUrls.map((url, index) => (
              <CarouselItem key={index}>
                <div
                  className={cn(
                    "rounded-md border object-cover shadow-sm",
                    imgCls
                  )}
                >
                  <img
                    className="object-cover w-full"
                    src={url}
                    alt={`${title} step ${index + 1}`}
                  />
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
          {imgUrls.length > 1 && (
            <>
              <CarouselPrevious />
              <CarouselNext />
            </>
          )}
        </Carousel>
      </div>
    </div>
  )
}
