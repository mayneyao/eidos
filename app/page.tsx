'use client'

import { useSqliteStore } from "@/lib/store";
import dynamic from "next/dynamic";

const Grid = dynamic(
  () => {
    return import("../components/grid");
  },
  { ssr: false }
);


export default function IndexPage() {
  const { selectedTable } = useSqliteStore();
  return <Grid tableName={selectedTable} />
}
