# Dogfood round 4 — 97 / 100

Run: `apps/gate/scripts/dogfood.sh 4` on ed1a3eb (palace world, marble Figure, same-room presence; no live services).
Every automated check passed: typecheck, build (4.8 s), desktop journey (Figure, palace: 0 errors, Visit again and
Visit another memory included), phone journey (Light: 0 errors), the aurora gate (`?world=aurora`), headset
rehearsal (161 frames / 3 s, entered VR, formed the memory, exited to the album, 0 errors), album interactions,
four generation renders. Frame rate (headless Chrome on this Mac): gate 54.0, memory 66.0, gate at headset quality
89.3 fps. The two-device check (nearby join, quiet guest, lights, look-here mark) passed separately earlier today.

Visual review of every stage (contact sheet of `apps/gate/.shots/round-4/desktop-figure/`):

| # | Item | Score | Notes |
|---|---|---|---|
| 1–4 | Gate, greeting, gathering, reply | 20/20 | Palace across the lagoon; Figure above the captions; one sentence of caption at a time. |
| 5 | Step through → memory | 10/10 | Stepping stones of light, through the arch, the coffered dome and its oculus, then the white. |
| 6–7 | Detail, album, Visit again | 10/10 | The cat forms; the album sits over the palace; revisit and another memory work. |
| 8–12 | Visuals | 28/30 | **Found:** on the white page the Figure looked peach (its additive glow tints white stone); fixed after the round. The Figure sits low in the frame for a moment as forming begins. |
| 13–15 | Platforms | 14/15 | Gate at desktop quality is 54 fps here (palace detail and shadows); headset quality is 89. |
| 16–19 | Robustness | 15/15 | |

Fixed after: glow on the white page reduced to a trace (the eyes and diamonds stay lit by their own light).
