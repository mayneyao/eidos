import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Link } from "react-router-dom"

import { AspectRatio } from "../ui/aspect-ratio"
import { Typewriter } from "../ui/typewriter"

const texts = [
  "📚 bookmark",
  "📖 reading list",
  "🍳 recipes",
  "🎮 game collection",
  // "📷 photo album",
]

const colors = [
  "text-cyan-400",
  "text-purple-400",
  "text-blue-400",
  "text-pink-400",
  "text-yellow-400",
  "text-green-400",
  "text-red-400",
]

const images = [
  "/show/bookmark.webp",
  "/show/reading-list.webp",
  "/show/recipes.webp",
  "/show/games.webp",
  // "/show/photos.webp",
  // "/show/wiki.webp",
]

export const BuildYourOwn = () => {
  const [currentIndex, setCurrentIndex] = useState(0)
  const currentImage = images[currentIndex % images.length]
  const slideVariants = {
    hiddenRight: {
      x: "100%",
      opacity: 0,
    },
    hiddenLeft: {
      x: "-50%",
      opacity: 0,
      transition: {
        duration: 0.3,
      },
    },
    visible: {
      x: "0",
      opacity: 1,
      transition: {
        duration: 1.5,
      },
    },
    exit: {
      opacity: 0,
      scale: 0.8,
      transition: {
        duration: 0.3,
      },
    },
  }
  return (
    <>
      <div className=" text-2xl">
        Building your own{" "}
        <Typewriter
          texts={texts}
          colors={colors}
          delay={0}
          onIndexChange={setCurrentIndex}
        />
      </div>
      <div className="space-x-4 py-4">
        <Link
          className="inline-flex h-9 items-center justify-center rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-gray-50 shadow transition-colors hover:bg-gray-900/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-950 disabled:pointer-events-none disabled:opacity-50 dark:bg-gray-50 dark:text-gray-900 dark:hover:bg-gray-50/90 dark:focus-visible:ring-gray-300"
          target="_blank"
          to="https://store.eidos.space/buy/2397216c-4322-40fa-b425-681d455e6702"
        >
          Get Early Access
        </Link>
        <a
          href="#active-selection"
          className="text-sm font-medium underline-offset-4 hover:underline"
        >
          Already have a key?
        </a>
      </div>
      <AnimatePresence>
        <AspectRatio ratio={16 / 9}>
          <motion.img
            key={currentIndex}
            src={currentImage}
            initial={"hiddenLeft"}
            variants={slideVariants}
            animate="visible"
            exit="exit"
            className="rounded-md border"
          />
        </AspectRatio>
      </AnimatePresence>
    </>
  )
}
