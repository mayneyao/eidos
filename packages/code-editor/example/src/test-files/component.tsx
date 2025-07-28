import React, { useState, useEffect } from 'react'

interface Props {
  title: string
  count?: number
  onUpdate?: (value: number) => void
}

export const TestComponent: React.FC<Props> = ({ title, count = 0, onUpdate }) => {
  const [value, setValue] = useState(count)
  const [isVisible, setIsVisible] = useState(true)

  useEffect(() => {
    if (onUpdate) {
      onUpdate(value)
    }
  }, [value, onUpdate])

  const handleIncrement = () => {
    setValue(prev => prev + 1)
  }

  const handleDecrement = () => {
    setValue(prev => prev - 1)
  }

  if (!isVisible) {
    return null
  }

  return (
    <div className="test-component">
      <h2>{title}</h2>
      <div className="counter">
        <button onClick={handleDecrement}>-</button>
        <span>{value}</span>
        <button onClick={handleIncrement}>+</button>
      </div>
      <button onClick={() => setIsVisible(false)}>
        Hide Component
      </button>
    </div>
  )
}

export default TestComponent
