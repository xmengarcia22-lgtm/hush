# Third-party code

Everything under `vendor/` is third-party code shipped unchanged, pinned by hash from `index.html` or from
`app/ui.js`. Each library keeps its own license, reproduced next to it.

| File | Library | Copyright | License |
|---|---|---|---|
| `vendor/jsQR.js` | [jsQR](https://github.com/cozmo/jsQR), a QR code reader, loaded only when the camera scanner opens | Copyright 2015 Cosmo Wolfe | Apache License 2.0, `vendor/LICENSE-jsQR.txt` |
| `vendor/qrcode.min.js` | [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator), a QR code writer | Copyright (c) 2009 Kazuhiko Arase | MIT License, `vendor/LICENSE-qrcode-generator.txt` |

The server has one npm dependency, [ws](https://github.com/websockets/ws) (MIT License), installed by
`npm install` and not vendored here.

Everything else in this repository is Hush's own code, under the GNU Affero General Public License v3
(`LICENSE`).
