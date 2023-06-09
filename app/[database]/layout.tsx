'use client'

import { SideBar } from "@/components/sidebar";
import { useSqliteStore } from "@/lib/store";
import { useParams } from 'next/navigation';
import { useEffect } from "react";


interface RootLayoutProps {
  children: React.ReactNode
}

export default function DatabaseLayout({ children }: RootLayoutProps) {
  const params = useParams();
  const { setCurrentDatabase } = useSqliteStore();
  
  useEffect(() => {
    setCurrentDatabase(params.database)
  }, [params.database, setCurrentDatabase])

  return <div className="relative  grid  lg:grid-cols-5">
    <div className="col-span-1 h-screen">
      <SideBar database={params.database} />
    </div>
    <div className="col-span-3 h-screen lg:col-span-4 lg:border-l">
      {children}
    </div>
  </div>
}