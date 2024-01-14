import { BinaryOperator, CompareOperator } from "@/lib/fields/const"

export interface IFilterValue {
  operator: CompareOperator
  operands: [
    field: string,
    value: string | number | boolean | Date | null | undefined
  ]
}

export interface IGroupFilterValue {
  operator: BinaryOperator
  operands: (IFilterValue | IGroupFilterValue)[]
}

export type FilterValueType = IFilterValue | IGroupFilterValue

const testValue: IGroupFilterValue = {
  operator: BinaryOperator.And,
  operands: [
    {
      operator: CompareOperator.Equal,
      operands: ["id", 1],
    },
    {
      operator: CompareOperator.Equal,
      operands: ["name", "test"],
    },
    {
      operator: BinaryOperator.Or,
      operands: [
        {
          operator: CompareOperator.Equal,
          operands: ["id", 1],
        },
        {
          operator: CompareOperator.Equal,
          operands: ["name", "test"],
        },
      ],
    },
  ],
}
