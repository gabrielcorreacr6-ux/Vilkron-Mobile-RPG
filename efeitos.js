/* ============================================================
   EFEITOS — visual "de jogo profissional" feito na placa de vídeo
   - Brilho na tela (bloom), com opção de qualidade alta/baixa
   - Materiais com shader: bola de energia, fogo, onda de choque,
     chão em chamas/brilhando, escudo com hexágonos, rastro da espada
   Depende de: three.js r128 (+ EffectComposer/UnrealBloomPass, se carregados)
   Tudo aqui tem plano B: se algo faltar, o jogo usa o visual simples.
   ============================================================ */
(function (global) {
  'use strict';
  const THREE = global.THREE;
  const Efeitos = global.Efeitos = {};
  const tempo = { value: 0 };          // relógio compartilhado por todos os shaders
  Efeitos.tempo = tempo;
  Efeitos.atualizar = dt => { tempo.value += dt; };

  /* ---------------- QUALIDADE ---------------- */
  const CHAVE = 'vilkron_graficos';
  Efeitos.qualidade = (() => { try { return global.localStorage.getItem(CHAVE) || 'alta'; } catch (e) { return 'alta'; } })();
  Efeitos.definirQualidade = q => { Efeitos.qualidade = q; try { global.localStorage.setItem(CHAVE, q); } catch (e) {} };

  /* ---------------- RUÍDO (GLSL) ---------------- */
  const RUIDO = `
    float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    float ruido(vec2 p) {
      vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
    }
    float fbm(vec2 p) {
      float v = 0.0, a = 0.5;
      for (int i = 0; i < 5; i++) { v += a * ruido(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
      return v;
    }`;
  const VERT_UV = `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
  const VERT_MUNDO = `
    varying vec2 vUv; varying vec3 vMundo;
    void main() { vUv = uv; vec4 m = modelMatrix * vec4(position, 1.0); vMundo = m.xyz; gl_Position = projectionMatrix * viewMatrix * m; }`;

  // ---- bola de energia: núcleo branco, halo colorido, redemoinho
  const FRAG_ORBE = RUIDO + `
    uniform vec3 cor; uniform float t; uniform float semente;
    varying vec2 vUv;
    void main() {
      vec2 c = vUv * 2.0 - 1.0; float d = length(c);
      float s = sin(t * 4.0 + semente), co = cos(t * 4.0 + semente);
      vec2 rc = mat2(co, -s, s, co) * c;            // gira sem emenda
      float gira = fbm(rc * 2.6 + vec2(semente, -t * 3.0));
      float nucleo = smoothstep(0.34, 0.0, d);
      float halo = exp(-d * d * 5.0);
      float anel = smoothstep(0.75, 0.3, d) * smoothstep(0.1, 0.4, d) * gira;
      float pulso = 0.85 + 0.15 * sin(t * 18.0 + semente);
      vec3 col = cor * (halo * 0.9 + anel * 1.3) * pulso + vec3(1.0) * nucleo * 1.2;
      float a = clamp(nucleo + halo * 0.8 + anel, 0.0, 1.0) * (1.0 - smoothstep(0.8, 1.0, d));
      gl_FragColor = vec4(col * a, 1.0);
    }`;

  // ---- fogo: labareda que ondula e sobe (quadro em pé)
  const FRAG_FOGO = RUIDO + `
    uniform vec3 cor; uniform float t; uniform float semente; uniform float forca;
    varying vec2 vUv;
    void main() {
      vec2 p = vec2(vUv.x * 2.0 - 1.0, vUv.y);
      float n = fbm(vec2(p.x * 2.2 + semente, p.y * 2.0 - t * 2.4));
      float n2 = fbm(vec2(p.x * 5.0 - semente, p.y * 4.5 - t * 4.0));
      // corpo em gota: largo embaixo, línguas finas em cima, balançando
      float y = p.y;
      float largura = 0.62 * (1.0 - y) * smoothstep(0.0, 0.25, y + 0.05) + 0.04;
      float x = p.x + (n - 0.5) * 0.7 * y;
      float corpo = largura - abs(x);
      float chama = smoothstep(-0.05, 0.22, corpo + (n2 - 0.5) * 0.45 * (0.3 + y));
      chama *= smoothstep(1.0, 0.45, y + (n - 0.5) * 0.45);
      chama *= smoothstep(0.0, 0.18, y);                          // base macia
      float nucleo = smoothstep(0.18, 0.45, corpo) * smoothstep(0.55, 0.05, y);
      vec3 col = mix(cor * 0.45, cor * 1.15, smoothstep(0.0, 0.8, chama)) + vec3(1.0, 0.92, 0.8) * nucleo * 0.55;
      gl_FragColor = vec4(col * chama * forca, 1.0);
    }`;

  // ---- onda de choque: anel macio e quebrado por ruído
  const FRAG_ANEL = RUIDO + `
    uniform vec3 cor; uniform float t; uniform float progresso; uniform float semente;
    varying vec2 vUv;
    void main() {
      vec2 c = vUv * 2.0 - 1.0; float d = length(c);
      float r = 0.55 + progresso * 0.38, w = mix(0.18, 0.05, progresso);
      vec2 dirc = c / max(d, 0.001);
      float quebra = 0.55 + 0.7 * fbm(dirc * 2.5 + vec2(semente, d * 5.0 - t * 3.0));
      float anel = exp(-pow((d - r) / w, 2.0)) * quebra;
      float dentro = smoothstep(r, 0.0, d) * 0.22 * (1.0 - progresso);
      float a = (anel + dentro) * (1.0 - progresso) * (1.0 - smoothstep(0.95, 1.0, d));
      gl_FragColor = vec4((cor * 1.2 + vec3(0.25) * anel) * a, 1.0);
    }`;

  // ---- chão brilhando/queimando (círculos, triângulos): ruído no espaço do mundo
  const FRAG_CHAO = RUIDO + `
    uniform vec3 cor; uniform float t; uniform float intensidade; uniform float circular;
    varying vec2 vUv; varying vec3 vMundo;
    void main() {
      vec2 q = vMundo.xz * 0.9;
      float n = fbm(q + vec2(t * 0.35, -t * 0.6));
      float r = fbm(q * 1.3 - vec2(t * 0.25, t * 0.15));
      float veias = 1.0 - smoothstep(0.0, 0.045, abs(r - 0.5));     // linhas finas como lava
      n = n * n;
      float borda = 1.0;
      if (circular > 0.5) { float d = length(vUv * 2.0 - 1.0); borda = smoothstep(1.0, 0.75, d) + smoothstep(0.98, 0.9, d) * 0.6 * (1.0 - smoothstep(0.9, 0.8, d)); }
      float brilho = (0.12 + 0.9 * n + veias * 0.8) * borda * intensidade;
      gl_FragColor = vec4(cor * brilho + vec3(1.0) * veias * 0.25 * borda * intensidade, 1.0);
    }`;

  // ---- escudo: bolha com reflexo na borda e hexágonos
  const VERT_ESCUDO = `
    varying vec3 vN; varying vec3 vVista; varying vec2 vUv;
    void main() {
      vUv = uv; vec4 m = modelMatrix * vec4(position, 1.0);
      vN = normalize(mat3(modelMatrix) * normal); vVista = normalize(cameraPosition - m.xyz);
      gl_Position = projectionMatrix * viewMatrix * m;
    }`;
  const FRAG_ESCUDO = `
    uniform vec3 cor; uniform float t; uniform float vida;
    varying vec3 vN; varying vec3 vVista; varying vec2 vUv;
    float hexDist(vec2 p) { p = abs(p); return max(dot(p, normalize(vec2(1.0, 1.73))), p.x); }
    void main() {
      float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vVista))), 2.2);
      vec2 g = vUv * vec2(18.0, 9.0); vec2 r = vec2(1.0, 1.73); vec2 h = r * 0.5;
      vec2 a = mod(g, r) - h, b = mod(g - h, r) - h; vec2 cel = dot(a, a) < dot(b, b) ? a : b;
      float hex = smoothstep(0.42, 0.5, hexDist(cel));
      float onda = 0.5 + 0.5 * sin(vUv.y * 20.0 - t * 4.0);
      float al = (fres * 1.1 + hex * 0.35 * (0.4 + 0.6 * onda) + 0.06) * vida;
      gl_FragColor = vec4(cor * al, 1.0);
    }`;

  // ---- rastro da espada: some ao longo do tempo e da largura
  const VERT_RASTRO = `
    attribute float idade; attribute float lado;
    varying float vIdade; varying float vLado;
    void main() { vIdade = idade; vLado = lado; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
  const FRAG_RASTRO = `
    uniform vec3 cor; uniform float forca;
    varying float vIdade; varying float vLado;
    void main() {
      float a = pow(1.0 - vIdade, 1.6) * smoothstep(0.0, 0.35, vLado) * forca;
      vec3 col = mix(cor, vec3(1.0), smoothstep(0.6, 1.0, vLado) * (1.0 - vIdade));
      gl_FragColor = vec4(col * a, 1.0);
    }`;
  Efeitos.SHADERS = { RUIDO, VERT_UV, VERT_MUNDO, FRAG_ORBE, FRAG_FOGO, FRAG_ANEL, FRAG_CHAO, VERT_ESCUDO, FRAG_ESCUDO, VERT_RASTRO, FRAG_RASTRO };

  const pronto = () => !!(THREE && THREE.ShaderMaterial);
  function mat(vert, frag, unif) {
    return new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: frag,
      uniforms: Object.assign({ t: tempo }, unif),
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide
    });
  }
  const corU = c => ({ value: new THREE.Color(c) });

  Efeitos.orbe = cor => pronto() ? mat(VERT_UV, FRAG_ORBE, { cor: corU(cor), semente: { value: Math.random() * 10 } }) : null;
  Efeitos.fogo = (cor, forca) => pronto() ? mat(VERT_UV, FRAG_FOGO, { cor: corU(cor), semente: { value: Math.random() * 10 }, forca: { value: forca || 1 } }) : null;
  Efeitos.anel = cor => pronto() ? mat(VERT_UV, FRAG_ANEL, { cor: corU(cor), progresso: { value: 0 }, semente: { value: Math.random() * 10 } }) : null;
  Efeitos.chao = (cor, circular) => pronto() ? mat(VERT_MUNDO, FRAG_CHAO, { cor: corU(cor), intensidade: { value: 1 }, circular: { value: circular ? 1 : 0 } }) : null;
  Efeitos.escudo = cor => {
    if (!pronto()) return null;
    const m = mat(VERT_ESCUDO, FRAG_ESCUDO, { cor: corU(cor), vida: { value: 1 } });
    m.side = THREE.FrontSide; return m;
  };

  /* ---------------- RACHADURAS NO CHÃO (textura desenhada) ---------------- */
  let texRach = null;
  Efeitos.rachaduras = () => {
    if (texRach || !global.document) return texRach;
    const c = global.document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    const galho = (x, y, ang, comp, larg, nivel) => {
      if (nivel > 3 || comp < 6) return;
      let px = x, py = y;
      const passos = 6;
      for (let i = 0; i < passos; i++) {
        const nx = px + Math.cos(ang) * comp / passos, ny = py + Math.sin(ang) * comp / passos;
        g.strokeStyle = 'rgba(20,14,10,0.95)'; g.lineWidth = larg * (1 - i / passos * 0.6);
        g.beginPath(); g.moveTo(px, py); g.lineTo(nx, ny); g.stroke();
        g.strokeStyle = 'rgba(255,190,120,0.35)'; g.lineWidth = Math.max(1, larg * 0.35);
        g.beginPath(); g.moveTo(px + 1, py + 1); g.lineTo(nx + 1, ny + 1); g.stroke();
        px = nx; py = ny; ang += (Math.random() - 0.5) * 0.6;
        if (Math.random() < 0.25) galho(px, py, ang + (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.6), comp * 0.5, larg * 0.6, nivel + 1);
      }
    };
    g.lineCap = 'round';
    for (let i = 0; i < 9; i++) galho(128, 128, i / 9 * Math.PI * 2 + Math.random() * 0.4, 70 + Math.random() * 45, 6, 0);
    const grad = g.createRadialGradient(128, 128, 0, 128, 128, 40);
    grad.addColorStop(0, 'rgba(30,20,12,0.8)'); grad.addColorStop(1, 'rgba(30,20,12,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
    texRach = new THREE.CanvasTexture(c); texRach.encoding = THREE.sRGBEncoding;
    return texRach;
  };

  /* ---------------- RASTRO DA ESPADA ---------------- */
  // Guarda as últimas posições da base e da ponta da lâmina e desenha uma fita entre elas
  class Rastro {
    constructor(cor, amostras) {
      this.n = amostras || 14;
      const n = this.n;
      this.pos = new Float32Array(n * 2 * 3);
      const idade = new Float32Array(n * 2), lado = new Float32Array(n * 2), idx = [];
      for (let i = 0; i < n; i++) { idade[i * 2] = idade[i * 2 + 1] = i / (n - 1); lado[i * 2] = 0; lado[i * 2 + 1] = 1; }
      for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      this.geo = new THREE.BufferGeometry();
      this.geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
      this.geo.setAttribute('idade', new THREE.Float32BufferAttribute(idade, 1));
      this.geo.setAttribute('lado', new THREE.Float32BufferAttribute(lado, 1));
      if (this.geo.setIndex) this.geo.setIndex(idx);
      this.mat = mat(VERT_RASTRO, FRAG_RASTRO, { cor: corU(cor), forca: { value: 0 } });
      this.mesh = new THREE.Mesh(this.geo, this.mat);
      this.mesh.frustumCulled = false; this.mesh.renderOrder = 9;
      this.cheio = false;
    }
    // ativo: está golpeando agora; base/ponta: posições da lâmina no mundo
    passo(ativo, base, ponta, dt) {
      const p = this.pos, n = this.n;
      if (!this.cheio && base) { for (let i = 0; i < n; i++) { p.set([base.x, base.y, base.z, ponta.x, ponta.y, ponta.z], i * 6); } this.cheio = true; }
      p.copyWithin(6, 0, (n - 1) * 6);                       // empurra as antigas para trás
      if (base) p.set([base.x, base.y, base.z, ponta.x, ponta.y, ponta.z], 0);
      const f = this.mat.uniforms.forca;
      f.value = ativo ? Math.min(1, f.value + dt * 12) : Math.max(0, f.value - dt * 5);
      this.mesh.visible = f.value > 0.01;
      this.geo.attributes.position.needsUpdate = true;
    }
  }
  Efeitos.Rastro = Rastro;

  /* ---------------- BRILHO NA TELA (BLOOM) ---------------- */
  // Só o que é bem claro brilha (efeitos), o chão e o céu não.
  Efeitos.iniciarPos = function (renderer, cena, camera, w, h) {
    if (Efeitos.qualidade !== 'alta' || !THREE.EffectComposer || !THREE.UnrealBloomPass || !THREE.RenderPass) return null;
    try {
      const comp = new THREE.EffectComposer(renderer);
      if (comp.setPixelRatio) comp.setPixelRatio(Math.min(1.5, renderer.getPixelRatio ? renderer.getPixelRatio() : 1));
      comp.addPass(new THREE.RenderPass(cena, camera));
      const bloom = new THREE.UnrealBloomPass(new THREE.Vector2(w / 2, h / 2), 0.85, 0.45, 0.82);
      comp.addPass(bloom);
      if (THREE.ShaderPass && THREE.GammaCorrectionShader) comp.addPass(new THREE.ShaderPass(THREE.GammaCorrectionShader));
      comp.bloom = bloom;
      return comp;
    } catch (e) { console.warn('bloom desligado', e); return null; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
