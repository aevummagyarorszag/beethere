# Bee There integration patches (pwa-install 0.7.0)

The MIT-licensed upstream bundle is kept locally. Two focused changes are applied:

- `fetchAndProcessManifest` maps `x-bee-there-screenshots` to the component's screenshot gallery. The linked manifest deliberately has no standard `screenshots` entry, so Android's browser-owned native install confirmation does not expand into a screenshot gallery. App identity and native installation remain tied to the linked manifest.
- The Android mobile template includes a gallery toggle using the upstream `toggleGallery` handler. Integration styles in `install-component.css` hide gallery images until that toggle is selected.

The surrounding native `<dialog>` and visual viewport sizing live in `install.js`/`install.css`/`install-component.css`; upstream platform detection, install APIs and Apple gallery remain in use. Reapply these two bundle changes when updating the vendor version.
