'use client'

import { SideBar } from "@/components/sidebar";
import { useParams } from 'next/navigation';


interface RootLayoutProps {
  children: React.ReactNode
}

export default function DatabaseLayout({ children }: RootLayoutProps) {
  const params = useParams();
  return <div className="relative  grid  lg:grid-cols-5">
    <div className="col-span-1 h-screen">
      <SideBar database={params.database} />
    </div>
    <div className="col-span-3 h-screen lg:col-span-4 lg:border-l">
      {children}
    </div>
  </div>
}