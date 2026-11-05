# Custom domain deployment

The implementation is disabled by default. Passing local tests or uploading a
disabled Worker does not establish customer-domain availability.

## Configuration

Configure these separately for each environment:

- `CUSTOM_DOMAINS_ENABLED`: `true` only after the acceptance checks below.
- `CUSTOM_DOMAIN_ZONE_ID`: the SaaS zone ID, with Cloudflare for SaaS enabled.
- `CUSTOM_DOMAIN_CNAME_TARGET`: a proxied, dedicated onboarding target.
- `CUSTOM_DOMAIN_DCV_DELEGATION_TARGET`: the exact zone-wide hostname displayed
  under Cloudflare Custom Hostnames → DCV Delegation. The customer record is
  `_acme-challenge.<customer-host> CNAME <customer-host>.<delegation-target>`.
- `CLOUDFLARE_CUSTOM_HOSTNAMES_TOKEN`: a secret scoped to Custom Hostname
  management on that zone. Never expose it to the account UI, Runtime or logs.

The feature remains unavailable when any required configuration is missing.
The existing Publish/account service secrets and login secrets remain stable.
No account D1 migration or new `publish_access` field is required.

## Staging acceptance

1. Prepare a separate staging SaaS zone, fallback origin and onboarding target.
   Use Cloudflare's documented Worker-as-origin setup (originless fallback
   record and a zone-scoped `*/*` route to Publish). Do not assume the existing
   `*-staging.eidos.ink/*` route matches third-party hosts. If sharing a zone,
   prove explicit route precedence preserves production Publish and Relay;
   a `*/*` route must never silently capture another environment's hostnames.
2. Upload the Publish build while disabled, then the matching account build.
   Confirm discovery, existing handles, public pages, private/password access,
   Form submission and Relay upgrades still work. Confirm the new DO binding.
3. Use staging-only configuration and credentials to enable a controlled pilot.
   Bind domains you own: external DNS CNAME; Cloudflare DNS apex flattening;
   DNS-only traffic records are the first onboarding path. Test Cloudflare O2O
   and any external ALIAS provider separately before advertising their support.
4. Verify Eidos TXT and DCV delegation before provisioning. Observe separate
   hostname/SSL status and current validation records. Check CAA restrictions,
   DNSSEC failures, propagation, order timeouts and delegated renewal.
5. Exercise Markdown images/links, file Range downloads and plugin Views,
   nested paths, `.eidos` Runtime, password access, private login and signed-in
   Form submission on the actual hostname. Confirm unknown Hosts are denied.
6. Test concurrent competing accounts, handle changes, deletion of DNS proof,
   Pro expiry/suspension, unpublish, cleanup API failure, rebind and old-session
   rejection. Verify cache policy and canonical headers from multiple regions.
7. Record provider quota and projected hostname charges, including pending
   registrations. Confirm automatic cleanup and the provider API token scope.

Before production, independently verify SaaS account availability, quota,
fallback status, ingress routes, CAA and DCV delegation. Root onboarding through
ordinary A/AAAA records is excluded without contracted Apex Proxying.

## Operation and rollback

One hostname binds an entire tenant and retains publication paths. The root
traffic record should use DNS-only mode at the customer's provider, including
Cloudflare's grey-cloud mode. The SaaS target remains proxied in Eidos's zone.
Customer-side CDN/O2O proxying is not included in the first onboarding guarantee.
The root path is not a publication index. Apex and `www` consume distinct bindings;
the current per-tenant allowance is one, so no automatic `www` alias is added.
Official addresses remain aliases, with canonical metadata preferring the active
custom domain. Removing a domain leaves publications and R2 objects intact.

Active bindings renew verification leases every six hours, expiring within
24 hours without success. Missing proof or invalid DNS/TLS revokes serving;
transient provider outages cannot extend the lease. Pending registrations and
records continuously non-active for seven days are removed by alarms. Removal failure
leaves a non-serving `removing` record and retries external cleanup.

For an application rollback, disable the feature first and verify official URL
behavior. Keep the DO class/binding and registry data available for cleanup;
do not delete the namespace. An emergency disable stops custom-domain serving
but does not delete provider certificates or stop hostname billing. Re-enable
management with correct configuration to complete cleanup. Never delete the
provider hostname before durable application revocation.

## Official references

- [Worker as fallback origin](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/start/advanced-settings/worker-as-origin/)
- [Hostname and certificate readiness](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/domain-support/hostname-validation/)
- [Delegated DCV](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/security/certificate-management/issue-and-validate/validate-certificates/delegated-dcv/)
- [SaaS plans](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/plans/)
- [Apex proxying](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/start/advanced-settings/apex-proxying/)
