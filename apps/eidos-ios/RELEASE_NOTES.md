# Eidos iOS 0.2.1

Build 6 fixes installation and startup of compatible Marketplace plugins.
Requires iOS 17 or later. This release is intended for the existing TestFlight
internal and public testing groups.

## Bug fixes

- Install plugins with bundled translations without the “Invalid plugin package
  envelope” error. Validated translations are supplied to plugin views and actions,
  and the permission review uses readable plugin labels.
- Keep plugin dependency variables separate from the host's mount arguments,
  fixing plugin views such as Markmap that failed to start after installation.
- Preserve package integrity checks, permission review and per-Space enablement
  for both older packages and localized packages.
- Recover LAN pairing when the computer advertises an unreachable VPN or
  virtual-network address by checking alternative addresses and local discovery.

## What to test

Install or update a compatible plugin from Space actions → Plugins. Review its
permissions, then open a Markdown note with Markmap. Check installation in both
English and Chinese and confirm that enabling a plugin affects only the chosen
Space. Existing local files should remain available after updating the app.

Seven published packages passed installation and enablement checks in an iOS
simulator; Markmap rendering and Journals navigation were also verified there.
Physical iPhone and TestFlight upgrade testing remain separate from simulator
coverage. Themes, background services, plugin storage and other capabilities
not implemented by the mobile host remain unsupported.
