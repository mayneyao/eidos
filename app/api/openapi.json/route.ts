import { NextResponse } from "next/server"

export async function GET() {
  // const openApiDocument = generateOpenApiDocument(appRouter, {
  //   title: "tRPC OpenAPI",
  //   version: "1.0.0",
  //   baseUrl: "http://localhost:3001",
  //   docsUrl: "/docs",
  // })
  return NextResponse.json({ msg: "not available" })
}
