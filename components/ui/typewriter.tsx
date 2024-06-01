"use client"

import { useEffect, useState } from "react"
import { animate, motion, useMotionValue, useTransform } from "framer-motion"

import { cn } from "@/lib/utils"

export interface ITypewriterProps {
  delay: number
  texts: string[]
  colors?: string[] // tailwind colors
  baseText?: string
}

function visibleLength(str: string) {
  return [...new Intl.Segmenter().segment(str)].length
}

function sliceText(str: string, length: number) {
  return [...new Intl.Segmenter().segment(str)]
    .slice(0, length)
    .map((s) => s.segment)
    .join("")
}

export function Typewriter({
  delay,
  texts,
  colors,
  baseText = "",
}: ITypewriterProps) {
  const [animationComplete, setAnimationComplete] = useState(false)
  const count = useMotionValue(0)
  const rounded = useTransform(count, (latest) => Math.round(latest))
  const displayText = useTransform(rounded, (latest) =>
    sliceText(baseText, latest)
  )

  useEffect(() => {
    const controls = animate(count, visibleLength(baseText), {
      type: "tween",
      delay,
      duration: 1,
      ease: "easeInOut",
      onComplete: () => setAnimationComplete(true),
    })
    return () => {
      controls.stop && controls.stop()
    }
  }, [count, baseText.length, delay, baseText])

  return (
    <span>
      <motion.span>{displayText}</motion.span>
      {animationComplete && (
        <RepeatedTextAnimation
          texts={texts}
          colors={colors}
          delay={delay + 1}
        />
      )}
      <BlinkingCursor />
    </span>
  )
}

export interface IRepeatedTextAnimationProps {
  delay: number
  texts: string[]
  colors?: string[]
}

const defaultTexts = [
  "quiz page with questions and answers",
  "blog Article Details Page Layout",
  "ecommerce dashboard with a sidebar",
  "ui like platform.openai.com....",
  "buttttton",
  "aop that tracks non-standard split sleep cycles",
  "transparent card to showcase achievements of a user",
]
function RepeatedTextAnimation({
  delay,
  colors,
  texts = defaultTexts,
}: IRepeatedTextAnimationProps) {
  const textIndex = useMotionValue(0)

  const baseText = useTransform(textIndex, (latest) => texts[latest] || "")
  const [color, setColor] = useState(colors?.[0] || "text-primary")
  const count = useMotionValue(0)
  const rounded = useTransform(count, (latest) => Math.round(latest))
  const displayText = useTransform(rounded, (latest) =>
    sliceText(baseText.get(), latest)
  )
  const updatedThisRound = useMotionValue(true)

  useEffect(() => {
    const animation = animate(count, 60, {
      type: "tween",
      delay,
      duration: 1,
      ease: "easeIn",
      repeat: Infinity,
      repeatType: "reverse",
      repeatDelay: 0.3,
      onUpdate(latest) {
        if (updatedThisRound.get() && latest > 0) {
          updatedThisRound.set(false)
        } else if (!updatedThisRound.get() && latest === 0) {
          textIndex.set((textIndex.get() + 1) % texts.length)
          updatedThisRound.set(true)
          setColor(
            colors?.[(textIndex.get() + 1) % colors.length] || "text-primary"
          )
        }
      },
    })
    return () => {
      animation.stop && animation.stop()
    }
  }, [colors, count, delay, textIndex, texts, updatedThisRound])

  return (
    <motion.span className={cn("inline", color)}>{displayText}</motion.span>
  )
}

const cursorVariants = {
  blinking: {
    opacity: [0, 0, 1, 1],
    transition: {
      duration: 1,
      repeat: Infinity,
      repeatDelay: 0,
      ease: "linear",
      times: [0, 0.5, 0.5, 1],
    },
  },
}

function BlinkingCursor() {
  return (
    <motion.div
      variants={cursorVariants}
      animate="blinking"
      className="inline-block h-5 w-[1px] translate-y-1 bg-neutral-900"
    />
  )
}
