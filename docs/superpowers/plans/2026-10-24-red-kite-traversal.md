# Red Kite traversal and quiet controls

The user clarified that walking and exploring the generated world like a game is essential. Two stationary views or a small movement radius do not meet that requirement. Preserve the two attributed storylines while adding continuous traversal and smaller translucent controls.

## Implementation

- [x] Reproduce the fixed desktop camera in a real browser; identify the omitted collider export in the original World Labs operation.
- [x] Cache the existing 1.4 MB collider GLB for world `0b84554c-b182-4b3e-a7bb-78f15822a49d`. No new generation or mesh-generation request.
- [x] Add Rapier's kinematic capsule controller to Gate. Bake the GLB into the same metric, OpenCV-to-Three.js frame as the splats. Calibrate the spawn ground and apply the same vertical correction to the visible world.
- [x] Walk on the actual mesh, slide against obstacles, climb ordinary slopes, apply gravity and permit a desktop jump. Remove the provisional local movement radius. Add an authored collider for the prop table.
- [x] Integrate keyboard walking/running and drag or pointer-lock looking; touch movement; Quest left-stick walking and right-stick snap turns. Preserve physical tracking. Switching telling and returning to the story reset to grounded anchors behind the existing fade.
- [x] Preserve Rest, disconnection, reduced-motion preferences, source ownership and separate viewpoint selection. Add a visible ambient-motion override and a collider debug option. Fail visibly if physics assets cannot load.
- [x] Refine the existing interface: compact translucent story panel, smaller perspective controls, optional hidden panels, grouped scene options and smaller in-world controls. Keep text contrast, scrolling and touch targets usable.
- [x] Run unit tests of real physics (floor, wall, slope, jumping, pause), a route through the actual exported collider, actual browser input tests, and emulated Quest input/pose tests. Inspect desktop and mobile together, repair once, and confirm.
- [x] Request an independent read-only review and resolve material findings. Record the architecture, controls, evidence and remaining hardware/live-speech gates in `docs/red-kite/`.

Release step: commit the named paths and push the verified result to `ManagementMO/memory-gate` main, as already authorized. Repository history and a fresh local/remote comparison are the authority for release completion. Preserve the incoming compatible story work from `300a624`; the Red Kite rendering, physics and source/confirmation architecture remain primary.

## Boundaries and evidence

Use Spark + Three.js + WebXR already in Gate, with `@dimforge/rapier3d-compat` for character collision. This is real collider-based locomotion, not a Unity migration or an infinite replacement floor. The separately authored kite and spool use damped spring dynamics; the whole generated environment does not become editable rigid bodies. Stay within geometry the export actually contains; a missing ground sample must never silently enable flying through empty space.

Physical Quest performance/comfort and real family speech remain separate evidence gates. Existing written fictional lines and computer sample voice stay labeled. Keep tokens and signed source URLs out of committed evidence. Record mesh identity/hash, traversal coverage and remaining limitations in the team handoff.

Primary references: [World Labs export frame](https://docs.worldlabs.ai/marble/export/specs), [SPZ metric frame](https://docs.worldlabs.ai/api/rendering-spz), [interactive world examples](https://docs.worldlabs.ai/api/interactive-world-examples), [Rapier character controller](https://rapier.rs/docs/user_guides/javascript/character_controller/).
