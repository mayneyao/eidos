import { useTableSearchStore } from "@/components/table/table-store-provider";
import type { IField } from "@/packages/core/types/IField";
import type { Item } from "@glideapps/glide-data-grid";
import { useEffect, useMemo, useState } from "react";

interface FormattedResult {
    columnIndex: number;
    rowIndex: number;
    rowId: string;
}

export const useGridSearch = (
    showColumns: IField[],
    getColumnIndexByColumnName: (fieldName: string) => number,
) => {
    const { searchResults, currentSearchIndex, setCurrentSearchIndex } = useTableSearchStore();
    const [cellIndex, setCellIndex] = useState(0);

    const groupedResults = useMemo(() => {
        if (!searchResults) return [];
        return searchResults.map((result: any) => {
            if (result && result.matches && result.row) {
                return result.matches.filter((match: any) => {
                    return showColumns.some(col => col.table_column_name === match.column);
                })
                    .map((match: any) => ({
                        columnIndex: getColumnIndexByColumnName(match.column),
                        rowIndex: result.rowIndex,
                        rowId: result.row._id,
                    } as FormattedResult))

                    .sort((a: FormattedResult, b: FormattedResult) => a.columnIndex - b.columnIndex);
            } else {
                return [];
            }
        });
    }, [searchResults, getColumnIndexByColumnName, showColumns]);

    const formattedSearchResults = useMemo(() => {
        return groupedResults.flat().map(result => ([result.columnIndex, result.rowIndex] as Item));
    }, [groupedResults]);

    const currentRowGroup = useMemo(() => {
        return groupedResults[currentSearchIndex];
    }, [groupedResults, currentSearchIndex]);


    const currentCell = useMemo(() => {
        if (!currentRowGroup || currentRowGroup.length === 0) return undefined;
        return currentRowGroup[cellIndex] || currentRowGroup[0];
    }, [currentRowGroup, cellIndex]);

    const advanceSearch = (): boolean => {
        if (!currentRowGroup) return false;
        if (cellIndex < currentRowGroup.length - 1) {
            setCellIndex(prev => prev + 1);
            return true;
        } else {
            return false;
        }
    };

    const reverseSearch = (): boolean => {
        if (!currentRowGroup) return false;
        if (cellIndex > 0) {
            setCellIndex(prev => prev - 1);
            return true;
        } else {
            return false;
        }
    };



    useEffect(() => {
        const onNavigateSearch = (e: CustomEvent) => {
            const { direction } = e.detail;
            if (direction === "next") {
                if (!advanceSearch()) {
                    setCurrentSearchIndex((prev: number) => {
                        const nextIndex = prev < groupedResults.length - 1 ? prev + 1 : 0;
                        setCellIndex(0);
                        return nextIndex;
                    });
                }
            } else if (direction === "prev") {
                if (!reverseSearch()) {
                    setCurrentSearchIndex((prev: number) => {
                        const newIndex = prev > 0 ? prev - 1 : groupedResults.length - 1;
                        setCellIndex(groupedResults[newIndex] ? groupedResults[newIndex].length - 1 : 0);
                        return newIndex;
                    });
                }
            }
        };
        window.addEventListener("navigateSearch", onNavigateSearch as EventListener);
        return () => {
            window.removeEventListener("navigateSearch", onNavigateSearch as EventListener);
        };
    }, [advanceSearch, groupedResults, setCurrentSearchIndex, cellIndex, currentRowGroup, searchResults]);


    const _currentCell = useMemo(() => {
        return currentCell ? ([currentCell.columnIndex, currentCell.rowIndex] as Item) : undefined;
    }, [currentCell]);

    return {
        formattedSearchResults,
        currentCell: _currentCell,
    };
}