import { useEffect, useMemo, useRef, useState } from "react"
import type { EidosFilePlugin } from "./plugin"
import type { EidosFileViewRendererProps } from "./eidos-file-editor-view"
import { EidosFileSchemaSettings } from "./eidos-file-schema-settings"
import type { NativeRequest, Program } from "../../mobile-plugin-host/src/host"
import type { ViewDeclaration } from "../../plugin-runtime/src/contracts"
import type { validateSetting as ValidateSetting } from "../../plugin-runtime/src/manifest"

type Request = <T>(method: string, params?: unknown) => Promise<T>
function MobileView({
  program,
  declaration,
  ...props
}: EidosFileViewRendererProps & {
  program: Program
  declaration: ViewDeclaration
}) {
  const root = useRef<HTMLDivElement>(null)
  const latest = useRef(props)
  latest.current = props
  const [error, setError] = useState("")
  useEffect(() => {
    let active = true
    let close = () => {}
    if (!props.view) return
    void import("../../mobile-plugin-host/src/host")
      .then(({ MobilePluginInstance }) => {
        if (!active || !root.current || !props.view) return
        const table = {
          source: props.source,
          table: props.table,
          view: props.view,
          query: props.query,
        }
        const native: NativeRequest = async () => {
          throw new Error("此表格视图没有文件系统或网络代理权限")
        }
        const instance = new MobilePluginInstance(program, native, {
          view: declaration,
          table,
          theme: {
            "--eidos-background": getComputedStyle(
              document.documentElement
            ).getPropertyValue("--background"),
            "--eidos-foreground": getComputedStyle(
              document.documentElement
            ).getPropertyValue("--foreground"),
            "--eidos-primary": getComputedStyle(
              document.documentElement
            ).getPropertyValue("--primary"),
            "--eidos-color-scheme":
              document.documentElement.dataset.theme ?? "light",
          },
          notify: setError,
          navigate: () => {
            throw new Error("未声明页面")
          },
          openFile: async () => {
            throw new Error("未声明文件访问")
          },
          openRecord: async (id) => {
            latest.current.onInspectedRowChange?.(id)
          },
          confirm: async () => false,
          canMutate: () =>
            !latest.current.disabled && latest.current.capabilities.mutate,
        })
        root.current.replaceChildren(instance.frame)
        const timer = setInterval(() => {
          const current = latest.current
          if (
            table.table !== current.table ||
            table.view !== current.view ||
            table.query !== current.query
          ) {
            table.table = current.table
            if (current.view) table.view = current.view
            table.query = current.query
            instance.refresh()
          }
        }, 500)
        close = () => {
          clearInterval(timer)
          instance.dispose()
        }
      })
      .catch((error) => {
        if (active) setError(String(error))
      })
    return () => {
      active = false
      close()
    }
  }, [program, declaration, props.source, props.table.table.id, props.view?.id])
  return (
    <div
      style={{
        height: "100%",
        minHeight: 360,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {error && <p role="status">{error}</p>}
      <div ref={root} style={{ flex: 1, minHeight: 0 }} />
    </div>
  )
}
export function useMobilePlugins(request: Request, themeOnly = false) {
  const [programs, setPrograms] = useState<Program[]>([])
  useEffect(() => {
    let active = true
    void request<Program[]>("plugin.catalog", { themeOnly })
      .then(async (programs) => {
        programs = programs.filter(
          (program) => program.manifest.kind !== "theme"
        )
        if (!programs.length) return
        const { validatePackage } =
          await import("../../mobile-plugin-host/src/validate")
        for (const program of programs)
          validatePackage(JSON.stringify({ format: 2, ...program }))
        if (!active) return
        setPrograms(programs)
      })
      .catch(() => {
        if (active) setPrograms([])
      })
    return () => {
      active = false
    }
  }, [request, themeOnly])
  return useMemo<EidosFilePlugin[]>(
    () =>
      programs.flatMap((program) => {
        const views = (program.manifest.views ?? []).filter(
          (view) =>
            view.capabilities?.includes("eidos/table") &&
            program.manifest.placements?.some(
              (p) => p.location === "table/view" && p.view === view.id
            )
        )
        return views.length
          ? [
              {
                id: program.manifest.id,
                views: views.map((view) => ({
                  type: "plugin:" + program.manifest.id + "/" + view.id,
                  label: view.title,
                  description: program.manifest.name,
                  create: { defaultName: view.title },
                  settings: view.configuration
                    ? (props) => (
                        <EidosFileSchemaSettings
                          {...props}
                          inlineMobile
                          schema={view.configuration!}
                          values={
                            (props.view.properties?.plugin ?? {}) as Record<
                              string,
                              unknown
                            >
                          }
                          onUpdate={async (values) => {
                            const validateSetting: typeof ValidateSetting = (
                              await import("../../plugin-runtime/src/manifest")
                            ).validateSetting
                            for (const [key, value] of Object.entries(values)) {
                              const property =
                                view.configuration!.properties[key]
                              if (!property) throw new Error("未知视图设置")
                              validateSetting(property, value)
                            }
                            await props.onUpdate({ plugin: values })
                          }}
                        />
                      )
                    : undefined,
                  renderer: (props) => (
                    <MobileView
                      {...props}
                      program={program}
                      declaration={view}
                    />
                  ),
                })),
              },
            ]
          : []
      }),
    [programs]
  )
}
