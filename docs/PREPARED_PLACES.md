# Prepared places and the album's samples

Two demonstration scenes live in Gate's library and in its album:

- **The Red Kite**: the cached World Labs meadow with the team's five Blender props. Mo's full two-tellings experience is at `/?story=red-kite`. The album's Red Kite card opens it, and its "gate/" link returns to the album.
- **The courtyard**: the cached World Labs courtyard, furnished from the photoreal object library. The album's courtyard card steps straight into it.

Both places can also be reached from a normal visit. Words that describe a place call it up instead of a live sketch: "courtyard", or two of "pergola / grape vines / shutters / limestone / stone paving", and "red kite", or two of "kite / meadow / oak / path / hills". The person's words are matched against `packages/shared/src/places.ts`. Things named in the conversation are then brought in from the library, each to its own spot in that world. This is instant and costs nothing; no model is called. Things that rest on something bring it along, so a teapot brings its table and a spool brings Mo's side table.

The host's device keeps the place as the visit's memory (`memories.share`, with each thing brought in and where it was put), so guests follow into it and see the same things, as they do for a sketched memory.

## Changing a scene

- **Spots** (where a kind of thing stands) are in `PLACES` in `packages/shared/src/places.ts`. Units are metres in the world's own frame, with the visitor at the world camera's position: x is right and z is back, as seen from that camera; y is up from the floor. Use `on: 'table'` for things that sit on a table. A kind can list several spots; a second chair takes the second one.
- **`view`** turns the visitor toward a place's best side. The courtyard faces back (π) because its world camera faces a corner. **`flat`** lets laptops and phones step back to see things that are within arm's reach in the headset.
- **Models:**
  - The photoreal kinds are Poly Haven CC0 models, fetched once with `node apps/gate/scripts/fetch-models.mjs`. They are not in git.
  - The team's own models are listed in `TEAM_MODELS` in `apps/gate/src/scene/sketch/realModels.ts`. These are in git, under `apps/gate/public/red-kite/models/`.
  - A new kind also needs an entry in `LIBRARY` in `packages/shared/src/scene.ts`, giving its footprint, height and the words people use for it.
- **Album pictures** are taken from the real scenes. Re-run the capture after polishing:
  ```sh
  node apps/gate/scripts/album-pictures.mjs red-kite    # needs `npm run demo:kite` once
  node apps/gate/scripts/album-pictures.mjs courtyard   # needs `npm run seed:world` once
  ```
  The words and pictures each card shows are in `apps/gate/src/album/prepared.ts`.

## Adding a third place

1. Cache its world the way the courtyard and the meadow are cached: a `fixtures/worlds/<name>.json` pack and a seed script that uploads it as an asset. Don't generate a new world for this; the World Labs budget is spent.
2. Add the setting to `splats.usePreparedPlace` in `convex/splats.ts`.
3. Add its words, intro, view and spots to `PLACES`.
4. Add a picture recipe to `album-pictures.mjs` and an entry to `PREPARED`.

Every prepared place is fictional sample content and is labelled as such in the album. In a visit it is a place from the library, never the person's own photograph.
