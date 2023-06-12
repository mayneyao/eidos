import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export default function Page() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center">
      <div className="flex gap-2">
        <Input className="w-[300px]" placeholder="Enter a share link" />{" "}
        <Button>Enter</Button>
      </div>
    </div>
  )
}
