// A shared photo or video floats beside the companion while you talk about it, framed like a pane of glass.
// Walking through the gate, it drifts ahead into the light: the place it shows is what forms on the other side.
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useGate, type MediaItem } from '../state/store';
import { COMPANION_SPOT, MEDIA_SPOT } from './layout';
import { SPOT, walkCompanion } from './palace/plan';
import { damp, dampVec3, easeInOutCubic } from './util';

const FRAG = /* glsl */ `
varying vec2 vUv;
uniform sampler2D uMap; uniform float uFade, uAspect, uHasMap, uTime, uGlow;
float roundedBox(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
void main() {
  vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
  vec2 halfSize = vec2(uAspect * 0.5, 0.5) - 0.075; // leave a margin for the glow around the glass
  float d = roundedBox(p, halfSize, 0.05);
  float w = fwidth(d);
  float inside = 1.0 - smoothstep(-w, w, d);
  vec2 puv = p / (halfSize * 2.0) + 0.5;
  vec3 photo = uHasMap > 0.5 ? texture2D(uMap, puv).rgb : vec3(0.12, 0.12, 0.2);
  // a glass rim: a bright hairline just inside the edge, brighter along the top
  float rim = (1.0 - smoothstep(0.0, w * 2.5, abs(d + 0.006))) * (0.5 + 0.5 * smoothstep(-0.5, 0.5, p.y));
  // the photograph is set back behind the glass with a faint inner shadow and a sheen
  float inner = smoothstep(-0.08, 0.0, d);
  vec3 col = photo * (1.0 - inner * 0.35);
  col += vec3(1.0) * pow(max(0.0, 1.0 - length(p - vec2(-uAspect * 0.3, 0.42)) * 1.6), 3.0) * 0.12;
  col += vec3(0.92, 0.94, 1.0) * rim * 0.9;
  float halo = exp(-max(d, 0.0) * 26.0) * (1.0 - inside) * uGlow;
  vec3 haloCol = mix(vec3(0.6, 0.5, 1.0), vec3(0.45, 0.95, 0.8), vUv.x);
  gl_FragColor = vec4(col * inside + haloCol * halo, (inside + halo * 0.6) * uFade);
  #include <colorspace_fragment>
}`;

function useMediaTexture(media: MediaItem | null): { texture: THREE.Texture | null; aspect: number } {
  const [state, setState] = useState<{ texture: THREE.Texture | null; aspect: number }>({ texture: null, aspect: 4 / 3 });
  useEffect(() => {
    if (!media) { setState({ texture: null, aspect: 4 / 3 }); return; }
    let disposed = false;
    let tex: THREE.Texture | null = null;
    let video: HTMLVideoElement | null = null;
    if (media.kind === 'video') {
      video = document.createElement('video');
      Object.assign(video, { src: media.url, muted: true, loop: true, playsInline: true, crossOrigin: 'anonymous' });
      video.play().catch(() => undefined);
      tex = new THREE.VideoTexture(video);
      tex.colorSpace = THREE.SRGBColorSpace;
      setState({ texture: tex, aspect: media.width / Math.max(1, media.height) || 16 / 9 });
    } else {
      new THREE.TextureLoader().load(media.url, (t) => {
        if (disposed) { t.dispose(); return; }
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 4;
        tex = t;
        const img = t.image as HTMLImageElement;
        setState({ texture: t, aspect: (img.naturalWidth || media.width) / Math.max(1, img.naturalHeight || media.height) });
      });
    }
    return () => { disposed = true; tex?.dispose(); if (video) { video.pause(); video.removeAttribute('src'); video.load(); } };
  }, [media]);
  return state;
}

const _ahead = new THREE.Vector3(0.7, 0.05, 0);

export function MediaCard() {
  const media = useGate((s) => s.media);
  const { texture, aspect } = useMediaTexture(media);
  const mesh = useRef<THREE.Mesh>(null);
  const pos = useRef(MEDIA_SPOT.clone().add(new THREE.Vector3(0, -0.4, 0)));
  const material = useMemo(() => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uMap: { value: null }, uFade: { value: 0 }, uAspect: { value: 4 / 3 }, uHasMap: { value: 0 }, uTime: { value: 0 }, uGlow: { value: 0.8 } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: FRAG,
  }), []);
  useEffect(() => {
    material.uniforms.uMap!.value = texture;
    material.uniforms.uHasMap!.value = texture ? 1 : 0;
    material.uniforms.uAspect!.value = aspect;
  }, [texture, aspect, material]);

  const target = useRef(new THREE.Vector3());
  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const s = useGate.getState();
    const showing = !!media && (s.stage === 'greeting' || s.stage === 'gathering' || s.stage === 'entering');
    const u = material.uniforms;
    u.uTime!.value += dt;
    const palace = s.world === 'palace';
    if (palace && s.stage === 'entering') {
      // In the palace the photo goes on ahead with the companion and fades as you cross the water.
      walkCompanion(s.enterProgress, target.current).add(_ahead);
      u.uFade!.value = media ? 1 - THREE.MathUtils.smoothstep(s.enterProgress, 0.12, 0.4) : 0;
    } else if (s.stage === 'entering') {
      const p = easeInOutCubic(s.enterProgress);
      target.current.copy(MEDIA_SPOT).lerp(COMPANION_SPOT.entering, p).setY(MEDIA_SPOT.y + p * 0.3);
      u.uFade!.value = media ? 1 - THREE.MathUtils.smoothstep(s.enterProgress, 0.55, 0.85) : 0;
    } else {
      target.current.copy(palace ? SPOT.media : MEDIA_SPOT);
      u.uFade!.value = damp(u.uFade!.value, showing ? 1 : 0, 2.2, dt);
    }
    if (pos.current.distanceTo(target.current) > 12) pos.current.copy(target.current);
    dampVec3(pos.current, target.current, s.stage === 'entering' ? 5 : 2.2, dt);
    const m = mesh.current;
    if (!m) return;
    const t = state.clock.elapsedTime;
    m.position.set(pos.current.x, pos.current.y + Math.sin(t * 0.9) * 0.012, pos.current.z);
    m.rotation.set(Math.sin(t * 0.4) * 0.02, -0.22 + Math.sin(t * 0.3) * 0.03, 0);
    const h = 0.78;
    m.scale.set(h * aspect, h, 1);
    m.visible = u.uFade!.value > 0.01;
  });

  return (
    <mesh ref={mesh} material={material} renderOrder={30}>
      <planeGeometry args={[1.12, 1.12]} />
    </mesh>
  );
}
