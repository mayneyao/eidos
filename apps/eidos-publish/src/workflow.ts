import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers"

import { canonicalSha256 } from "./canonical"
import { refreshTenantEntitlements } from "./entitlements"
import type {
  DurableResult,
  PublicationVersionRecord,
  PublishWorkflowParams,
  ReadyReceipt,
  ServingTarget,
  StaticArtifactRecord,
  ValidationReceipt,
} from "./contracts"
import {
  MarkdownPreparationError,
  prepareMarkdownVersion,
  probeMarkdownTarget,
  validateMarkdownVersion,
} from "./markdown"
import {
  activateFormRevision,
  FormPreparationError,
  prepareFormVersion,
  probeFormTarget,
  validateFormVersion,
} from "./form"
import { StaticPreparationError } from "./static"
import {
  runtimeDescriptor,
  runtimeInstanceName,
  RuntimePreparationError,
  type EidosRuntimeContainer,
  type RuntimePrepareResult,
} from "./runtime"

const STEP_POLICY = {
  retries: { limit: 3, delay: "5 seconds", backoff: "exponential" },
  timeout: "3 minutes",
} as const

const RUNTIME_STEP_POLICY = {
  ...STEP_POLICY,
  timeout: "20 minutes",
} as const

export class PublishWorkflow extends WorkflowEntrypoint<
  Env,
  PublishWorkflowParams
> {
  override async run(
    event: Readonly<WorkflowEvent<PublishWorkflowParams>>,
    step: WorkflowStep
  ): Promise<unknown> {
    const input = event.payload
    const tenant = this.env.PUBLISH_TENANTS.getByName(input.tenantId)
    try {
      const version = await step.do(
        "01-bind-driver",
        STEP_POLICY,
        async (): Promise<PublicationVersionRecord> =>
          requireDurable(await tenant.beginValidation(input.versionId))
      )
      assertJob(version, input)
      let validation: ValidationReceipt
      let prepared: {
        target: ServingTarget
        targetSha256: string
        readyReceipt: ReadyReceipt
        artifact?: StaticArtifactRecord
      }
      if (version.driverId === "org.eidos.driver.eidos") {
        await step.do(
          "01b-authorize-runtime-budget",
          STEP_POLICY,
          async (): Promise<{ authorized: true }> => {
            requireDurable(
              await tenant.authorizeBuildRuntime(
                input.versionId,
                `build:${input.jobId}`
              )
            )
            return { authorized: true }
          }
        )
        const instanceKey = runtimeInstanceName(
          input.tenantId,
          this.env.RUNTIME_SHARD_COUNT,
          input.runtimeIsolation
        )
        const descriptor = runtimeDescriptor(
          version,
          input.tenantId,
          input.runtimeIdleSeconds,
          instanceKey
        )
        validation = await step.do(
          "02-validate-eidos-source",
          RUNTIME_STEP_POLICY,
          async (): Promise<ValidationReceipt> =>
            await runtime(this.env, instanceKey).validateSource(descriptor)
        )
        await step.do(
          "03-commit-validation-receipt",
          STEP_POLICY,
          async (): Promise<{ state: string }> => ({
            state: requireDurable(
              await tenant.recordValidation(input.versionId, validation)
            ).state,
          })
        )
        prepared = await step.do(
          "04-prepare-and-probe-runtime",
          RUNTIME_STEP_POLICY,
          async (): Promise<RuntimePrepareResult> =>
            await runtime(this.env, instanceKey).probePrepared(descriptor)
        )
      } else if (version.driverId === "org.eidos.driver.markdown") {
        validation = await step.do(
          "02-validate-markdown-source",
          STEP_POLICY,
          async (): Promise<ValidationReceipt> =>
            await validateMarkdownVersion(this.env, version)
        )
        await step.do(
          "03-commit-validation-receipt",
          STEP_POLICY,
          async (): Promise<{ state: string }> => ({
            state: requireDurable(
              await tenant.recordValidation(input.versionId, validation)
            ).state,
          })
        )
        prepared = await step.do(
          "04-prepare-markdown-static-target",
          RUNTIME_STEP_POLICY,
          async () =>
            await prepareMarkdownVersion(
              this.env,
              tenant,
              input.tenantId,
              input.slug,
              version
            )
        )
        await step.do(
          "04b-probe-markdown-static-target",
          STEP_POLICY,
          async (): Promise<{ ready: true }> => {
            if (
              prepared.target.kind !== "static" ||
              prepared.artifact === undefined
            ) {
              throw new MarkdownPreparationError(
                "invalid_static_target",
                "Markdown Driver returned an invalid static target"
              )
            }
            await probeMarkdownTarget(
              this.env,
              prepared.target,
              prepared.artifact
            )
            return { ready: true }
          }
        )
      } else if (version.driverId === "org.eidos.driver.form") {
        validation = await step.do(
          "02-validate-form-definition",
          STEP_POLICY,
          async (): Promise<ValidationReceipt> =>
            await validateFormVersion(this.env, version)
        )
        await step.do(
          "03-commit-validation-receipt",
          STEP_POLICY,
          async (): Promise<{ state: string }> => ({
            state: requireDurable(
              await tenant.recordValidation(input.versionId, validation)
            ).state,
          })
        )
        prepared = await step.do(
          "04-prepare-form-static-target",
          STEP_POLICY,
          async () =>
            await prepareFormVersion(
              this.env,
              tenant,
              input.tenantId,
              input.slug,
              version
            )
        )
        await step.do(
          "04b-probe-form-static-target",
          STEP_POLICY,
          async (): Promise<{ ready: true }> => {
            if (
              prepared.target.kind !== "static" ||
              prepared.artifact === undefined
            ) {
              throw new FormPreparationError(
                "invalid_static_target",
                "Form Driver returned an invalid static target"
              )
            }
            await probeFormTarget(this.env, prepared.target, prepared.artifact)
            return { ready: true }
          }
        )
      } else {
        throw new WorkflowOperationError(
          "unsupported_driver",
          "Version Driver is not installed"
        )
      }
      const ready = await step.do(
        "05-commit-ready-receipt",
        STEP_POLICY,
        async (): Promise<PublicationVersionRecord> =>
          requireDurable(
            await tenant.markReady(
              input.versionId,
              prepared.target,
              prepared.targetSha256,
              prepared.readyReceipt
            )
          )
      )
      if (prepared.target.kind === "runtime") {
        await step.do(
          "05b-record-runtime-ready",
          STEP_POLICY,
          async (): Promise<{ recorded: true }> => {
            await tenant.recordRuntimeReady(input.versionId)
            return { recorded: true }
          }
        )
      }
      if (!input.activate) return workflowResult(ready, prepared)

      const currentPrincipal = await step.do(
        "05c-refresh-activation-entitlements",
        STEP_POLICY,
        async () =>
          await refreshTenantEntitlements(
            this.env,
            input.tenantId,
            tenant,
            true
          )
      )

      const activationInputSha256 = await canonicalSha256({
        slug: input.slug,
        versionId: input.versionId,
      })
      const activation = await step.do(
        "06-activate-version",
        STEP_POLICY,
        async () => {
          try {
            return requireDurable(
              await tenant.activateVersion(
                input.slug,
                input.versionId,
                input.actor,
                input.requestId,
                currentPrincipal.access,
                `workflow:${input.jobId}:activate`,
                activationInputSha256
              )
            )
          } catch (cause) {
            const reconciled = await tenant.reconcileActivation(
              input.publicationId,
              input.versionId,
              input.requestId
            )
            if (reconciled.ok) return reconciled.value
            throw cause
          }
        }
      )
      if (version.driverId === "org.eidos.driver.form") {
        await step.do(
          "06b-activate-form-revision",
          STEP_POLICY,
          async (): Promise<{ activated: true }> => {
            await activateFormRevision(
              this.env,
              input.tenantId,
              tenant,
              input.publicationId
            )
            return { activated: true }
          }
        )
      }
      return { ...workflowResult(ready, prepared), activation }
    } catch (cause) {
      const code = workflowErrorCode(cause)
      if (cause instanceof RuntimePreparationError) {
        await tenant.recordRuntimeFailure(input.versionId)
      }
      await step.do(
        "99-record-failure",
        {
          retries: { limit: 5, delay: "5 seconds", backoff: "exponential" },
          timeout: "1 minute",
        },
        async (): Promise<{ recorded: true }> => {
          await tenant.markFailed(
            input.versionId,
            workflowErrorStep(cause),
            code,
            workflowRetryable(code)
          )
          return { recorded: true }
        }
      )
      throw cause
    }
  }
}

function runtime(
  env: Env,
  instanceKey: string
): DurableObjectStub<EidosRuntimeContainer> {
  return env.EIDOS_RUNTIMES.getByName(instanceKey)
}

function assertJob(
  version: PublicationVersionRecord,
  input: PublishWorkflowParams
): void {
  if (
    version.jobId !== input.jobId ||
    version.versionId !== input.versionId ||
    version.publicationId !== input.publicationId
  ) {
    throw new WorkflowOperationError(
      "publish_job_conflict",
      "Publish job does not match the Version"
    )
  }
}

function workflowResult(
  version: PublicationVersionRecord,
  prepared: {
    target: ServingTarget
    targetSha256: string
    readyReceipt: ReadyReceipt
  }
) {
  return {
    versionId: version.versionId,
    state: version.state,
    servingTarget: prepared.target,
    servingTargetSha256: prepared.targetSha256,
  }
}

function requireDurable<T>(result: DurableResult<T>): T {
  if (result.ok) return result.value
  throw new WorkflowOperationError(result.error.code, result.error.message)
}

class WorkflowOperationError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = "WorkflowOperationError"
    this.code = code
  }
}

function workflowErrorCode(cause: unknown): string {
  if (
    cause instanceof WorkflowOperationError ||
    cause instanceof RuntimePreparationError ||
    cause instanceof MarkdownPreparationError ||
    cause instanceof FormPreparationError ||
    cause instanceof StaticPreparationError
  ) {
    return cause.code
  }
  return "publish_workflow_failed"
}

function workflowRetryable(code: string): boolean {
  return ![
    "invalid_eidos_file",
    "invalid_markdown_source",
    "invalid_markdown_utf8",
    "form_definition_invalid",
    "form_field_unsupported",
    "markdown_asset_manifest_mismatch",
    "invalid_validation_receipt",
    "unsupported_driver",
    "publish_job_conflict",
    "source_digest_mismatch",
    "source_size_mismatch",
  ].includes(code)
}

function workflowErrorStep(cause: unknown): string {
  if (cause instanceof RuntimePreparationError) return "runtime"
  if (cause instanceof MarkdownPreparationError) return "markdown"
  if (cause instanceof FormPreparationError) return "form"
  if (cause instanceof StaticPreparationError) return "static"
  if (cause instanceof WorkflowOperationError) return "control"
  return "workflow"
}
