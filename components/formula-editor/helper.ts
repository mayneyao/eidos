import { IField } from "@/lib/store/interface"

export const getDynamicallyTypes = (fields: IField<any>[]) => {
  let typeDefine = ``
  fields.forEach((field) => {
    typeDefine += `const ${field.name} = '${field.name}'\n`
  })
  return typeDefine
}
