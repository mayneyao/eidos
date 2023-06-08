'use client'

import dynamic from "next/dynamic";

const Grid = dynamic(
  () => {
    return import("../components/grid");
  },
  { ssr: false }
);


export default function IndexPage() {
  return <Grid />
}
