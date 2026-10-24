// PLACEHOLDER (replaced by the full Figure build): a smooth white capsule so the app composes while the figure is made.
import { useGate } from '../../state/store';

export function FigureCompanion({ visible = true }: { visible?: boolean; onLight?: number }) {
  const mood = useGate((s) => s.mood);
  return (
    <group visible={visible}>
      <mesh position={[0, 0.06, 0]}>
        <sphereGeometry args={[0.11, 48, 32]} />
        <meshPhysicalMaterial color="#f4f4f6" roughness={0.18} clearcoat={1} clearcoatRoughness={0.06} />
      </mesh>
      <mesh position={[0, -0.12, 0]}>
        <capsuleGeometry args={[0.07, 0.12, 12, 32]} />
        <meshPhysicalMaterial color="#f4f4f6" roughness={0.2} clearcoat={1} />
      </mesh>
      <mesh position={[0, 0.07, 0.09]}>
        <sphereGeometry args={[0.02, 16, 16]} />
        <meshBasicMaterial color={mood === 'listening' ? '#7fe8ff' : '#4fb7ff'} toneMapped={false} />
      </mesh>
    </group>
  );
}
