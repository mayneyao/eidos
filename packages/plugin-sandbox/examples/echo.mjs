addEventListener("message", async ({ data }) => {
  await new Promise((resolve) => setTimeout(resolve, 10))
  postMessage({ echo: data })
})
