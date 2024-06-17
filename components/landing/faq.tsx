import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"

const items = [
  {
    question: "Where is the data stored?",
    answer: (
      <p>
        Eidos is a web application that stores data in your browser by default.
        However, you can choose to store data in a folder on your computer
        instead, and only need to give permission once. After that, Eidos will
        remember this permission, so you won't need to authorized it every time
        you use the app. just like a native app.
        <br />
        <br />
        <ol className="list-inside list-decimal">
          <li>
            <a
              href="https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system"
              className="text-blue-500"
              target="_blank"
            >
              OFPS
            </a>
            (default), requires chromium-based browser. {`version > 86`}
          </li>
          <li>
            <a
              href="https://developer.chrome.com/blog/persistent-permissions-for-the-file-system-access-api"
              className="text-blue-500"
              target="_blank"
            >
              Native File System
            </a>
            , requires chromium-based browser. {`version > 122`}
          </li>
        </ol>
      </p>
    ),
  },
]

export function FAQ() {
  return (
    <>
      <h2 className="text-center text-3xl font-bold tracking-tighter sm:text-5xl">
        FAQ
      </h2>
      <Accordion type="single" collapsible className="w-full">
        {items.map((item, index) => (
          <AccordionItem key={index} value={`item-${index}`}>
            <AccordionTrigger>{item.question}</AccordionTrigger>
            <AccordionContent>{item.answer}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </>
  )
}
