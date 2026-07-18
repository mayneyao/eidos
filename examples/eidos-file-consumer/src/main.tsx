import { createRoot } from "react-dom/client"

import "@eidos.space/eidos-file-ui/styles.css"
import "./styles.css"
import { App } from "./app"

createRoot(document.getElementById("root")!).render(<App />)
