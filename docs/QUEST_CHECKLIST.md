# Physical Meta Quest 3 check — pending

No physical-device pass is recorded by this review. A wearer must perform this check on the running build.

## Open the right origin

1. Keep the Mac awake and connect the phone and Quest to the same trusted Wi-Fi.
2. Run scripts/start-all.sh, npm run doctor, then npm run demo:links. This prints the exact current family phone and Quest URLs from private local room credentials.
3. Open phoneOnWifi on the phone (HTTPS port 5174), accept the local certificate and join as family.
4. Open questOnWifi in Quest Browser (HTTPS port 4173). Accept the local certificate, enable the microphone by a user gesture, then Enter the memory.
5. Open the spectator link on the laptop/projector. The prepared room code is 6N9S4X; a code-only audience needs active family sharing. Never publish the family key.

Current laptop IP at review time: 10.0.8.161. It can change; use the links command instead of relying on this address. ADB is not installed; USB pairing is not claimed.

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
- [ ] B / phone Pause stops interaction and gives a comfortable pause; Resume restores the same memory.
- [ ] Mic permission, recording and playback work inside XR; interrupted speech does not overlap.
- [ ] Exit and re-enter XR without losing the room.
- [ ] Measure frame rate/comfort on the actual Quest, with scene quality and session refresh recorded.
- [ ] If quality is poor, use the 100k variant or illustrative courtyard; recheck comfort.

Record the tester, date, Quest Browser/OS version, refresh rate, quality setting, approximate session length, failures and any discomfort in a new evidence file. An emulator result never checks these boxes.
