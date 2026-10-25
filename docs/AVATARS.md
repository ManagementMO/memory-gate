# Likenesses for shared visits

In a shared visit, everyone appears where they really are in the memory: at their perspective's eye height, with their head and (in the headset) their hands. By default each person is their perspective's **person**: the grandchild a boy of about eight, the grandparent his grandmother. A family member can replace that with a **likeness**, a rigged 3D model built from their own photos. While a figure loads, or if it can't, a porcelain figure in their colour stands in.

## The two people

`apps/gate/public/people/boy.glb` (1.31 m, eyes at 1.21 m) and `grandma.glb` (1.56 m, eyes at 1.45 m) are rigged MakeHuman characters made with MPFB 2 and the MakeHuman system assets (CC0, free for any use). Each has a 52-bone Mixamo skeleton and one `Walk_InPlace` loop. While nobody is seeing through the boy's eyes, the boy standing in at his spot is `boy-flower.glb`: the same boy and skeleton holding a daisy (a separate mesh on his right hand), with a 10 s `Idle_Flower` loop in which he twirls it, sniffs it, admires it and holds it out to you. Someone seeing through his eyes is always the walking `boy.glb`. The source exports (17-19 MB, 2048 px PNG textures, plus FBX and the `.blend`) stay outside the repo; `node apps/gate/scripts/prepare-people.mjs [sourceDir] [flowerDir]` makes the light copies (meshopt geometry, WebP textures at most 1024 px, about 1 MB each), as `fetch-models.mjs` does for the object library. They are shown at their true size, and each perspective's eye height is theirs (`PERSONAS` in `social/store.ts` and in the SpacetimeDB module).

The likeness is built **offline, on your own computer**. Only the finished model (a `.glb` file) is uploaded to this computer's Memory Gate server. The photos never leave your machine, and no photo is sent to any 3D service.

## Consent

- A likeness is shown only to people in the same visit.
- **A child's likeness needs a parent's or guardian's agreement.** The upload form asks whether the person is under 18. If they are, it asks for the guardian's name and their explicit agreement, and the server refuses the model without both. The exchange gateway refuses it again.
- Whoever holds the likeness's key, which is kept on the device that uploaded it, can choose **Stop sharing it** at any time. That deletes the file, and every visit stops showing the likeness within about 10 seconds.
- Deleting a memory does not delete the likeness, because a likeness is not tied to one visit. Revoke it separately.

## What you need

| Tool | Cost | Purpose |
|---|---|---|
| [Blender](https://www.blender.org/download/) 4.2 or newer | Free | Modelling and export |
| [MPFB 2](https://static.makehumancommunity.org/mpfb.html) (the MakeHuman plugin for Blender) | Free | A body with the right age, height and proportions, plus a rig |
| [KeenTools FaceBuilder for Blender](https://keentools.io/products/facebuilder-for-blender) | Paid, with a trial | A head shaped from 2–3 photos of the person |

## Build it

1. **Body.** In Blender, open the MPFB panel and create a new human.
   - Set **age** and **height** to match the person. A grandchild might be 7 years old and about 1.25 m tall; a grandparent might be 72 and 1.65 m.
   - Leave the body neutral and clothed simply; MPFB's default clothing assets are fine.
2. **Rig.** In MPFB, choose **Add rig → Game engine**. The app looks for bones named `head`, `neck_01`, `upperarm_l/r`, `lowerarm_l/r` and `hand_l/r`. MPFB's default rig and Mixamo names also work.
3. **Face.** In FaceBuilder, add 2–3 photos of the person (front, three-quarter, side), place the pins, and build the head.
   - Bake the face texture.
   - Then fit the FaceBuilder head over the MPFB head, or project its texture onto the MPFB head, and transfer the head weights.
   - Keep it gentle and recognisable rather than photoreal; the scene is soft porcelain.
4. **Pose.** Leave the model in its rest pose (A-pose or T-pose). The app moves the arms and head itself.
5. **Export.** Choose **File → Export → glTF 2.0** and set:
   - Format **glTF Binary (.glb)**, +Y up, **Apply Modifiers** on.
   - No animations, no Draco compression.
   - Textures 1024–2048 px JPEG.
   - Aim for **≤ 30,000 triangles** and **≤ 8 MB**; the server rejects files over 10 MB.
   - Scale in metres: the model's height should be the person's real height.
6. **Delete the photos** from the Blender project folder if you don't need them any more.

## Share it

1. Join the visit on the same computer (or the phone you'll use), choose **My likeness**, pick the `.glb` and answer the consent questions.
2. The device remembers the likeness and shows it again in later visits. To wear it on another device (for example the person's own phone), open the visit there with `?avatar=KEY` added to the link. The key is shown nowhere else; treat it like a password.
3. If the model has no recognisable skeleton or won't load, the porcelain figure is shown instead, and nothing breaks.

## How it moves

- The **body** stands on the ground below the person's eyes (in the meadow, its real ground). Standing, it slowly turns to face where their head faces; walking, it faces the way they go.
- **Standing**: any loop in the file named like "idle" plays on its own clock, and keeps going underneath the walk, so stopping picks it up again where it is.
- **Walking**: any loop in the file named like "walk" plays as much as they're moving (none while standing or swaying, all of it by a slow stroll), at the pace that keeps its feet from sliding (measured from the stance foot), backwards when they step back. Each frame starts again from the rest pose, so the head and arm turns never pile up (`avatar/walkCycle.ts`).
- **Neck and head** share the head's turn (40% neck, 60% head).
- **Arms** use an analytic two-bone solve to reach the controllers or hands in the headset. On phones and laptops they swing with the walk, and standing they follow the idle loop (or, without one, rest at the sides).
- The two people are shown at their true size. A likeness is **scaled to the person's eye height**, so someone seeing through a grandchild's eyes appears grandchild-sized, with a "seeing as grandchild" label.
