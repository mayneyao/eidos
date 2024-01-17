import React, { useEffect, useRef } from "react"
import { useClickAway } from "ahooks"

import { IField } from "@/lib/store/interface"

import { cellRenderMap } from "../grid/cells"
import { lightTheme } from "../grid/theme"

export const StandaloneCellRender = (props: {
  column: IField
  cell: any
  value: any
}) => {
  const [isEditing, setIsEditing] = React.useState(false)
  const render = cellRenderMap[props.column.type]
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const editorRef = useRef<HTMLDivElement>(null)
  useClickAway(() => {
    setIsEditing(false)
  }, editorRef)

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d")
    if (!ctx) return
    render.draw(
      {
        ctx,
        theme: lightTheme,
        col: 1,
        row: 1,
        rect: {
          x: 0,
          y: 0,
          height: 36,
          width: 200,
        },
        hoverAmount: 0,
        cellFillColor: "#757272",
        cell: props.cell,
        imageLoader: {
          loadOrGetImage: (url: string, col: number, row: number) => {
            const img = new Image()
            new Promise((resolve, reject) => {
              img.onload = () => {
                resolve(img)
              }
              img.onerror = () => {
                reject()
              }
              img.src = url
            })
            return img
          },
        },
      } as any,
      props.cell
    )
  }, [props.cell, render])
  return <div>{props.value}</div>
  if (!render) {
    return <div>{props.cell.displayData}</div>
  }
  const Editor = render.provideEditor!(props.cell as any)! as any
  const handleFinishEditing = (newValue: any) => {
    setIsEditing(false)
    console.log("end", newValue)
  }
  const handleChange = (newValue: any) => {
    console.log("change", newValue)
    setIsEditing(false)
  }

  return (
    <div className="relative" ref={editorRef}>
      <canvas
        onClick={() => {
          setIsEditing(true)
        }}
        ref={canvasRef}
        width={200}
        height={36}
      ></canvas>
      <div className="absolute left-0 top-0 bg-white">
        {isEditing && (
          <Editor
            value={props.cell}
            onChange={(newValue: any) => console.log(newValue)}
            onFinishedEditing={handleFinishEditing}
          />
        )}
      </div>
    </div>
  )
}
