import { FeatureCard, IFeatureCard } from "./card"

const features: IFeatureCard[] = [
  {
    title: "Developer Friendly",
    description: (
      <p>
        While Eidos is just a web app with no web server, it also offers an API
        for developers to extend its functionality. Create your own workflows
        with ease.
      </p>
    ),
    lightImageUrl: "/show/api-light.webp",
    darkImageUrl: "/show/api-dark.webp",
  },
  {
    title: "Email Integration",
    description: (
      <p>
        Capture ideas, notes, and read/watch-it-later easily.
        <br />
        <br />
        Each resource in Eidos has a unique email address, allowing you to
        create or update resources simply by sending an email.
      </p>
    ),
    lightImageUrl: "/show/mail-to-eidos.webp",
    imgCls: "bg-red-100 p-4",
  },
  {
    title: "SQLite Standardization",
    description: (
      <p>
        Every table in Eidos is a SQLite table. Access or modify the data using
        any SQLite client. <br />
        <br />
        SaaS may come and go, but your data in SQLite will always be there.
      </p>
    ),
    lightImageUrl: "/show/sqlite.webp",
    imgCls: "bg-blue-100 p-4",
  },
  {
    title: "Offline AI Capabilities",
    description:
      "Download LLM once and use it anytime, even without an internet connection. No data leaves your device.",
    lightImageUrl: "/show/offline-ai.webp",
    imgCls: "bg-teal-100 p-2",
  },
]

const extendFeatures: IFeatureCard[] = [
  {
    title: "Prompt",
    description:
      "Code knowledge is not required. You can use the Prompt extension to speed up your workflow, and what you SAY is what you get.",
    lightImageUrl: "/show/custom-ai-prompt.webp",
    imgCls: "bg-indigo-100",
  },
  {
    title: "UDF(user-defined function)",
    description: "Use JavaScript to customize your Formula function.",
    lightImageUrl: "/show/ext-udf-light.webp",
    imgCls: "p-2 bg-yellow-100",
  },
]

export const Features = () => {
  return (
    <div>
      <div className="mx-auto grid max-w-sm items-start gap-24 sm:max-w-4xl lg:max-w-5xl">
        {features.map((feature, index) => (
          <FeatureCard key={index} {...feature} even={index % 2 == 0} />
        ))}
      </div>

      <hr className="my-8" />
      <div className="container px-4 py-12 xs:px-0 md:px-6">
        <div className="flex flex-col items-center justify-center py-4 text-center">
          <div className="space-y-2">
            <h2 className="text-3xl font-bold tracking-tighter sm:text-5xl">
              Customize Everything
            </h2>
            <p className="max-w-[900px] text-gray-500 dark:text-gray-400 md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
              Build your own unique Eidos with an easy and powerful extension
              system.
            </p>
          </div>
        </div>
      </div>
      <div className="mx-auto grid max-w-sm items-start gap-24 sm:max-w-4xl lg:max-w-5xl">
        {extendFeatures.map((feature, index) => (
          <FeatureCard key={index} {...feature} even={index % 2 == 0} />
        ))}
      </div>
    </div>
  )
}
