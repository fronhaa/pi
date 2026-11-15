import { test } from 'node:test';
import assert from 'node:assert/strict';
import { heliocentric, moonAge, moonAngle, orbitPath } from '../../src/scene/solarSystem.ts';

// Posições do Sistema Solar na tela de escolha (src/scene/solarSystem.ts; JPL Tabela 1 e catálogo de fases da NASA/GSFC).

const dist = (p: { x: number; y: number }) => Math.hypot(p.x, p.y);
const lonDeg = (p: { x: number; y: number }) => ((Math.atan2(p.y, p.x) * 180) / Math.PI + 360) % 360;
const angDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

test('Terra a ~1 ua e Marte entre 1,38 e 1,67 ua do Sol', () => {
  for (const d of ['2026-01-01', '2026-11-15', '2027-06-01', '2049-12-31']) {
    const date = new Date(`${d}T00:00:00Z`);
    const e = dist(heliocentric('earth', date));
    const m = dist(heliocentric('mars', date));
    assert.ok(e > 0.98 && e < 1.02, `Terra ${d}: ${e}`);
    assert.ok(m > 1.38 && m < 1.67, `Marte ${d}: ${m}`);
  }
});

test('no equinócio de março o Sol está em longitude 0°, então a Terra está a 180°', () => {
  const earth = heliocentric('earth', new Date('2026-03-20T14:46:00Z'));
  assert.ok(angDiff(lonDeg(earth), 180) < 1, `${lonDeg(earth)}`);
});

test('oposição de Marte (16/01/2025): Terra e Marte do mesmo lado do Sol', () => {
  const date = new Date('2025-01-16T00:00:00Z');
  assert.ok(angDiff(lonDeg(heliocentric('earth', date)), lonDeg(heliocentric('mars', date))) < 2);
});

test('a órbita de Marte desenhada passa pela posição de hoje', () => {
  const date = new Date('2026-11-15T00:00:00Z');
  const now = heliocentric('mars', date);
  const closest = Math.min(...orbitPath('mars', date, 720).map((p) => Math.hypot(p.x - now.x, p.y - now.y)));
  assert.ok(closest < 0.01, `${closest}`);
});

test('Lua: na lua nova fica na direção do Sol; na cheia, do lado oposto', () => {
  const nova = new Date(Date.UTC(2026, 10, 9, 7, 2)); // lua nova de 09/11/2026 (catálogo da NASA/GSFC)
  assert.ok(moonAge(nova) < 0.6 || moonAge(nova) > 29, `idade ${moonAge(nova)}`);
  const earth = heliocentric('earth', nova);
  const sunDir = (Math.atan2(-earth.y, -earth.x) * 180) / Math.PI;
  assert.ok(angDiff((moonAngle(nova) * 180) / Math.PI, sunDir) < 8);
  const cheia = new Date(nova.getTime() + 14.77 * 86_400_000);
  const e2 = heliocentric('earth', cheia);
  const sun2 = (Math.atan2(-e2.y, -e2.x) * 180) / Math.PI;
  assert.ok(angDiff((moonAngle(cheia) * 180) / Math.PI, sun2 + 180) < 8);
});
