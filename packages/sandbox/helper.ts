import sdkInjectScript from "./sdk-inject-script.html?raw";

export type BindingType = "table" | "secret" | "text"


export type IBinding = {
    type: BindingType
    value: string
}

export type IBindings = Record<string, IBinding>

export const makeSdkInjectScript = ({
    bindings,
    space,
}: {
    bindings?: IBindings
    space: string
}) => {
    let res = sdkInjectScript.replace("${{currentSpace}}", space)
    if (bindings) {
        res = `<script>window.__EIDOS_BINDINGS__ = ${JSON.stringify(bindings)}</script>` + res
    }
    return res
}