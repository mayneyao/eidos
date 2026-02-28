import type { BinaryOperator, CompareOperator } from "../fields/const"

export interface IFilterValue {
  operator: CompareOperator
  operands: [
    field: string,
    value: string | number | boolean | Date | null | undefined,
  ]
}

export interface IGroupFilterValue {
  operator: BinaryOperator
  operands: (IFilterValue | IGroupFilterValue)[]
}

export type FilterValueType = IFilterValue | IGroupFilterValue
