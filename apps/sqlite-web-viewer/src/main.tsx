import ReactDOM from "react-dom/client"

import { App } from "./app"
import { PwaUpdateController } from "./pwa/pwa-update-controller"
import "./styles.css"

ReactDOM.createRoot(document.getElementById("root")!).render(
  <>
    <App />
    <PwaUpdateController />
  </>
)
