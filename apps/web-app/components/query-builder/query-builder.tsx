import React, { useEffect, useState } from "react"
import type { AggregateItem } from "@/packages/core/sqlite/interface"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { TableField } from "@/apps/web-app/hooks/use-table-fields"

export type QueryTransformType = "aggregate" | "filter" | "sort" // Add more transform types

export interface AggregateTransformConfig {
  aggregations: AggregateItem[]
  groupBy?: string[]
}

export interface FilterTransformConfig {
  conditions: Array<{
    field: string
    operator: string
    value: any
  }>
}

export interface SortTransformConfig {
  sortBy: Array<{
    field: string
    direction: "asc" | "desc"
  }>
}

export type QueryTransform = {
  type: "aggregate"
  config: AggregateTransformConfig
}
// | { type: "filter"; config: FilterTransformConfig }
// | { type: "sort"; config: SortTransformConfig }

interface QueryBuilderProps {
  fields: TableField[]
  onQueryChange: (transforms: QueryTransform[]) => void
  transforms?: QueryTransform[]
}

export const QueryBuilder: React.FC<QueryBuilderProps> = ({
  fields,
  onQueryChange,
  transforms,
}) => {
  const { t } = useTranslation()
  const [transform, setTransform] = useState<QueryTransform>(
    transforms?.[0] || {
      type: "aggregate",
      config: {
        aggregations: [],
        groupBy: [],
      },
    }
  )

  useEffect(() => {
    if (transforms) {
      setTransform(transforms[0])
    }
  }, [transforms])

  const addAggregation = () => {
    const newTransform = {
      ...transform,
      config: {
        ...transform.config,
        aggregations: [
          ...(transform.config.aggregations || []),
          {
            column: "",
            function: "sum" as const,
            alias: "",
          },
        ],
      },
    }
    setTransform(newTransform)
    onQueryChange([newTransform])
  }

  const updateAggregation = (
    index: number,
    updates: Partial<
      NonNullable<QueryTransform["config"]["aggregations"]>[number]
    >
  ) => {
    const newAggregations = [...(transform.config.aggregations || [])]
    newAggregations[index] = {
      ...newAggregations[index],
      ...updates,
    }

    const newTransform = {
      ...transform,
      config: {
        ...transform.config,
        aggregations: newAggregations,
      },
    }

    setTransform(newTransform)
    onQueryChange([newTransform])
  }

  const removeAggregation = (index: number) => {
    const newAggregations = transform.config.aggregations?.filter(
      (_, i) => i !== index
    )
    const newTransform = {
      ...transform,
      config: {
        ...transform.config,
        aggregations: newAggregations,
      },
    }
    setTransform(newTransform)
    onQueryChange([newTransform])
  }

  const addGroupBy = () => {
    const newTransform = {
      ...transform,
      config: {
        ...transform.config,
        groupBy: [...(transform.config.groupBy || []), ""],
      },
    }
    setTransform(newTransform)
    onQueryChange([newTransform])
  }

  const updateGroupBy = (index: number, value: string) => {
    const newGroupBy = [...(transform.config.groupBy || [])]
    newGroupBy[index] = value

    const newTransform = {
      ...transform,
      config: {
        ...transform.config,
        groupBy: newGroupBy,
      },
    }
    setTransform(newTransform)
    onQueryChange([newTransform])
  }

  const removeGroupBy = (index: number) => {
    const newGroupBy = transform.config.groupBy?.filter((_, i) => i !== index)
    const newTransform = {
      ...transform,
      config: {
        ...transform.config,
        groupBy: newGroupBy,
      },
    }
    setTransform(newTransform)
    onQueryChange([newTransform])
  }

  return (
    <div className="space-y-4 p-4 border rounded-md">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-medium">{t("queryBuilder.title")}</h3>
      </div>

      {/* Group By Section */}
      <div className="space-y-2 p-2 border rounded-md">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">
            {t("queryBuilder.groupBy")}
          </span>
          <Button variant="outline" size="sm" onClick={addGroupBy}>
            {t("queryBuilder.addGroup")}
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {transform.config.groupBy?.map((field, groupIndex) => (
            <div key={groupIndex} className="flex items-center gap-1">
              <Select
                value={field}
                onValueChange={(value) => updateGroupBy(groupIndex, value)}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue
                    placeholder={t("queryBuilder.selectGroupField")}
                  />
                </SelectTrigger>
                <SelectContent>
                  {fields.map((field) => (
                    <SelectItem key={field.name} value={field.name}>
                      {field.label || field.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeGroupBy(groupIndex)}
              >
                {t("common.delete")}
              </Button>
            </div>
          ))}
        </div>
      </div>

      {/* Metrics Section */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">
            {t("queryBuilder.metrics")}
          </span>
          <Button variant="outline" size="sm" onClick={addAggregation}>
            {t("queryBuilder.addMetric")}
          </Button>
        </div>
        {transform.config.aggregations?.map((agg, index) => (
          <div
            key={index}
            className="flex items-center gap-2 p-2 border rounded-md"
          >
            <Select
              value={agg.column}
              onValueChange={(value) =>
                updateAggregation(index, { column: value })
              }
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder={t("queryBuilder.selectField")} />
              </SelectTrigger>
              <SelectContent>
                {fields
                  .filter((f) => f.type === "number")
                  .map((field) => (
                    <SelectItem key={field.name} value={field.name}>
                      {field.label || field.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>

            <Select
              value={agg.function}
              onValueChange={(value: any) =>
                updateAggregation(index, { function: value })
              }
            >
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder={t("queryBuilder.aggregationType")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sum">{t("queryBuilder.sum")}</SelectItem>
                <SelectItem value="avg">{t("queryBuilder.average")}</SelectItem>
                <SelectItem value="count">{t("queryBuilder.count")}</SelectItem>
                <SelectItem value="min">{t("queryBuilder.min")}</SelectItem>
                <SelectItem value="max">{t("queryBuilder.max")}</SelectItem>
                <SelectItem value="count_distinct">
                  {t("queryBuilder.distinctCount")}
                </SelectItem>
              </SelectContent>
            </Select>

            <input
              type="text"
              value={agg.alias || ""}
              onChange={(e) =>
                updateAggregation(index, { alias: e.target.value })
              }
              placeholder={t("queryBuilder.alias")}
              className="flex h-10 w-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
            />

            <Button
              variant="ghost"
              size="sm"
              onClick={() => removeAggregation(index)}
            >
              {t("common.delete")}
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}
