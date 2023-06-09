'use client'

import dynamic from "next/dynamic";
import { useParams } from "next/navigation";

const Grid = dynamic(
  () => {
    return import("@/components/grid");
  },
  { ssr: false }
);

export default function TablePage() {
  const params = useParams();
  return <Grid tableName={params.table} />
}
