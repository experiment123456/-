# Original online asset delivery

The home page uses the original online MP4 URLs, foreground PNG URL and Google Fonts stylesheet. These resources are not bundled or downloaded by the startup script. Their URLs are recorded in `ONLINE-SOURCES.json` and referenced directly by `src/App.tsx` / `index.html`.

- Home videos: the original four CDN MP4 URLs, played by HTML video with the existing carousel and opacity transition.
- Train window: the original Figma-hosted foreground PNG.
- Instrument Serif: the original Google Fonts stylesheet, normal and italic.
- `abyss-whale-login.mp4` / `.png`: existing login assets, unchanged.
- `komorebi.mp3`: existing background music, unchanged; preserve the attribution in `MUSIC-CREDITS.md`.

Teammates need internet access to those hosts during use. CDN availability, font loading and browser autoplay policy can affect the result, just as in the original app. The login media and music listed above remain local, as they were before packaging.

This document records provenance, not a new license grant. Preserve `MUSIC-CREDITS.md` and confirm original asset rights before publishing or commercial redistribution.
