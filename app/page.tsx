'use client'

import dynamic from "next/dynamic";

const Grid = dynamic(
  () => {
    return import("../components/grid");
  },
  { ssr: false }
);


export default function IndexPage() {
  return (
    <section className="container grid items-center gap-6 pb-8 pt-6 md:py-10">
      <Grid />
    </section>
  )
}
