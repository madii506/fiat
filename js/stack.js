/* FIAT hero: a live 3D money stack. Notes peel off the top and dissolve into amber pixels. */
import * as THREE from 'three';
import { RoomEnvironment } from '/vendor/RoomEnvironment.js';
import { noteCanvas, bandCanvas, edgeCanvas, rnd } from './tex.js';

const NL = 2.35, NW = 1.0, NT = 0.0062, SHEETS = 38, BH = SHEETS * NT;
const GX = 40, GY = 17, CELLS = GX * GY, LIFE = 7.5, FLY = 3;

export async function mount(stage) {
  const canvas = document.createElement('canvas');
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' }); }
  catch (e) { return false; }
  if (!renderer.getContext()) return false;
  try { await Promise.race([Promise.all(['800 40px Cinzel', '700 40px Cinzel', '500 40px JBM'].map(f => document.fonts.load(f))), new Promise(r => setTimeout(r, 1500))]); } catch (e) { }
  stage.prepend(canvas);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 0.92;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.32;

  // textures
  const tex = (c, srgb = true) => { const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); return t; };
  const noteT = tex(noteCanvas(0.62)), bandT = tex(bandCanvas()), edgeT = tex(edgeCanvas());
  const topMat = new THREE.MeshStandardMaterial({ map: noteT, roughness: 0.84 });
  const edgeMat = new THREE.MeshStandardMaterial({ map: edgeT, roughness: 0.92 });
  const bandTop = new THREE.MeshStandardMaterial({ map: bandT, roughness: 0.7 });
  const bandSide = new THREE.MeshStandardMaterial({ color: 0xe39a28, roughness: 0.7 });

  function brick() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(NL, BH, NW), [edgeMat, edgeMat, topMat, edgeMat, edgeMat, edgeMat]);
    body.position.y = BH / 2; body.castShadow = body.receiveShadow = true; g.add(body);
    for (let i = 0; i < 3; i++) { // a few loose sheets so the edges don't look machined
      const s = new THREE.Mesh(new THREE.BoxGeometry(NL, NT, NW), [edgeMat, edgeMat, topMat, edgeMat, edgeMat, edgeMat]);
      s.position.set((rnd() - 0.5) * 0.03, BH * (0.2 + i * 0.3), (rnd() - 0.5) * 0.02); s.rotation.y = (rnd() - 0.5) * 0.025; s.castShadow = true; g.add(s);
    }
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.44, BH + 0.006, NW + 0.02), [bandSide, bandSide, bandTop, bandSide, bandSide, bandSide]);
    band.position.y = (BH + 0.006) / 2; band.castShadow = band.receiveShadow = true; g.add(band);
    return g;
  }
  const root = new THREE.Group(); scene.add(root);
  const layout = [[0, 0, 0, 0.40], [0.07, BH, 0.02, 0.31], [-0.04, 2 * BH, -0.03, 0.47], [1.6, 0, -1.5, -0.25], [1.62, BH, -1.47, -0.18], [-1.2, 0, -2.3, 0.12]];
  for (const [x, y, z, ry] of layout) { const b = brick(); b.position.set(x, y, z); b.rotation.y = ry; root.add(b); }
  const topY = 3 * BH;

  // ground + lights
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.55 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  scene.add(new THREE.HemisphereLight(0xfff1dc, 0x0d1014, 0.28));
  const key = new THREE.DirectionalLight(0xffe4bd, 2.4); key.position.set(-3.5, 6, 3); key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024); Object.assign(key.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 0.5, far: 30 }); key.shadow.radius = 4; key.shadow.bias = -0.0005; key.shadow.normalBias = 0.012;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xc4d4ff, 1.7); rim.position.set(4, 2.5, -4); scene.add(rim);
  const warm = new THREE.PointLight(0xffa83a, 6, 9, 1.6); warm.position.set(0.6, 1.5, -2.2); scene.add(warm);

  // flying notes: each note is a grid of cells that can detach and fly off as pixels
  const cellGeo = new THREE.PlaneGeometry(NL / GX * 1.003, NW / GY * 1.003); cellGeo.rotateX(-Math.PI / 2);
  const iUv = new Float32Array(CELLS * 2);
  for (let j = 0; j < GY; j++) for (let i = 0; i < GX; i++) { const k = j * GX + i; iUv[k * 2] = i / GX; iUv[k * 2 + 1] = 1 - (j + 1) / GY; }
  cellGeo.setAttribute('iUv', new THREE.InstancedBufferAttribute(iUv, 2));
  const cellMat = new THREE.MeshStandardMaterial({ map: noteT, side: THREE.DoubleSide, roughness: 0.82 });
  cellMat.onBeforeCompile = sh => {
    sh.uniforms.uCell = { value: new THREE.Vector2(1 / GX, 1 / GY) };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 iUv;\nattribute float iGlow;\nvarying float vGlow;\nuniform vec2 uCell;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = uv * uCell + iUv;\n#endif\nvGlow = iGlow;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vGlow;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.68, 0.18), vGlow * 0.9);\ntotalEmissiveRadiance += vec3(1.0, 0.55, 0.08) * vGlow * 2.2;');
  };
  const cellInfo = [];
  for (let j = 0; j < GY; j++) for (let i = 0; i < GX; i++) {
    const fx = i / (GX - 1), fy = j / (GY - 1);
    const th = Math.min(0.98, Math.max(0.02, (1 - fx) * 0.62 + fy * 0.38 + (rnd() - 0.5) * 0.22));
    cellInfo.push({ lx: -NL / 2 + (i + 0.5) * NL / GX, lz: -NW / 2 + (j + 0.5) * NW / GY, th,
      v: new THREE.Vector3(0.55 + rnd() * 0.7, 0.3 + rnd() * 0.65, -0.25 + rnd() * 0.4), spin: new THREE.Vector3(rnd() * 6 - 3, rnd() * 6 - 3, rnd() * 6 - 3), amber: rnd() < 0.62 });
  }
  const fly = [];
  for (let n = 0; n < FLY; n++) {
    const m = new THREE.InstancedMesh(cellGeo.clone(), cellMat, CELLS);
    m.geometry.setAttribute('iGlow', new THREE.InstancedBufferAttribute(new Float32Array(CELLS), 1).setUsage(THREE.DynamicDrawUsage));
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.castShadow = true; m.frustumCulled = false;
    scene.add(m); fly.push({ m, off: n / FLY });
  }
  const S0 = new THREE.Vector3(0.0, topY + 0.004, -0.02), C0 = new THREE.Vector3(0.75, topY + 1.15, -0.1), E0 = new THREE.Vector3(3.3, topY + 1.65, -1.0);
  const bez = (t, out) => out.set(0, 0, 0).addScaledVector(S0, (1 - t) * (1 - t)).addScaledVector(C0, 2 * (1 - t) * t).addScaledVector(E0, t * t);
  const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const P = new THREE.Vector3(), Q = new THREE.Quaternion(), E = new THREE.Euler(), M = new THREE.Matrix4(), SC = new THREE.Vector3(), L = new THREE.Vector3(), NQ = new THREE.Quaternion(), NE = new THREE.Euler();
  function updateNote(f, time) {
    const u = ((time / LIFE) + f.off) % 1;
    const lift = smooth(0.0, 0.16, u), t = smooth(0.06, 1.0, u) ;
    bez(t, P); P.y += lift * 0.05;
    NE.set(0.1 * lift + 0.35 * t, 0.47 - 0.25 * t, -0.08 * lift - 0.3 * t); NQ.setFromEuler(NE);
    const dis = smooth(0.12, 0.92, u) * 1.25, fade = 1 - smooth(0.9, 1.0, u);
    const glow = f.m.geometry.attributes.iGlow.array;
    for (let k = 0; k < CELLS; k++) {
      const c = cellInfo[k];
      const bend = 0.04 * Math.sin(Math.PI * (c.lx / NL + 0.5)) * lift + 0.12 * t * (c.lx / NL + 0.5) * (c.lz / NW + 0.5);
      L.set(c.lx, bend, c.lz).applyQuaternion(NQ).add(P);
      const a = Math.max(0, dis - c.th) * LIFE / 1.25; // seconds since this cell broke off
      if (a > 0) {
        L.addScaledVector(c.v, a * 0.42 + a * a * 0.05);
        E.set(c.spin.x * a, c.spin.y * a, c.spin.z * a); Q.setFromEuler(E).premultiply(NQ);
        const s = Math.max(0, 1 - a * 0.36) * fade; SC.set(s, 1, s);
        glow[k] = c.amber ? Math.min(1, a * 1.4) : 0;
      } else { Q.copy(NQ); SC.set(fade, 1, fade); glow[k] = 0; }
      M.compose(L, Q, SC); f.m.setMatrixAt(k, M);
    }
    f.m.instanceMatrix.needsUpdate = true; f.m.geometry.attributes.iGlow.needsUpdate = true;
  }

  // camera, resize, parallax
  const cam = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
  const base = new THREE.Vector3(0.6, 2.95, 7.2), target = new THREE.Vector3(0.95, 0.72, -0.35);
  let W = 0, H = 0, mx = 0, my = 0, px = 0, py = 0;
  function resize() {
    const r = stage.getBoundingClientRect(); W = Math.max(1, r.width); H = Math.max(1, r.height);
    renderer.setSize(W, H, false); cam.aspect = W / H;
    const wide = W > 760 && W / H > 1.1;
    if (wide) { cam.fov = 25; base.set(0.7, 3.15, 9.4); cam.setViewOffset(W, H, -W * 0.13, H * 0.03, W, H); } // keep the headline's side clear
    else { cam.fov = W / H < 1 ? 40 : 31; base.set(1.0, 3.5, 10.2); cam.clearViewOffset(); }
    cam.updateProjectionMatrix();
  }
  resize(); new ResizeObserver(resize).observe(stage);
  window.addEventListener('pointermove', e => { mx = e.clientX / innerWidth - 0.5; my = e.clientY / innerHeight - 0.5; }, { passive: true });

  let visible = true, last = performance.now(), clock = 0; const perf = { n: 0, sum: 0, low: false };
  new IntersectionObserver(es => { visible = es[0].isIntersecting; }).observe(stage);
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!visible || document.hidden) return;
    clock += dt;
    // slow device? drop resolution and shadows once instead of stuttering
    perf.n++; perf.sum += dt;
    if (!perf.low && perf.n >= 90) { if (perf.sum / perf.n > 0.035) { perf.low = true; renderer.setPixelRatio(1); key.castShadow = false; resize(); } perf.n = 0; perf.sum = 0; }
    px += (mx - px) * 0.04; py += (my - py) * 0.04;
    cam.position.set(base.x + px * 0.6 + Math.sin(clock * 0.25) * 0.12, base.y - py * 0.35, base.z); cam.lookAt(target);
    root.rotation.y = Math.sin(clock * 0.18) * 0.04;
    for (const f of fly) updateNote(f, clock);
    renderer.render(scene, cam);
  }
  requestAnimationFrame(frame);
  stage.classList.add('live');
  return true;
}
