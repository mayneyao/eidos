import { useCallback, useState } from "react"

import { getHnswIndex } from "@/lib/ai/vec_search"
import { getSqliteProxy } from "@/lib/sqlite/proxy"
import { useSqlite, useSqliteStore } from "@/hooks/use-sqlite"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { useToast } from "@/components/ui/use-toast"

import { useConfigStore } from "../store"
import { saveTransformerCache } from "./helper"
import { SpaceSelect } from "./space-select"

export function DevtoolsPage() {
  const { aiConfig, setAiConfig } = useConfigStore()
  const { toast } = useToast()
  const [space, setSpace] = useState<string>("")
  console.log("space", space)
  const clearAllEmbeddings = useCallback(async () => {
    console.log(space)
    if (!space) {
      throw new Error("Please select a space")
    }
    const sqlWorker = getSqliteProxy(space, "devtools")
    const res = await sqlWorker.sql2`DELETE FROM eidos__embeddings`
    console.log(res)
    const { exists, vectorHnswIndex } = await getHnswIndex("bge-m3", space)
    if (exists) {
      // mark all items as deleted, not actually delete them
      vectorHnswIndex.markDeleteItems(vectorHnswIndex.getUsedLabels())
    }
    // clear all embeddings
  }, [space])

  const handleAction = (cb: () => Promise<void> | void) => async () => {
    try {
      await cb()
      toast({
        title: "Success",
        description: "Action completed successfully",
      })
    } catch (error: any) {
      toast({
        title: "Error",
        description: JSON.stringify(error.message),
      })
    }
  }

  const clearLocalModels = () => {
    setAiConfig({
      ...aiConfig,
      localModels: [],
    })
  }
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Devtools</h3>
        <p className="text-sm text-muted-foreground">
          some tools for development{" "}
        </p>
        <span className=" text-red-500"> use it with caution.</span>
      </div>
      <Separator />
      <div className="flex flex-col gap-4">
        <Card x-chunk="dashboard-04-chunk-1">
          <CardHeader>
            <CardTitle>Save transformer.js cache </CardTitle>
            <CardDescription>
              <p>
                Save transformer.js cache to <code>/static/transformers/</code>
              </p>
            </CardDescription>
          </CardHeader>
          <CardFooter className="border-t px-6 py-4">
            <Button
              className="w-full"
              onClick={handleAction(saveTransformerCache)}
            >
              Save
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Clear local LLMs </CardTitle>
            <CardDescription>
              <p>
                just set local models to empty array, don't remove the cache
              </p>
            </CardDescription>
          </CardHeader>
          <CardFooter className="border-t px-6 py-4">
            <Button
              className=" xs:w-full"
              onClick={handleAction(clearLocalModels)}
            >
              Clear
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Clear All Embedding </CardTitle>
            <CardDescription>
              empty eidos__embeddings & vector database
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SpaceSelect onSelect={setSpace} />
          </CardContent>
          <CardFooter className="border-t px-6 py-4">
            <Button
              className=" xs:w-full"
              onClick={handleAction(clearAllEmbeddings)}
            >
              Clear
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}
