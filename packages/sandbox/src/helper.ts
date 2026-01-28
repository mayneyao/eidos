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
    port = '13127'
}: {
    bindings?: IBindings
    space: string
    port?: string
}) => {
    // replace all ${{currentSpace}} to space

    let res = sdkInjectScript.replace(/\${{currentSpace}}/g, space)

    if (bindings) {
        res = `<script>window.__EIDOS_BINDINGS__ = ${JSON.stringify(bindings)}</script>` + res
    }
    return res
}