# Real main-memory object discovery

These are screenshots of the running main Gate journey, not the earlier design mockup. They use the checked meadow, the current boy/grandmother models, the existing companion and dock, and the additive object HUD.

- `meadow-markers.jpg`: existing main view with small discovery prompts.
- `meadow-apify-card.jpg`: a real NASA excerpt retrieved by Apify, with a source link and small provider credit.
- `quest-apify-card.jpg`: the corresponding native card in a stereo Quest 3 emulated session.
- `quest-flowers-card.jpg`: the authored meadow flower hotspot with actual RHS context (daisies are explicitly an example, not a species identification).
- `quest-trees-card.jpg`: the authored tree hotspot with actual Minnesota DNR context.
- `home-desktop.jpg`, `home-phone.jpg`, `home-landscape.jpg`: the actual welcome screen with the secondary meadow option, small Apify credit and existing example links. Headset entry stays clear of the welcome controls at all three sizes.

`verification.json` contains the six checks, public source URLs, retrieval times, successful Apify run IDs and private Actor build ID. Session tokens, environment files and private browser storage are excluded. Physical Quest hardware remains unverified.

`home-to-headset.json` records the final ten-check run through the new home option, including responsive/invitation/nearby behavior and all original native discovery checks. It reused the same three successful Actor runs and had no page errors. The separate `walking-check.json` retains the broader movement-check limitations.
