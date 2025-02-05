import { TableContext } from "@/components/table/hooks"
import { Item } from "@glideapps/glide-data-grid"
import { useContext, useEffect, useMemo, useState } from "react"

interface FormattedResult {
    columnIndex: number;
    rowIndex: number;
    rowId: string;
}

export const useSearchResults = (
    getColumnIndexByColumnName: (fieldName: string) => number,
) => {
    const { searchResults, currentSearchIndex, setCurrentSearchIndex } = useContext(TableContext)
    const [formattedResults, setFormattedResults] = useState<FormattedResult[]>([])

    useEffect(() => {
        if (!searchResults) {
            setFormattedResults([])
            return
        }
        const formattedResults = searchResults.flatMap((result) => {
            return result.matches.map((match) => {
                return {
                    columnIndex: getColumnIndexByColumnName(match.column),
                    rowIndex: result.rowIndex,
                    rowId: result.row._id
                } as FormattedResult
            })
        })
        setFormattedResults(formattedResults)
    }, [searchResults])

    const formattedSearchResults = useMemo(() => {
        return formattedResults.map(result => ([result.columnIndex, result.rowIndex] as Item))
    }, [formattedResults])

    // console.log({ formattedResults, formattedSearchResults })

    return {
        searchResults,
        formattedSearchResults,
        isLoadingComplete: !searchResults || currentSearchIndex >= formattedResults.length,
        currentSearchIndex,
        setCurrentSearchIndex,
    }
}