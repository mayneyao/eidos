import { Button } from "@/components/ui/button"

function MyButton() {
  // tailwind css support
  return <button className="bg-red-300 p-2 rounded-md">I'm a button</button>
}

export default function MyBlock() {
  return (
    <div className="flex flex-col gap-4">
      <h1>Welcome to my block</h1>
      <MyButton />
      {/* shadcn component support */}
      <Button>Shadcn Button</Button>
    </div>
  )
}
