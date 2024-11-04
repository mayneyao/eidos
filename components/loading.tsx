import { useEffect, useRef } from "react"
import { Loader2, SparklesIcon } from "lucide-react"
import { useTheme } from "next-themes"

export const Loading = () => <Loader2 className="h-5 w-5 animate-spin" />

export const TwinkleSparkle = () => {
  return <SparklesIcon className="h-6 w-6 animate-pulse text-purple-500" />
}

interface AnimationSettings {
  drawDuration: number
  delayBetweenPaths: number
  fillDuration: number
}

export function SVGAnimator({
  svgContent,
  width,
  height,
  settings = {
    drawDuration: 2,
    delayBetweenPaths: 0.5,
    fillDuration: 1,
  },
}: {
  svgContent: string
  width?: number
  height?: number
  settings?: AnimationSettings
}) {
  const { theme } = useTheme()
  const darkMode = theme === "dark"

  const svgRef = useRef<HTMLDivElement>(null)

  const animateSVG = (svgElement: SVGElement) => {
    const elements = svgElement.querySelectorAll(
      "path, line, circle, rect, ellipse, polygon, polyline, text"
    )
    let maxStrokeDuration = 0

    elements.forEach((element, index) => {
      if (
        element instanceof SVGGeometryElement ||
        element instanceof SVGTextElement
      ) {
        let length = 0

        if (element instanceof SVGGeometryElement) {
          length = element.getTotalLength()
        } else if (element instanceof SVGTextElement) {
          length = element.getComputedTextLength()
        }

        const delay = index * settings.delayBetweenPaths
        const totalStrokeDuration = settings.drawDuration + delay
        maxStrokeDuration = Math.max(maxStrokeDuration, totalStrokeDuration)

        const originalFill =
          element.getAttribute("fill") || (darkMode ? "#FFFFFF" : "#000000")
        const originalStroke = element.getAttribute("stroke") || originalFill

        Object.assign(element.style, {
          strokeDasharray: `${length} ${length}`,
          strokeDashoffset: length.toString(),
          stroke: darkMode ? "#FFFFFF" : originalStroke,
          fill: originalFill,
          strokeWidth: "1",
          fillOpacity: "0",
          animation: `
            drawPath ${settings.drawDuration}s ease-in-out ${delay}s forwards,
            fillOpacity ${settings.fillDuration}s ease-in-out ${maxStrokeDuration}s forwards,
            removeStroke 0.3s ease-in-out ${maxStrokeDuration}s forwards
          `,
        })
      }
    })
  }

  useEffect(() => {
    if (svgContent && svgRef.current) {
      const svgElement = svgRef.current.querySelector("svg")
      if (svgElement) {
        svgElement.setAttribute("width", width ? `${width}px` : "100%")
        svgElement.setAttribute("height", height ? `${height}px` : "100%")
        animateSVG(svgElement)
      }
    }
  }, [svgContent, darkMode, settings])

  return (
    <div>
      {svgContent && (
        <div className="w-full max-w-md aspect-square p-4 rounded mt-4">
          <div
            ref={svgRef}
            dangerouslySetInnerHTML={{ __html: svgContent }}
            className="w-full h-full"
          />
        </div>
      )}

      <style>{`
        @keyframes drawPath {
          to {
            stroke-dashoffset: 0;
          }
        }

        @keyframes fillOpacity {
          to {
            fill-opacity: 1;
          }
        }

        @keyframes removeStroke {
          to {
            stroke-width: 0;
          }
        }
      `}</style>
    </div>
  )
}

export const LogoLoading = ({
  width = 50,
  height = 50,
}: {
  width?: number
  height?: number
}) => {
  return (
    <SVGAnimator
      width={width}
      height={height}
      svgContent={`<svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
<g clip-path="url(#clip0_6_50)">
<path fill-rule="evenodd" clip-rule="evenodd" d="M256.151 500.829L467.826 378.591L467.85 134.156L256.199 11.9587L44.5239 134.197L44.5 378.632L256.151 500.829ZM255.85 33.3289L440.459 139.913L401.716 162.349L403.25 331.87L390.749 338.809L389.004 169.33L323.205 207.319L324.077 375.821L311.985 382.053L310.704 214.258L256.505 244.693L232.653 230.922L379.275 145.309L325.849 114.463L178.96 199.922L150.897 183.72L298.242 98.5245L249.692 70.4936L101.884 155.422L74.6395 139.693L255.85 33.3289ZM265.077 473.329L265.077 427L117.707 342.561L117.787 330.301L265.077 414.5L265.077 341.991L117.381 256.485L117.14 242.189L265.077 326.5L265.077 264.329L293.613 248.108L293.395 415.991L343.625 386.991L343.733 219.17L372.194 202.569L371.77 370.741L421.567 341.991L420.783 173.992L450.297 156.953L449.85 366.959L265.077 473.329ZM98.0001 178.148L63.8279 158.419L63.3501 367.959L245.87 473.329L245.87 439.959L96.8722 354.128L96.8722 296.459L245.87 380.959L245.87 353.329L97.2186 266.959L97.2186 208.036L245.87 293.86L245.693 263.419L191.098 231.898L213.527 218.653L342.884 143.969L327.243 135.011L174.643 222.398L112.29 186.398L136.521 172.276L263.827 98.7762L249.206 90.335L98.0001 178.148Z" fill="#828282"/>
</g>
<defs>
<clipPath id="clip0_6_50">
<rect width="512" height="512" fill="white"/>
</clipPath>
</defs>
</svg>
`}
    />
  )
}
