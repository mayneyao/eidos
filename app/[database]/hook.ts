import { useParams } from "next/navigation";
import { useEffect } from "react";

export const useTableChange = (callback: Function) => {
  const { database, table } = useParams();
  useEffect(() => {
    callback()
  }, [database, table])
}