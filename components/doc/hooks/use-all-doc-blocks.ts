import { useMemo } from "react";
import { BuiltInBlocks } from "../blocks";
import { useExtBlocks } from "./use-ext-blocks";

export const useAllDocBlocks = () => {
    const extBlocks = useExtBlocks();
    const allBlocks = useMemo(() => {
        return [...BuiltInBlocks, ...extBlocks];
    }, [extBlocks]);

    return allBlocks;
};