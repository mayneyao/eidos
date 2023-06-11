"use client"

// import { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useKeyPress } from "ahooks"
import { Minimize2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SidebarNav } from "@/app/settings/components/sidebar-nav"

// export const metadata: Metadata = {
//   title: "Forms",
//   description: "Advanced form example using react-hook-form and Zod.",
// }

const sidebarNavItems = [
  {
    title: "Profile",
    href: "/settings",
  },
  {
    title: "AIConfig",
    href: "/settings/ai",
  },
  {
    title: "Appearance",
    href: "/settings/appearance",
  },
  {
    title: "Notifications",
    href: "/settings/notifications",
  },
  {
    title: "Display",
    href: "/settings/display",
  },
]

interface SettingsLayoutProps {
  children: React.ReactNode
}

export default function SettingsLayout({ children }: SettingsLayoutProps) {
  const router = useRouter()
  useKeyPress("esc", (e) => {
    e.preventDefault()
    router.back()
  })

  return (
    <>
      <div className="md:hidden">
        <Image
          src="/settings/forms-light.png"
          width={1280}
          height={791}
          alt="Forms"
          className="block dark:hidden"
        />
        <Image
          src="/settings/forms-dark.png"
          width={1280}
          height={791}
          alt="Forms"
          className="hidden dark:block"
        />
      </div>
      <div className="flex w-full justify-center">
        <div className="hidden w-full max-w-7xl space-y-6 p-10 pb-16 md:block">
          <div className="flex items-start justify-between">
            <div className="space-y-0.5">
              <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
              <p className="text-muted-foreground">
                Manage your account settings and set e-mail preferences.
              </p>
            </div>
            <Button variant="ghost" asChild>
              <Link href="/">
                <Minimize2 className="mr-2 h-4 w-4" /> ESC
              </Link>
            </Button>
          </div>
          <Separator className="my-6" />
          <div className="flex flex-col space-y-8 lg:flex-row lg:space-x-12 lg:space-y-0">
            <aside className="-mx-4 lg:w-1/5">
              <SidebarNav items={sidebarNavItems} />
            </aside>
            <div className="flex-1 lg:max-w-2xl">{children}</div>
          </div>
        </div>
      </div>
    </>
  )
}
