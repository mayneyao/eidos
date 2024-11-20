import { motion } from "framer-motion"
import { BlocksIcon } from "lucide-react"
import { Link } from "react-router-dom"

import { MessageIcon } from "./icons"

export const Overview = () => {
  return (
    <motion.div
      key="overview"
      className="max-w-3xl mx-auto md:mt-20"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ delay: 0.5 }}
    >
      <div className="rounded-xl p-6 flex flex-col gap-8 leading-relaxed text-center max-w-xl">
        <p className="flex flex-row justify-center gap-4 items-center">
          <BlocksIcon className="w-9 h-9" />
          <span>+</span>
          <MessageIcon size={32} />
        </p>
        <p>
          Build your own extensions with AI. This will use your configured{" "}
          <Link to="/settings/ai#model-preferences" className="underline">
            coding model
          </Link>{" "}
          to generate code.
        </p>
      </div>
    </motion.div>
  )
}
