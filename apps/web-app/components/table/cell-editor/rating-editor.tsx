import { useState } from "react"
import useChangeEffect from "../hooks/use-change-effect"

interface IRatingEditorProps {
  value: number
  onChange: (value: number) => void
  isEditing: boolean
  onFinishEditing?: () => void
}

export const RatingEditor = ({
  value,
  onChange,
  isEditing,
  onFinishEditing,
}: IRatingEditorProps) => {
  const [_value, setValue] = useState<number>(value)
  const [hover, setHover] = useState(0)
  const [isInternalEditing, setIsInternalEditing] = useState(false)

  useChangeEffect(() => {
    onChange(_value)
  }, [_value, onChange])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !isEditing) {
      e.preventDefault()
      setIsInternalEditing(true)
    }
  }

  const handleClick = () => {
    if (!isEditing) {
      setIsInternalEditing(true)
    }
  }

  const handleStarClick = (ratingValue: number) => {
    setValue(ratingValue)
    setIsInternalEditing(false)
    onFinishEditing?.()
  }

  const isActuallyEditing = isEditing || isInternalEditing

  return (
    <div
      className="flex h-full w-full items-center px-2"
      onKeyDown={handleKeyDown}
      onClick={handleClick}
      tabIndex={0}
    >
      {[...Array(5)].map((star, i) => {
        const ratingValue = i + 1
        return (
          <label key={i}>
            <svg
              onClick={() => handleStarClick(ratingValue)}
              className="h-5 w-5 text-gray-400"
              fill={ratingValue <= (hover || _value) ? "currentColor" : "none"}
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              onMouseEnter={() => setHover(ratingValue)}
              onMouseLeave={() => setHover(_value)}
              viewBox="0 0 24 24"
            >
              <path d="M12 2l3.09 6.89L22 9.5l-5 4.36 1.18 6.85L12 17.77l-6.18 3.94L7 13.86 2 9.5l6.91-0.61L12 2z"></path>
            </svg>
          </label>
        )
      })}
    </div>
  )
}
