// This entry stays small. The logo is already painted by index.html while the
// workbench and its CSS load; importing it must not replace the document.
void import("./main").catch((cause: unknown) => {
  window.dispatchEvent(new Event("lite-startup-finished"))
  const host = document.getElementById("lite-startup")
  if (!host) return
  const message = document.createElement("p")
  message.setAttribute("role", "alert")
  message.textContent = navigator.language.startsWith("zh")
    ? "无法加载工作区，请重试。"
    : "Could not load the workspace. Please retry."
  const retry = document.createElement("button")
  retry.textContent = navigator.language.startsWith("zh") ? "重试" : "Retry"
  retry.style.setProperty("-webkit-app-region", "no-drag")
  retry.onclick = () => window.location.reload()
  host.replaceChildren(message, retry)
  console.error("Could not load the workspace", cause)
})
