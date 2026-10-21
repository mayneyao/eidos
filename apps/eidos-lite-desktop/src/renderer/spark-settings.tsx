import { useEffect, useState } from "react"
import { Sparkles } from "lucide-react"
import type { SparkStatus } from "../shared/spark"
import { useEidosLiteI18n } from "./i18n"

export function SparkSettings({
  signedIn,
  subject,
}: {
  signedIn: boolean
  subject?: string
}) {
  const { t } = useEidosLiteI18n()
  const [status, setStatus] = useState<SparkStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [confirmRelease, setConfirmRelease] = useState(false)
  const availableLicenses =
    signedIn && status?.state !== "active"
      ? (status?.licenses ?? []).filter((license) =>
          ["pending", "active"].includes(license.status)
        )
      : []
  const deviceLimitMessage = t(
    "All Spark device slots are in use. Release an old device on your Spark account page and try again."
  )
  const run = async (operation: () => Promise<SparkStatus>) => {
    setBusy(true)
    setError("")
    try {
      setStatus(await operation())
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : ""
      setError(
        code.includes("spark_device_limit_reached")
          ? t(
              "All Spark device slots are in use. Release an old device on your Spark account page and try again."
            )
          : t(
              "Spark could not be updated. Check your connection and sign in to the license owner's account, then retry."
            )
      )
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => {
    let active = true
    setError("")
    setConfirmRelease(false)
    void window.eidosLite
      .getSparkStatus?.(true)
      .then((value) => {
        if (active) setStatus(value)
      })
      .catch(() => {
        if (active)
          setError(
            t("Spark status is unavailable. Your local files are unaffected.")
          )
      })
    return () => {
      active = false
    }
  }, [signedIn, subject, t])
  return (
    <section
      className="settings-service settings-spark"
      aria-labelledby="settings-spark-title"
    >
      <div className="settings-service-heading">
        <h3 className="settings-subheading" id="settings-spark-title">
          <Sparkles aria-hidden="true" />
          Spark
        </h3>
      </div>
      <div className="settings-group">
        <div className="settings-row settings-spark-overview">
          <span className="settings-row-copy">
            <strong>
              {!status
                ? t("Checking Spark…")
                : status.state === "active"
                  ? t("Spark is active on this device")
                  : t("Activate Spark")}
            </strong>
            {status?.state === "active" ? (
              <small>
                {t("Advanced Spark features are available on this device.")}
              </small>
            ) : (
              <small>
                {availableLicenses.length > 0
                  ? t("Activate this device using a license on your account.")
                  : t("Refresh to check your Spark access, or redeem a code.")}
              </small>
            )}
            {status?.licenseId &&
              status.licenses
                .filter((l) => l.id === status.licenseId)
                .map((license) => (
                  <small key={license.id}>
                    {t("{used} of {total} devices activated", {
                      used: license.activation_count,
                      total: license.max_activations,
                    })}
                  </small>
                ))}
            {status?.expiresAt && (
              <small>
                {t("Offline authorization valid until {date}", {
                  date: new Date(status.expiresAt).toLocaleString(),
                })}
              </small>
            )}
            {status?.perpetualOffline && (
              <small>
                {t("Activated for offline use without a renewal deadline.")}
              </small>
            )}
            {status?.state === "expired" && (
              <small>
                {t(
                  "Connect and refresh Spark to renew this device's offline authorization."
                )}
              </small>
            )}
            {!signedIn && status?.state !== "active" && (
              <small>
                {t(
                  "Sign in above with the account that redeemed your Spark code."
                )}
              </small>
            )}
          </span>
          <div className="settings-row-actions">
            <button
              className="settings-button settings-button-quiet"
              disabled={busy}
              onClick={() =>
                void run(() => window.eidosLite.getSparkStatus(true))
              }
            >
              {t("Refresh")}
            </button>
            <button
              className="settings-button settings-button-quiet"
              onClick={() => void window.eidosLite.openSpark()}
            >
              {t("Redeem code / manage devices")}
            </button>
            {status?.licenseId && signedIn && (
              <button
                className="settings-button settings-button-quiet"
                disabled={busy}
                onClick={() => setConfirmRelease(true)}
              >
                {t("Release this Spark device")}
              </button>
            )}
            {availableLicenses.length === 1 && (
              <button
                className="settings-button"
                disabled={
                  busy ||
                  availableLicenses[0].activation_count >=
                    availableLicenses[0].max_activations
                }
                onClick={() =>
                  void run(() =>
                    window.eidosLite.activateSpark(availableLicenses[0].id)
                  )
                }
              >
                {t("Activate on this device")}
              </button>
            )}
          </div>
        </div>
        {confirmRelease && status?.licenseId && signedIn && (
          <div
            className="settings-row settings-spark-confirmation"
            role="group"
            aria-label={t("Release this Spark device")}
          >
            <span className="settings-row-copy">
              <small>
                {t(
                  "Release this device's slot? Spark features will stop on this computer. Your files and account license will remain. You can activate this device again manually."
                )}
              </small>
            </span>
            <div className="settings-row-actions">
              <button
                className="settings-button settings-button-quiet"
                disabled={busy}
                onClick={() => setConfirmRelease(false)}
              >
                {t("Cancel")}
              </button>
              <button
                className="settings-button"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const released = await window.eidosLite.deactivateSpark()
                    setConfirmRelease(false)
                    return released
                  })
                }
              >
                {t("Confirm release")}
              </button>
            </div>
          </div>
        )}
        {availableLicenses.length > 1 && (
          <details className="settings-spark-license-choice">
            <summary>{t("Choose a license to activate this device")}</summary>
            {availableLicenses.map((license) => (
              <div className="settings-row" key={license.id}>
                <span className="settings-row-copy">
                  <strong>
                    {t(
                      license.acquisition_source === "legacy_gift"
                        ? "Legacy Spark gift"
                        : license.acquisition_source === "code"
                          ? "Redeemed Spark code"
                          : "Spark license"
                    )}
                  </strong>
                  {license.acquired_at &&
                    !Number.isNaN(Date.parse(license.acquired_at)) && (
                      <small>
                        {t("Issued on {date}", {
                          date: new Date(license.acquired_at).toLocaleString(),
                        })}
                      </small>
                    )}
                  <small>
                    {t("{used} of {total} devices activated", {
                      used: String(license.activation_count),
                      total: String(license.max_activations),
                    })}
                  </small>
                </span>
                <button
                  className="settings-button"
                  disabled={
                    busy || license.activation_count >= license.max_activations
                  }
                  onClick={() =>
                    void run(() => window.eidosLite.activateSpark(license.id))
                  }
                >
                  {t("Activate on this device")}
                </button>
              </div>
            ))}
          </details>
        )}
        {availableLicenses.length > 0 &&
          availableLicenses.every(
            (license) => license.activation_count >= license.max_activations
          ) &&
          !status?.error && (
            <p className="settings-service-notice" role="status">
              {deviceLimitMessage}
            </p>
          )}
        {(error || status?.error) && (
          <p className="settings-service-notice" role="status">
            {error ||
              (status?.error?.includes("spark_device_limit_reached")
                ? deviceLimitMessage
                : status?.error?.includes("System clock changed")
                  ? t("System clock changed; refresh Spark while online.")
                  : status?.state === "active"
                    ? t(
                        "Spark could not be refreshed. Cached offline authorization is still available."
                      )
                    : t(
                        "Spark status is unavailable. Your local files are unaffected."
                      ))}
          </p>
        )}
      </div>
    </section>
  )
}
