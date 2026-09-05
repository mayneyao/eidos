import logo from "../../../../packages/markdown/assets/markdown-logo.svg?url&no-inline"
import { useSiteLocale } from "./locale"

export { logo }

export function Brand() {
  const { t, href } = useSiteLocale()
  return (
    <a
      className="site-brand"
      href={href("/")}
      aria-label={t("Markdown home", "Markdown 首页")}
    >
      <img src={logo} width="32" height="32" alt="" />
      Markdown
    </a>
  )
}
