// Splat room look: a Spark object-space modifier that (1) tones the photo splat toward the shared sepia ramp while
// keeping the photo's own tonal values (warm, readable, never blown out), (2) reveals the room outward from the
// photo's camera like a memory forming, with a warm band at the front, and (3) dissolves the far, noisy edges so
// the room floats in passthrough. Runs in Spark's splat-generation pass (per splat, not per pixel), so it costs
// nothing per frame once settled. Splats are unlit and Spark writes sRGB directly (no tone mapping), so this is
// the only place the room's exposure is decided.
import { dyno, type SplatMesh } from '@sparkjsdev/spark';

export type RoomGrade = {
  reveal: { value: number };
  warmth: { value: number };
  exposure: { value: number };
  farStart: { value: number };
  farEnd: { value: number };
};

export function applyRoomGrade(room: SplatMesh, opts: { farStart?: number; farEnd?: number; warmth?: number; exposure?: number } = {}): RoomGrade {
  const reveal = dyno.dynoFloat(0);
  const warmth = dyno.dynoFloat(opts.warmth ?? 0.85);
  const exposure = dyno.dynoFloat(opts.exposure ?? 0.92);
  const farStart = dyno.dynoFloat(opts.farStart ?? 6.0); // splat units from the photo camera
  const farEnd = dyno.dynoFloat(opts.farEnd ?? 8.5);
  room.objectModifier = dyno.dynoBlock({ gsplat: dyno.Gsplat }, { gsplat: dyno.Gsplat }, ({ gsplat }) => {
    const grade = new dyno.Dyno({
      inTypes: { gsplat: dyno.Gsplat, reveal: 'float', warmth: 'float', exposure: 'float', farStart: 'float', farEnd: 'float' },
      outTypes: { gsplat: dyno.Gsplat },
      inputs: { gsplat, reveal, warmth, exposure, farStart, farEnd },
      statements: ({ inputs, outputs }) => dyno.unindentLines(`
        ${outputs.gsplat} = ${inputs.gsplat};
        vec3 mgC = clamp(${inputs.gsplat}.rgba.rgb, 0.0, 1.0);
        float mgL = dot(mgC, vec3(0.299, 0.587, 0.114));
        // Sepia ramp that preserves luminance (shadow / mid / paper white), so walls stay paper, not light bulbs.
        vec3 mgS = mix(mix(vec3(0.15, 0.105, 0.07), vec3(0.58, 0.46, 0.33), smoothstep(0.0, 0.55, mgL)),
                       vec3(0.93, 0.86, 0.72), smoothstep(0.5, 1.0, mgL));
        float mgD = length(${inputs.gsplat}.center);
        float mgIn = 1.0 - smoothstep(${inputs.reveal} - 0.9, ${inputs.reveal}, mgD);
        float mgBand = smoothstep(${inputs.reveal} - 1.3, ${inputs.reveal} - 0.45, mgD) * mgIn;
        float mgFar = 1.0 - smoothstep(${inputs.farStart}, ${inputs.farEnd}, mgD);
        vec3 mgOut = mix(mgC, mgS, ${inputs.warmth}) * ${inputs.exposure};
        ${outputs.gsplat}.rgba.rgb = min(mgOut + mgBand * vec3(0.30, 0.20, 0.08), vec3(1.0));
        ${outputs.gsplat}.rgba.a = ${inputs.gsplat}.rgba.a * mgIn * mgFar;
        ${outputs.gsplat}.scales = ${inputs.gsplat}.scales * mix(0.25, 1.0, mgIn);
      `),
    });
    return { gsplat: grade.outputs.gsplat };
  });
  room.updateGenerator();
  return { reveal, warmth, exposure, farStart, farEnd };
}
