type ProgressUpdate = (message: string, progress: number) => void

const ENABLE_SYNC_PROGRESS_STEPS = [
  {
    delay: 0,
    progress: 12,
    message: "Checking selected sync provider...",
  },
  {
    delay: 400,
    progress: 28,
    message: "Preparing remote sync configuration...",
  },
  {
    delay: 1200,
    progress: 48,
    message: "Configuring Graft remote...",
  },
  {
    delay: 2400,
    progress: 72,
    message: "Pushing the current branch snapshot...",
  },
  {
    delay: 5000,
    progress: 88,
    message: "Reloading sync metadata...",
  },
]

export function startEnableSyncProgress(update: ProgressUpdate) {
  const [firstStep, ...remainingSteps] = ENABLE_SYNC_PROGRESS_STEPS
  if (firstStep) {
    update(firstStep.message, firstStep.progress)
  }

  const timers = remainingSteps.map((step) =>
    window.setTimeout(() => update(step.message, step.progress), step.delay)
  )

  return () => {
    timers.forEach((timer) => window.clearTimeout(timer))
  }
}
