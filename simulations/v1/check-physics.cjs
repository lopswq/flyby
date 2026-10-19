'use strict';
// HTML에 포함된 실제 물리 코드를 검증함. 별도의 복제 모델은 사용하지 않음.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync(path.join(__dirname, 'flyby.html'), 'utf8');
const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
for (const [, attributes, source] of scripts) new vm.Script(source, { filename: attributes });
const source = scripts.find(([ , attributes]) => attributes.includes('id="physics"'))?.[2];
assert.ok(source, '물리 코드 존재');
const context = vm.createContext({});
vm.runInContext(`${source}\nthis.physics = FlybyPhysics;`, context);
const P = context.physics;
const initial = P.initial();
const first = P.measure(initial);
const reference = P.reference();
const last = reference.states.at(-1);
const final = P.measure(last);
let maxEnergyError = 0;
let maxAngularError = 0;
for (const state of reference.states) {
  for (const value of Object.values(state)) assert.ok(Number.isFinite(value), '유한 상태값');
  const m = P.measure(state);
  assert.ok(m.distance > P.C.radius, '행성 표면 충돌 없음');
  assert.ok(Math.abs(state.py - P.C.planetY - P.C.planetVy * state.t) < 1e-7, '일정한 행성 속도');
  maxEnergyError = Math.max(maxEnergyError, Math.abs((m.energy - first.energy) / first.energy));
  maxAngularError = Math.max(maxAngularError, Math.abs((m.angular - first.angular) / first.angular));
}
assert.ok(maxEnergyError < 1e-5, '행성 기준 비에너지 상대 오차 < 0.001%');
assert.ok(maxAngularError < 1e-9, '행성 기준 비각운동량 보존');
assert.ok(final.solar > first.solar + 5, '태양 기준 속력 증가 > 5 km/s');
assert.ok(Math.abs(final.relative - first.relative) < 0.005, '행성 기준 전후 속력 오차 < 0.005 km/s');
assert.ok(Math.abs(final.distance - first.distance) < final.relative * P.C.dt * 1.01, '동일 거리 이탈 판정 오차는 한 스텝 이내');
assert.ok(P.finished(last), '최종 이탈 판정');
assert.ok(!P.finished(initial), '초기 상태는 이탈 완료 아님');
assert.ok(reference.closest > P.C.radius * 2, '최근접 거리는 반지름의 2배 초과');
const middle = P.interpolate(initial, P.step(initial), 0.5);
assert.equal(middle.t, P.C.dt / 2, '렌더링 시간 보간');
assert.equal(initial.t, 0, '원본 상태를 보간이 변경하지 않음');
// 프레임률과 배율은 적분 간격을 바꾸지 않아 같은 이탈 결과를 내야 함.
for (const [fps, rate] of [[30, 0.5], [60, 1], [144, 2]]) {
  let state = P.initial();
  let accumulator = 0;
  let count = 0;
  while (!P.finished(state)) {
    accumulator += P.C.secondsPerSecond * rate / fps;
    while (accumulator >= P.C.dt && !P.finished(state)) {
      state = P.step(state);
      accumulator -= P.C.dt;
    }
    assert.ok(++count < 100000, '재생 시간 제한');
  }
  assert.equal(state.x, last.x, `${fps} FPS / ${rate}× 동일 위치`);
  assert.equal(state.vy, last.vy, `${fps} FPS / ${rate}× 동일 속도`);
}
console.log(JSON.stringify({
  result: 'PASS',
  solarBeforeKms: first.solar,
  solarAfterKms: final.solar,
  gainKms: final.solar - first.solar,
  relativeBeforeKms: first.relative,
  relativeAfterKms: final.relative,
  closestCenterKm: reference.closest,
  closestAltitudeKm: reference.closest - P.C.radius,
  maxRelativeEnergyError: maxEnergyError,
  maxRelativeAngularError: maxAngularError,
  simulatedHours: reference.duration / 3600,
  playbackSeconds: reference.duration / P.C.secondsPerSecond,
  frameRateChecks: '30 FPS / 0.5×, 60 FPS / 1×, 144 FPS / 2×'
}, null, 2));
