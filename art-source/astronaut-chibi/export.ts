import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { createChibiAstronaut } from '@/ChibiAstronaut';
import { createChibiClips } from '@/chibiAnimations';

const astro = createChibiAstronaut({ facing: 1, outline: false });
const { root } = astro;
const clips = createChibiClips(astro);
const cache = new Map<string, THREE.MeshStandardMaterial>();
root.traverse((o) => {
  const m = o as THREE.Mesh;
  if (!m.isMesh) return;
  const old = m.material as THREE.MeshToonMaterial;
  const glow = old.emissive && old.emissiveIntensity > 0 && old.emissive.getHex() !== 0;
  const key = old.color.getHexString() + (old.transparent ? 't' : '') + (glow ? 'g' : '') + (old.side === THREE.BackSide ? 'b' : '');
  if (!cache.has(key)) cache.set(key, new THREE.MeshStandardMaterial({
    color: old.color, roughness: 1, metalness: 0, transparent: old.transparent, opacity: old.opacity, name: 'c' + key,
    emissive: glow ? old.emissive : new THREE.Color(0), emissiveIntensity: glow ? old.emissiveIntensity : 1,
    side: old.side === THREE.BackSide ? THREE.DoubleSide : old.side, depthWrite: old.depthWrite,
  }));
  m.material = cache.get(key)!;
  m.castShadow = true; m.receiveShadow = true;
});
new GLTFExporter().parse(root, (res) => {
  const bytes = new Uint8Array(res as ArrayBuffer);
  let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  (window as any).glb = btoa(bin); (window as any).done = true;
}, (e) => { console.log('export error', e); }, { binary: true, animations: [clips.walk, clips.jump, clips.interact] });
