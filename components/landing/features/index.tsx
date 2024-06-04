import { FeatureCard, IFeatureCard } from "./card"

const features: IFeatureCard[] = [
  {
    title: "Developers Friendly",
    description:
      "While Eidos is a local-first web app, it also offers an API for developers to extend its functionality. Create your own workflows with ease.",
    lightImageUrl: "/show/api-light.webp",
    darkImageUrl: "/show/api-dark.webp",
  },
  {
    title: "Email Integration",
    description:
      "Each resource in Eidos has a unique email address. Create or update resources simply by sending an email.",
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
  {
    title: "Customize Everything",
    description: (
      <div className="prose text-gray-500 dark:text-gray-400">
        Every component in Eidos can be customized, not limited to:
        <ul>
          <li>Table Fields</li>
          <li>Table Views</li>
          <li>Table Formula Functions</li>
          <li>Document Blocks</li>
          <li>AI Prompts</li>
        </ul>
        <br />
        For example, you can create a prompt extension for generating mind maps,
        which can then be used in any document.
      </div>
    ),
    lightImageUrl: "/show/custom-ai-prompt.webp",
    imgCls: "bg-indigo-100",
  },
]

export const Features = () => {
  return (
    <div className="mx-auto grid max-w-sm items-start gap-24 sm:max-w-4xl lg:max-w-5xl">
      {features.map((feature, index) => (
        <FeatureCard key={index} {...feature} even={index % 2 == 0} />
      ))}
    </div>
  )
}
