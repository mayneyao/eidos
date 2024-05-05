import { LockClosedIcon } from "@radix-ui/react-icons"
import { CloudOffIcon, SparkleIcon, WifiOffIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"

import { DatabaseSelect } from "@/components/database-select"
import { EidosIcon } from "@/components/icons/eidos"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useActivation } from "@/hooks/use-activation"
import { useGoto } from "@/hooks/use-goto"
import { useSpace } from "@/hooks/use-space"
import { cn } from "@/lib/utils"

import { useLastOpened } from "./[database]/hook"

const Activation = () => {
  const { active, isActivated } = useActivation()
  const [code, setCode] = useState("")
  const [loading, setLoading] = useState(false)
  const nav = useNavigate()
  const handleActive = async () => {
    setLoading(true)
    await active(code)
    setLoading(false)
  }
  if (isActivated) {
    return (
      <div>
        🎉You have already activated Eidos.
        <Button size="xs" variant="ghost" onClick={() => nav("/")}>
          Open App
        </Button>
      </div>
    )
  }
  return (
    <div className="flex w-full flex-col items-center justify-center">
      <div className="flex gap-2">
        <Input
          // autoFocus
          className="w-[300px]"
          placeholder="Enter Code"
          value={code}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              handleActive()
            }
          }}
          onChange={(e) => setCode(e.target.value)}
        />
        <Button onClick={handleActive} disabled={loading}>
          Enter
        </Button>
      </div>

      <div className="mt-2 p-2 text-sm">
        Eidos is currently in development; join our{" "}
        <Link
          to="https://discord.gg/KAeDX8VEpK"
          target="_blank"
          className="text-blue-500"
        >
          Discord
        </Link>{" "}
        server to stay updated on the latest progress
      </div>
    </div>
  )
}

export const LandingPage = () => {
  const { spaceList } = useSpace()
  let [searchParams, setSearchParams] = useSearchParams()
  const isHome = Boolean(searchParams.get("home"))
  const { lastOpenedDatabase } = useLastOpened()
  const goto = useGoto()

  const { isActivated } = useActivation()

  useEffect(() => {
    if (isActivated && lastOpenedDatabase && !isHome) {
      goto(lastOpenedDatabase)
    }
  }, [lastOpenedDatabase, goto, isActivated, isHome])

  // activated and it's the first time to open the app
  if (isActivated && !lastOpenedDatabase && !isHome) {
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <div className="w-[200px]">
          <DatabaseSelect databases={spaceList} />
        </div>
      </div>
    )
  }

  return (
    <div className="h-full w-full">
      <header
        className={cn(
          "sticky top-0 flex h-14 items-center bg-card px-4  lg:px-6",
          {
            "!px-2": window.matchMedia(
              "(display-mode: window-controls-overlay)"
            ).matches,
          }
        )}
        id="title-bar"
      >
        <Link className="flex items-center justify-center gap-2" to="#">
          <EidosIcon className="h-8 w-8" />{" "}
          <span className=" text-2xl font-semibold">Eidos</span>
        </Link>
        <div className="h-full grow" id="drag-region" />
        <nav className="ml-auto flex gap-4 sm:gap-6">
          <Link
            className="text-sm font-medium underline-offset-4 hover:underline"
            to="#features"
          >
            Features
          </Link>
          <Link
            className="text-sm font-medium underline-offset-4 hover:underline"
            to="https://wiki.eidos.space"
            target="_blank"
          >
            Wiki
          </Link>
          <Link
            className="text-sm font-medium underline-offset-4 hover:underline"
            to="https://github.com/mayneyao/eidos"
            target="_blank"
          >
            Github
          </Link>
          <Link
            className="text-sm font-medium underline-offset-4 hover:underline"
            to="https://discord.gg/KAeDX8VEpK"
            target="_blank"
          >
            Discord
          </Link>
        </nav>
      </header>
      <main>
        <section className="w-full py-12 md:py-24 lg:py-32 xl:py-48">
          <div className="container px-4 md:px-6">
            <div className="flex flex-col items-center space-y-4 text-center">
              <div className="space-y-2">
                <h1 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl lg:text-6xl/none">
                  Everyone's eidos space
                </h1>
                <p className="mx-auto max-w-[700px] text-gray-500 dark:text-gray-400 md:text-xl">
                  A PIM tool <br /> for recording and managing your lifelong
                  data in one place.
                </p>
              </div>
              <div className="space-x-4">
                <Link
                  className="inline-flex h-9 items-center justify-center rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-gray-50 shadow transition-colors hover:bg-gray-900/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-950 disabled:pointer-events-none disabled:opacity-50 dark:bg-gray-50 dark:text-gray-900 dark:hover:bg-gray-50/90 dark:focus-visible:ring-gray-300"
                  target="_blank"
                  to="https://store.eidos.space/buy/2397216c-4322-40fa-b425-681d455e6702"
                >
                  Get Early Access
                </Link>
                <Link
                  className="inline-flex h-9 items-center justify-center rounded-md border border-gray-200 bg-white px-4 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-950 disabled:pointer-events-none disabled:opacity-50 dark:border-gray-800 dark:bg-gray-950 dark:hover:bg-gray-800 dark:hover:text-gray-50 dark:focus-visible:ring-gray-300"
                  to="#"
                >
                  Learn More
                </Link>
              </div>
            </div>
          </div>
        </section>
        <section
          className="w-full bg-gray-100 py-12 dark:bg-gray-800 md:py-24 lg:py-32"
          id="features"
        >
          <div className="container space-y-12 px-4 xs:px-0 md:px-6">
            <div className="flex flex-col items-center justify-center space-y-4 text-center">
              <div className="space-y-2">
                <div className="inline-block rounded-lg bg-gray-100 px-3 py-1 text-sm dark:bg-gray-800">
                  <span className="flex gap-2">
                    <SparkleIcon className=" text-purple-500" /> Features
                  </span>
                </div>
                <h2 className="flex justify-between text-xl font-bold tracking-tighter sm:text-4xl">
                  <span className="mx-4 flex items-center gap-2">
                    <CloudOffIcon className="h-9 w-9 opacity-50" />
                    Local-first
                  </span>
                  <span className="mx-4 flex items-center gap-2">
                    <LockClosedIcon className="h-9 w-9 opacity-50" />
                    Privacy-first
                  </span>
                  <span className="mx-4 flex items-center gap-2">
                    <WifiOffIcon className="h-9 w-9 opacity-50" />
                    Offline-support
                  </span>
                </h2>
                <p className="max-w-[900px] text-gray-500 dark:text-gray-400 md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
                  There is no server, no cloud. Get your data under your
                  control. Avoid vendor lock-in. <br />
                  Offline-first, you can access your data without internet, and
                  even access <span className="  text-purple-500">AI</span>{" "}
                  features.
                </p>
              </div>
            </div>
            <div className="mx-auto grid max-w-sm items-start gap-8 sm:max-w-4xl sm:grid-cols-2 md:gap-12 lg:max-w-5xl lg:grid-cols-3">
              <div className="grid gap-1">
                <h3 className="text-lg font-bold">Web First</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Everything runs inside the browser and data is stored in your
                  local device. It's{" "}
                  <span className=" text-purple-500">blazing fast</span>.
                </p>
              </div>
              <div className="grid gap-1">
                <h3 className="text-lg font-bold">Extension First</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Build your own unique Eidos with an easy extension system.
                </p>
              </div>
              <div className="grid gap-1">
                <h3 className="text-lg font-bold">Open Source</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Eidos is an open-source project, code doesn't lie.
                </p>
              </div>
            </div>
          </div>
        </section>
        <section className="w-full py-12 md:py-24 lg:py-32">
          <div className="container px-4 md:px-6">
            <Tabs className="w-full" defaultValue="doc">
              <TabsList className="mx-auto flex max-w-sm justify-center gap-4 border-b bg-secondary py-4 md:max-w-md">
                <TabsTrigger value="doc">Doc</TabsTrigger>
                <TabsTrigger value="table">Table</TabsTrigger>
                <TabsTrigger value="extension">Extension</TabsTrigger>
                {/* <TabsTrigger value="ai">AI</TabsTrigger> */}
              </TabsList>
              <TabsContent value="doc">
                <div className="flex flex-col  items-center gap-6 py-12  lg:gap-12">
                  <div className="flex flex-col justify-center space-y-4">
                    <div className="grid gap-1">
                      <h3 className="text-xl font-bold">Doc</h3>
                      <p className="text-gray-500 dark:text-gray-400">
                        Write your own document with markdown and organize your
                        knowledge.
                      </p>
                    </div>
                  </div>
                  <img
                    alt="eidos doc"
                    className="mx-auto aspect-video overflow-hidden rounded-xl object-contain  sm:w-full lg:order-last"
                    src="/screenshots/doc.jpeg"
                  />
                </div>
              </TabsContent>
              <TabsContent value="table">
                <div className="flex flex-col items-center gap-6 py-12  lg:gap-12">
                  <div className="flex flex-col justify-center space-y-4">
                    <div className="grid gap-1">
                      <h3 className="text-xl font-bold">Table</h3>
                      <p className="text-gray-500 dark:text-gray-400">
                        Manage your data with a spreadsheet-like interface.
                      </p>
                    </div>
                  </div>
                  <img
                    alt="eidos table"
                    className="mx-auto aspect-video overflow-hidden rounded-xl object-contain  sm:w-full lg:order-last"
                    height="500"
                    src="/screenshots/table.jpeg"
                  />
                </div>
              </TabsContent>
              <TabsContent value="extension">
                <div className="flex  flex-col items-center gap-6 py-12  lg:gap-12">
                  <div className="flex flex-col justify-center space-y-4">
                    <div className="grid gap-1">
                      <h3 className="text-xl font-bold">Extension</h3>
                      <p className="text-gray-500 dark:text-gray-400">
                        Build your own Eidos with an easy extension system.
                      </p>
                    </div>
                  </div>
                  <img
                    alt="eidos extension"
                    className="mx-auto aspect-video overflow-hidden rounded-xl object-contain  sm:w-full lg:order-last"
                    height="310"
                    src="/screenshots/ext.jpeg"
                  />
                </div>
              </TabsContent>
              {/* <TabsContent value="ai">
                <div className="flex  flex-col  items-center gap-6 py-12  lg:gap-12">
                  <div className="flex flex-col justify-center space-y-4">
                    <div className="grid gap-1">
                      <h3 className="text-xl font-bold">AI</h3>
                      <p className="text-gray-500 dark:text-gray-400">
                        Talk to your data, let AI help you to manage your data.
                      </p>
                    </div>
                  </div>
                  <img
                    alt="Image"
                    className="mx-auto aspect-video  overflow-hidden rounded-xl object-cover object-center sm:w-full lg:order-last"
                    height="310"
                    src="/placeholder.svg"
                  />
                </div>
              </TabsContent> */}
            </Tabs>
          </div>
        </section>
        {/* <section className="w-full py-12 md:py-24 lg:py-32 xl:py-48">
          <div className="flex flex-col items-center justify-center space-y-4 text-center">
            <div className="space-y-2">
              <h2 className="text-3xl font-bold tracking-tighter sm:text-5xl">
                Building on modern web technologies
              </h2>
              <p className="max-w-[900px] text-gray-500 dark:text-gray-400 md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
                Eidos use many next-generation web api to provide a better user
                experience.
                <br />
                <details>
                  <summary>check out your browser compatibility</summary>
                </details>
              </p>
            </div>
          </div>
        </section> */}
        <section
          id="#join"
          className="w-full bg-gray-100 py-12 dark:bg-gray-800 md:py-24 lg:py-32"
          tabIndex={-1}
        >
          <div className="container grid items-center justify-center gap-4 px-4 text-center md:px-6">
            <Activation />
          </div>
        </section>
      </main>
      <footer className="flex w-full shrink-0 flex-col items-center gap-2 border-t px-4 py-6 sm:flex-row md:px-6">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          © {new Date().getFullYear()} Eidos Space. All rights reserved.
        </p>
        <nav className="flex gap-4 sm:ml-auto sm:gap-6">
          <Link className="text-xs underline-offset-4 hover:underline" to="#">
            Terms of Service
          </Link>
          <Link className="text-xs underline-offset-4 hover:underline" to="#">
            Privacy
          </Link>
        </nav>
      </footer>
    </div>
  )
}
