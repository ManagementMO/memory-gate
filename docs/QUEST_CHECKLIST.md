# Physical Meta Quest 3 check — pending

No physical-device pass is recorded by this review. A wearer must perform this check on the running build.

## Open the right origin

1. Keep the Mac awake and connect the phone and Quest to the same trusted Wi-Fi.
2. Run scripts/start-all.sh, npm run doctor, then npm run demo:links. This prints the exact current family phone and Quest URLs from private local room credentials.
3. Open phoneOnWifi on the phone (HTTPS port 5174), accept the local certificate and join as family.
4. Open questOnWifi in Quest Browser (HTTPS port 4173). Accept the local certificate, enable the microphone by a user gesture, then Enter the memory.
5. Open the spectator link on the laptop/projector. Use the code printed by demo:links; a code-only audience needs active family sharing. Never publish the family key.

The laptop IP can change; use the links command instead of an address from an earlier review. USB pairing is not claimed.

The current build requests **immersive-vr**, with an opaque background. The lite-world flag now changes only the scenery variant; it does not force the eye buffer down to 0.5. The default framebuffer scale is 0.75, and an explicit ?scale=1 remains available for a measured comparison. Record both the splat variant and eye scale when checking performance. Unused AR room-scanning features are disabled. This configuration change is emulator-tested; it does not check any physical-device box below.

The latest native emulator run passed keepsake grabbing/return and gate selection. A separate real family-screen click paused/resumed the active VR session, with the break instruction still present after five seconds. The emulator's numeric B-button injection did not reach the app's named B input (observed value and press count stayed zero); controller B is **not passed**. Check it on the physical Quest and use the family pause control meanwhile. Evidence: evidence/immersive-vr/.

## Wearer checklist

- [ ] The correct courtyard appears and its scale/floor look plausible at the wearer's actual height.
- [ ] Stereo and both eyes render correctly. No eye tracking is claimed.
- [ ] The entry is comfortable while standing/seated. Do not walk beyond the real boundary to reach content.
- [ ] The nearby keepsake can be reached with a controller, squeezed, inspected and released to its remembered location.
- [ ] A short trigger select opens/closes the gate without accidentally recording a long turn.
- [ ] Hold trigger, speak a supported correction, release: a gold preview appears without moving the accepted bench.
- [ ] Confirm with A or phone. The phone and spectator show the same moved/turned bench.
- [ ] Select the moved bench. The correct original clip, attribution and English reading appear/play.
- [ ] Undo restores the previous placement and source.
- [ ] B / phone Pause stops interaction and shows a persistent Taking a break instruction; B / phone Resume restores the same memory. Check the perceived transition with the wearer.
- [ ] Mic permission, recording and playback work inside XR; interrupted speech does not overlap.
- [ ] Exit and re-enter XR without losing the room.
- [ ] Measure frame rate/comfort on the actual Quest, with scene quality and session refresh recorded.
- [ ] If quality is poor, use the 100k variant or illustrative courtyard; recheck comfort.

Record the tester, date, Quest Browser/OS version, refresh rate, quality setting, approximate session length, failures and any discomfort in a new evidence file. An emulator result never checks these boxes.
