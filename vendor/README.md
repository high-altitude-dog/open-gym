# Vendored libraries

Bundled once by `../tools/vendor.sh` (esbuild 0.28.2, ES2020 modules, not minified so they can be read). No third-party script is ever loaded from the network.

| File | Source | Licence | SHA-256 |
|---|---|---|---|
| `noble.js` | `@noble/curves` 2.4.0 (ed25519, x25519) and `@noble/hashes` 2.4.0 (sha256, sha512, hmac, hkdf), by Paul Miller | MIT | `98315f59f2a58578559c2ac3f42c96e97a64993f98591875202d3ec64e3f89ec` |
| `qrcodegen.js` | Nayuki's QR Code generator 1.8.0, `typescript-javascript/qrcodegen.ts` (the same library and version as the Android app) | MIT | `9281db8d0e48ea603e73d39a173a8624c31c3136f930f1cbfa1b74d89fc987b5` |

## Logos

`../icons/brand/*.svg`, to show which install steps fit which phone and browser. The trademarks belong to their owners.
- `chrome.svg`, `firefox.svg`, `safari.svg`, `samsung.svg`: the full-colour browser logos from [browser-logos](https://github.com/alrra/browser-logos) (`@browser-logos/chrome` 2.0.0, `@browser-logos/firefox` 3.0.10, `@browser-logos/safari` 2.1.0, `@browser-logos/samsung-internet` 4.0.6), unchanged.
- `apple.svg`: from [Simple Icons](https://simpleicons.org) 16.33.0 (CC0; the mark is single-colour).
- `android.svg`: the full-body Android robot, [Android_robot.svg](https://commons.wikimedia.org/wiki/File:Android_robot.svg) from Wikimedia Commons, by Google Inc. (designed by Irina Blok), CC BY 3.0; recoloured from #A4C639 to the current Android green #3DDC84. *The Android robot is reproduced or modified from work created and shared by Google and used according to terms described in the Creative Commons 3.0 Attribution License*.
