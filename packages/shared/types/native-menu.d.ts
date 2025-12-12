type NativeMenuItem =
    | {
        type: 'text'
        label: string
        id?: string // Unique identifier for handling clicks
        enabled?: boolean
        accelerator?: string
        icon?: string
    }
    | {
        type: 'separator'
    }
    | {
        type: 'submenu'
        label: string
        submenu: NativeMenuItem[]
        id?: string
        enabled?: boolean
        icon?: string
    }
    | {
        type: 'checkbox'
        label: string
        checked?: boolean
        id?: string
        enabled?: boolean
    }
    | {
        type: 'radio'
        label: string
        checked?: boolean
        id?: string
        enabled?: boolean
    }

interface ShowNativeMenuOptions {
    items: NativeMenuItem[]
    x?: number
    y?: number
}
