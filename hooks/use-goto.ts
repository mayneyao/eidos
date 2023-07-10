import { useNavigate } from "react-router-dom";

export const useGoto = () => {
  const router = useNavigate();
  return (space: string, tableName?: string) => {
    const path = tableName ? `/${space}/${tableName}` : `/${space}`;
    router(path);
  };
};
