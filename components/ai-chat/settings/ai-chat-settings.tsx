import { SettingsIcon } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"

import { useAIChatSettingsStore } from "./ai-chat-settings-store"
import { SourceLangSelector } from "./lang-selector"
import { VoiceSelector } from "./voice-selector"

export function AIChatSettings() {
  const { pitch, setPitch, rate, setRate, autoSpeak, setAutoSpeak } =
    useAIChatSettingsStore()
  return (
    <Dialog>
      <DialogTrigger asChild>
        <div className=" cursor-pointer p-2 hover:bg-secondary">
          <SettingsIcon></SettingsIcon>
        </div>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>AI Chat Settings</DialogTitle>
          <DialogDescription>
            Here you can configure your AI Chat settings.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="voice" className="text-right">
              Voice
            </Label>
            <VoiceSelector />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="voice" className="text-right">
              Auto speak
            </Label>
            <Switch checked={autoSpeak} onCheckedChange={setAutoSpeak} />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="pitch" className="text-right">
              Pitch
            </Label>
            <div className="flex gap-2">
              <Slider
                className="min-w-[200px]"
                defaultValue={[1]}
                max={2}
                min={0}
                step={0.1}
                value={[pitch]}
                onValueChange={(value) => {
                  setPitch(value[0])
                }}
              />
              {pitch}
            </div>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="rate" className="text-right">
              Rate
            </Label>
            <div className="flex gap-2">
              <Slider
                className="min-w-[200px]"
                defaultValue={[1]}
                max={2}
                min={0.5}
                step={0.1}
                value={[rate]}
                onValueChange={(value) => {
                  setRate(value[0])
                }}
              />
              {rate}
            </div>
          </div>
          <hr />
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="voice" className="text-right">
              Source language
            </Label>
            <SourceLangSelector />
          </div>
        </div>
        <DialogFooter></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
