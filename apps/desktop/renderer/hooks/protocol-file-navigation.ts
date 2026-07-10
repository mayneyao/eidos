import { toSpaceFileUrl } from "@/apps/web-app/components/file-space/file-path"

interface NavigateToProtocolFileOptions {
  spaceId: string
  systemPath: string
  getRelativeFilePath: (
    spaceId: string,
    systemPath: string
  ) => Promise<string | null>
  flushPendingWrites: () => Promise<boolean>
  navigate: (destination: string) => void
}

export async function navigateToProtocolFile({
  spaceId,
  systemPath,
  getRelativeFilePath,
  flushPendingWrites,
  navigate,
}: NavigateToProtocolFileOptions): Promise<void> {
  const relativePath = await getRelativeFilePath(spaceId, systemPath)
  if (!relativePath) {
    throw new Error("The file is outside the current Space")
  }
  if (!(await flushPendingWrites())) {
    throw new Error(
      "Eidos could not save the current file. Resolve the error before opening another file."
    )
  }
  navigate(toSpaceFileUrl(relativePath))
}
