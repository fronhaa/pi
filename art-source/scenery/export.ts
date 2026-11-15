import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { createMarsStation } from '@/models/MarsStation';
import { createSolarPanels } from '@/models/SolarPanels';
import { createRover } from '@/models/Rover';
import { createRocks } from '@/models/Rocks';
import { createResearchBase } from '@/models/ResearchBase';
import { createGreenhouseBase } from '@/models/GreenhouseBase';
import { createCommBase } from '@/models/CommBase';
import { createSolarPower } from '@/models/SolarPower';
import { createDormitory } from '@/models/Dormitory';
import { createRefectory } from '@/models/Refectory';
import { createGym } from '@/models/Gym';

const models = { 'mars-station': createMarsStation(), 'solar-panels': createSolarPanels(), rover: createRover(), 'mars-rocks': createRocks(), 'research-base': createResearchBase(), 'greenhouse-base': createGreenhouseBase(), 'comm-base': createCommBase(), 'solar-panels-battery': createSolarPower(), dormitory: createDormitory(), refectory: createRefectory(), gym: createGym() };
(async () => {
  const out: Record<string, string> = {};
  for (const [name, m] of Object.entries(models)) {
    const res = (await new GLTFExporter().parseAsync(m.root, { binary: true, animations: m.clips })) as ArrayBuffer;
    const bytes = new Uint8Array(res);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    out[name] = btoa(bin);
  }
  (window as any).glbs = out;
  (window as any).done = true;
})().catch((e) => console.log('export error', e));
