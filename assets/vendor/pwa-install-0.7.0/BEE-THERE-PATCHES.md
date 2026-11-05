# Bee There integration (pwa-install 0.7.0)

The bundle uses the original upstream implementation. The earlier custom screenshot
manifest mapping has been removed; there are no Bee There patches in the bundle.

The component has `disable-screenshots` on every entry page and the manifest has no
screenshot entries. Android invokes the upstream install method directly from the
Bee There button. Apple devices display the upstream instructions without a gallery.
The native modal wrapper and viewport sizing are maintained separately in
`install.js`, `install.css` and `install-component.css`.
