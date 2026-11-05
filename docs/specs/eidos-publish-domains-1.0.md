# Eidos Publish Custom Domains 1.0

Status: Optional Publish service profile, gated by deployment configuration.
Canonical language: English. This profile does not change Eidos File or Runtime semantics.

## Binding and routing

A currently active Publish Pro tenant MAY bind one exact customer hostname to
its entire Publish site. Publication paths MUST remain unchanged. A hostname
MUST map to one stable tenant ID and one fresh binding ID, independently of a
Publish handle. Apex and `www` hostnames are separate bindings. This profile
does not introduce a root index, single-publication root mount, or wildcard.

The service MUST normalize IDNs to ASCII, reject URL syntax, IP literals,
non-public names and Eidos control/publication zones, and reserve enough DNS
name space for the verification labels. Domain and tenant claims MUST serialize.
An expired or removed binding MUST NOT authorize a later binding generation.

Unknown Hosts MUST be rejected before serving tenant content, shared assets,
Runtime APIs or management/discovery APIs. Management APIs remain on the official
control origin. Published content MUST retain existing public, password,
publisher-only private, and signed-in Form checks on every hostname.

## Proof and certificate lifecycle

Registration MUST generate a fresh account-bound `_eidos-publish.<hostname>`
TXT token. A pre-existing CNAME or certificate MUST NOT count as account proof.
The token MUST remain in DNS for periodic revalidation. Cloudflare hostname
ownership and certificate validation are separate from this Eidos proof.

The provider hostname MUST NOT be provisioned before Eidos proof is verified.
Delegated DCV MUST be configured and its `_acme-challenge` CNAME verified;
conflicting certificate-order TXT instructions MUST NOT be displayed alongside
that CNAME. This profile relies on delegated renewals rather than application
HTTP challenge routing.

`pending_dns`, `pending_tls`, `ready`, `active`, `suspended`, `removing` and
`removed` are separate application states. Activation requires current Pro,
matching tenant/domain claims, Eidos TXT proof, DCV delegation, provider hostname
`active`, provider SSL `active`, and DNS pointing to the configured SaaS target.
Readiness MUST NOT itself enable public routing; activation is explicit.

Active bindings are checked every six hours. A successful check grants at most
a 24-hour verification lease. Transient failures MUST NOT extend that lease;
missing ownership or invalid DNS/TLS MUST revoke routing. Public requests MUST
also check current tenant entitlements using the existing bounded refresh.
Bindings continuously non-active for seven days are removed; time previously
spent active MUST NOT shorten this recovery window. Removal
MUST revoke routing durably before provider cleanup, retry failed cleanup, and
prevent reuse until cleanup completes. Provider creates with uncertain outcomes
MUST be reconciled by hostname before another order is created.

## Origins, sessions and content

The public URL MUST use the actual validated hostname. Custom-domain Runtime
tickets, viewer/password/respondent sessions and Form intents MUST bind their
audience to both hostname and binding ID. Runtime proxying MUST also check the
current hostname-to-tenant mapping. Official-host audiences remain compatible.

Account login stays on the official account origin. The account service MUST
resolve custom callback targets through the trusted Publish service, reject an
outdated binding ID, and issue a short-lived, single-use, generation-bound code.
Cookies MUST remain Secure, HttpOnly and host-only; account credentials MUST NOT
be shared with customer origins. This profile does not add a member-list ACL.

Assets, attachment downloads, Form endpoints and Runtime requests MUST remain
same-origin and retain version/access checks. Custom-domain HTML MUST avoid
shared caching; protected content MUST remain `private, no-store`. Existing
official URLs remain usable aliases. Public canonical metadata and publishing
receipts prefer an active custom domain without forcing management/API redirects.
Already downloaded or browser-cached public content cannot be recalled.

Published plugin Views MUST NOT connect to the current publication origin or
other registered active publication origins. This check MUST apply when serving
an existing artifact, not only when originally publishing it.

## DNS and conformance

Subdomains use CNAME to the configured SaaS target. Apex domains require DNS
flattening/ALIAS support; ordinary apex CNAME and manually copied Cloudflare IPs
MUST NOT be advertised as universal solutions. A-only onboarding requires a
separately contracted and verified Apex Proxying deployment.

The retained Worker tests cover normalization, concurrent tenant allocation,
duplicate ownership, DNS/TLS/activation separation, generation-bound sessions,
Runtime and Form access, expiry, cleanup failure and fresh-proof rebinds. Account
tests cover trusted callback resolution and single-use generation-bound codes.
Real DNS, provider issuance/renewal, O2O and edge-route coexistence are deployment
acceptance tests; local mocks MUST NOT be presented as proof of those behaviors.
