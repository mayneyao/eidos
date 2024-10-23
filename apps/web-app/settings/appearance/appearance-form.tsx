"use client"

import { useEffect } from "react"
import i18n from "@/locales/i18n"
import { zodResolver } from "@hookform/resolvers/zod"
import { ChevronDown } from "lucide-react"
import { useTheme } from "next-themes"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import * as z from "zod"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/react-hook-form/form"

const appearanceFormSchema = z.object({
  theme: z.enum(["light", "dark"], {
    required_error: "Please select a theme.",
  }),
  font: z.enum(["inter", "manrope", "system"], {
    invalid_type_error: "Select a font",
    required_error: "Please select a font.",
  }),
  language: z.enum(["en", "zh"], {
    invalid_type_error: "Select a language",
    required_error: "Please select a language.",
  }),
})

type AppearanceFormValues = z.infer<typeof appearanceFormSchema>

// This can come from your database or API.
const defaultValues: Partial<AppearanceFormValues> = {
  theme: "light",
  language: "en",
}

export function AppearanceForm() {
  const { t } = useTranslation()
  const { theme, setTheme } = useTheme()
  const form = useForm<AppearanceFormValues>({
    resolver: zodResolver(appearanceFormSchema),
    defaultValues,
  })

  useEffect(() => {
    // Load saved preferences from localStorage
    const savedPreferences = localStorage.getItem("appearancePreferences")
    if (savedPreferences) {
      const parsedPreferences = JSON.parse(savedPreferences)
      form.reset(parsedPreferences)
      i18n.changeLanguage(parsedPreferences.language)
    }

    // Set up event listener for form changes
    const subscription = form.watch((data) => {
      if (data.theme || data.font || data.language) {
        savePreferences(data as AppearanceFormValues)
      }
    })

    return () => subscription.unsubscribe()
  }, [form])

  function savePreferences(data: AppearanceFormValues) {
    localStorage.setItem("appearancePreferences", JSON.stringify(data))
    i18n.changeLanguage(data.language)
    setTheme(data.theme)
  }

  return (
    <Form {...form}>
      <form className="space-y-8">
        {/* <FormField
          control={form.control}
          name="font"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("Font")}</FormLabel>
              <div className="relative w-max">
                <FormControl>
                  <select
                    className={cn(
                      buttonVariants({ variant: "outline" }),
                      "w-[200px] appearance-none bg-transparent font-normal"
                    )}
                    {...field}
                  >
                    <option value="inter">Inter</option>
                    <option value="manrope">Manrope</option>
                    <option value="system">{t("System")}</option>
                  </select>
                </FormControl>
                <ChevronDown className="absolute right-3 top-3 h-4 w-4 opacity-50" />
              </div>
              <FormDescription>
                {t("Set the font you want to use in the dashboard.")}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        /> */}

        <FormField
          control={form.control}
          name="language"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("settings.appearance.language")}</FormLabel>
              <div className="relative w-max">
                <FormControl>
                  <select
                    className={cn(
                      buttonVariants({ variant: "outline" }),
                      "w-[200px] appearance-none bg-transparent font-normal"
                    )}
                    {...field}
                  >
                    <option value="en">English</option>
                    <option value="zh">中文</option>
                  </select>
                </FormControl>
                <ChevronDown className="absolute right-3 top-3 h-4 w-4 opacity-50" />
              </div>
              <FormDescription>
                {t("settings.appearance.languageDescription")}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="theme"
          render={({ field }) => (
            <FormItem className="space-y-1">
              <FormLabel>{t("settings.appearance.theme")}</FormLabel>
              <FormDescription>
                {t("settings.appearance.themeDescription")}
              </FormDescription>
              <FormMessage />
              <RadioGroup
                onValueChange={field.onChange as any}
                defaultValue={field.value}
                className="grid max-w-md grid-cols-2 gap-8 pt-2"
              >
                <FormItem>
                  <FormLabel className="[&:has([data-state=checked])>div]:border-primary">
                    <FormControl>
                      <RadioGroupItem value="light" className="sr-only" />
                    </FormControl>
                    <div className="items-center rounded-md border-2 border-muted p-1 hover:border-accent">
                      <div className="space-y-2 rounded-sm bg-[#ecedef] p-2">
                        <div className="space-y-2 rounded-md bg-white p-2 shadow-sm">
                          <div className="h-2 w-[80px] rounded-lg bg-[#ecedef]" />
                          <div className="h-2 w-[100px] rounded-lg bg-[#ecedef]" />
                        </div>
                        <div className="flex items-center space-x-2 rounded-md bg-white p-2 shadow-sm">
                          <div className="h-4 w-4 rounded-full bg-[#ecedef]" />
                          <div className="h-2 w-[100px] rounded-lg bg-[#ecedef]" />
                        </div>
                        <div className="flex items-center space-x-2 rounded-md bg-white p-2 shadow-sm">
                          <div className="h-4 w-4 rounded-full bg-[#ecedef]" />
                          <div className="h-2 w-[100px] rounded-lg bg-[#ecedef]" />
                        </div>
                      </div>
                    </div>
                    <span className="block w-full p-2 text-center font-normal">
                      {t("settings.appearance.light")}
                    </span>
                  </FormLabel>
                </FormItem>
                <FormItem>
                  <FormLabel className="[&:has([data-state=checked])>div]:border-primary">
                    <FormControl>
                      <RadioGroupItem value="dark" className="sr-only" />
                    </FormControl>
                    <div className="items-center rounded-md border-2 border-muted bg-popover p-1 hover:bg-accent hover:text-accent-foreground">
                      <div className="space-y-2 rounded-sm bg-slate-950 p-2">
                        <div className="space-y-2 rounded-md bg-slate-800 p-2 shadow-sm">
                          <div className="h-2 w-[80px] rounded-lg bg-slate-400" />
                          <div className="h-2 w-[100px] rounded-lg bg-slate-400" />
                        </div>
                        <div className="flex items-center space-x-2 rounded-md bg-slate-800 p-2 shadow-sm">
                          <div className="h-4 w-4 rounded-full bg-slate-400" />
                          <div className="h-2 w-[100px] rounded-lg bg-slate-400" />
                        </div>
                        <div className="flex items-center space-x-2 rounded-md bg-slate-800 p-2 shadow-sm">
                          <div className="h-4 w-4 rounded-full bg-slate-400" />
                          <div className="h-2 w-[100px] rounded-lg bg-slate-400" />
                        </div>
                      </div>
                    </div>
                    <span className="block w-full p-2 text-center font-normal">
                      {t("settings.appearance.dark")}
                    </span>
                  </FormLabel>
                </FormItem>
              </RadioGroup>
            </FormItem>
          )}
        />
      </form>
    </Form>
  )
}
