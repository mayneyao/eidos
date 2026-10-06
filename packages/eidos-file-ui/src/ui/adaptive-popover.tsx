import {
  useContext,
  createContext,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useCallback,
  forwardRef,
  type ComponentProps,
  type ElementRef,
  type ForwardRefExoticComponent,
  type ReactNode,
} from "react"
import { createPortal } from "react-dom"
import { ArrowLeft, X } from "lucide-react"
import { Dialog } from "radix-ui"
import { useEidosFileUI } from "../context"
import * as Desktop from "./primitives"
import { MobilePopoverLayer } from "./mobile-layer"
export { MobilePopoverLayer } from "./mobile-layer"

type Page = {
  id: string
  title: string
  escape?(event: KeyboardEvent): void
}
const Navigation = createContext<{
  target: HTMLDivElement | null
  active?: string
  register(page: Page): () => void
  close(): void
} | null>(null)
const MobileRoot = createContext<{ open: boolean; close(): void } | null>(null)

export function useMobileSettingsClose() {
  return useContext(Navigation)?.close
}

export function PopoverAnchor(
  props: ComponentProps<typeof Desktop.PopoverAnchor>
) {
  const { interactionMode } = useEidosFileUI()
  return interactionMode === "mobile" ? null : (
    <Desktop.PopoverAnchor {...props} />
  )
}

export function Popover(props: ComponentProps<typeof Desktop.Popover>) {
  const { interactionMode } = useEidosFileUI()
  const layer = useContext(MobilePopoverLayer) + 10
  const [localOpen, setLocalOpen] = useState(props.defaultOpen ?? false)
  const open = props.open ?? localOpen
  const change = (value: boolean) => {
    setLocalOpen(value)
    props.onOpenChange?.(value)
  }
  return interactionMode === "mobile" ? (
    <MobilePopoverLayer.Provider value={layer}>
      <MobileRoot.Provider value={{ open, close: () => change(false) }}>
        <Dialog.Root {...props} open={open} onOpenChange={change} />
      </MobileRoot.Provider>
    </MobilePopoverLayer.Provider>
  ) : (
    <Desktop.Popover {...props} />
  )
}
export const PopoverTrigger: typeof Desktop.PopoverTrigger = forwardRef<
  ElementRef<typeof Desktop.PopoverTrigger>,
  ComponentProps<typeof Desktop.PopoverTrigger>
>((props, ref) => {
  const { interactionMode } = useEidosFileUI()
  return interactionMode === "mobile" ? (
    <Dialog.Trigger {...props} ref={ref} />
  ) : (
    <Desktop.PopoverTrigger {...props} ref={ref} />
  )
})
type ContentProps = ComponentProps<typeof Desktop.PopoverContent> & {
  mobileHeader?: ReactNode
}
export const PopoverContent: ForwardRefExoticComponent<ContentProps> =
  forwardRef<HTMLDivElement, ContentProps>((props, ref) => {
    const { interactionMode, themeName, translate: t } = useEidosFileUI()
    const layer = useContext(MobilePopoverLayer)
    const navigation = useContext(Navigation)
    const root = useContext(MobileRoot)
    const id = useId()
    const title = props["aria-label"] ?? t("Settings")
    const [target, setTarget] = useState<HTMLDivElement | null>(null)
    const [pages, setPages] = useState<Page[]>([])
    const register = useCallback((page: Page) => {
      setPages((current) => [...current, page])
      return () =>
        setPages((current) => current.filter((item) => item.id !== page.id))
    }, [])
    const latest = useRef({ root, props })
    latest.current = { root, props }
    useLayoutEffect(() => {
      if (!navigation || !root?.open || interactionMode !== "mobile") return
      const previousFocus = document.activeElement as HTMLElement | null
      const unregister = navigation.register({
        id,
        title,
        escape: (event) => {
          latest.current.props.onEscapeKeyDown?.(event)
          if (!event.defaultPrevented) latest.current.root?.close()
        },
      })
      return () => {
        unregister()
        queueMicrotask(() => {
          if (previousFocus?.isConnected)
            previousFocus.focus({ preventScroll: true })
        })
      }
    }, [navigation?.register, root?.open, interactionMode, id, title])
    useLayoutEffect(() => {
      if (navigation?.active === id) {
        navigation.target
          ?.querySelector<HTMLElement>(`[data-mobile-page="${id}"] > header h2`)
          ?.focus()
      }
    }, [navigation?.active, navigation?.target, id])
    if (interactionMode !== "mobile") {
      const { mobileHeader: _mobileHeader, ...desktopProps } = props
      return <Desktop.PopoverContent {...desktopProps} ref={ref} />
    }
    const body = (
      <div
        className="eidos-mobile-settings-body"
        role={props.role}
        onKeyDown={props.onKeyDown}
        data-eidos-file-filter-popover={
          "data-eidos-file-filter-popover" in props ? "" : undefined
        }
        data-eidos-file-sort-popover={
          "data-eidos-file-sort-popover" in props ? "" : undefined
        }
        aria-busy={props["aria-busy"]}
      >
        {props.children}
      </div>
    )
    if (navigation) {
      if (!root?.open || !navigation.target) return null
      return createPortal(
        <div
          ref={ref}
          className="eidos-mobile-settings-page"
          data-mobile-page={id}
          hidden={navigation.active !== id}
        >
          {props.mobileHeader ?? (
            <header>
              <button
                type="button"
                aria-label={t("Back")}
                onClick={() => root.close()}
              >
                <ArrowLeft size={20} />
              </button>
              <h2 tabIndex={-1}>{title}</h2>
              <button
                type="button"
                aria-label={t("Close")}
                onClick={navigation.close}
              >
                <X size={20} />
              </button>
            </header>
          )}
          {body}
        </div>,
        navigation.target
      )
    }
    const activePage = pages.at(-1)
    return (
      <Dialog.Portal>
        <Dialog.Overlay
          className="eidos-mobile-cell-backdrop"
          style={{ zIndex: layer }}
        />
        <Dialog.Content
          ref={ref}
          style={{ zIndex: layer + 1 }}
          data-eidos-file-root=""
          data-theme={themeName}
          data-mobile-menu={props.role === "menu" ? "true" : undefined}
          className="eidos-file-root eidos-mobile-cell-sheet eidos-mobile-settings-sheet"
          data-mobile-navigation={pages.length ? "true" : undefined}
          aria-label={activePage?.title}
          aria-describedby={undefined}
          onOpenAutoFocus={props.onOpenAutoFocus}
          onCloseAutoFocus={props.onCloseAutoFocus}
          onEscapeKeyDown={(event) => {
            if (activePage) {
              activePage.escape?.(event)
              event.preventDefault()
            } else props.onEscapeKeyDown?.(event)
          }}
        >
          <Navigation.Provider
            value={{
              target,
              active: activePage?.id,
              register,
              close: () => root?.close(),
            }}
          >
            <div
              className="eidos-mobile-settings-page"
              hidden={Boolean(activePage)}
            >
              {props.mobileHeader ?? (
                <header>
                  <Dialog.Title>{title}</Dialog.Title>
                  <Dialog.Close aria-label={t("Close")}>
                    <X size={20} />
                  </Dialog.Close>
                </header>
              )}
              {body}
            </div>
            <div
              ref={setTarget}
              className="eidos-mobile-settings-pages"
              hidden={!activePage}
            />
          </Navigation.Provider>
        </Dialog.Content>
      </Dialog.Portal>
    )
  })
