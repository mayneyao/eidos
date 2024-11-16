import sdkInjectScript from "./sdk-inject-script.html?raw"

export const makeSdkInjectScript = ({
    bindings,
    space,
}: {
    bindings?: Record<string, { type: "table"; value: string }>
    space: string
}) => {
    let res = sdkInjectScript.replace("${{currentSpace}}", space)
    if (bindings) {
        res = `<script>window.__EIDOS_BINDINGS__ = ${JSON.stringify(bindings)}</script>` + res
    }
    return res
}
