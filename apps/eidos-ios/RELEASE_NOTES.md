# Eidos iOS 0.2.0

Build 5 fixes initial LAN pairing when a computer advertises an unreachable VPN
or virtual-network address. Requires iOS 17 or later.

## Bug fixes

- Pairing verifies alternative LAN addresses before sending credentials and
  falls back to Bonjour discovery for older codes. The verified address is
  retained for reconnection. QR recognition no longer rejects an otherwise
  valid invitation solely because its primary address is unsupported.

## Improvements

- The bundled Eidos File editor includes column-header filtering, clearer
  filter editing and consistent record context menus.

## What to test

Update Eidos Lite to 0.29.1 and generate a fresh code in Device connection.
On the same Wi-Fi network, test scanning and pasting the code, desktop approval,
Space download, offline edits and reconnection. Also test a computer with VPN
or virtual-network adapters enabled and cancellation during pairing.

The address recovery fix passed native tests on an iOS 17.5 simulator against
a real desktop service, including certificate rejection and legacy discovery.
Physical iPhone camera scanning and Windows LAN pairing still need coverage.
Use disposable files or a copy of your Space, and report your device model,
iOS version and reproduction steps through TestFlight.

This candidate is intended for the existing public TestFlight group. Upload,
Apple processing and external testing approval are separate from preparation.
