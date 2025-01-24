import {
    useEffect,
    useMemo,
    useState
} from "react"



export const useGap = (
    width: number | undefined,
    el1?: HTMLElement | null,
    el2?: HTMLElement | null
) => {
    const [gap, setGap] = useState(0)
    const [breakpoint, setBreakpoint] = useState<number | null>(null)
    useEffect(() => {
        if (el1 && el2) {
            const rect1 = el1.getBoundingClientRect()
            const rect2 = el2.getBoundingClientRect()
            let distance = rect2.left - (rect1.left + rect1.width)
            if (distance < 50 && !breakpoint) {
                setBreakpoint(width!)
            }
            setGap(distance)
        }
    }, [breakpoint, el1, el2, width])
    const display = useMemo(() => {
        if (!breakpoint) return "lg"
        return (width ?? 0) < (breakpoint ?? 0) ? "sm" : "lg"
    }, [width, breakpoint])
    return {
        gap,
        display,
        breakpoint,
    }
}