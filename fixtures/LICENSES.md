# Fixture sources, licenses and credits

**Sample content only.** These are clearly labeled public-domain photos and generated or CC0 models. No family
identity, history or testimonial is attached to any of them.

The repository's default courtyard uses the original, reproducible models in `fixtures/builtin/` and permitted sample
photos. A fresh clone can run it without external model-generation services. The optional earlier 15-file sample
pack in `fixtures/large/` (approximately 21.5 MB) and historical renders are also included in the initial import.
Raw sources and unused variants stay local. `scripts/seed.mjs` falls back to the original library if the optional
pack is absent. The following legacy notes document provenance rather than grant new rights.

**Legacy pack rights remain source-specific and partly unresolved.** It was originally assembled for private team
use. Inclusion in this import does not establish commercial redistribution rights for generated outputs.
- **Tripo-generated models:** Tripo's help page says free-tier users don't own their outputs (prep questions.md C).
  Don't publish them until that's settled.
- **The SHARP splats:** made with Apple's research-only model license.
- **World Labs splat:** follows World Labs' terms.
- **Poly Haven models:** CC0.

## Photos

| File | Source | Rights | Credit line |
|---|---|---|---|
| `sample-photo-1938.jpg` (964 × 731) | "Interior of living room. Greenhills, Ohio", 1938, FSA/OWI Black-and-White Negatives, Library of Congress, https://www.loc.gov/item/2017769353/ | "No known restrictions on images made by the U.S. government; images copied from other sources may be restricted." (quoted from the LoC record) | Library of Congress, Prints & Photographs Division, FSA/OWI Collection |
| `sample-photo-1934.jpg` (964 × 760) | "Living room. Model house. Reedsville, West Virginia", 1934, Elmer S. Johnson, FSA/OWI, Library of Congress, https://www.loc.gov/item/2017759274/ | "No known restrictions on images made by the U.S. government; images copied from other sources may be restricted." (same statement on the LoC record) | Elmer S. Johnson, Library of Congress, Prints & Photographs Division, FSA/OWI Collection |

Processing: we downloaded the 1024 px "v" JPEGs from tile.loc.gov, then cropped the black film border and negative numbers with
`sips -c` (prep, 2026-10-23; see the prep repo's `evidence/samples.md`). We made no other edits. Both are empty model-home
interiors with no people in them.

## Splats

| File | What | License / terms |
|---|---|---|
| `large/sample-sharp-500k.spz` (500,000 splats, SPZ v3, 6.97 MB) | SHARP (Apple `ml-sharp` at `aed6527`, checkpoint `sharp_2572gikvuh.pt`) run on `sample-photo-1938.jpg` on a Modal L40S (prep V29), then the top 500k splats by opacity × volume written with `@adobe/spz` (V15) | Derived from the public-domain photo. **The SHARP weights are research-only** ("Apple Machine Learning Research Model is licensed under the Apple Machine Learning Research Model License Agreement"; use "exclusively for Research Purposes", no commercial use, revocable). Present the demo as a research prototype. |
| `large/sample-worldlabs-500k.spz` (497,664 splats, 5.5 MB) | World Labs Marble draft world (`marble-1.0-draft`) generated during prep from `sample-photo-1938.jpg`, 500k SPZ export | Generated with World Labs Marble during prep; World Labs terms apply (the prep notes don't record specific output-license terms). |

## Object library (`large/*.glb`, every file ≤ 1.5 MB)

Every Tripo model was generated with **Tripo v3.1** (`model: v3.1-20260211`, `face_limit: 20000`, `texture: true`) from a
text prompt written by the team; no photo or personal data was sent. Each was then shrunk with
`gltf-transform optimize --compress false --texture-compress webp --texture-size 1024` (gltf-transform 4.5.1).

**Tripo output terms:** these are governed by Tripo's terms of service. Our research notes (`research/tripo.md` in the prep
repo) say: "Output ownership is also UNVERIFIED for API use. Search results quote a Tripo help page saying Tripo retains
rights to Free-user outputs and paid users hold the rights, but the page returned 403 to me." Treat the models as
demo-only sample content until someone confirms the terms for this account.

| Key | File | Source | Prompt | Tripo task id | Generated | yawOffset | Size (m) |
|---|---|---|---|---|---|---|---|
| piano | `piano.glb` | Tripo v3.1 (prep) | "upright piano, dark polished wood, 1940s, single household object" | 3475d0b5-9639-43ad-92bb-901e27335552 | 2026-10-23 (prep) | -π/2 | 1.45 |
| armchair | `armchair.glb` | Tripo v3.1 (prep) | "large armchair, faded floral fabric, 1940s, single household object" | 39ebb19b-b871-410d-ab6d-6a5603381251 | 2026-10-23 (prep) | -π/2 | 0.95 |
| radio | `radio.glb` | Tripo v3.1 (prep) | "tabletop wooden radio, rounded top, 1940s, single household object" | c2504c9b-189b-4553-b573-a52b55acb216 | 2026-10-23 (prep) | -π/2 | 0.42 |
| bowl of oranges | `oranges.glb` | Tripo v3.1 (prep) | "bowl of oranges, ceramic bowl, single object" | fa0978e9-1c6c-40a2-b8d8-9d94245acfec | 2026-10-23 (prep) | 0 | 0.30 |
| lamp | `lamp.glb` | Tripo v3.1 (practice build) | "table lamp with fabric lampshade, 1940s, single household object" | 32b45628-2fa6-4e19-9d0e-1f539bc7f3cb | 2026-10-23 07:09 UTC | 0 | 0.55 |
| (clock, not seeded) | `clock.glb` | Tripo v3.1 (practice build); replaced by the CC0 Poly Haven clock below | "wooden mantel clock, 1940s, single household object" | 84465d74-a397-4ec2-a8d6-3d70afc4c121 | 2026-10-23 07:09 UTC | -π/2 | 0.38 |
| sewing machine | `sewing-machine.glb` | Tripo v3.1 (practice build) | "treadle sewing machine with cast iron stand, 1940s, single household object" | 0e426ddb-1de6-4bcd-84ca-15df3d434353 | 2026-10-23 07:09 UTC | -π/2 | 1.00 |
| rug | `rug.glb` | Tripo v3.1 (practice build) | "rectangular woven wool rug lying flat, 1940s, single household object" | 2aa42d6b-2f70-4cd1-885e-bc1fabf103eb | 2026-10-23 07:09 UTC | 0 | 1.80 |
| vase with flowers | `vase-with-flowers.glb` | Tripo v3.1 (practice build) | "vase with flowers, 1940s, single household object" | ec15a90f-d798-4406-9bca-84834e0462d2 | 2026-10-23 07:09 UTC | 0 | 0.50 |
| teapot | `teapot.glb` | Tripo v3.1 (practice build) | "porcelain teapot, 1940s, single household object" | 0ac0afd5-b317-4092-a981-0cbe818bffb1 | 2026-10-23 07:09 UTC | -π/2 | 0.25 |
| (rocking chair, not seeded) | `rocking-chair.glb` | Tripo v3.1 (practice build); replaced by the CC0 Poly Haven rocker below | "wooden rocking chair, 1940s, single household object" | 11ee6f67-2220-49a3-8923-6e52fa511aa1 | 2026-10-23 07:09 UTC | π | 1.05 |
| (chair, not seeded) | `chair-cc0.glb` | SheenChair by Wayfair, LLC (Eric Chadwick), KhronosGroup glTF-Sample-Assets (CC0); a modern lounge chair, replaced by the Poly Haven wooden chair below | n/a | n/a | n/a | 0 | 0.85 |

- **SheenChair (no longer seeded):** CC0 1.0. Credit if used: "SheenChair, Wayfair LLC (CC0), KhronosGroup glTF-Sample-Assets". Shrunk from 4.1 MB to 1.42 MB.
- **Cost:** the prep models used 80 credits (prep `evidence/spend.log`). The practice-build models used 140 credits (balance 340 → 200), logged in `evidence/spend.md`.
- **Facing:** every `yawOffset` was checked by rendering, in `evidence/library/<key>.png`. Each sheet shows the raw model from +Z, +X, -Z and -X, plus a front check from +Z after `rotation.y = yawOffset`. The front is the piano keyboard, the chair seat opening, the radio dial and grille, the clock face, the sewing machine's operator side (needle left, hand wheel right) and the teapot's profile (spout left, handle right). Round objects get 0.
- **Rug fix:** Tripo returned the rug standing on its edge (thin axis X, patterned face +X, bowed about 9 cm per metre). `rug.glb` wraps it in one node that scales X by 0.25, then rotates +90° about Z. It now lies flat with the pattern up and the long side along X, at about 2 cm bow per metre. The upright original is kept at `large/raw/rug.glb`.
- **Node scales:** `piano.glb` and `radio.glb` carry a root-node scale from earlier look-dev (1.248 and 0.360), so their world-space box isn't 1 m. Scale library models by their bounding box (largest dimension → `size`), never by assuming a 1 m box.

### CC0 models from Poly Haven (seeded for `chair`, `clock` and `rocking chair`)

Picked from the prep research (`research/free-3d-models.md`): no login, CC0 1.0. We downloaded the 1K glTF through the Poly
Haven API with `node fixtures/library/polyhaven-fetch.mjs <assetId> <out.glb>` on 2026-10-23 (practice build), then shrank
it to one plain GLB (`gltf-transform optimize --compress false --texture-compress webp --texture-size 1024`; no meshopt or
Draco). There are no skins or animations in the glTF exports. **Rule used:** a CC0 model replaces a Tripo one when its era
fit is at least as good. So the Poly Haven armchair (a grey French bergère) was **not** used: the Tripo floral wingback
fits a 1940s room better.

| Key | File | Poly Haven asset | Authors (credit line) | License | Triangles (after optimize) | yawOffset | Size (m) | GLB MB |
|---|---|---|---|---|---|---|---|---|
| chair | `chair-ph.glb` | Painted Wooden Chair 01, https://polyhaven.com/a/painted_wooden_chair_01 | Kuutti Siitonen | CC0 1.0 | 672 | 0 | 0.96 | 0.23 |
| clock | `clock-ph.glb` | Mantel Clock 01, https://polyhaven.com/a/mantel_clock_01 | Rico Cilliers (model, textures), Yann Kervran (rig) | CC0 1.0 | 15,452 (from 29,742) | 0 | 0.48 | 0.62 |
| rocking chair | `rocking-chair-ph.glb` | Rockingchair 01, https://polyhaven.com/a/Rockingchair_01 | Jorge Camacho | CC0 1.0 | 11,014 | 0 | 1.00 | 0.56 |
| (armchair alternate, not seeded) | `armchair-ph.glb` | Arm Chair 01, https://polyhaven.com/a/ArmChair_01 | Kirill Sannikov | CC0 1.0 | 5,616 | 0 | 1.07 | 0.53 |

CC0 needs no attribution; we credit the authors anyway (seed `credit` field). Sizes come from Poly Haven's real-world
dimensions. The clock's glTF box is smaller than Poly Haven's listed 48 cm, so its size is set explicitly; the headset
scales every model by its bounding box.

## Rebuild

```sh
# 1. Generate (paid: 20 Tripo credits each; refuses past the 150-credit cap logged in evidence/spend.md)
node fixtures/library/tripo-generate.mjs lamp clock "sewing machine" rug "vase with flowers" teapot "rocking chair"
# 2. Shrink each raw GLB (gltf-transform 4.5.1; any install works, e.g. npx -y @gltf-transform/cli@4.5.1)
GT="npx -y @gltf-transform/cli@4.5.1"
$GT optimize fixtures/large/raw/lamp.glb fixtures/large/lamp.glb --compress false --texture-compress webp --texture-size 1024
# 3. Rug only: shrink to a temp file, then lay it flat
node fixtures/library/orient.mjs /tmp/rug-upright.glb fixtures/large/rug.glb --rot-z-deg 90 --scale-x 0.25
# 4. Check facing for every LIBRARY row in scripts/seed.mjs (headless Chromium) -> evidence/library/*.png
node fixtures/library/views.mjs            # or: node fixtures/library/views.mjs teapot=-0.5  (yaw in units of π)
# 5. CC0 models (no login): fetch the 1K glTF from Poly Haven and pack it into one shrunken GLB
node fixtures/library/polyhaven-fetch.mjs painted_wooden_chair_01 fixtures/large/chair-ph.glb
node fixtures/library/polyhaven-fetch.mjs mantel_clock_01 fixtures/large/clock-ph.glb
node fixtures/library/polyhaven-fetch.mjs Rockingchair_01 fixtures/large/rocking-chair-ph.glb
# 6. Upload and upsert (idempotent: files whose sha256 matches the stored file are not re-uploaded); refuses GLBs > 1.5 MB
npm run seed
```

## Original reproducible courtyard and props (October 23 review)

`builtin/*.glb` are original illustrative geometry exported from `apps/headset/src/scene-assets/props.scene-asset.ts` by `scripts/build-builtin-assets.mjs`. The courtyard is original geometry in `courtyard.scene-asset.ts`. No downloaded model, photo texture, font or third-party texture is incorporated into those GLBs. The keepsake frame contains a symbolic illustration, not a family photograph. These files are independent of the historical downloaded/generated models described above.
