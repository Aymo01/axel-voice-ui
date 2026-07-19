import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import {
  ORB_VERTEX_SHADER,
  ORB_FRAGMENT_SHADER,
  PARTICLE_VERTEX_SHADER,
  PARTICLE_FRAGMENT_SHADER,
} from './orbShaders';

export type OrbState = 'idle' | 'listening' | 'talking' | 'processing';

interface StateParams {
  amplitude: number;
  frequency: number;
  speed: number;
  glow: number;
  rotationSpeed: number;
  scan: number;
  pulse: number;
}

const STATE_PARAMS: Record<OrbState, StateParams> = {
  idle: { amplitude: 0.1, frequency: 1.2, speed: 0.1, glow: 1.1, rotationSpeed: 0.05, scan: 0, pulse: 0.15 },
  listening: { amplitude: 0.18, frequency: 1.5, speed: 0.28, glow: 1.6, rotationSpeed: 0.11, scan: 0, pulse: 0.45 },
  talking: { amplitude: 0.34, frequency: 2.3, speed: 1.0, glow: 2.2, rotationSpeed: 0.16, scan: 0, pulse: 0.95 },
  processing: { amplitude: 0.1, frequency: 1.0, speed: 0.35, glow: 1.5, rotationSpeed: 0.42, scan: 1, pulse: 0.3 },
};

const LERP_RATE = 0.06;

function lerp(current: number, target: number, rate: number) {
  return current + (target - current) * rate;
}

interface OrbProps {
  state: OrbState;
  audioLevel: number;
}

function Orb({ state, audioLevel }: OrbProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  const geometry = useMemo(() => new THREE.IcosahedronGeometry(1.5, 4), []);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uAmplitude: { value: STATE_PARAMS.idle.amplitude },
      uFrequency: { value: STATE_PARAMS.idle.frequency },
      uSpeed: { value: STATE_PARAMS.idle.speed },
      uGlow: { value: STATE_PARAMS.idle.glow },
      uScan: { value: 0 },
      uColorA: { value: new THREE.Color('#22d3ee') },
      uColorB: { value: new THREE.Color('#a855f7') },
    }),
    [],
  );

  useFrame((_state, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    uniforms.uTime.value += delta;

    const target = STATE_PARAMS[state];
    const audioBoost = state === 'listening' ? audioLevel * 0.14 : 0;

    uniforms.uAmplitude.value = lerp(uniforms.uAmplitude.value, target.amplitude + audioBoost, LERP_RATE);
    uniforms.uFrequency.value = lerp(uniforms.uFrequency.value, target.frequency, LERP_RATE);
    uniforms.uSpeed.value = lerp(uniforms.uSpeed.value, target.speed, LERP_RATE);
    uniforms.uGlow.value = lerp(uniforms.uGlow.value, target.glow + audioBoost, LERP_RATE);
    uniforms.uScan.value = lerp(uniforms.uScan.value, target.scan, LERP_RATE);

    mesh.rotation.y += delta * target.rotationSpeed;
    mesh.rotation.x = Math.sin(uniforms.uTime.value * 0.08) * 0.18;
  });

  return (
    <mesh ref={meshRef} geometry={geometry}>
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={ORB_VERTEX_SHADER}
        fragmentShader={ORB_FRAGMENT_SHADER}
        wireframe
        transparent
        toneMapped={false}
      />
    </mesh>
  );
}

interface ParticleHaloProps {
  state: OrbState;
  audioLevel: number;
}

const PARTICLE_COUNT = 2200;

function ParticleHalo({ state, audioLevel }: ParticleHaloProps) {
  const pointsRef = useRef<THREE.Points>(null);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uPulse: { value: STATE_PARAMS.idle.pulse },
      uBaseSize: { value: 1.6 },
      uColor: { value: new THREE.Color('#a5f3fc') },
    }),
    [],
  );

  const [positions, phases] = useMemo(() => {
    const pos = new Float32Array(PARTICLE_COUNT * 3);
    const ph = new Float32Array(PARTICLE_COUNT);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const r = THREE.MathUtils.randFloat(2.0, 3.6);
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(THREE.MathUtils.randFloatSpread(2));
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);
      ph[i] = Math.random() * Math.PI * 2;
    }
    return [pos, ph];
  }, []);

  useFrame((_state, delta) => {
    const points = pointsRef.current;
    if (!points) return;

    uniforms.uTime.value += delta;
    const target = STATE_PARAMS[state];
    const audioBoost = state === 'listening' ? audioLevel * 0.5 : 0;
    uniforms.uPulse.value = lerp(uniforms.uPulse.value, target.pulse + audioBoost, LERP_RATE);

    const rotationSpeed = state === 'talking' ? 0.07 : state === 'listening' ? 0.045 : 0.018;
    points.rotation.y += delta * rotationSpeed;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-aPhase" args={[phases, 1]} />
      </bufferGeometry>
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={PARTICLE_VERTEX_SHADER}
        fragmentShader={PARTICLE_FRAGMENT_SHADER}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </points>
  );
}

interface OrbVisualizationProps {
  state: OrbState;
  audioLevel?: number;
}

export default function OrbVisualization({ state, audioLevel = 0 }: OrbVisualizationProps) {
  return (
    <div className="h-[340px] w-[340px] sm:h-[400px] sm:w-[400px] md:h-[460px] md:w-[460px]">
      <Canvas
        camera={{ position: [0, 0, 5.2], fov: 45 }}
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: true }}
      >
        <color attach="background" args={['#050510']} />
        <Orb state={state} audioLevel={audioLevel} />
        <ParticleHalo state={state} audioLevel={audioLevel} />
        <EffectComposer multisampling={0}>
          <Bloom intensity={1.3} luminanceThreshold={0.12} luminanceSmoothing={0.9} mipmapBlur radius={0.85} />
        </EffectComposer>
      </Canvas>
    </div>
  );
}
