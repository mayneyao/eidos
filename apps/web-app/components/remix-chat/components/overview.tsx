import { motion } from "framer-motion"
import { BlocksIcon } from "lucide-react"
import { Link } from "react-router-dom"
import { useSettings } from "@/apps/web-app/hooks/use-settings"

import { useAiConfig } from "@/apps/web-app/hooks/use-ai-config"

import { MessageIcon } from "./icons"

export const Overview = ({ aiModel }: { aiModel: string }) => {
  const { openSettingsModal } = useSettings()
  
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
          <button 
            onClick={() => openSettingsModal("ai")} 
            className="underline cursor-pointer"
          >
            coding model({aiModel})
          </button>{" "}
          to generate code.
        </p>
        {!aiModel && (
          <p className="text-sm text-gray-500">
            No coding model selected. It will use the first available model.
            Please select a coding model in the{" "}
            <button 
              onClick={() => openSettingsModal("ai")} 
              className="underline cursor-pointer"
            >
              settings
            </button>{" "}
            for better results.
          </p>
        )}
      </div>
    </motion.div>
  )
}
