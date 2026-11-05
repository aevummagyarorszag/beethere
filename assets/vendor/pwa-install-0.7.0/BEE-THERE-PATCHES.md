# Bee There integration patch (pwa-install 0.7.0)

The upstream MIT-licensed component remains responsible for platform detection,
native installation, instructions and gallery controls.

One focused bundle patch maps the manifest extension `x-bee-there-screenshots`
to the component's screenshot gallery inside `fetchAndProcessManifest`. The raw
linked manifest has no standard `screenshots` property, so Android's browser-owned
confirmation remains compact. The app identity remains tied to the linked manifest.
Reapply this mapping when upgrading the bundle.

`install-component.css` displays the upstream desktop-style More / Install card
at phone widths too. Pictures remain hidden until More is selected. Browsers
without a native install API retain the upstream mobile instructions.
`install.js` and `install.css` provide the native modal wrapper and visual-viewport
sizing. Apple continues to use the library's original gallery interface.
