# The boy and his grandmother, walking (branch `human-models`)

The laptop sees through the grandchild's eyes and an emulated Meta Quest 3 through the grandparent's, in the team's
Red Kite meadow (`?memory=red-kite`, the host saying "We flew a red kite in a big meadow by an old oak tree…", so the
prepared meadow is called up and the headset, waiting at the gate, follows into it).

| | |
|---|---|
| 1 | The laptop, at the boy's 1.21 m, sees the grandmother standing at the grandparent's spot by the oak. |
| 2 | The Quest, at the grandmother's 1.45 m, sees the boy (Lily) on the path. |
| 3 | The laptop holds W: the Quest sees the boy walking toward it (1.5 m/s, the walk fully on), then stopping. |
| 4 | He stops 0.7 m short of her: people keep a little room between them. |
| 5 | The Quest pulls its left stick back: the laptop sees her stepping back along the path (1.2 m/s, walking backwards). |
| 6 | From the side, low: her shoes are on the path (walking happens on the ground you see). |

Her raised hands are the emulator's: its controllers float at face height in front of the head, and in the headset
the arms reach for the controllers. The emulated Quest loads the light 100k meadow, which it draws with a fine grid.

Checked by `node apps/gate/scripts/walk-check.mjs` (9/9), which reads what each device draws (`window.__people`:
which person, how much of the walk, speed, position). Not tried on a physical Quest yet.
