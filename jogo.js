/* ============================================================
   JOGO — motor do jogo 2.5D (mapa 2D, personagens 3D)
   Depende de: three.js r128, GLTFLoader, SkeletonUtils, skins.js, mapas.js
   Os números de equilíbrio ficam todos em CONFIG, no topo.
   ============================================================ */
(function (global) {
  'use strict';
  const THREE = global.THREE;
  const Skins = global.Skins;
  const MAPAS = global.MAPAS;
  const temDOM = typeof document !== 'undefined' && !global.JOGO_SEM_TELA;

  /* ======================= CONFIG ======================= */
  const CONFIG = {
    velHeroi: 5.2,
    lentidaoAgua: 0.6,             // na água todos andam a 60% (barco e serpente não)
    respawnMob: 180,               // 3 minutos
    respawnHeroi: 45,        // segundos para voltar depois de cair (fora da arena)
    // XP de cada estrela: no 1º elo, 50 × a estrela (1ª = 50, 2ª = 100 ... 50ª = 2500);
    // do 2º elo em diante, 1000 × (elo − 1) × a estrela (2º elo: 1000, 2000...; 3º elo: 2000, 4000...).
    // O último elo não tem limite de 50 estrelas.
    xpPrimeiroElo: 50, xpPorEloAcima: 1000,
    temporadaMeses: 2, temporadaVolta: 2,   // a cada 2 meses a temporada vira e todos voltam 2 elos
    // cor de cada elo (Beginner ... Immortal God) acima da barra de vida
    coresElo: ['#b9c0c4', '#7dd38a', '#5aa9ff', '#3ad6c4', '#b58cff', '#ff9d3c', '#ff5a5a', '#ff6fd0', '#ffd34d'],
    estrelasPorRank: 50,
    ranks: ['Beginner', 'Apprentice', 'Junior', 'Experienced', 'Epic', 'Legendary', 'Supremacy', 'Mythical', 'Immortal God'],
    porEstrela: { poder: 0.005, velAtaque: 0.002 },          // 0,5% de poder e 0,2% de vel. de ataque por estrela
    porEstrelaEpico: { critico: 0.001, rouboVida: 0.002 },   // do Epic para cima: 0,1% crítico e 0,2% roubo de vida
    vitoriasProtecao: 5,
    escalaMapa: { mapa1: 1, mapa2: 1.6, mapa3: 2.4, arenas: 2.4, ascensao: 3.5, repouso: 1 },
    raioZonaAeroporto: 10,
    raioMoita: 1.7,
    afundarAgua: 0.55,       // quanto o corpo afunda no rio/lago (metros, para um herói de 1,8 m)
    // efeitos dos mobs: lentidão de 10% e crítico de +10% (o documento dizia 0,1%, pequeno demais para sentir)
    mobs: {
      maestro:  { vida: 600, dano: 35, alcance: 8,  intervalo: 1.8, vel: 2.6, projetil: 'notas', xp: 40, ouro: 25 },
      veterano: { vida: 500, dano: 45, alcance: 10, intervalo: 2.0, vel: 2.4, projetil: 'bala', slow: [0.10, 1.0], xp: 45, ouro: 30 },
      dragao:   { vida: 800, dano: 30, alcance: 7,  intervalo: 1.6, vel: 2.8, projetil: 'fogo', slow: [0.10, 1.0], verdadeiro: true, xp: 60, ouro: 40 },
      barao:    { vida: 700, dano: 30, alcance: 8,  intervalo: 1.5, vel: 2.4, projetil: 'moeda', criticoQuinto: 0.10, xp: 55, ouro: 60 },
      aranha:   { vida: 650, dano: 40, alcance: 7,  intervalo: 1.6, vel: 3.2, projetil: 'teia', stunTeia: 0.1, slowTeia: [0.3, 0.2], corpoACorpo: 1.8, xp: 50, ouro: 30 },
      golem:    { vida: 3000, dano: 80, alcance: 4, intervalo: 2.2, vel: 2.0, xp: 200, ouro: 150, pisao: 4, golpeAgua: 6, stunAgua: 0.2 },
      serpente: { vida: 2500, dano: 70, alcance: 3.5, intervalo: 1.6, vel: 7, xp: 300, ouro: 200 }
    },
    minions: {
      frente:     { vida: 300, dano: 15, alcance: 1.8, intervalo: 1.2, xp: 10, ouro: 8 },
      balistico:  { vida: 220, dano: 25, alcance: 8,   intervalo: 1.8, xp: 12, ouro: 10 },
      carregador: { vida: 400, dano: 0,  alcance: 0,   intervalo: 9,   xp: 15, ouro: 40 },
      vel: 2.6, perseguir: 2       // seguem só até 2 passos além do alcance
    },
    // Atirador de energia: habilidade 1 acelera os ataques; habilidade 2 faz as bolas explodirem
    atirador: { aceleracao: 0.6, aceleracaoDur: 5, explosaoDur: 6, explosaoRaio: 2.5, explosaoCritico: 0.05,
                saltos: 2, janelaSaltos: 15, distSalto: 8 },
    // Últimates (4º botão)
    ultimate: {
      soldado: { alcance: 10, largura: 1.7, dano: 2.0 },                       // explosão em linha (x dano)
      mago:    { comprimento: 10, base: 9, dano: 1.5, slow: 0.4, dur: 3 },     // triângulo de fogo roxo; dano real
      suporte: { raio: 8, stun: 4, antiCura: 0.5, antiCuraDur: 10, cura: 0.5 }
    },
    torre: { vida: 3000, dano: 120, alcance: 9, intervalo: 1.2, xp: 80, ouro: 60, golpesParaMinion: 3.5,
      // defesa da torre: cada jogador tira no máximo 10% da vida dela a cada 10 s (precisa de mais gente atacando junto)
      limitePorJogador: 0.10, janelaLimite: 10,
      // sem minions por perto, a torre mata o herói em 3 disparos: 20%, 60% e 120% da vida dele (ignora escudo e cura)
      sequencia: [0.2, 0.6, 1.2], esqueceSequencia: 4 },
    arena: { inscricao: 150, minionsCada: 30, respawnBase: 30, respawnPasso: 20, respawnMax: 120 },
    loja: {
      cura:   { nome: 'Frasco de cura', preco: 30, desc: 'Recupera toda a vida.' },
      vel:    { nome: 'Frasco de velocidade', preco: 40, desc: '+50% de velocidade por 4 s.' },
      invis:  { nome: 'Frasco de invisibilidade', preco: 60, desc: 'Invisível por 5 s.' },
      relogio:{ nome: 'Relógio que para o tempo', preco: 120, desc: 'Arremesse: paralisa tudo em volta por 5 s.' },
      cacador:{ nome: 'Frasco caçador experiente', preco: 80, desc: '+50% de dano em mobs por 60 s.' }
    }
  };

  // Classes: vida, dano, alcance, recargas [ataque, hab1, hab2]
  const CLASSES = {
    soldado:  { nome: 'Soldado',  vida: 1300, dano: 70, alcance: 2.8, cd: [0.9, 6, 9, 30],    habs: ['Giro', 'Investida', 'Terremoto'] },
    suporte:  { nome: 'Suporte',  vida: 950,  dano: 45, alcance: 11,  cd: [1.0, 8, 12, 40],   habs: ['Cura', 'Escudo', 'Selo'] },
    mago:     { nome: 'Mago',     vida: 850,  dano: 62, alcance: 9.5, cd: [1.0, 7, 12, 35],   habs: ['Chamas', 'Ilusão', 'Fogo Roxo'] },
    atirador: { nome: 'Atirador', vida: 900,  dano: 58, alcance: 12,  cd: [0.85, 12, 14, 20], habs: ['Aceleração', 'Explosão', 'Salto'] }
  };
  const CORES = ['#9aa3a8', '#c0392b', '#2e86de', '#27ae60', '#8e44ad', '#e67e22', '#f1c40f', '#ecf0f1'];

  // Ganchos para o modo online (rede.js e painel.js preenchem; offline ficam vazios)
  const G = {};
  const gancho = (nome, ...args) => (typeof G[nome] === 'function' ? G[nome](...args) : undefined);
  const PODERES = { imortal: false, invisivel: false, semVantagem: false };
  const remoto = e => e && e.tipo === 'remoto';
  // jogadores de outros celulares só levam dano do NOSSO herói (mobs e minions são de cada tela)
  const deMim = o => o && (o.tipo === 'heroi' || o.donoHeroi);

  /* ======================= UTIL ======================= */
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function semeado(s) { return () => (s = (s * 16807) % 2147483647) / 2147483647; }
  function distSeg(px, pz, ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz;
    const t = l ? clamp(((px - ax) * dx + (pz - az) * dz) / l, 0, 1) : 0;
    return Math.hypot(px - ax - t * dx, pz - az - t * dz);
  }
  function distLinha(x, z, pts) {
    let m = Infinity;
    for (let i = 0; i < pts.length - 1; i++) m = Math.min(m, distSeg(x, z, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]));
    return m;
  }
  function girarPara(atual, alvo, passo) {
    const d = Math.atan2(Math.sin(alvo - atual), Math.cos(alvo - atual));
    return atual + clamp(d, -passo, passo);
  }

  /* ======================= PERFIL SALVO ======================= */
  const CHAVE = 'jogo25d_perfil_v1';
  function perfilPadrao() {
    const c = {};
    Object.keys(CLASSES).forEach(k => { c[k] = { xp: 0, estrelas: 0, protecao: false, vitorias: 0 }; });
    return {
      nome: 'Jogador', clan: '', classe: null, genero: 'm', cor: '#9aa3a8', ouro: 120, ouroTotal: 0, danoTotal: 0,
      classes: c, passes: {}, mapa: 'mapa1', pontosRank: 0,
      inventario: { cura: 2, vel: 0, invis: 0, relogio: 0, cacador: 0 }
    };
  }
  let P = perfilPadrao();
  try {
    const s = JSON.parse(global.localStorage.getItem(CHAVE) || 'null');
    if (s) { P = Object.assign(perfilPadrao(), s); P.classes = Object.assign(perfilPadrao().classes, s.classes || {}); }
    P.viradaTemporada = aplicarTemporada(P);
  } catch (e) { /* sem armazenamento: começa do zero */ }
  let salvarT = null;
  function salvar() {
    clearTimeout(salvarT);
    salvarT = setTimeout(() => { try { global.localStorage.setItem(CHAVE, JSON.stringify(P)); } catch (e) {} gancho('salvou'); }, 600);
  }

  /* ======================= PROGRESSÃO ======================= */
  const C = () => P.classes[P.classe] || { xp: 0, estrelas: 0 };
  function rankInfo(estrelas) {
    const i = Math.min(CONFIG.ranks.length - 1, Math.floor(estrelas / CONFIG.estrelasPorRank));
    const dentro = i === CONFIG.ranks.length - 1 ? estrelas - i * CONFIG.estrelasPorRank : estrelas % CONFIG.estrelasPorRank;
    return { indice: i, nome: CONFIG.ranks[i], estrelas: dentro };
  }
  // XP que falta para a próxima estrela, dado quantas estrelas a classe já tem
  function xpProximaEstrela(estrelas) {
    const r = rankInfo(estrelas), n = r.estrelas + 1;
    return r.indice === 0 ? CONFIG.xpPrimeiroElo * n : CONFIG.xpPorEloAcima * r.indice * n;
  }
  function subirEstrelas(c) {
    let subiu = 0;
    while (c.xp >= xpProximaEstrela(c.estrelas)) { c.xp -= xpProximaEstrela(c.estrelas); c.estrelas++; subiu++; }
    return subiu;
  }
  // temporada: janeiro-fevereiro, março-abril... Na virada, cada classe volta 2 elos (mantém as estrelas de dentro do elo)
  function temporadaAtual(d) {
    d = d || new Date();
    return d.getFullYear() * Math.round(12 / CONFIG.temporadaMeses) + Math.floor(d.getMonth() / CONFIG.temporadaMeses);
  }
  function aplicarTemporada(perfil) {
    const atual = temporadaAtual();
    if (perfil.temporada === undefined || perfil.temporada === null) { perfil.temporada = atual; return false; }
    if (perfil.temporada >= atual) return false;
    const viradas = Math.min(5, atual - perfil.temporada);
    Object.keys(perfil.classes || {}).forEach(k => {
      const c = perfil.classes[k], r = rankInfo(c.estrelas || 0);
      const elo = Math.max(0, r.indice - CONFIG.temporadaVolta * viradas);
      if (elo === r.indice) return;
      c.estrelas = elo * CONFIG.estrelasPorRank + Math.min(r.estrelas, CONFIG.estrelasPorRank - 1);
      c.xp = 0;
    });
    perfil.temporada = atual;
    return true;
  }
  function bonus() {
    const n = C().estrelas, epico = Math.max(0, n - 4 * CONFIG.estrelasPorRank);
    return {
      poder: 1 + CONFIG.porEstrela.poder * n,
      velAtaque: 1 + CONFIG.porEstrela.velAtaque * n,
      critico: CONFIG.porEstrelaEpico.critico * epico,
      rouboVida: CONFIG.porEstrelaEpico.rouboVida * epico
    };
  }
  function ganhar(xp, ouro, motivo) {
    const c = C();
    if (!P.classe) return;
    c.xp += xp; P.ouro += ouro; P.ouroTotal += ouro;
    const subiu = subirEstrelas(c);
    c.vitorias++;
    if (!c.protecao && c.vitorias >= CONFIG.vitoriasProtecao) { c.protecao = true; c.vitorias = 0; aviso('Proteção de estrela ativada'); }
    if (motivo) aviso('+' + ouro + ' ouro · +' + xp + ' XP' + (subiu ? ' · +' + subiu + ' estrela' : ''));
    salvar(); hud();
  }
  function perderEstrela() {
    const c = C();
    if (c.protecao) { c.protecao = false; aviso('A proteção segurou sua estrela'); }
    else if (c.estrelas > 0) { c.estrelas--; aviso('Você perdeu 1 estrela'); }
    c.vitorias = 0; salvar(); hud();
  }

  /* ======================= CENA ======================= */
  const R = {};
  function iniciarCena(container) {
    R.renderer = new THREE.WebGLRenderer({ antialias: true });
    R.renderer.setPixelRatio(Math.min(2, global.devicePixelRatio || 1));
    R.renderer.outputEncoding = THREE.sRGBEncoding;
    R.Fx = global.Efeitos || null;          // shaders bonitos (efeitos.js); sem ele, visual simples
    if (container) container.appendChild(R.renderer.domElement);
    R.scene = new THREE.Scene();
    R.camera = new THREE.PerspectiveCamera(42, 1, 0.5, 260);
    R.hemi = new THREE.HemisphereLight(0xe8f4ff, 0x4d6b33, 0.85); R.scene.add(R.hemi);
    const sol = new THREE.DirectionalLight(0xfff0d6, 1.05); sol.position.set(10, 18, 8); R.scene.add(sol); R.sol = sol;
    // luzes dos vaga-lumes e da lanterna do herói (só acendem à noite)
    R.luzesVaga = [];
    if (THREE.PointLight) {
      for (let i = 0; i < 4; i++) { const l = new THREE.PointLight(0xd8ff7a, 0, 7, 2); R.scene.add(l); R.luzesVaga.push(l); }
      R.lanterna = new THREE.PointLight(0xffd9a0, 0, 13, 1.6); R.scene.add(R.lanterna);
    }
    // ambiente suave para metais não ficarem pretos
    try {
      const pm = new THREE.PMREMGenerator(R.renderer), env = new THREE.Scene();
      const geo = new THREE.SphereGeometry(10, 24, 12), cores = [], pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const c = new THREE.Color(0x6e8a4a).lerp(new THREE.Color(0xdff0ff), (pos.getY(i) / 10 + 1) / 2);
        cores.push(c.r, c.g, c.b);
      }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(cores, 3));
      env.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
      R.scene.environment = pm.fromScene(env, 0.04).texture;
    } catch (e) { /* sem ambiente: segue sem reflexo */ }
    R.texLoader = new THREE.TextureLoader();
    R.cacheSprite = {};
    // textura macia para poeira, respingos e brilhos
    R.texParticula = canvasTex(64, 64, g => {
      const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.45, 'rgba(255,255,255,0.55)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    });
    R.sombraTex = canvasTex(64, 64, g => {
      const r = g.createRadialGradient(32, 32, 2, 32, 32, 32);
      r.addColorStop(0, 'rgba(0,0,0,0.45)'); r.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = r; g.fillRect(0, 0, 64, 64);
    });
    R.brilhoTex = canvasTex(64, 64, g => {
      const r = g.createRadialGradient(32, 32, 2, 32, 32, 32);
      r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.4, 'rgba(255,255,255,0.6)'); r.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = r; g.fillRect(0, 0, 64, 64);
    });
    if (temDOM) setTimeout(() => ['notas', 'bala', 'fogo', 'moeda', 'teia', 'flecha'].forEach(n => carregarEfeito(n)), 500);
    R.olhoTex = canvasTex(64, 64, g => {
      g.fillStyle = 'rgba(20,20,20,0.75)'; g.beginPath(); g.arc(32, 32, 30, 0, 7); g.fill();
      g.strokeStyle = '#fff'; g.lineWidth = 4; g.beginPath(); g.ellipse(32, 32, 18, 10, 0, 0, 7); g.stroke();
      g.beginPath(); g.arc(32, 32, 5, 0, 7); g.fillStyle = '#fff'; g.fill();
      g.strokeStyle = '#ff5a4a'; g.lineWidth = 5; g.beginPath(); g.moveTo(14, 14); g.lineTo(50, 50); g.stroke();
    });
    redimensionar();
    if (temDOM) global.addEventListener('resize', redimensionar);
    // brilho na tela (qualidade alta)
    if (temDOM && R.Fx && R.Fx.iniciarPos) {
      R.composer = R.Fx.iniciarPos(R.renderer, R.scene, R.camera, global.innerWidth, global.innerHeight);
      if (R.composer) redimensionar();
    }
  }
  function redimensionar() {
    const w = temDOM ? global.innerWidth : 800, h = temDOM ? global.innerHeight : 600;
    R.renderer.setSize(w, h, false);
    if (R.composer) R.composer.setSize(w, h);
    R.camera.aspect = w / h; R.camera.fov = w < h ? 52 : 42; R.camera.updateProjectionMatrix();
  }
  function canvasTex(w, h, desenhar) {
    if (!temDOM) return new THREE.Texture();
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    desenhar(c.getContext('2d'));
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
  }

  /* ======================= CONSTRUÇÃO DO MAPA ======================= */
  const E = { entidades: [], projeteis: [], efeitos: [], t: 0, interacoes: [] };
  let ordemChao = -20;

  function texChao(nome, reserva, repX, repY) {
    const t = Skins.textura(nome, repX, repY);
    if (reserva && temDOM) {
      // se a textura própria do mapa ainda não existe, usa a reserva
      const img = new global.Image();
      img.onerror = () => { const r = Skins.textura(reserva, repX, repY); t.image = r.image; t.needsUpdate = true; setTimeout(() => { t.image = r.image; t.needsUpdate = true; }, 1500); };
      img.src = 'assets/tex/' + nome + '.jpg?v=20';
    }
    return t;
  }
  // repete a textura multiplicando as coordenadas UV: todas as peças usam a mesma textura na memória
  function uvRep(geo, rx, ry) {
    const uv = geo.attributes && geo.attributes.uv;
    if (!uv) return geo;
    for (let i = 0; i < uv.count; i++) { uv.array[i * 2] *= rx; uv.array[i * 2 + 1] *= ry; }
    uv.needsUpdate = true;
    return geo;
  }
  function camada(geo, mat, x, z, y) {
    mat.depthWrite = false;
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2; m.position.set(x, y, z);
    m.renderOrder = ordemChao++;
    E.mundo.add(m);
    return m;
  }
  function faixa(pts, largura, tex, rep, y, tint) {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const L = Math.hypot(bx - ax, bz - az);
      const geo = uvRep(new THREE.PlaneGeometry(L + largura * 0.6, largura), (L + largura * 0.6) / rep, largura / rep);
      const m = camada(geo, new THREE.MeshLambertMaterial({ map: Skins.textura(tex, 1, 1), color: tint || 0xffffff }), (ax + bx) / 2, (az + bz) / 2, y);
      m.rotation.z = -Math.atan2(bz - az, bx - ax);
    }
    pts.forEach(([x, z]) => camada(uvRep(new THREE.CircleGeometry(largura / 2, 20), largura / rep, largura / rep),
      new THREE.MeshLambertMaterial({ map: Skins.textura(tex, 1, 1), color: tint || 0xffffff }), x, z, y));
  }
  function disco(r, tex, rep, x, z, y, tint) {
    return camada(uvRep(new THREE.CircleGeometry(r, 48), rep, rep), new THREE.MeshLambertMaterial({ map: Skins.textura(tex, 1, 1), color: tint || 0xffffff }), x, z, y);
  }
  // manchas grandes claras e escuras por cima da grama: tira a cara de azulejo repetido
  function manchasGrama(GW, GH, semente) {
    if (!temDOM) return;
    const rnd = semeado(semente * 97 + 13);
    const t = canvasTex(512, 512, g => {
      g.clearRect(0, 0, 512, 512);
      // manchas suaves (sem o amarelo de antes) e desenhadas "dando a volta" na borda: sem linhas retas no chão
      for (let i = 0; i < 60; i++) {
        const x = rnd() * 512, y = rnd() * 512, r = 40 + rnd() * 90, escura = rnd() < 0.7;
        for (const ox of [-512, 0, 512]) for (const oy of [-512, 0, 512]) {
          const cx = x + ox, cy = y + oy; if (cx + r < 0 || cx - r > 512 || cy + r < 0 || cy - r > 512) continue;
          const grad = g.createRadialGradient(cx, cy, 0, cx, cy, r);
          grad.addColorStop(0, escura ? 'rgba(14,30,10,0.34)' : 'rgba(110,128,58,0.16)');
          grad.addColorStop(1, 'rgba(0,0,0,0)');
          g.fillStyle = grad; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill();
        }
      }
    });
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    const m = camada(uvRep(new THREE.PlaneGeometry(GW, GH), GW / 90, GH / 90),
      new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.8 }), 0, 0, 0.005);
    return m;
  }

  // água: cor mais funda, correnteza andando e um segundo reflexo por cima
  function agua(d) {
    const rios = d.rios || [], lagos = d.lagos || [];
    if (!rios.length && !lagos.length) return;
    const aRaso = 0x3f8f8a, aFundo = 0x06202c;
    if (R.Fx && R.Fx.agua && R.Fx.agua(aRaso, aFundo)) {
      const leito = cor => new THREE.MeshBasicMaterial({ map: Skins.textura('rio', 1, 1), color: cor, transparent: true });
      rios.forEach(r => camada(fita(r.pts, r.largura + 0.6, 6), leito(0x2e6f7a), 0, 0, 0.026));
      lagos.forEach(l => camada(uvRep(new THREE.CircleGeometry(l.r + 0.3, 48), 2, 2), leito(0x2a6573), l.x, l.z, 0.026));
      rios.forEach(r => camada(fita(r.pts, r.largura + 1.2, 1), R.Fx.agua(aRaso, aFundo, { rio: true }), 0, 0, 0.03));
      lagos.forEach(l => camada(new THREE.PlaneGeometry((l.r + 0.6) * 2, (l.r + 0.6) * 2), R.Fx.agua(aRaso, aFundo, { radial: true }), l.x, l.z, 0.03));
      return;
    }
    const base = Skins.textura('rio', 1, 1), brilho = Skins.textura('rio', 1, 1, 'brilho');
    const lago = Skins.textura('lago', 1, 1), lagoBrilho = Skins.textura('lago', 1, 1, 'brilho');
    const fundo = 0x3f7f96;
    rios.forEach(r => {
      faixa(r.pts, r.largura, 'rio', 5, 0.02, fundo);
      faixaTex(r.pts, r.largura * 0.86, brilho, 3, 0.025, { transparent: true, opacity: 0.32, color: 0xd8f4ff });
    });
    lagos.forEach(l => {
      disco(l.r, 'lago', 2.2, l.x, l.z, 0.02, fundo);
      camada(uvRep(new THREE.CircleGeometry(l.r * 0.9, 48), 1.6, 1.6),
        new THREE.MeshBasicMaterial({ map: lagoBrilho, transparent: true, opacity: 0.28, color: 0xd8f4ff }), l.x, l.z, 0.025);
    });
    E.efeitos.push({ atualizar(dt) {
      if (base.offset) { base.offset.x -= dt * 0.05; brilho.offset.x -= dt * 0.11; brilho.offset.y += dt * 0.015; }
      if (lago.offset) { lago.offset.x += dt * 0.008; lagoBrilho.offset.x -= dt * 0.012; lagoBrilho.offset.y += dt * 0.01; }
    } });
  }
  function faixaTex(pts, largura, tex, rep, y, opc) {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const L = Math.hypot(bx - ax, bz - az);
      const m = camada(uvRep(new THREE.PlaneGeometry(L + largura * 0.6, largura), (L + largura * 0.6) / rep, largura / rep),
        new THREE.MeshBasicMaterial(Object.assign({ map: tex }, opc)), (ax + bx) / 2, (az + bz) / 2, y);
      m.rotation.z = -Math.atan2(bz - az, bx - ax);
    }
  }

  // ---------- fita: faixa lisa seguindo uma curva (caminhos, rios, margens) ----------
  // uv.x = metros ao longo / rep ; uv.y = 0 numa beirada e 1 na outra
  function fita(pts, largura, rep) {
    const n = pts.length, pos = [], uv = [], idx = [];
    let acum = 0;
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      let tx = b[0] - a[0], tz = b[1] - a[1]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
      const nx = -tz * largura / 2, nz = tx * largura / 2;
      if (i > 0) acum += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      // o plano é desenhado deitado (rotation.x = -90°): (x, -z) no plano vira (x, z) no chão
      pos.push(pts[i][0] + nx, -(pts[i][1] + nz), 0, pts[i][0] - nx, -(pts[i][1] - nz), 0);
      uv.push(acum / rep, 0, acum / rep, 1);
      if (i < n - 1) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    if (g.setIndex) g.setIndex(idx);
    if (g.computeVertexNormals) g.computeVertexNormals();
    return g;
  }
  // beiradas irregulares que somem na grama (máscara desenhada uma vez)
  function texBorda() {
    if (R.texBorda) return R.texBorda;
    R.texBorda = canvasTex(256, 64, g => {
      const img = g.createImageData(256, 64), rnd = semeado(77);
      const ruido = []; for (let i = 0; i < 64; i++) ruido.push(rnd());
      const suave = x => { const i = Math.floor(x) % 64, f = x - Math.floor(x); return ruido[i] * (1 - f) + ruido[(i + 1) % 64] * f; };
      for (let x = 0; x < 256; x++) {
        const b1 = 0.1 + suave(x / 9) * 0.16 + suave(x / 3.1 + 17) * 0.06, b2 = 0.1 + suave(x / 9 + 31) * 0.16 + suave(x / 3.3 + 5) * 0.06;
        for (let y = 0; y < 64; y++) {
          const v = y / 63, borda = Math.min(v / b1, (1 - v) / b2);
          const a = Math.max(0, Math.min(1, borda)) * (0.92 + 0.08 * rnd());
          const k = (y * 256 + x) * 4; img.data[k] = img.data[k + 1] = img.data[k + 2] = 255 * a; img.data[k + 3] = 255;
        }
      }
      g.putImageData(img, 0, 0);
    });
    R.texBorda.encoding = THREE.LinearEncoding || R.texBorda.encoding;
    R.texBorda.wrapS = THREE.RepeatWrapping;
    return R.texBorda;
  }
  function materialBorda(tex, cor, rep) {
    return new THREE.MeshLambertMaterial({ map: Skins.textura(tex, 1, 1), alphaMap: texBorda(), transparent: true, color: cor || 0xffffff, depthWrite: false, side: THREE.DoubleSide });
  }
  function caminhoSuave(c, aguaBase) {
    // um pouco mais largo que o caminho de regra: as beiradas somem na grama
    const geo = fita(c.pts, c.largura * 1.35, c.largura * 1.35);
    const m = camada(geo, materialBorda('caminho_terra', aguaBase ? 0xb9a27a : 0xd8c8a8), 0, 0, 0.02);
    return m;
  }
  // ---------- pontes onde o caminho cruza um rio ----------
  function acharPontes(d) {
    const pontes = [];
    if (d.aguaBase) return pontes;
    (d.caminhos || []).forEach(c => (d.rios || []).forEach(r => {
      let ini = -1;
      const dentro = i => distLinha(c.pts[i][0], c.pts[i][1], r.pts) < r.largura / 2 + 1.6;
      for (let i = 0; i <= c.pts.length; i++) {
        const nd = i < c.pts.length && dentro(i);
        if (nd && ini < 0) ini = i;
        if (!nd && ini >= 0) {
          const a = c.pts[Math.max(0, ini - 1)], b = c.pts[Math.min(c.pts.length - 1, i)];
          pontes.push({ ax: a[0], az: a[1], bx: b[0], bz: b[1], larg: Math.max(3.2, c.largura * 0.95) });
          ini = -1;
        }
      }
    }));
    return pontes;
  }
  function naPonte(x, z) {
    return (E.pontes || []).some(p => distSeg(x, z, p.ax, p.az, p.bx, p.bz) < p.larg / 2);
  }
  function montarPonte(p) {
    const L = Math.hypot(p.bx - p.ax, p.bz - p.az), ang = Math.atan2(p.bx - p.ax, p.bz - p.az);
    const g = new THREE.Group(); g.position.set((p.ax + p.bx) / 2, 0, (p.az + p.bz) / 2); g.rotation.y = ang;
    const madeira = cor => new THREE.MeshLambertMaterial({ color: cor });
    const tabuas = Math.ceil(L / 0.42);
    for (let i = 0; i < tabuas; i++) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(p.larg, 0.12, 0.36), madeira(i % 3 === 0 ? 0x5a3e26 : i % 3 === 1 ? 0x6b4a2e : 0x4f3520));
      t.position.set((Math.random() - 0.5) * 0.08, 0.07, -L / 2 + 0.21 + i * 0.42); t.rotation.y = (Math.random() - 0.5) * 0.04; g.add(t);
    }
    [-1, 1].forEach(lado => {
      const viga = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, L), madeira(0x3f2a18)); viga.position.set(lado * (p.larg / 2 - 0.1), 0.85, 0); g.add(viga);
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, L + 0.4), madeira(0x3a2615)); base.position.set(lado * (p.larg / 2 - 0.05), 0.04, 0); g.add(base);
      for (let k = 0; k <= Math.ceil(L / 2.2); k++) {
        const z = -L / 2 + Math.min(L, k * 2.2);
        const poste = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.95, 0.16), madeira(0x3f2a18)); poste.position.set(lado * (p.larg / 2 - 0.1), 0.47, z); g.add(poste);
      }
    });
    E.mundo.add(g);
    // sombra da ponte na água
    camada(new THREE.PlaneGeometry(p.larg + 0.8, L), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false }), g.position.x, g.position.z, 0.035).rotation.z = ang;
  }
  // ---------- praça redonda com calçada e meio-fio ----------
  function texCalcada() {
    if (R.texCalcada) return R.texCalcada;
    R.texCalcada = canvasTex(512, 512, g => {
      g.clearRect(0, 0, 512, 512);
      g.translate(256, 256);
      // anéis de pedras e uma rosa dos ventos no centro
      for (let r = 40; r < 250; r += 26) {
        const n = Math.round(2 * Math.PI * r / 30);
        for (let i = 0; i < n; i++) {
          const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2;
          g.beginPath(); g.arc(0, 0, r + 11, a0 + 0.012, a1 - 0.012); g.arc(0, 0, r - 11, a1 - 0.012, a0 + 0.012, true); g.closePath();
          const tom = 0.82 + ((i * 37 + r) % 9) / 50;
          g.fillStyle = `rgba(${Math.round(255 * tom)},${Math.round(248 * tom)},${Math.round(232 * tom)},0.35)`; g.fill();
          g.strokeStyle = 'rgba(40,34,28,0.45)'; g.lineWidth = 2; g.stroke();
        }
      }
      g.fillStyle = 'rgba(70,58,44,0.55)';
      for (let i = 0; i < 8; i++) { g.save(); g.rotate(i / 8 * Math.PI * 2); g.beginPath(); g.moveTo(0, -36); g.lineTo(9, 0); g.lineTo(0, i % 2 ? 22 : 36); g.lineTo(-9, 0); g.closePath(); g.fill(); g.restore(); }
    });
    return R.texCalcada;
  }
  function pracaRedonda(p) {
    const r = Math.max(p.w, p.h) / 2 + 1;
    // transparent: entra na mesma fila do caminho e é desenhada depois dele (por cima)
    const guia = camada(new THREE.CircleGeometry(r + 0.6, 64), new THREE.MeshLambertMaterial({ color: 0x5c5a55, transparent: true }), p.x, p.z, 0.04);
    camada(uvRep(new THREE.CircleGeometry(r, 64), r / 2.5, r / 2.5), new THREE.MeshLambertMaterial({ map: Skins.textura('concreto_praca', 1, 1), color: 0xd9d2c4, transparent: true }), p.x, p.z, 0.045);
    camada(new THREE.CircleGeometry(r * 0.98, 64), new THREE.MeshLambertMaterial({ map: texCalcada(), transparent: true, depthWrite: false }), p.x, p.z, 0.05);
    return guia;
  }
  // A câmera nunca gira, então cada árvore é um quadro inclinado de frente para ela.
  const INCLINACAO = Math.atan2(12.2, 11);
  const ASPECTO = { arvore_1: 451 / 640, pinheiro_1: 348 / 640 };
  function bosque(lista) {
    const tipos = {};
    lista.forEach(a => { (tipos[a.img] = tipos[a.img] || []).push(a); });
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), esc = new THREE.Vector3(), cor = new THREE.Color();
    q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -INCLINACAO);
    Object.keys(tipos).forEach(img => {
      const l = tipos[img], anc = MAPAS.ANCORAS[img] !== undefined ? MAPAS.ANCORAS[img] : 0.03;
      const geo = new THREE.PlaneGeometry(ASPECTO[img] || 1, 1);
      geo.translate(0, 0.5 - anc, 0);
      const mat = new THREE.MeshBasicMaterial({ alphaTest: 0.4, side: THREE.DoubleSide });
      const malha = new THREE.InstancedMesh(geo, mat, l.length);
      malha.name = 'bosque_' + img;
      l.forEach((a, i) => {
        pos.set(a.x, 0, a.z); esc.set(a.h, a.h, 1);
        m4.compose(pos, q, esc); malha.setMatrixAt(i, m4);
        cor.set(a.cor); malha.setColorAt(i, cor);
      });
      malha.instanceMatrix.needsUpdate = true;
      if (malha.instanceColor) malha.instanceColor.needsUpdate = true;
      malha.frustumCulled = false;
      malha.renderOrder = 1;
      E.mundo.add(malha);
      const usar = t => { mat.map = t; mat.needsUpdate = true; };
      if (R.cacheSprite[img]) usar(R.cacheSprite[img]);
      else if (temDOM) R.texLoader.load('assets/sprites/' + img + '.png?v=20', t => { t.encoding = THREE.sRGBEncoding; R.cacheSprite[img] = t; usar(t); });
    });
    // sombras de todas as árvores, também em lote
    const sg = new THREE.PlaneGeometry(1, 0.65); sg.rotateX(-Math.PI / 2);
    const sombras = new THREE.InstancedMesh(sg, new THREE.MeshBasicMaterial({ map: R.sombraTex, transparent: true, depthWrite: false, opacity: 0.9 }), lista.length);
    const qs = new THREE.Quaternion();
    lista.forEach((a, i) => { pos.set(a.x, 0.06, a.z); const r = a.h * 0.62; esc.set(r, 1, r); m4.compose(pos, qs, esc); sombras.setMatrixAt(i, m4); });
    sombras.instanceMatrix.needsUpdate = true; sombras.frustumCulled = false; sombras.renderOrder = 0;
    E.mundo.add(sombras);
    return lista.length;
  }

  // Mais pontos de mob: cópias de cada espécie perto dos caminhos, sempre nos mesmos
  // lugares para todos os jogadores (sorteio com semente fixa)
  function mobsDoMapa(d) {
    if (d._mobsTodos) return d._mobsTodos;
    const base = (d.mobs || []).slice();
    const extras = [], rnd = semeado((d.floresta ? d.floresta.semente : 5) * 131 + 7);
    const [W, H] = d.tam;
    const livre = (x, z) => {
      if (Math.abs(x) > W / 2 - 14 || Math.abs(z) > H / 2 - 14) return false;
      if (naAgua(x, z) || naAguaFolga(x, z, 4)) return false;
      if (d.aguaBase && !naIlha(x, z)) return false;
      if (zonaSegura(x, z) || Math.hypot(x - d.entrada[0], z - d.entrada[1]) < 24) return false;
      if (Math.hypot(x - d.aeroporto.x, z - d.aeroporto.z) < 20) return false;
      if ((d.arenas || []).some(a => dentroArena(a, x, z, 10))) return false;
      if (d.eventoRank && Math.hypot(x - d.eventoRank.x, z - d.eventoRank.z) < d.eventoRank.r + 6) return false;
      if (d.podio && Math.hypot(x - d.podio.x, z - d.podio.z) < d.podio.zonaSegura + 6) return false;
      if ((d.pracas || []).some(p => Math.abs(x - p.x) < p.w / 2 + 10 && Math.abs(z - p.z) < p.h / 2 + 10)) return false;
      if (base.concat(extras).some(m => Math.hypot(x - m.x, z - m.z) < 22)) return false;
      if ((d.decor || []).some(o => Math.hypot(x - o.x, z - o.z) < 8)) return false;
      const c = (d.caminhos || []).length ? Math.min(...d.caminhos.map(c2 => distLinha(x, z, c2.pts) - c2.largura / 2)) : 10;
      return c > 5 && c < 13;          // pertinho do caminho: dá para achar
    };
    const especies = Array.from(new Set(base.map(m => m.tipo))).filter(t => t !== 'golem');
    const COPIAS = d.copiasMob !== undefined ? d.copiasMob : 2;
    especies.forEach(tipo => {
      for (let k = 0; k < COPIAS; k++) {
        for (let tent = 0; tent < 600; tent++) {
          const x = (rnd() - 0.5) * W, z = (rnd() - 0.5) * H;
          if (livre(x, z)) { extras.push({ tipo, x: Math.round(x), z: Math.round(z), extra: true }); break; }
        }
      }
    });
    d._mobsTodos = base.concat(extras);
    return d._mobsTodos;
  }

  function sombra(x, z, raio, pai) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(raio * 2, raio * 1.3),
      new THREE.MeshBasicMaterial({ map: R.sombraTex, transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.06, z); m.renderOrder = 0;
    (pai || E.mundo).add(m);
    return m;
  }
  function peca(nome, altura, x, z, opc) {
    opc = opc || {};
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ alphaTest: 0.35, color: opc.tint || 0xffffff }));
    s.center.set(0.5, MAPAS.ANCORAS[nome] !== undefined ? MAPAS.ANCORAS[nome] : 0.03);
    s.position.set(x, 0, z);
    s.scale.set(altura, altura, 1);
    s.visible = false;
    (opc.pai || E.mundo).add(s);
    const aplicar = t => {
      s.material.map = t; s.material.needsUpdate = true;
      const asp = t.image ? t.image.width / t.image.height : 1;
      s.scale.set(altura * asp, altura, 1); s.visible = true;
    };
    if (R.cacheSprite[nome]) aplicar(R.cacheSprite[nome]);
    else if (temDOM) {
      R.texLoader.load('assets/sprites/' + nome + '.png?v=20', t => { t.encoding = THREE.sRGBEncoding; R.cacheSprite[nome] = t; aplicar(t); });
    }
    const temBase = (MAPAS.ANCORAS[nome] || 0) > 0.08;
    if (!temBase && opc.sombra !== false) sombra(x, z, Math.max(0.5, altura * 0.28), opc.pai);
    return s;
  }
  function textoSprite(texto, largura, cor) {
    const t = canvasTex(512, 96, g => {
      g.fillStyle = 'rgba(16,22,18,0.72)'; g.fillRect(0, 0, 512, 96);
      g.fillStyle = cor || '#f3ecd8'; g.font = 'bold 40px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(texto, 256, 50);
    });
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
    s.scale.set(largura, largura * 96 / 512, 1);
    return s;
  }

  function naIlha(x, z) {
    const d = E.def;
    return (d.ilhas || []).some(i => Math.hypot(x - i.x, z - i.z) < i.r);
  }
  function noCaminho(x, z, folga) {
    return (E.def.caminhos || []).some(c => distLinha(x, z, c.pts) < c.largura / 2 + (folga || 0));
  }
  function naAgua(x, z) {
    const d = E.def;
    if (!d) return false;
    if (d.aguaBase) return !naIlha(x, z) && !noCaminho(x, z);
    if (E.pontes && E.pontes.length && naPonte(x, z)) return false;
    return (d.rios || []).some(r => distLinha(x, z, r.pts) < r.largura / 2) ||
      (d.lagos || []).some(l => Math.hypot(x - l.x, z - l.z) < l.r);
  }
  // construções que não dá para atravessar (toca dos minions, lojas, barracas, fonte)
  const LARGURA_SPRITE = { caverna_iso: 1.11, caverna_frente: 0.92, loja_azul: 0.78, loja_vermelha: 0.96, barraca_iso: 1.02, barraca_frente: 0.94, fonte: 1.07 };
  function montarSolidos(d) {
    E.solidos = [];
    (d.decor || []).forEach(o => {
      const asp = LARGURA_SPRITE[o.img]; if (!asp) return;
      const r = o.h * asp * (/^caverna/.test(o.img) ? 0.4 : 0.36);
      E.solidos.push({ x: o.x, z: o.z - r * 0.15, r });
    });
  }
  function empurrarSolidos(e) {
    for (const s of E.solidos || []) {
      const dx = e.x - s.x, dz = e.z - s.z, d = Math.hypot(dx, dz), min = s.r + (e.raio || 0.6) * 0.6;
      if (d >= min) continue;
      if (d < 1e-3) { e.z = s.z + min; continue; }
      e.x = s.x + dx / d * min; e.z = s.z + dz / d * min;
    }
  }
  // moitas sempre na beira do caminho (nunca em cima): boas para emboscadas
  function pontoNoCaminho(x, z) {
    let m = null;
    (E.def.caminhos || []).forEach(c => {
      for (let i = 0; i < c.pts.length - 1; i++) {
        const [ax, az] = c.pts[i], [bx, bz] = c.pts[i + 1], dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz;
        const t = l ? clamp(((x - ax) * dx + (z - az) * dz) / l, 0, 1) : 0;
        const px = ax + t * dx, pz = az + t * dz, dd = Math.hypot(x - px, z - pz);
        if (!m || dd < m.d) m = { d: dd, px, pz, nx: -dz / (Math.sqrt(l) || 1), nz: dx / (Math.sqrt(l) || 1), c };
      }
    });
    return m;
  }
  function ajustarMoitas(d) {
    const livre = (x, z) => !naAgua(x, z) && !noCaminho(x, z, 0.8) && !zonaSegura(x, z) &&
      !(d.pracas || []).some(p => Math.hypot(x - p.x, z - p.z) < Math.max(p.w, p.h) / 2 + 3) &&
      !(d.arenas || []).some(a => dentroArena(a, x, z, 3)) && !(E.solidos || []).some(s => Math.hypot(x - s.x, z - s.z) < s.r + 2);
    return (d.moitas || []).map(([x, z]) => {
      const m = pontoNoCaminho(x, z); if (!m) return [x, z];
      const beira = m.c.largura / 2 + CONFIG.raioMoita + 0.6;
      if (m.d >= beira - 0.3 && m.d <= beira + 4 && livre(x, z)) return [x, z];
      // lado em que a moita já estava; se não der, o outro lado do caminho
      let sx = x - m.px, sz = z - m.pz; const l = Math.hypot(sx, sz);
      if (l > 0.3) { sx /= l; sz /= l; } else { sx = m.nx; sz = m.nz; }
      for (const lado of [1, -1]) for (const extra of [0, 1.5, 3, 5]) {
        const nx = m.px + sx * lado * (beira + extra), nz = m.pz + sz * lado * (beira + extra);
        if (livre(nx, nz)) return [nx, nz];
      }
      // sem lugar bom por perto (ex.: no meio do rio): procura em volta, senão some
      for (let raio = 3; raio <= 12; raio += 3) for (let k = 0; k < 8; k++) {
        const nx = x + Math.cos(k * Math.PI / 4) * raio, nz = z + Math.sin(k * Math.PI / 4) * raio;
        if (livre(nx, nz)) return [nx, nz];
      }
      return null;
    }).filter(Boolean);
  }
  function naMoita(x, z) { return E.moitas.some(m => Math.hypot(x - m[0], z - m[1]) < CONFIG.raioMoita); }
  function zonaSegura(x, z) {
    const d = E.def;
    if (Math.hypot(x - d.aeroporto.x, z - d.aeroporto.z) < CONFIG.raioZonaAeroporto) return true;
    if (d.podio && Math.hypot(x - d.podio.x, z - d.podio.z) < d.podio.zonaSegura) return true;
    const p = d.pracas && d.pracas[0];
    return !!(p && Math.hypot(x - p.x, z - p.z) < Math.max(p.w, p.h) / 2 + 1);
  }
  function dentroArena(a, x, z, folga) {
    return Math.abs(x - a.x) < a.w / 2 + (folga || 0) && Math.abs(z - a.z) < a.h / 2 + (folga || 0);
  }

  // rastro de luz da lâmina (soldado e quem mais tiver espada), em golpes e habilidades
  const _rb = THREE.Vector3 ? new THREE.Vector3() : null, _rp = THREE.Vector3 ? new THREE.Vector3() : null;
  function atualizarRastros(dt) {
    if (!R.Fx || !R.Fx.Rastro || !Skins.linhaArma) return;
    // a espada de fogo queima mesmo parada: o laço abaixo só passa por quem tem rastro, então acende aqui
    for (const e of E.entidades) {
      if ((e.tipo === 'heroi' || e.tipo === 'remoto') && e.classe === 'soldado' && !e.rastro && fxSkin(e).arma && !e.morto && e.obj.visible !== false && Skins.linhaArma(e.obj, _rb, _rp)) fxSkin(e).arma(e, false, dt);
    }
    for (const e of E.entidades) {
      if ((e.tipo !== 'heroi' && e.tipo !== 'remoto') || e.classe !== 'soldado' || !e.anim) continue;
      const ativo = !e.morto && (!!e.investida || /^(ataque|habilidade1|habilidade3)$/.test(e.anim.estado || ''));
      const fs = fxSkin(e);
      if (fs.semRastro) { if (!e.morto && e.obj.visible !== false && fs.arma && Skins.linhaArma(e.obj, _rb, _rp)) fs.arma(e, ativo, dt); continue; }
      if (!e.rastro) {
        if (!ativo) continue;
        e.rastro = new R.Fx.Rastro(tema(e).principal, 14);
      }
      if (e.rastro.mesh.parent !== E.mundo) E.mundo.add(e.rastro.mesh);
      const tem = Skins.linhaArma(e.obj, _rb, _rp);
      e.rastro.passo(ativo && tem, tem ? _rb : null, tem ? _rp : null, dt);
      if (tem && fs.arma && e.obj.visible !== false && !e.morto) fs.arma(e, ativo, dt);
    }
  }

  function limparMapa() {
    limparFx();
    // o herói continua vivo entre um mapa e outro: a animação dele não pode ser desligada
    E.entidades.forEach(e => { if (e.anim && e !== E.heroi) Skins.remover(e.obj); });
    if (E.mundo) R.scene.remove(E.mundo);
    E.mundo = new THREE.Group(); R.scene.add(E.mundo);
    E.entidades = []; E.projeteis = []; E.efeitos = []; E.interacoes = []; E.moitas = [];
    E.ondas = []; E.barcos = []; E.arenas = []; E.chuva = null; E.serpentes = [];
    E.buffDano = 0; ordemChao = -20; E.agenda = [];
  }
  // agenda no tempo do jogo (não no relógio real)
  function agendar(daqui, fn) { (E.agenda = E.agenda || []).push({ em: E.t + daqui, fn }); }

  async function carregarMapa(id) {
    const d = MAPAS.lista[id];
    limparMapa();
    E.mapa = id; E.def = d; P.mapa = id; salvar();
    R.scene.background = new THREE.Color(d.ceu);
    R.scene.fog = new THREE.Fog(d.ceu, d.nevoa[0], d.nevoa[1]);
    const [W, H] = d.tam;
    const rep = d.chao.metrosPorRepeticao;

    // chão
    if (d.aguaBase) {
      camada(uvRep(new THREE.PlaneGeometry(W + 60, H + 60), (W + 60) / 8, (H + 60) / 8), new THREE.MeshLambertMaterial({ map: Skins.textura('rio', 1, 1) }), 0, 0, 0);
      d.ilhas.forEach(i => { disco(i.r + 2.5, 'margem_areia', (i.r + 2.5) / 3, i.x, i.z, 0.01); disco(i.r, d.chao.tex, i.r / rep, i.x, i.z, 0.02, d.chao.tint); });
    } else {
      const GW = W + 120, GH = H + 120;     // o chão vai além da borda, por baixo da floresta
      camada(uvRep(new THREE.PlaneGeometry(GW, GH), GW / rep, GH / rep),
        new THREE.MeshLambertMaterial({ map: texChao(d.chao.tex, d.chao.reserva, 1, 1), color: d.chao.tint }), 0, 0, 0);
      manchasGrama(GW, GH, d.semente || 7);
    }
    // ordem: caminhos, margens, água (por cima do caminho), pontes, praça
    E.pontes = acharPontes(d);
    (d.caminhos || []).forEach(c => caminhoSuave(c, d.aguaBase));
    const margem = 0x9c8a66;
    (d.rios || []).forEach(r => camada(fita(r.pts, r.largura + 5, 5), materialBorda('margem_areia', margem, 0.3), 0, 0, 0.012));
    (d.lagos || []).forEach(l => disco(l.r + 2.2, 'margem_areia', 3, l.x, l.z, 0.012, margem));
    agua(d);
    E.pontes.forEach(montarPonte);
    (d.pracas || []).forEach(p => pracaRedonda(p));

    // decoração, aeroporto e interações
    (d.decor || []).forEach(o => {
      peca(o.img, o.h, o.x, o.z);
      if (o.interacao) E.interacoes.push({ tipo: o.interacao, x: o.x, z: o.z + 2.5, raio: 4.5 });
    });
    peca('aeroporto_iso', 8, d.aeroporto.x, d.aeroporto.z);
    E.interacoes.push({ tipo: 'aeroporto', x: d.aeroporto.x, z: d.aeroporto.z + 3, raio: 8 });
    const anel = camada(new THREE.RingGeometry(CONFIG.raioZonaAeroporto - 0.3, CONFIG.raioZonaAeroporto, 64),
      new THREE.MeshBasicMaterial({ color: 0x5cc8e0, transparent: true, opacity: 0.45 }), d.aeroporto.x, d.aeroporto.z, 0.05);
    anel.renderOrder = 5;

    // moitas
    montarSolidos(d);
    E.moitas = ajustarMoitas(d);
    E.moitas.forEach(([x, z], i) => {
      // três arbustos juntos: parece um esconderijo de verdade
      const a = i * 2.4;
      peca('moita_1', 1.35, x - Math.cos(a) * 0.8, z - 0.4, { tint: 0xc9d3c0 });
      peca('moita_1', 1.25, x + Math.cos(a) * 0.85, z - 0.3, { tint: 0xbac6b1 });
      peca('moita_1', 1.6, x, z + 0.3, { tint: 0xffffff });
    });

    // floresta: miolo + uma mata fechada em toda a borda (é ela que segura o jogador)
    const mobs = mobsDoMapa(d);
    const f = d.floresta, rnd = semeado(f.semente), arvores = [];
    const corArvore = new THREE.Color(f.tint || '#ffffff');
    const sombria = () => {
      // árvores mais escuras e variadas (algumas quase negras no meio da mata)
      const k = 0.68 + rnd() * 0.32, c = corArvore.clone().multiplyScalar(k);
      c.b *= 0.92 + rnd() * 0.12; c.r *= 0.86 + rnd() * 0.1;
      return c;
    };
    const podeArvore = (x, z, borda) => {
      if (f.soIlhas) { if (!d.ilhas.some(i => Math.hypot(x - i.x, z - i.z) < i.r - 3)) return false; }
      if (naAgua(x, z) || (!d.aguaBase && naAguaFolga(x, z, borda ? 2 : 3))) return false;
      if (noCaminho(x, z, borda ? 3 : 4.5)) return false;                      // caminho sempre livre
      if ((d.pracas || []).some(p => Math.abs(x - p.x) < p.w / 2 + 4 && Math.abs(z - p.z) < p.h / 2 + 4)) return false;
      if (Math.hypot(x - d.aeroporto.x, z - d.aeroporto.z) < 15) return false;
      if ((d.decor || []).some(o => Math.hypot(x - o.x, z - o.z) < 5)) return false;
      if (mobs.some(m => Math.hypot(x - m.x, z - m.z) < 7)) return false;
      if ((d.arenas || []).some(a => dentroArena(a, x, z, 7))) return false;
      if (d.eventoRank && Math.hypot(x - d.eventoRank.x, z - d.eventoRank.z) < d.eventoRank.r + 4) return false;
      if (d.podio && Math.hypot(x - d.podio.x, z - d.podio.z) < d.podio.zonaSegura) return false;
      if (Math.hypot(x - d.entrada[0], z - d.entrada[1]) < 8) return false;
      if (E.moitas.some(m => Math.hypot(x - m[0], z - m[1]) < 3)) return false;
      return true;
    };
    const plantar = (x, z, maior) => {
      const pinho = rnd() < 0.5;
      const h = (pinho ? 4.6 + rnd() * 1.6 : 3.8 + rnd() * 1.4) * (maior ? 1.15 + rnd() * 0.25 : 1);
      arvores.push({ img: pinho ? 'pinheiro_1' : 'arvore_1', h, x, z, cor: sombria() });
    };
    // miolo: bem mais árvores que antes
    // em bosques: a maioria nasce perto de outra árvore, deixando clareiras entre eles
    const alvo = Math.round(f.qtd * (f.soIlhas ? 1.6 : 3.4));
    let postas = 0, tent = 0;
    while (postas < alvo && tent < alvo * 30) {
      tent++;
      let x, z;
      if (postas > 8 && rnd() < 0.65) {
        const viz = arvores[Math.floor(rnd() * postas)], ang = rnd() * 6.283, dd = 2.4 + rnd() * 3.2;
        x = viz.x + Math.cos(ang) * dd; z = viz.z + Math.sin(ang) * dd;
        if (Math.abs(x) > W / 2 - 3 || Math.abs(z) > H / 2 - 3) continue;
      } else { x = (rnd() - 0.5) * (W - 6); z = (rnd() - 0.5) * (H - 6); }
      if (!podeArvore(x, z, false)) continue;
      plantar(x, z, false); postas++;
    }
    // borda: faixa fechada de mata, de 6 m para dentro até 34 m para fora do limite
    if (!d.aguaBase) {
      const passo = 2.7, dentro = 6, fora = 34;
      for (let x = -W / 2 - fora; x <= W / 2 + fora; x += passo) {
        for (let z = -H / 2 - fora; z <= H / 2 + fora; z += passo) {
          const dx = W / 2 - Math.abs(x), dz = H / 2 - Math.abs(z);
          if (Math.min(dx, dz) > dentro) continue;                              // só a faixa da borda
          const jx = x + (rnd() - 0.5) * passo * 0.9, jz = z + (rnd() - 0.5) * passo * 0.9;
          const naMata = Math.min(W / 2 - Math.abs(jx), H / 2 - Math.abs(jz)) < 0;
          if (!naMata && !podeArvore(jx, jz, true)) continue;
          if (naMata && (naAgua(jx, jz) || noCaminho(jx, jz, 1.5) || Math.hypot(jx - d.aeroporto.x, jz - d.aeroporto.z) < 12)) continue;
          plantar(jx, jz, naMata);
        }
      }
    }
    E.arvores = bosque(arvores);

    // especiais
    if (d.eventoRank) montarEventoRank(d.eventoRank);
    if (d.cachoeira) montarCachoeira(d.cachoeira);
    if (d.podio) montarPodio(d.podio);
    if (d.chuva) E.chuva = { ativa: true, voltaEm: 0, cfg: d.chuva, obj: montarChuva() };
    (d.arenas || []).forEach((a, i) => E.arenas.push(montarArena(a, i)));

    // mobs, minions e serpente
    for (const m of mobs) await criarMob(m);
    (d.minions || []).forEach((def, i) => E.ondas.push({ def, proxima: 4 + i * 6 }));
    if (d.serpente) await criarSerpente(d.serpente);

    // herói
    if (E.heroi) {
      E.mundo.add(E.heroi.obj); E.mundo.add(E.heroi.sombra); E.mundo.add(E.heroi.barra);
      if (E.heroi.seloSprite && E.heroi.seloSprite.isObject3D) E.mundo.add(E.heroi.seloSprite);
      E.heroi.x = d.entrada[0]; E.heroi.z = d.entrada[1]; E.heroi.time = 'jogador';
      E.heroi.arena = null;
      E.entidades.push(E.heroi);
    }
    aplicarAmbiente(d);
    hud();
    gancho('mapaCarregado', id);
  }

  /* ---------- noite com vaga-lumes (gráfico alto) / dia (gráfico baixo) ---------- */
  function aplicarAmbiente(d) {
    const noite = !!(global.Efeitos && global.Efeitos.qualidade === 'alta' && temDOM && !d.semNoite);
    E.noite = noite;
    const ceu = noite ? (d.ceuNoite || '#0b1412') : d.ceu;
    R.scene.background = new THREE.Color(ceu);
    R.scene.fog = new THREE.Fog(ceu, noite ? 16 : d.nevoa[0], noite ? 62 : d.nevoa[1]);
    if (R.hemi) {
      R.hemi.color = new THREE.Color(noite ? 0x7088c8 : 0xe8f4ff); R.hemi.groundColor = new THREE.Color(noite ? 0x121a0e : 0x4d6b33);
      R.hemi.intensity = noite ? 0.34 : 0.85;
    }
    if (R.sol) { R.sol.color = new THREE.Color(noite ? 0x9db4ff : 0xfff0d6); R.sol.intensity = noite ? 0.42 : 1.05; }
    if (R.lanterna) R.lanterna.intensity = noite ? 0.8 : 0;
    (R.luzesVaga || []).forEach(l => { l.intensity = 0; });
    if (global.Efeitos && global.Efeitos.luzAgua) global.Efeitos.luzAgua.value = noite ? 0.55 : 1;
    // o que não recebe luz (árvores, construções desenhadas) escurece junto
    const tom = noite ? new THREE.Color(0.42, 0.47, 0.6) : null;
    E.mundo.traverse(o => {
      const m = o.material; if (!m || !m.color) return;
      if (!(o.isSprite || (o.isInstancedMesh || o.name.indexOf('bosque_') === 0))) return;
      if (!m.userData.corDia) m.userData.corDia = m.color.clone();
      m.color.copy(m.userData.corDia); if (tom) m.color.multiply(tom);
    });
    criarVagalumes(noite);
  }
  function criarVagalumes(ligar) {
    if (R.vagalumes) { R.scene.remove(R.vagalumes.pts); R.vagalumes = null; }
    if (!ligar || !THREE.Points) return;
    const N = 150, pos = new Float32Array(N * 3), cor = new Float32Array(N * 3), dados = [];
    const h = E.heroi || { x: E.def.entrada[0], z: E.def.entrada[1] };
    for (let i = 0; i < N; i++) {
      dados.push({ x: h.x + (Math.random() - 0.5) * 70, z: h.z + (Math.random() - 0.5) * 70, y: 0.4 + Math.random() * 2.2,
        vx: 0, vz: 0, fase: Math.random() * 20, ritmo: 0.5 + Math.random() * 0.9, brilho: 0 });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cor, 3));
    const mat = new THREE.PointsMaterial({ size: 0.32, map: R.texParticula, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
    const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 13;
    R.scene.add(pts);
    R.vagalumes = { pts, geo, dados };
  }
  function atualizarVagalumes(dt) {
    const v = R.vagalumes, h = E.heroi;
    if (R.lanterna && h) R.lanterna.position.set(h.x, 2.6, h.z + 0.5);
    if (!v || !h) return;
    const pa = v.geo.attributes.position.array, ca = v.geo.attributes.color.array;
    const perto = [];
    v.dados.forEach((f, i) => {
      // voo preguiçoso, mudando de rumo devagar
      f.vx += (Math.random() - 0.5) * dt * 2.2; f.vz += (Math.random() - 0.5) * dt * 2.2;
      f.vx *= 0.985; f.vz *= 0.985;
      f.x += f.vx * dt; f.z += f.vz * dt; f.y = Math.max(0.3, Math.min(3, f.y + Math.sin(E.t * 1.3 + f.fase) * dt * 0.4));
      // quem fica longe do herói reaparece do outro lado
      if (f.x - h.x > 35) f.x -= 70; if (h.x - f.x > 35) f.x += 70;
      if (f.z - h.z > 35) f.z -= 70; if (h.z - f.z > 35) f.z += 70;
      // pisca: acende devagar, fica um pouco e apaga
      const c = (E.t * f.ritmo + f.fase) % 3.2;
      f.brilho = c < 1.6 ? Math.sin(c / 1.6 * Math.PI) : 0;
      pa[i * 3] = f.x; pa[i * 3 + 1] = f.y; pa[i * 3 + 2] = f.z;
      ca[i * 3] = 0.75 * f.brilho; ca[i * 3 + 1] = 1.0 * f.brilho; ca[i * 3 + 2] = 0.35 * f.brilho;
      if (f.brilho > 0.5) perto.push([Math.hypot(f.x - h.x, f.z - h.z), f]);
    });
    v.geo.attributes.position.needsUpdate = true; v.geo.attributes.color.needsUpdate = true;
    // os 4 mais perto do herói iluminam o chão de verdade
    perto.sort((a, b) => a[0] - b[0]);
    (R.luzesVaga || []).forEach((l, i) => {
      const f = perto[i] && perto[i][1];
      if (f) { l.position.set(f.x, f.y, f.z); l.intensity = 1.6 * f.brilho; } else l.intensity = 0;
    });
  }
  function naAguaFolga(x, z, f) {
    const d = E.def;
    return (d.rios || []).some(r => distLinha(x, z, r.pts) < r.largura / 2 + f) ||
      (d.lagos || []).some(l => Math.hypot(x - l.x, z - l.z) < l.r + f);
  }

  function montarEventoRank(ev) {
    const anel = camada(new THREE.RingGeometry(ev.r - 0.6, ev.r, 96), new THREE.MeshBasicMaterial({ color: 0xe3b44c, transparent: true, opacity: 0.6 }), ev.x, ev.z, 0.06);
    anel.renderOrder = 5;
    camada(new THREE.CircleGeometry(ev.r - 0.6, 64), new THREE.MeshBasicMaterial({ color: 0xe3b44c, transparent: true, opacity: 0.08 }), ev.x, ev.z, 0.05);
    const t = textoSprite('ZONA RANQUEADA', 9, '#e3b44c'); t.position.set(ev.x, 4, ev.z); E.mundo.add(t);
  }
  function montarCachoeira(c) {
    const tex = canvasTex(64, 128, g => {
      for (let y = 0; y < 128; y += 4) { g.fillStyle = `rgba(${200 + (y % 16) * 3},${235},255,${0.5 + (y % 12) / 30})`; g.fillRect(0, y, 64, 3); }
    });
    tex.wrapT = THREE.RepeatWrapping;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(4, 6), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.8 }));
    m.position.set(c.x, 3, c.z + 1.5); E.mundo.add(m);
    E.efeitos.push({ sempre: true, atualizar: dt => { tex.offset.y -= dt * 1.5; } });
  }
  function montarChuva() {
    const n = 700, pos = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) {
      const x = (Math.random() - 0.5) * 60, y = Math.random() * 25, z = (Math.random() - 0.5) * 50;
      pos.set([x, y, z, x - 0.05, y - 0.7, z], i * 6);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xcfe6ff, transparent: true, opacity: 0.45 }));
    E.mundo.add(l);
    return l;
  }
  function atualizarChuva(dt) {
    const c = E.chuva; if (!c) return;
    if (!c.ativa && E.t >= c.voltaEm) { c.ativa = true; aviso('A chuva voltou'); }
    c.obj.visible = c.ativa;
    if (!c.ativa) return;
    const p = c.obj.geometry.attributes.position, a = p.array;
    for (let i = 0; i < a.length; i += 6) {
      a[i + 1] -= dt * 22; a[i + 4] -= dt * 22;
      if (a[i + 1] < 0) { a[i + 1] += 25; a[i + 4] += 25; }
    }
    p.needsUpdate = true;
    if (E.heroi) c.obj.position.set(E.heroi.x, 0, E.heroi.z);
  }

  function montarPodio(pd) {
    const rankings = ['Clãs', 'Players', 'Farm', 'Top'];
    const marmore = new THREE.MeshStandardMaterial({ color: 0xece8e0, roughness: 0.35 });
    const ouro = new THREE.MeshStandardMaterial({ color: 0xe3b44c, metalness: 0.6, roughness: 0.35 });
    rankings.forEach(async (r, i) => {
      const x = pd.x + (i - 1.5) * 6.5, z = pd.z;
      const base = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.2, 3.4), marmore); base.position.set(x, 0.6, z); E.mundo.add(base);
      const placa = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.5, 0.1), ouro); placa.position.set(x, 0.6, z + 1.75); E.mundo.add(placa);
      const nome = nomeTop(r);
      const t = textoSprite('Top 1 · ' + r + ': ' + nome, 6); t.position.set(x, 4.6, z + 1.8); E.mundo.add(t);
      // estátua: herói de mármore, parado
      const classe = ['soldado', 'mago', 'suporte', 'atirador'][i];
      try {
        const est = await Skins.criarPersonagem({ classe, genero: i % 2 ? 'f' : 'm', cor: '#ffffff', semArmas: true });
        const an = Skins.animador(est); if (an) { an.atualizar(0.6); Skins.remover(est); }
        est.traverse(n => { if (n.isMesh) n.material = marmore; });
        est.position.set(x, 1.2, z); est.scale.setScalar(1.25);
        E.mundo.add(est);
      } catch (e) { /* sem modelo: fica só o pedestal */ }
    });
  }
  function nomeTop(ranking) {
    if (Jogo.rankingServidor && Jogo.rankingServidor[ranking] && Jogo.rankingServidor[ranking][0]) return Jogo.rankingServidor[ranking][0].nome;
    if (ranking === 'Clãs') return P.clan || '—';
    return P.nome;
  }

  /* ======================= ENTIDADES ======================= */
  let proxId = 1;
  function nova(o) {
    const e = Object.assign({
      id: proxId++, x: 0, z: 0, rot: 0, vida: 100, vidaMax: 100, raio: 0.6, vel: 2.5, altura: 1.8,
      morto: false, slows: [], stunAte: 0, congeladoAte: 0, invisAte: 0, invulAte: 0, escudo: 0, escudoAte: 0,
      prontoEm: 0, time: 'neutro'
    }, o);
    if (e.obj && !e.obj.parent) E.mundo.add(e.obj);
    e.barra = barraVida(e);
    e.sombra = sombra(e.x, e.z, Math.max(0.5, e.raio), E.mundo);
    E.entidades.push(e);
    return e;
  }
  function barraVida(e) {
    const c = temDOM ? document.createElement('canvas') : null;
    if (c) { c.width = 64; c.height = 10; }
    const t = c ? new THREE.CanvasTexture(c) : new THREE.Texture();
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false, transparent: true }));
    s.scale.set(Math.max(1.2, e.raio * 2.2), 0.18, 1);
    s.renderOrder = 10;
    s.userData = { c, t, ultimo: -1 };
    E.mundo.add(s);
    return s;
  }
  // ---------- selo do rank acima da barra de vida ----------
  // amigos/equipe veem elo + estrelas; os outros só o elo.
  // Último elo acima de 50 estrelas: estrelas douradas com aura roxa; a cada 150 a mais, fumaça "fervendo".
  function selo(e, estrelas, comEstrelas) {
    if (estrelas === undefined || estrelas === null) return;
    const r = rankInfo(estrelas), ultimo = r.indice === CONFIG.ranks.length - 1;
    const aura = ultimo && r.estrelas > 50;
    const chave = r.indice + '|' + (comEstrelas ? r.estrelas : '-');
    if (e.seloChave === chave) return;
    e.seloChave = chave;
    e.seloFumaca = aura && comEstrelas ? Math.floor((r.estrelas - 50) / 150) : 0;
    if (!temDOM) { e.seloSprite = e.seloSprite || { position: new THREE.Vector3(), visible: true }; return; }
    if (!e.seloSprite) {
      const c = document.createElement('canvas'); c.width = 256; c.height = 48;
      const t = new THREE.CanvasTexture(c);
      e.seloSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
      e.seloSprite.scale.set(1.9, 1.9 * 48 / 256, 1); e.seloSprite.renderOrder = 10;
      e.seloSprite.userData = { c, t };
      E.mundo.add(e.seloSprite);
    }
    const { c, t } = e.seloSprite.userData, g = c.getContext('2d');
    g.clearRect(0, 0, 256, 48);
    const nome = r.nome, est = comEstrelas ? ' ' + r.estrelas + ' ★' : '';
    g.font = 'bold 26px sans-serif'; g.textBaseline = 'middle';
    const wN = g.measureText(nome).width, wE = est ? g.measureText(est).width : 0, x0 = 128 - (wN + wE) / 2;
    // fundo discreto
    g.fillStyle = 'rgba(10,14,12,0.55)';
    const l = wN + wE + 20; g.beginPath(); if (g.roundRect) g.roundRect(128 - l / 2, 6, l, 36, 12); else g.rect(128 - l / 2, 6, l, 36); g.fill();
    g.textAlign = 'left';
    g.fillStyle = CONFIG.coresElo[r.indice]; g.fillText(nome, x0, 25);
    // onde ficam as estrelas no selo (para a chama sair exatamente de cima delas)
    const wNum = est ? g.measureText(' ' + r.estrelas).width : 0, wEsp = g.measureText(' ').width;
    e.seloEstrelasX = est ? ((x0 + wN + wEsp + (wNum - wEsp) / 2) - 128) / 256 * 1.9 : 0;
    if (est) {
      if (aura) { g.shadowColor = '#b04dff'; g.shadowBlur = 14; g.fillStyle = '#ffd34d'; g.fillText(est, x0 + wN, 25); g.fillText(est, x0 + wN, 25); }
      g.shadowBlur = 0; g.fillStyle = '#ffd34d'; g.fillText(est, x0 + wN, 25);
    }
    t.needsUpdate = true;
  }
  function atualizarSelo(e, dt) {
    const s = e.seloSprite;
    s.visible = !!(e.barra && e.barra.visible);
    s.position.set(e.x, e.barra.position.y + 0.3, e.z);
    // chaminha roxa bem pequena em cima do número de estrelas: um pouco mais viva a cada 150 estrelas acima de 50
    if (e.seloFumaca > 0 && s.visible) {
      e.seloChamaAcc = (e.seloChamaAcc || 0) + dt * (34 + 8 * Math.min(5, e.seloFumaca));
      while (e.seloChamaAcc >= 1) {
        e.seloChamaAcc -= 1;
        const cor = Math.random() < 0.25 ? 0xe9c8ff : Math.random() < 0.6 ? 0xb04dff : 0x7a2fc4;
        // base larga e ponta fina: as que nascem nas pontas sobem menos (formato de chama)
        const lado = (Math.random() - 0.5) * 0.2;
        emitir('faisca', e.x + (e.seloEstrelasX || 0) + lado, s.position.y + 0.1, e.z + 0.02,
          { n: 1, cor, vel: 0.02, subida: (0.3 + 0.05 * Math.min(5, e.seloFumaca)) * (1 - Math.abs(lado) * 3.5), vida: 0.28 });
      }
    }
  }
  function desenharBarra(e) {
    const b = e.barra, u = b.userData;
    const frac = clamp(e.vida / e.vidaMax, 0, 1), esc = e.escudo > 0 ? 1 : 0;
    const chave = Math.round(frac * 64) + esc * 1000;
    b.visible = !e.morto && (e.tipo !== 'serpente' || e.emerso) && e.obj.visible !== false;
    if (u.ultimo === chave || !u.c) return;
    u.ultimo = chave;
    const g = u.c.getContext('2d');
    g.fillStyle = 'rgba(0,0,0,0.7)'; g.fillRect(0, 0, 64, 10);
    g.fillStyle = e === E.heroi ? '#4ade80' : aliado(e, E.heroi || e) ? '#5aa9ff' : '#ef4444';
    g.fillRect(1, 1, 62 * frac, 8);
    if (esc) { g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillRect(1, 1, 62, 2); }
    u.t.needsUpdate = true;
  }
  const ALIADOS = { jogador: 1, azul: 1 };
  function aliado(a, b) { return a.time === b.time || (ALIADOS[a.time] && ALIADOS[b.time]); }
  function inimigos(a, b) { return !aliado(a, b); }
  function invisivel(e) {
    return e.invisAte > E.t || (e.tipo === 'heroi' && (naMoita(e.x, e.z) || PODERES.invisivel)) ||
      (remoto(e) && (e.naMoita || e.invisivelRede));
  }
  function lentidao(e) {
    let m = 1;
    e.slows = e.slows.filter(s => s.ate > E.t);
    e.slows.forEach(s => { m *= (1 - s.pct); });
    if (naAgua(e.x, e.z) && !e.naoAfundaAgua) m *= CONFIG.lentidaoAgua;
    if (E.chuva && E.chuva.ativa) m *= (1 - E.chuva.cfg.slow);
    if (e.velBonusAte > E.t) m *= 1 + e.velBonus;
    return m;
  }
  // toda cura passa por aqui: "corte de cura" reduz o que entra
  function curar(e, quanto) {
    if (!e || e.morto || quanto <= 0) return 0;
    if (e.antiCuraAte > E.t) quanto *= 1 - (e.antiCura || 0.5);
    const antes = e.vida; e.vida = Math.min(e.vidaMax, e.vida + quanto); return e.vida - antes;
  }
  // efeitos de controle; em jogadores de outro celular vão como aviso
  function controlar(e, ef) {
    if (remoto(e)) { gancho('efeitoRemoto', e, ef); return; }
    if (ef.stun) e.stunAte = Math.max(e.stunAte || 0, E.t + ef.stun);
    if (ef.slow) aplicarSlow(e, ef.slow[0], ef.slow[1]);
    if (ef.antiCura) { e.antiCura = ef.antiCura[0]; e.antiCuraAte = E.t + ef.antiCura[1]; }
  }
  function aplicarSlow(e, pct, dur) { if (pct > 0 && dur > 0) e.slows.push({ pct, ate: E.t + dur }); }
  function preso(e) { return e.stunAte > E.t || e.congeladoAte > E.t; }

  // ---------- balanço do administrador (dano e defesa de cada herói, mob, minion e torre) ----------
  // Jogo.ajustes.balanco = { geral: { soldado: { dano: 100, defesa: 0 }, maestro: {...} }, mapas: { mapa1: { ... } } }
  // dano em % (100 = normal); defesa em % de dano que deixa de levar (0 a 90). O ajuste do mapa vale por cima do geral.
  function chaveBalanco(e) {
    if (!e) return null;
    if (e.tipo === 'heroi' || e.tipo === 'clone' || e.donoHeroi) return e.classe || P.classe;
    if (e.tipo === 'mob' || e.tipo === 'minion') return e.especie;
    if (e.tipo === 'serpente') return 'serpente';
    if (e.tipo === 'torre') return 'torre';
    return null;
  }
  function balanco(chave) {
    const b = global.Jogo && Jogo.ajustes && Jogo.ajustes.balanco;
    if (!b || !chave) return null;
    const m = b.mapas && b.mapas[E.mapa] && b.mapas[E.mapa][chave];
    const g = b.geral && b.geral[chave];
    if (!m && !g) return null;
    const v = k => (m && m[k] !== undefined && m[k] !== '' && m[k] !== null) ? Number(m[k]) : (g && g[k] !== undefined && g[k] !== '' && g[k] !== null) ? Number(g[k]) : null;
    return { dano: v('dano'), defesa: v('defesa') };
  }
  function causarDano(alvo, valor, origem, opc) {
    opc = opc || {};
    // quem bate: o dano dele sobe ou desce (jogador de outro celular já mandou o dano ajustado)
    if (origem && !remoto(origem)) { const b = balanco(chaveBalanco(origem)); if (b && b.dano !== null && isFinite(b.dano)) valor *= Math.max(0, b.dano) / 100; }
    // quem apanha: a defesa tira uma parte (dano real e disparos especiais da torre passam direto)
    if (!opc.verdadeiro && !remoto(alvo)) { const b = balanco(chaveBalanco(alvo)); if (b && b.defesa !== null && isFinite(b.defesa)) valor *= 1 - clamp(b.defesa, 0, 90) / 100; }
    if (!alvo || alvo.morto || alvo.invulAte > E.t) return 0;
    if (alvo.tipo === 'heroi' && (zonaSegura(alvo.x, alvo.z) || PODERES.imortal)) return 0;
    if (remoto(alvo) && (!deMim(origem) || PODERES.semVantagem || zonaSegura(alvo.x, alvo.z))) return 0;
    if (alvo.tipo === 'serpente' && !alvo.emerso) return 0;
    let v = valor;
    const deHeroi = origem && (origem.tipo === 'heroi' || origem.donoHeroi);
    if (deHeroi) {
      const b = bonus();
      v *= b.poder * (1 + E.buffDano);
      if (Math.random() < b.critico + (opc.critExtra || 0)) v *= 1.5;
      if ((alvo.tipo === 'mob' || alvo.tipo === 'minion' || alvo.tipo === 'serpente') && E.heroi.cacadorAte > E.t) v *= 1.5;
    }
    // defesa da torre: limite de dano por jogador numa janela de tempo
    if (alvo.tipo === 'torre' && origem && !opc.semLimite && (deHeroi || remoto(origem))) {
      const chave = remoto(origem) ? origem.uid : 'eu', cfgT = CONFIG.torre;
      const lim = (alvo.limites = alvo.limites || {})[chave] = alvo.limites[chave] && E.t - alvo.limites[chave].desde < cfgT.janelaLimite ? alvo.limites[chave] : { desde: E.t, total: 0 };
      const resta = Math.max(0, alvo.vidaMax * cfgT.limitePorJogador - lim.total);
      if (v > resta) {
        v = resta;
        if ((alvo.avisoDefesa || 0) < E.t) {
          alvo.avisoDefesa = E.t + 2;
          anelEfeito(alvo.x, alvo.z, alvo.raio + 1.2, alvo.time === 'azul' ? 0x7ea6ff : 0xff7a7a, 0.5, true);
          if (deHeroi) aviso('A defesa da torre segurou o golpe: chame mais gente para derrubá-la');
        }
      }
      lim.total += v;
      if (v <= 0) return 0;
      if (deHeroi && alvo.arenaRef) gancho('danoTorre', { a: alvo.arenaRef.indice, i: alvo.arenaRef.torres.indexOf(alvo), v: Math.round(v) });
    }
    if (remoto(alvo)) {
      // a vida dele é controlada pelo celular dele: só avisamos o dano
      gancho('danoRemoto', alvo, v, opc);
      if (E.heroi.ilusao && E.heroi.invisAte > E.t) { E.heroi.invisAte = 0; E.heroi.invulAte = 0; E.heroi.ilusao = false; }
      return v;
    }
    if (!opc.verdadeiro && alvo.escudo > 0 && alvo.escudoAte > E.t) {
      const abs = Math.min(alvo.escudo, v); alvo.escudo -= abs; v -= abs;
    }
    alvo.vida -= v;
    if (deHeroi) {
      P.danoTotal += v;
      const rv = bonus().rouboVida;
      if (rv > 0 && E.heroi && !E.heroi.morto) curar(E.heroi, v * rv);
      if (E.heroi.ilusao && E.heroi.invisAte > E.t) { E.heroi.invisAte = 0; E.heroi.invulAte = 0; E.heroi.ilusao = false; }
    }
    // o herói não perde o golpe/habilidade por levar dano: só reage se estiver livre
    const atacando = alvo.tipo === 'heroi' && alvo.anim && /^(ataque|habilidade)/.test(alvo.anim.estado || '');
    if (alvo.anim && v > 0 && alvo.vida > 0 && !opc.semReacao && !atacando) alvo.anim.tocar('dano');
    if (alvo.tipo === 'mob' && origem) alvo.alvo = origem.donoHeroi ? E.heroi : origem;
    if (alvo.vida <= 0) morrer(alvo, origem);
    return v;
  }

  function morrer(e, origem) {
    e.morto = true; e.vida = 0;
    if (e.anim) e.anim.tocar('morte');
    const deHeroi = origem && (origem.tipo === 'heroi' || origem.donoHeroi);
    const esc = CONFIG.escalaMapa[E.mapa] || 1;
    if (e.tipo === 'mob' || e.tipo === 'serpente') {
      e.renasceEm = E.t + CONFIG.respawnMob;
      if (deHeroi) {
        const rc = recompensaMob(e.especie, e.cfg, esc);
        ganhar(rc.xp, rc.ouro, true);
        gancho('mobAbatido', e);
        if (E.def.buffPorMob) { E.buffDano += E.def.buffPorMob; aviso('Buff do vale: +' + (E.buffDano * 100).toFixed(1) + '% de dano'); }
        if (dentroEvento(E.heroi)) { P.pontosRank += 1; }
      }
      if (e.especie === 'golem' && E.chuva) { E.chuva.ativa = false; E.chuva.voltaEm = E.t + 240; aviso('O golem caiu: a chuva parou por 4 minutos'); }
    } else if (e.tipo === 'minion') {
      e.removerEm = E.t + 1.6;
      if (deHeroi) { const rc = recompensaMob(e.especie, e.cfg, esc); ganhar(rc.xp, rc.ouro, true); }
    } else if (e.tipo === 'torre') {
      e.obj.visible = false;
      if (deHeroi) ganhar(CONFIG.torre.xp, CONFIG.torre.ouro, true);
      verificarVitoria(e.arenaRef);
    } else if (e.tipo === 'heroi') {
      const arena = e.arena;
      let espera = CONFIG.respawnHeroi;
      if (arena) {
        const min = (E.t - arena.inicio) / 60;
        espera = Math.min(CONFIG.arena.respawnMax, CONFIG.arena.respawnBase + CONFIG.arena.respawnPasso * Math.floor(min / 5));
      } else if (!E.def.pvpLivre) perderEstrela();
      e.renasceEm = E.t + espera;
      aviso('Você caiu. Volta em ' + Math.round(espera) + ' s');
      if (remoto(origem)) gancho('mortoPorJogador', origem);
    } else if (e.tipo === 'clone') {
      e.removerEm = E.t + 0.5;
    }
  }
  // o admin pode mudar o XP e o ouro de cada mob em cada mapa (vem do servidor)
  function recompensaMob(especie, cfg, esc) {
    const aj = Jogo.ajustes && Jogo.ajustes.mobs && Jogo.ajustes.mobs[E.mapa] && Jogo.ajustes.mobs[E.mapa][especie];
    return {
      xp: aj && aj.xp !== undefined && aj.xp !== '' ? Number(aj.xp) : Math.round(cfg.xp * esc),
      ouro: aj && aj.ouro !== undefined && aj.ouro !== '' ? Number(aj.ouro) : Math.round(cfg.ouro * esc)
    };
  }
  function dentroEvento(e) {
    const ev = E.def.eventoRank;
    return !!(ev && e && Math.hypot(e.x - ev.x, e.z - ev.z) < ev.r);
  }

  /* ---------- projéteis e áreas ---------- */
  const _boca = THREE.Vector3 ? new THREE.Vector3() : null;
  function atirar(origem, ang, o) {
    // tiros de arma saem da boca da arma, não do meio do corpo
    let x0 = origem.x + Math.sin(ang) * 0.6, z0 = origem.z + Math.cos(ang) * 0.6, y0 = 1.1;
    if (origem.obj && _boca && ['heroi', 'clone', 'remoto'].indexOf(origem.tipo) >= 0 && Skins.pontaArma && Skins.pontaArma(origem.obj, _boca)) {
      x0 = _boca.x; z0 = _boca.z; y0 = Math.max(0.5, _boca.y);
    }
    const p = Object.assign({
      x: x0, z: z0, y: y0,
      dx: Math.sin(ang), dz: Math.cos(ang), vel: 16, restante: 10, dano: 10, raio: 0.5,
      origem, time: origem.time, efeito: null, verdadeiro: false
    }, o);
    p.obj = projetilVisual(p.visual || 'brilho', p.cor, p.tamanho || 0.7);
    // brilho em volta do projétil dos mobs (a imagem sozinha some no mapa escuro)
    if (p.halo !== undefined && p.obj.isSprite && R.brilhoTex) {
      const h = new THREE.Sprite(new THREE.SpriteMaterial({ map: R.brilhoTex, color: p.halo, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9 }));
      h.scale.set(1.9, 1.9, 1); h.renderOrder = 10; p.obj.add(h);
    }
    p.obj.position.set(p.x, p.y, p.z);
    if (p.obj.isSprite || !p.obj.userData.deFrente) p.obj.material.rotation = -ang + Math.PI / 2;
    E.mundo.add(p.obj);
    E.projeteis.push(p);
    return p;
  }
  // quadro sempre de frente para a câmera (a câmera nunca gira, mas sobe/desce junto)
  function deFrente(m) { if (R.camera && m.quaternion && R.camera.quaternion) m.quaternion.copy(R.camera.quaternion); }
  function projetilVisual(nome, cor, tam) {
    // esferas desenhadas (não somam luz: o preto aparece preto)
    const desenhadas = { orbeNegra: () => [TX.orbeNegra(), 0xffffff], orbeNoite: () => [TX.orbeNoite(), 0xffffff], tintaRosa: () => [TX.bola(), 0xff5ab4], tintaAmarela: () => [TX.bola(), 0xffe14d] };
    if (desenhadas[nome]) {
      const [tex, c] = desenhadas[nome]();
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: c, transparent: true, depthWrite: false }));
      const k = nome.indexOf('tinta') === 0 ? 0.6 : 1.1; s.scale.set(tam * k, tam * k, 1); s.renderOrder = 11; return s;
    }
    const shader = (nome === 'brilho' || nome === 'fogo') && R.Fx && R.Fx.orbe(nome === 'fogo' ? (cor || 0xff7a2a) : (cor || 0xffffff));
    if (shader) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(tam * 1.9, tam * 1.9), shader);
      m.renderOrder = 11; m.userData.deFrente = true; deFrente(m);
      return m;
    }
    const mat = new THREE.SpriteMaterial({ transparent: true, depthWrite: false, color: cor || 0xffffff });
    const s = new THREE.Sprite(mat); s.scale.set(tam, tam, 1);
    if (nome === 'brilho') { mat.map = R.brilhoTex; mat.blending = THREE.AdditiveBlending; }
    else if (R.cacheSprite['ef_' + nome]) mat.map = R.cacheSprite['ef_' + nome];
    else if (temDOM) {
      // enquanto a imagem não chega, a esfera fica escondida (antes aparecia um quadrado branco)
      mat.visible = false;
      carregarEfeito(nome, t => { mat.map = t; mat.visible = true; mat.needsUpdate = true; });
    }
    return s;
  }
  function carregarEfeito(nome, pronto) {
    if (R.cacheSprite['ef_' + nome]) { if (pronto) pronto(R.cacheSprite['ef_' + nome]); return; }
    R.esperaEfeito = R.esperaEfeito || {};
    if (R.esperaEfeito[nome]) { if (pronto) R.esperaEfeito[nome].push(pronto); return; }
    R.esperaEfeito[nome] = pronto ? [pronto] : [];
    R.texLoader.load('assets/efeitos/' + nome + '.png', t => { t.encoding = THREE.sRGBEncoding; R.cacheSprite['ef_' + nome] = t; R.esperaEfeito[nome].forEach(f => f(t)); delete R.esperaEfeito[nome]; });
  }
  function atualizarProjeteis(dt) {
    for (let i = E.projeteis.length - 1; i >= 0; i--) {
      const p = E.projeteis[i];
      if (p.alvo && !p.alvo.morto) {
        // vira devagar na direção do alvo (até ~6 rad/s): perdoa o movimento do inimigo
        const queria = Math.atan2(p.alvo.x - p.x, p.alvo.z - p.z), atual = Math.atan2(p.dx, p.dz);
        const nova = girarPara(atual, queria, dt * 6);
        p.dx = Math.sin(nova); p.dz = Math.cos(nova);
      }
      const passo = p.vel * dt;
      p.x += p.dx * passo; p.z += p.dz * passo; p.restante -= passo;
      p.obj.position.set(p.x, p.y, p.z);
      if (p.obj.userData.deFrente) deFrente(p.obj);
      if (p.rastro !== undefined) emitir('faisca', p.x, p.y, p.z, { n: 2, cor: p.rastro, vel: 0.35, vida: 0.3, subida: 0.2 });
      let acertou = null;
      for (const e of (p.soVisual ? [] : E.entidades)) {
        if (e.morto || e === p.origem || !inimigos(e, p) || e.tipo === 'clone' && p.time === 'jogador') continue;
        if (remoto(e) && !deMim(p.origem)) continue;
        if (e.tipo === 'serpente' && !e.emerso) continue;
        if (Math.hypot(e.x - p.x, e.z - p.z) < p.raio + e.raio) { acertou = e; break; }
      }
      if (acertou) {
        if (p.impacto !== undefined) emitir('faisca', p.x, p.y, p.z, { n: 12, cor: p.impacto, vel: 3, vida: 0.35, subida: 1.5, grav: 6 });
        causarDano(acertou, p.dano, p.origem, { verdadeiro: p.verdadeiro });
        if (p.efeito) p.efeito(acertou);
      }
      if (acertou || p.restante <= 0) {
        if (!acertou && p.aoAcabar) p.aoAcabar(p.x, p.z);
        E.mundo.remove(p.obj); E.projeteis.splice(i, 1);
      }
    }
  }
  function area(x, z, raio, origem, fn) {
    let n = 0;
    E.entidades.forEach(e => {
      if (e.morto || !inimigos(e, origem) || e === origem) return;
      if (e.tipo === 'serpente' && !e.emerso) return;
      if (remoto(e) && !deMim(origem)) return;
      if (Math.hypot(e.x - x, e.z - z) <= raio + e.raio) { fn(e); n++; }
    });
    return n;
  }
  // golpe em leque na frente (meia-abertura em radianos): mais fácil de acertar que um ponto
  function cone(origem, ang, raio, abertura, fn) {
    let n = 0;
    E.entidades.forEach(e => {
      if (e.morto || !inimigos(e, origem) || e === origem) return;
      if (e.tipo === 'serpente' && !e.emerso) return;
      if (remoto(e) && !deMim(origem)) return;
      const dx = e.x - origem.x, dz = e.z - origem.z, d = Math.hypot(dx, dz);
      if (d > raio + e.raio) return;
      const da = Math.abs(Math.atan2(Math.sin(Math.atan2(dx, dz) - ang), Math.cos(Math.atan2(dx, dz) - ang)));
      if (d > e.raio + 0.6 && da > abertura) return;
      fn(e); n++;
    });
    return n;
  }
  function anelEfeito(x, z, raio, cor, dur, cresce) {
    const sh = R.Fx && R.Fx.anel(cor);
    if (sh) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(raio * 2.3, raio * 2.3), sh);
      m.rotation.x = -Math.PI / 2; m.position.set(x, 0.13, z); m.renderOrder = 6; E.mundo.add(m);
      E.efeitos.push({ t: 0, dur, atualizar(dt) {
        this.t += dt; const k = Math.min(1, this.t / this.dur);
        sh.uniforms.progresso.value = k;
        if (k >= 1) { E.mundo.remove(m); return true; }
      } });
      return m;
    }
    const m = new THREE.Mesh(new THREE.RingGeometry(raio * 0.8, raio, 48),
      new THREE.MeshBasicMaterial({ color: cor, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.1, z); m.renderOrder = 6;
    E.mundo.add(m);
    E.efeitos.push({
      t: 0, dur, atualizar(dt) {
        this.t += dt; const k = this.t / this.dur;
        m.material.opacity = 0.85 * (1 - k); if (cresce) m.scale.setScalar(0.6 + k * 0.7);
        if (k >= 1) { E.mundo.remove(m); return true; }
      }
    });
    return m;
  }
  function discoEfeito(x, z, raio, cor, dur, aCada) {
    const sh = R.Fx && R.Fx.chao(cor, true);
    if (sh) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(raio * 2, raio * 2), sh);
      m.rotation.x = -Math.PI / 2; m.position.set(x, 0.12, z); m.renderOrder = 6; E.mundo.add(m);
      let tick = 0;
      E.efeitos.push({ t: 0, dur, atualizar(dt) {
        this.t += dt; tick += dt;
        const ent = Math.min(1, this.t / 0.15), sai = Math.min(1, (this.dur - this.t) / 0.3);
        sh.uniforms.intensidade.value = Math.max(0, Math.min(ent, sai)) * (0.85 + 0.15 * Math.sin(this.t * 12));
        if (aCada && tick >= aCada.intervalo) { tick = 0; aCada.fn(); }
        if (this.t >= this.dur) { E.mundo.remove(m); return true; }
      } });
      return;
    }
    const m = new THREE.Mesh(new THREE.CircleGeometry(raio, 40),
      new THREE.MeshBasicMaterial({ color: cor, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.12, z); m.renderOrder = 6;
    E.mundo.add(m);
    let tick = 0;
    E.efeitos.push({
      t: 0, dur, atualizar(dt) {
        this.t += dt; tick += dt;
        m.material.opacity = 0.35 + 0.2 * Math.sin(this.t * 14);
        if (aCada && tick >= aCada.intervalo) { tick = 0; aCada.fn(); }
        if (this.t >= this.dur) { E.mundo.remove(m); return true; }
      }
    });
  }

  /* ======================= EFEITOS: PARTÍCULAS E TEMAS ======================= */
  // Cores dos efeitos de cada herói. Uma skin nova só precisa de uma entrada aqui
  // (ex.: TEMAS.atirador.ceifador = { principal: 0x7dff9a, ... }) para mudar todos os efeitos dela.
  const TEMAS = {
    soldado:  { padrao: { principal: 0xffd27a, faisca: 0xfff1c4, poeira: 0xcbb38f, brasa: 0xffa23a },
                // Cavaleiro de Lava: tudo pega fogo (espada em chamas, espiral, rastro e fogo saindo do chão)
                lava: { principal: 0xff6a1a, faisca: 0xffc04d, poeira: 0x4a2414, brasa: 0xff3d00, fogo: true },
                cacadora: { principal: 0x4dff7a, faisca: 0xb8ffc4, poeira: 0x3a3022, brasa: 0x1fbf4f },
                vilkronomita: { principal: 0x4fb8ff, faisca: 0xcfeeff, poeira: 0x2a3440, brasa: 0x2a7bff },
                viking: { principal: 0x39ff14, faisca: 0xb6ffb0, poeira: 0x2e3326, brasa: 0x1a9a20 },
                samurai: { principal: 0xff5a1a, faisca: 0xffa040, poeira: 0x1a1a1a, brasa: 0xff3d00 } },
    suporte:  { padrao: { principal: 0xfff3b0, cura: 0x6dff9c, brilho: 0xffe08a, selo: 0xfff3b0, controle: 0xff6b6b },
                ciber: { principal: 0x39ff88, cura: 0x39ff88, brilho: 0xa6ffcf, selo: 0x39ff88, controle: 0x39ff88 },
                medicina: { principal: 0xff2a2a, cura: 0xff3b3b, brilho: 0xff8080, selo: 0xff2a2a, controle: 0xff2a2a } },
    mago:     { padrao: { principal: 0xb26bff, brasa: 0xd9a0ff, fumaca: 0x6b4a8f, chama: 0x9b5cff },
                anubis: { principal: 0xffc23a, brasa: 0xffe08a, fumaca: 0x6b5420, chama: 0xffb020 },
                noturna: { principal: 0x2a8bff, brasa: 0x7fc8ff, fumaca: 0x0a0a14, chama: 0x2a8bff } },
    atirador: { padrao: { principal: 0x7fe0ff, faisca: 0xd9f8ff, explosivo: 0xffa23a, brasa: 0xffd27a },
                cosmos: { principal: 0xff2a2a, faisca: 0xff6060, explosivo: 0xff4a10, brasa: 0x8a0a0a },
                paintball: { principal: 0xff5ab4, faisca: 0xffe14d, explosivo: 0xff5ab4, brasa: 0xffe14d } }
  };
  function tema(h) {
    const t = TEMAS[h && h.classe] || TEMAS.soldado;
    return Object.assign({}, t.padrao, t[h && h.skin] || {});
  }
  // Partículas com brilho, todas de uma vez só na placa de vídeo (leve no celular).
  // Somem escurecendo, porque somam luz: preto = invisível.
  const FX = {};
  function poolFx(nome, max, tam) {
    if (FX[nome]) return FX[nome];
    const pos = new Float32Array(max * 3), cor = new Float32Array(max * 3);
    for (let i = 0; i < max; i++) pos[i * 3 + 1] = -999;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cor, 3));
    const mat = new THREE.PointsMaterial({ size: tam, map: R.texParticula, vertexColors: true, transparent: true,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
    const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 12;
    R.scene.add(pts);
    return (FX[nome] = { pts, geo, max, prox: 0, vivos: new Array(max).fill(null) });
  }
  const _cor = THREE.Color ? new THREE.Color() : null;
  // emitir('faisca', x, y, z, { n, cor, vel, subida, vida, grav, raio, dir: [dx,dz], espalha })
  function emitir(tipo, x, y, z, o) {
    if (!R.scene) return;
    const f = poolFx(tipo, tipo === 'grande' ? 300 : 900, { faisca: 0.22, media: 0.5, grande: 1.2 }[tipo] || 0.4);
    o = o || {};
    const n = o.n || 8, vel = o.vel === undefined ? 2 : o.vel, vida = o.vida || 0.6, raio = o.raio || 0;
    _cor.set(o.cor === undefined ? 0xffffff : o.cor);
    for (let k = 0; k < n; k++) {
      const i = f.prox; f.prox = (f.prox + 1) % f.max;
      const a = Math.random() * Math.PI * 2, rr = raio * Math.sqrt(Math.random());
      let vx = Math.cos(a) * vel * (0.4 + Math.random() * 0.8), vz = Math.sin(a) * vel * (0.4 + Math.random() * 0.8);
      if (o.dir) { const e = o.espalha || 0.6; vx = o.dir[0] * vel + vx * e; vz = o.dir[1] * vel + vz * e; }
      f.vivos[i] = { x: x + Math.cos(a) * rr, y: y + (o.alturaVar || 0) * Math.random(), z: z + Math.sin(a) * rr,
        vx, vz, vy: (o.subida || 0) * (0.6 + Math.random() * 0.8), t: 0, vida: vida * (0.6 + Math.random() * 0.8),
        g: o.grav === undefined ? 0 : o.grav, r: _cor.r, gg: _cor.g, b: _cor.b, arrasto: o.arrasto || 0 };
    }
  }
  function atualizarFx(dt) {
    Object.keys(FX).forEach(nome => {
      const f = FX[nome], pa = f.geo.attributes.position, ca = f.geo.attributes.color;
      let algum = false;
      for (let i = 0; i < f.max; i++) {
        const p = f.vivos[i]; if (!p) continue;
        algum = true;
        p.t += dt; p.vy -= p.g * dt;
        if (p.arrasto) { const k = Math.max(0, 1 - p.arrasto * dt); p.vx *= k; p.vz *= k; }
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (p.y < 0.05) { p.y = 0.05; p.vy *= -0.3; }
        const k = 1 - p.t / p.vida;
        if (k <= 0) { f.vivos[i] = null; pa.array[i * 3 + 1] = -999; ca.array[i * 3] = ca.array[i * 3 + 1] = ca.array[i * 3 + 2] = 0; continue; }
        pa.array[i * 3] = p.x; pa.array[i * 3 + 1] = p.y; pa.array[i * 3 + 2] = p.z;
        ca.array[i * 3] = p.r * k; ca.array[i * 3 + 1] = p.gg * k; ca.array[i * 3 + 2] = p.b * k;
      }
      if (algum || f.sujo) { pa.needsUpdate = true; ca.needsUpdate = true; f.sujo = algum; }
    });
  }
  function limparFx() { Object.keys(FX).forEach(n => { const f = FX[n]; f.vivos.fill(null); f.geo.attributes.position.array.fill(-999); f.sujo = true; }); }
  // brilho em volta do herói enquanto um efeito dura (aceleração, tiros explosivos...)
  function aura(e, cor, dur, densidade, naMao) {
    let acc = 0;
    E.efeitos.push({ t: 0, atualizar(dt) {
      this.t += dt; acc += dt * (densidade || 20);
      while (acc >= 1) {
        acc -= 1;
        if (naMao && e.obj && Skins.posicaoOsso && Skins.posicaoOsso(e.obj, 'righthand', _vfx)) emitir('faisca', _vfx.x, _vfx.y, _vfx.z, { n: 1, cor, vel: 0.4, subida: 0.8, vida: 0.35 });
        else emitir('faisca', e.x, 0.2, e.z, { n: 1, cor, vel: 0.3, subida: 2.4, vida: 0.6, raio: 0.7, alturaVar: 1.2 });
      }
      if (this.t >= dur || e.morto) return true;
    } });
  }
  const _vfx = THREE.Vector3 ? new THREE.Vector3() : null;
  // coluna de luz (cura, selo)
  function colunaLuz(x, z, cor, dur, raio) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(raio || 0.7, raio || 0.7, 4, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: cor, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    m.position.set(x, 2, z); m.renderOrder = 8; E.mundo.add(m);
    E.efeitos.push({ t: 0, atualizar(dt) { this.t += dt; const k = this.t / dur; m.material.opacity = 0.35 * (1 - k); m.scale.set(1 - k * 0.6, 1, 1 - k * 0.6); if (k >= 1) { E.mundo.remove(m); return true; } } });
  }
  // círculo de runas girando no chão (selo do suporte)
  function circuloRunas(x, z, r, cor, dur) {
    if (!R.texRunas) R.texRunas = canvasTex(256, 256, g => {
      g.strokeStyle = '#ffffff'; g.lineWidth = 5; g.beginPath(); g.arc(128, 128, 120, 0, 7); g.stroke();
      g.lineWidth = 2; g.beginPath(); g.arc(128, 128, 98, 0, 7); g.stroke();
      g.fillStyle = '#ffffff'; g.font = 'bold 20px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      const runas = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈ';
      for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; g.save(); g.translate(128 + Math.cos(a) * 109, 128 + Math.sin(a) * 109); g.rotate(a + Math.PI / 2); g.fillText(runas[i], 0, 0); g.restore(); }
      g.beginPath(); for (let i = 0; i <= 6; i++) { const a = i / 6 * Math.PI * 2 * 2; g.lineTo(128 + Math.cos(a) * 92, 128 + Math.sin(a) * 92); } g.stroke();
    });
    const m = camada(new THREE.PlaneGeometry(r * 2, r * 2), new THREE.MeshBasicMaterial({ map: R.texRunas, color: cor, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }), x, z, 0.11);
    m.renderOrder = 7;
    E.efeitos.push({ t: 0, atualizar(dt) { this.t += dt; m.rotation.z += dt * 1.6; const k = this.t / dur; m.material.opacity = 0.9 * Math.min(1, (1 - k) * 3); m.scale.setScalar(0.85 + 0.15 * Math.min(1, this.t * 4)); if (k >= 1) { E.mundo.remove(m); return true; } } });
  }
  // fumaça (ilusão do mago, salto) — escura, não soma luz
  function fumaca(x, z, cor, n) { particulas(x, z, { n: n || 10, cor, tam: 1.1, cresce: 2.2, velH: 1.6, velV: 1.4, gravidade: -0.5, vida: 0.8, raio: 0.4, opacidade: 0.55, y: 0.8 }); }

  /* ======================= HERÓI ======================= */
  async function criarHeroi() {
    const cls = CLASSES[P.classe];
    const obj = await Skins.criarPersonagem({ classe: P.classe, genero: P.genero, cor: P.cor, skin: (P.skinEquipada || {})[P.classe] || 'default' });
    const velho = E.heroi;
    if (velho) {
      Skins.remover(velho.obj); E.entidades = E.entidades.filter(e => e !== velho);
      // tudo que andava junto com o herói antigo sai junto (antes o selo de elo ficava flutuando sozinho)
      [velho.obj, velho.barra, velho.sombra, velho.seloSprite, velho.marcaAlvo, velho.olho, velho.rastro && velho.rastro.mesh].forEach(o => { if (o && o.parent) o.parent.remove(o); });
    }
    const h = nova({
      tipo: 'heroi', time: 'jogador', classe: P.classe, skin: (P.skinEquipada || {})[P.classe] || 'padrao', obj, anim: Skins.animador(obj),
      x: velho ? velho.x : E.def.entrada[0], z: velho ? velho.z : E.def.entrada[1], rot: velho ? velho.rot : 0,
      vida: cls.vida, vidaMax: cls.vida, raio: 0.6, vel: CONFIG.velHeroi,
      cds: [0, 0, 0, 0], arena: velho ? velho.arena : null, cacadorAte: 0, velBonus: 0, velBonusAte: 0
    });
    E.heroi = h;
    hud();
    return h;
  }
  // Escolha do alvo do ataque básico:
  //  - arrastando o botão: o inimigo mais perto da linha mirada (até 35°)
  //  - só tocando: o alvo travado, senão herói inimigo, senão o mais perto
  function alvoValido(h, e) {
    return !!(e && !e.morto && E.entidades.indexOf(e) >= 0 && inimigos(e, h) && e.tipo !== 'clone' && !(e.tipo === 'serpente' && !e.emerso) &&
      !(remoto(e) && (invisivel(e) || zonaSegura(e.x, e.z) || PODERES.semVantagem)) && !(e.tipo === 'heroi') && !(e.obj && e.obj.visible === false && remoto(e)));
  }
  // Mira auxiliar (menu ⋮): o alvo escolhido fica preso até morrer, sumir ou ficar longe;
  // arrastar o ataque para outro inimigo troca o alvo. Desligada, o alvo só é preferido por 2,5 s.
  const MIRA_AUX = { ligada: true, longe: 20 };
  try { const v = global.localStorage.getItem('vilkron_mira_aux'); if (v !== null) MIRA_AUX.ligada = v === '1'; } catch (e) {}
  function alvoPreso(h) {
    const a = h.alvoPreso;
    if (!MIRA_AUX.ligada || !a) return null;
    if (!alvoValido(h, a) || dist(a, h) > MIRA_AUX.longe) { h.alvoPreso = null; return null; }
    return a;
  }
  function escolherAlvo(h, alcance, angMira) {
    const valido = e => alvoValido(h, e);
    let melhor = null, nota = Infinity;
    E.entidades.forEach(e => {
      if (!valido(e)) return;
      const d = dist(e, h); if (d > alcance + e.raio) return;
      let n = d;
      if (angMira !== null && angMira !== undefined) {
        const da = Math.abs(Math.atan2(Math.sin(Math.atan2(e.x - h.x, e.z - h.z) - angMira), Math.cos(Math.atan2(e.x - h.x, e.z - h.z) - angMira)));
        if (da > 0.61) return;                       // fora do cone de 35°
        n = da * 8 + d * 0.3;
      } else {
        if (e === h.alvoTravado && h.travaAte > E.t) n -= 100;   // continua no mesmo alvo
        else if (remoto(e)) n -= 4;                               // herói inimigo primeiro
        else if (e.tipo === 'minion' || e.tipo === 'torre') n += 2;
      }
      if (n < nota) { nota = n; melhor = e; }
    });
    return melhor;
  }
  function alvoMaisPerto(origem, alcance) {
    let melhor = null, md = alcance;
    E.entidades.forEach(e => {
      if (e.morto || !inimigos(e, origem) || e.tipo === 'clone') return;
      if (e.tipo === 'serpente' && !e.emerso) return;
      if (remoto(e) && (invisivel(e) || zonaSegura(e.x, e.z) || PODERES.semVantagem)) return;
      const d = dist(e, origem);
      if (d < md) { md = d; melhor = e; }
    });
    return melhor;
  }
  function ocupadoHeroi(h) {
    const a = h.anim;
    return h.morto || preso(h) || h.travadoAte > E.t || (a && ['ataque', 'habilidade1', 'habilidade2', 'habilidade3'].indexOf(a.estado) >= 0 && h.classe !== 'atirador');
  }
  function podeAgir(h) { return !h.morto && !preso(h) && !(h.travadoAte > E.t); }

  // mira: {ang, dist} ou null para mirar sozinho
  function usar(slot, mira) {
    const h = E.heroi; if (!h || !podeAgir(h)) return false;
    if (h.cds[slot] > E.t) return false;
    // o atirador só atira parado (o salto é a exceção: é movimento)
    if (h.classe === 'atirador' && slot !== 3 && Entrada.mag > 0.12) return false;
    const saltoLivre = h.classe === 'atirador' && slot === 3;      // o salto pode ser usado no meio de qualquer animação
    if (h.anim && ['ataque', 'habilidade1', 'habilidade2', 'habilidade3'].indexOf(h.anim.estado) >= 0 && slot !== 0 && !saltoLivre) return false;
    const cls = CLASSES[h.classe];
    let ang = h.rot, alvo = null;
    if (slot === 0) {
      // ataque básico: mira assistida (prefere o alvo travado e heróis inimigos)
      const preso = alvoPreso(h), alcanceBasico = cls.alcance + (mira ? 1.5 : 3);
      if (!mira && preso && dist(preso, h) <= alcanceBasico + preso.raio) alvo = preso;     // mira auxiliar: vai sozinho no alvo escolhido
      else alvo = escolherAlvo(h, alcanceBasico, mira ? mira.ang : null);
      if (alvo) ang = Math.atan2(alvo.x - h.x, alvo.z - h.z);
      else if (mira) ang = mira.ang;
      if (MIRA_AUX.ligada) {
        if (alvo && (mira || !preso)) h.alvoPreso = alvo;        // arrastou para outro inimigo (ou não tinha alvo): troca
        h.alvoTravado = h.alvoPreso || alvo; h.travaAte = E.t + 1e6;
      } else { h.alvoTravado = alvo; h.travaAte = E.t + 2.5; }
    } else if (mira) ang = mira.ang;
    else {
      const preso = alvoPreso(h);
      alvo = preso && dist(preso, h) <= 14 ? preso : alvoMaisPerto(h, 12);   // habilidades também seguem o alvo escolhido
      if (alvo) ang = Math.atan2(alvo.x - h.x, alvo.z - h.z);
    }
    h.rot = ang;
    h.ultimoAlvo = alvo;
    let cd = cls.cd[slot];
    if (slot === 0) cd /= velAtaque(h);
    h.cds[slot] = E.t + cd;
    // salto do atirador: 2 pulos dentro de 15 s; depois disso, recarga
    if (h.classe === 'atirador' && slot === 3) {
      const c = CONFIG.atirador;
      if (!h.salto || E.t > h.salto.ate) h.salto = { ate: E.t + c.janelaSaltos, usados: 0 };
      h.salto.usados++;
      if (h.salto.usados >= c.saltos) h.salto = null;
      else h.cds[3] = E.t + 0.4;
    }
    HABILIDADES[h.classe][slot](h, ang, mira, alvo);
    gancho('acao', slot, ang);
    return true;
  }

  // velocidade de ataque do herói agora (estrelas + aceleração do atirador)
  function velAtaque(h) {
    return bonus().velAtaque * (h && h.aceleradoAte > E.t ? 1 + CONFIG.atirador.aceleracao : 1);
  }
  function explosaoEnergia(h, x, z) {
    const c = CONFIG.atirador, tm = tema(h);
    if (fxSkin(h).explosao) fxSkin(h).explosao(h, x, z);
    else {
      anelEfeito(x, z, c.explosaoRaio, tm.explosivo, 0.45, true);
      discoEfeito(x, z, c.explosaoRaio * 0.8, tm.brasa, 0.3);
      emitir('grande', x, 0.8, z, { n: 6, cor: tm.explosivo, vel: 2, subida: 1, vida: 0.35 });
      emitir('faisca', x, 0.8, z, { n: 22, cor: tm.brasa, vel: 6, subida: 3, grav: 10, vida: 0.5 });
    }
    area(x, z, c.explosaoRaio, h, e => causarDano(e, CLASSES.atirador.dano, h, { critExtra: c.explosaoCritico, semReacao: true }));
  }
  // ---------- ÚLTIMATES ----------
  function ultSoldado(h, ang) {
    const u = CONFIG.ultimate.soldado, atingidos = new Set(), tm = tema(h);
    h.travadoAte = E.t + 1.1;
    h.anim.tocar('habilidade3', { momento: 0.78, aoAcertar: () => {
      // a espada bate no chão e a explosão corre em linha reta
      for (let i = 0, d = 1.4; d <= u.alcance; i++, d += 1.45) {
        const x = h.x + Math.sin(ang) * d, z = h.z + Math.cos(ang) * d;
        agendar(i * 0.055, () => {
          anelEfeito(x, z, u.largura, tm.brasa, 0.4, true);
          discoEfeito(x, z, u.largura * 0.7, tm.principal, 0.25);
          emitir('grande', x, 0.5, z, { n: 2, cor: tm.brasa, vel: 1, subida: 2, vida: 0.4 });
          emitir('faisca', x, 0.3, z, { n: 10, cor: tm.principal, vel: 3, subida: 4, grav: 10, vida: 0.5 });
          particulas(x, z, { n: 5, cor: 0xd9b38a, tam: 0.9, cresce: 2, velH: 2, velV: 1.5, gravidade: 2, vida: 0.7, opacidade: 0.7 });
          if (i % 2 === 0) pedras(x, z, 3, 0x6b5a48, 4);
          if (i === 0) tremer(h.x, h.z, 0.35, 0.4);
          if (i % 2 === 0) rachaduras(x, z, u.largura * 1.4, 2);
          if (fxSkin(h).ult) fxSkin(h).ult(h, x, z, i, u);
          area(x, z, u.largura, h, e => { if (atingidos.has(e)) return; atingidos.add(e); causarDano(e, CLASSES.soldado.dano * u.dano, h); });
        });
      }
    } });
  }
  function noTriangulo(px, pz, a, b, c) {
    const s1 = (b[0] - a[0]) * (pz - a[1]) - (b[1] - a[1]) * (px - a[0]);
    const s2 = (c[0] - b[0]) * (pz - b[1]) - (c[1] - b[1]) * (px - b[0]);
    const s3 = (a[0] - c[0]) * (pz - c[1]) - (a[1] - c[1]) * (px - c[0]);
    return (s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0);
  }
  function ultMago(h, ang) {
    const u = CONFIG.ultimate.mago;
    h.travadoAte = E.t + 0.9;
    h.anim.tocar('habilidade3', { momento: 0.5, aoAcertar: () => {
      // triângulo com uma ponta no mago, abrindo para onde ele mirou
      const fx = Math.sin(ang), fz = Math.cos(ang), lx = Math.cos(ang), lz = -Math.sin(ang);
      const A = [h.x + fx * 0.6, h.z + fz * 0.6];
      const B = [h.x + fx * u.comprimento + lx * u.base / 2, h.z + fz * u.comprimento + lz * u.base / 2];
      const C = [h.x + fx * u.comprimento - lx * u.base / 2, h.z + fz * u.comprimento - lz * u.base / 2];
      const dentro = e => noTriangulo(e.x, e.z, A, B, C);
      const golpe = (mult, slowDur) => {
        E.entidades.forEach(e => {
          if (e.morto || !inimigos(e, h) || e === h || e.tipo === 'clone' || !dentro(e)) return;
          if (e.tipo === 'serpente' && !e.emerso) return;
          if (remoto(e) && !deMim(h)) return;
          causarDano(e, CLASSES.mago.dano * mult, h, { verdadeiro: true, semReacao: mult < 1 });
          controlar(e, { slow: [u.slow, slowDur] });
        });
      };
      golpe(u.dano, 2);                                         // explosão: 150% do dano como dano real + lentidão
      if (fxSkin(h).triangulo) {
        fxSkin(h).triangulo(h, A, B, C, u.dur);
        for (let k = 1; k <= u.dur / 0.5; k++) agendar(k * 0.5, () => golpe(0.25, 0.6));
        return;
      }
      const fogo = chaoTriangulo(A, B, C, tema(h).chama, u.dur);
      const tm = tema(h);
      const brasas = () => { for (let q = 0; q < 10; q++) { const r1 = Math.random(), r2 = Math.random(), w = r1 + r2 > 1 ? [1 - r1, 1 - r2] : [r1, r2];
        emitir(q % 2 ? 'faisca' : 'media', A[0] + (B[0] - A[0]) * w[0] + (C[0] - A[0]) * w[1], 0.2, A[1] + (B[1] - A[1]) * w[0] + (C[1] - A[1]) * w[1], { n: 1, cor: q % 2 ? tm.brasa : tm.chama, vel: 0.3, subida: 3, vida: 0.8 }); } };
      brasas();
      for (let k = 1; k <= u.dur / 0.5; k++) agendar(k * 0.5, () => golpe(0.25, 0.6));   // o chão continua queimando
      for (let k = 1; k <= u.dur / 0.15; k++) agendar(k * 0.15, brasas);
      for (let k = 0; k < 14; k++) {
        const r1 = Math.random(), r2 = Math.random(), q = r1 + r2 > 1 ? [1 - r1, 1 - r2] : [r1, r2];
        const x = A[0] + (B[0] - A[0]) * q[0] + (C[0] - A[0]) * q[1], z = A[1] + (B[1] - A[1]) * q[0] + (C[1] - A[1]) * q[1];
        labareda(x, z, tema(h).chama, 1.3 + Math.random() * 0.9, u.dur);
      }
      anelEfeito(h.x + fx * u.comprimento * 0.55, h.z + fz * u.comprimento * 0.55, u.base * 0.55, 0xc58bff, 0.5, true);
      return fogo;
    } });
  }
  // labareda em pé (shader de fogo); sem shader, usa a imagem do fogo
  // chamas subindo pela lâmina (mais fortes no golpe)
  function espadaEmChamas(e, golpe, dt) {
    e.fogoAcc = (e.fogoAcc || 0) + dt * (golpe ? 110 : 26);
    while (e.fogoAcc >= 1) {
      e.fogoAcc -= 1;
      const k = 0.15 + Math.random() * 0.85;
      const x = _rb.x + (_rp.x - _rb.x) * k, y = _rb.y + (_rp.y - _rb.y) * k, z = _rb.z + (_rp.z - _rb.z) * k;
      const cor = Math.random() < 0.35 ? 0xffc04d : Math.random() < 0.6 ? 0xff6a1a : 0xff3d00;
      emitir(Math.random() < (golpe ? 0.55 : 0.35) ? 'media' : 'faisca', x, y, z, { n: 1, cor, vel: golpe ? 0.6 : 0.25, subida: golpe ? 1.6 : 1.1, vida: golpe ? 0.4 : 0.5 });
    }
  }
  // espiral de fogo do Giro
  function espiralFogo(h, raio) {
    const t0 = E.t, dur = 0.7, bracos = 3;
    E.efeitos.push({ acc: 0, atualizar(dt) {
      const t = (E.t - t0) / dur; if (t > 1) return true;
      this.acc += dt * 90;
      while (this.acc >= 1) {
        this.acc -= 1;
        const b = Math.floor(Math.random() * bracos), r = 0.4 + (raio - 0.4) * t;
        const a = b / bracos * Math.PI * 2 + t * Math.PI * 3.2;
        const x = h.x + Math.cos(a) * r, z = h.z + Math.sin(a) * r;
        emitir(Math.random() < 0.55 ? (Math.random() < 0.3 ? 'grande' : 'media') : 'faisca', x, 0.3 + t * 1.2, z, { n: 1, cor: Math.random() < 0.5 ? 0xff6a1a : 0xffc04d, vel: 1.4, dir: [-Math.sin(a), Math.cos(a)], subida: 1.8, vida: 0.45 });
      }
    } });
    // as chamas acendem em volta seguindo o giro (cada uma mais longe, como uma espiral)
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2.4, r = raio * (0.45 + 0.5 * i / 9); agendar(i * 0.05, () => labareda(h.x + Math.cos(a) * r, h.z + Math.sin(a) * r, 0xff6a1a, 1.6 + i * 0.06, 0.7)); }
  }
  /* ======================= EFEITOS DAS SKINS ======================= */
  // Cada skin pode trocar pedaços dos efeitos da classe. Os ganchos ficam em FX_SKIN[id]:
  //   soldado: arma(e, golpe, dt) · giro(h, raio) · rastro(h, iv) · ult(h, x, z, i, u)
  //   suporte: cura(h) · escudo {cor, tex} · selo(h, raio, dur)
  //   mago:    chamas(h, x, z, dur) · ilusao(h, clone, dur) · clone(c, consumido, dt) · triangulo(h, A, B, C, dur)
  //   atirador: projetil(h, explode) · acerto(h, alvo, explode) · aceleracao(h, dur) · explosao(h, x, z) · saltoSai/saltoChega(h, x, z)
  //   todos:   projetil(h) → muda o visual do ataque básico
  const fxSkin = e => (e && FX_SKIN[e.skin]) || {};
  R.texSkin = R.texSkin || {};
  function texSkin(nome, w, hh, desenhar) {
    if (!R.texSkin[nome]) { R.texSkin[nome] = canvasTex(w, hh, desenhar); if (R.texSkin[nome].encoding !== undefined && THREE.LinearEncoding) R.texSkin[nome].encoding = THREE.sRGBEncoding; }
    return R.texSkin[nome];
  }
  const corCss = (c, a) => { const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255; return a === undefined ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a})`; };
  // ---- desenhos feitos à mão no canvas (nada de imagem externa) ----
  function glifo(g, k, s) {
    // hieróglifos simplificados: ankh, olho, pássaro, água, junco, cobra, sol, pena, braço, pilar
    g.beginPath();
    switch (k % 10) {
      case 0: g.ellipse(0, -s * 0.28, s * 0.16, s * 0.2, 0, 0, 7); g.moveTo(-s * 0.3, -s * 0.05); g.lineTo(s * 0.3, -s * 0.05); g.moveTo(0, -s * 0.08); g.lineTo(0, s * 0.45); break;
      case 1: g.moveTo(-s * 0.4, 0); g.quadraticCurveTo(0, -s * 0.3, s * 0.4, 0); g.quadraticCurveTo(0, s * 0.2, -s * 0.4, 0); g.moveTo(s * 0.06, -s * 0.02); g.arc(0, -s * 0.02, s * 0.06, 0, 7); g.moveTo(-s * 0.1, s * 0.12); g.quadraticCurveTo(-s * 0.15, s * 0.4, s * 0.05, s * 0.38); break;
      case 2: g.moveTo(-s * 0.3, s * 0.1); g.quadraticCurveTo(-s * 0.1, -s * 0.2, s * 0.15, -s * 0.15); g.lineTo(s * 0.32, -s * 0.22); g.moveTo(s * 0.15, -s * 0.15); g.quadraticCurveTo(s * 0.25, s * 0.1, -s * 0.3, s * 0.1); g.moveTo(-s * 0.05, s * 0.1); g.lineTo(-s * 0.1, s * 0.42); g.moveTo(s * 0.08, s * 0.1); g.lineTo(s * 0.08, s * 0.42); break;
      case 3: for (let i = 0; i < 2; i++) { const y = -s * 0.1 + i * s * 0.2; g.moveTo(-s * 0.4, y); for (let q = 0; q < 6; q++) g.lineTo(-s * 0.4 + (q + 1) * s * 0.133, y + (q % 2 ? -1 : 1) * s * 0.07); } break;
      case 4: g.moveTo(0, s * 0.45); g.quadraticCurveTo(-s * 0.2, 0, 0, -s * 0.45); g.quadraticCurveTo(s * 0.2, 0, 0, s * 0.45); g.moveTo(0, s * 0.45); g.lineTo(0, -s * 0.3); break;
      case 5: g.moveTo(-s * 0.35, s * 0.3); g.bezierCurveTo(-s * 0.35, -s * 0.1, s * 0.35, s * 0.2, s * 0.3, -s * 0.25); g.lineTo(s * 0.4, -s * 0.3); break;
      case 6: g.arc(0, 0, s * 0.3, 0, 7); g.moveTo(s * 0.07, 0); g.arc(0, 0, s * 0.07, 0, 7); break;
      case 7: g.moveTo(0, s * 0.45); g.quadraticCurveTo(-s * 0.22, -s * 0.1, s * 0.05, -s * 0.45); g.quadraticCurveTo(s * 0.2, -s * 0.05, 0, s * 0.45); g.moveTo(0, s * 0.4); g.lineTo(s * 0.03, -s * 0.35); break;
      case 8: g.moveTo(-s * 0.35, -s * 0.05); g.lineTo(s * 0.2, -s * 0.05); g.lineTo(s * 0.2, -s * 0.35); g.moveTo(-s * 0.35, s * 0.08); g.lineTo(s * 0.32, s * 0.08); g.lineTo(s * 0.32, -s * 0.35); break;
      default: g.moveTo(0, s * 0.45); g.lineTo(0, -s * 0.45); for (let i = 0; i < 4; i++) { const y = -s * 0.4 + i * s * 0.1; g.moveTo(-s * 0.2, y); g.lineTo(s * 0.2, y); }
    }
    g.stroke();
  }
  function caveira(g, s) {
    g.beginPath(); g.arc(0, -s * 0.1, s * 0.32, Math.PI * 0.85, Math.PI * 2.15); g.lineTo(s * 0.2, s * 0.32); g.lineTo(-s * 0.2, s * 0.32); g.closePath(); g.fill();
    g.save(); g.globalCompositeOperation = 'destination-out';
    g.beginPath(); g.ellipse(-s * 0.12, -s * 0.05, s * 0.08, s * 0.1, 0, 0, 7); g.ellipse(s * 0.12, -s * 0.05, s * 0.08, s * 0.1, 0, 0, 7); g.fill();
    g.beginPath(); g.moveTo(0, s * 0.06); g.lineTo(-s * 0.04, s * 0.15); g.lineTo(s * 0.04, s * 0.15); g.fill();
    for (let i = -2; i <= 2; i++) g.fillRect(i * s * 0.07 - s * 0.012, s * 0.22, s * 0.024, s * 0.1);
    g.restore();
  }
  function osso(g, s) {
    g.beginPath(); g.rect(-s * 0.32, -s * 0.05, s * 0.64, s * 0.1);
    [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([a, b]) => { g.moveTo(a * s * 0.36 + s * 0.07, b * s * 0.06); g.arc(a * s * 0.36, b * s * 0.06, s * 0.07, 0, 7); });
    g.fill();
  }
  const LINHAS_PY = ['def curar(aliados):', '    for a in aliados:', '        a.hp += 35', 'import vilkron as vk', 'escudo = vk.Escudo(4)', 'while vivo: pulsar()', 'if hp < 50: curar()', 'return True', 'print("online")', '0x1F 0xA3 0x7C 0xE0', 'class Nano(Robo):', 'self.energia = 100'];
  function trilhasCircuito(g, cx, cy, r0, r1, n, rnd) {
    for (let i = 0; i < n; i++) {
      let a = i / n * Math.PI * 2 + rnd() * 0.2, r = r0;
      let x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      g.beginPath(); g.moveTo(x, y);
      while (r < r1) {
        const passo = 14 + rnd() * 26; r = Math.min(r1, r + passo);
        if (rnd() < 0.35) a += (rnd() < 0.5 ? -1 : 1) * 0.12;
        x = cx + Math.cos(a) * r; y = cy + Math.sin(a) * r; g.lineTo(x, y);
      }
      g.stroke(); g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill();
      g.beginPath(); g.arc(cx + Math.cos(a) * (r0 + (r1 - r0) * 0.5), cy + Math.sin(a) * (r0 + (r1 - r0) * 0.5), 2.5, 0, 7); g.fill();
    }
  }
  const TX = {
    codigo: () => texSkin('codigo', 256, 256, g => {
      const grad = g.createRadialGradient(128, 128, 10, 128, 128, 124); grad.addColorStop(0, 'rgba(120,255,170,0.9)'); grad.addColorStop(0.55, 'rgba(40,220,110,0.45)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
      g.font = 'bold 15px monospace'; g.fillStyle = 'rgba(230,255,240,0.95)';
      LINHAS_PY.forEach((l, i) => g.fillText(l, 30 + (i % 3) * 4, 46 + i * 15));
    }),
    caveiras: () => texSkin('caveiras', 256, 256, g => {
      const grad = g.createRadialGradient(128, 128, 10, 128, 128, 124); grad.addColorStop(0, 'rgba(255,150,150,0.9)'); grad.addColorStop(0.55, 'rgba(220,30,30,0.45)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
      g.fillStyle = 'rgba(255,235,235,0.95)';
      [[128, 120, 70], [72, 150, 34], [184, 150, 34], [128, 196, 28]].forEach(([x, y, s]) => { g.save(); g.translate(x, y); caveira(g, s); g.restore(); });
    }),
    anelCircuito: () => texSkin('anelCircuito', 512, 512, g => {
      const rnd = semeado(31); g.strokeStyle = '#ffffff'; g.fillStyle = '#ffffff'; g.lineWidth = 3;
      g.beginPath(); g.arc(256, 256, 246, 0, 7); g.stroke(); g.lineWidth = 2; g.beginPath(); g.arc(256, 256, 214, 0, 7); g.stroke();
      trilhasCircuito(g, 256, 256, 150, 240, 26, rnd);
    }),
    anelOssos: () => texSkin('anelOssos', 512, 512, g => {
      g.fillStyle = '#ffffff'; g.strokeStyle = '#ffffff'; g.lineWidth = 3;
      g.beginPath(); g.arc(256, 256, 246, 0, 7); g.stroke();
      for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; g.save(); g.translate(256 + Math.cos(a) * 214, 256 + Math.sin(a) * 214); g.rotate(a + Math.PI / 2); if (i % 2) osso(g, 46); else caveira(g, 34); g.restore(); }
    }),
    escudoCircuito: () => texSkin('escudoCircuito', 256, 256, g => {
      const rnd = semeado(7); g.strokeStyle = '#ffffff'; g.fillStyle = '#ffffff'; g.lineWidth = 2;
      for (let i = 0; i < 40; i++) { let x = rnd() * 256, y = rnd() * 256; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 4; k++) { if (k % 2) x += (rnd() - 0.5) * 70; else y += (rnd() - 0.5) * 70; g.lineTo(x, y); } g.stroke(); g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); }
    }),
    escudoCaveiras: () => texSkin('escudoCaveiras', 256, 256, g => {
      g.fillStyle = '#ffffff';
      for (let i = 0; i < 12; i++) { g.save(); g.translate((i % 4) * 64 + 32 + (Math.floor(i / 4) % 2) * 20, Math.floor(i / 4) * 85 + 42); caveira(g, 40); g.restore(); }
    }),
    seloCircuito: () => texSkin('seloCircuito', 512, 512, g => {
      const rnd = semeado(53); g.strokeStyle = '#ffffff'; g.fillStyle = '#ffffff'; g.lineWidth = 3;
      trilhasCircuito(g, 256, 256, 30, 225, 22, rnd);
      g.lineWidth = 3; g.beginPath(); g.arc(256, 256, 250, 0, 7); g.stroke();
      g.font = 'bold 13px monospace'; const txt = LINHAS_PY.join('  ·  ') + '  ·  ';
      for (let i = 0; i < txt.length && i < 150; i++) { const a = i / 150 * Math.PI * 2; g.save(); g.translate(256 + Math.cos(a) * 238, 256 + Math.sin(a) * 238); g.rotate(a + Math.PI / 2); g.fillText(txt[i], -3, 4); g.restore(); }
    }),
    seloCaveiras: () => texSkin('seloCaveiras', 512, 512, g => {
      g.fillStyle = '#ffffff'; g.strokeStyle = '#ffffff'; g.lineWidth = 3;
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; [70, 130, 185].forEach((r, k) => { g.save(); g.translate(256 + Math.cos(a) * r, 256 + Math.sin(a) * r); g.rotate(a + Math.PI / 2); caveira(g, 26 + k * 8); g.restore(); }); }
      g.beginPath(); g.arc(256, 256, 250, 0, 7); g.stroke();
      for (let i = 0; i < 22; i++) { const a = i / 22 * Math.PI * 2; g.save(); g.translate(256 + Math.cos(a) * 232, 256 + Math.sin(a) * 232); g.rotate(a); osso(g, 34); g.restore(); }
    }),
    hieroAnel: () => texSkin('hieroAnel', 512, 512, g => {
      g.strokeStyle = '#ffffff'; g.lineWidth = 4; g.lineCap = 'round';
      g.beginPath(); g.arc(256, 256, 248, 0, 7); g.stroke(); g.beginPath(); g.arc(256, 256, 186, 0, 7); g.stroke();
      for (let i = 0; i < 20; i++) { const a = i / 20 * Math.PI * 2; g.save(); g.translate(256 + Math.cos(a) * 217, 256 + Math.sin(a) * 217); g.rotate(a + Math.PI / 2); glifo(g, i * 3, 44); g.restore(); }
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2 + 0.2; g.save(); g.translate(256 + Math.cos(a) * 140, 256 + Math.sin(a) * 140); g.rotate(a + Math.PI / 2); glifo(g, i * 7 + 1, 38); g.restore(); }
      for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; g.save(); g.translate(256 + Math.cos(a) * 70, 256 + Math.sin(a) * 70); g.rotate(a + Math.PI / 2); glifo(g, i * 2, 40); g.restore(); }
    }),
    hieroTri: () => texSkin('hieroTri', 512, 512, g => {
      g.strokeStyle = '#ffffff'; g.lineWidth = 4; g.lineCap = 'round';
      g.beginPath(); g.moveTo(256, 8); g.lineTo(506, 504); g.lineTo(6, 504); g.closePath(); g.stroke();
      g.save(); g.beginPath(); g.moveTo(256, 30); g.lineTo(486, 494); g.lineTo(26, 494); g.closePath(); g.clip();
      let k = 0; for (let y = 60; y < 500; y += 48) for (let x = 24; x < 500; x += 44) { g.save(); g.translate(x + ((y / 48) % 2) * 20, y); glifo(g, k++ * 7, 34); g.restore(); }
      g.restore();
    }),
    glifo: k => texSkin('glifo' + (k % 10), 64, 64, g => { g.strokeStyle = '#ffffff'; g.lineWidth = 6; g.lineCap = 'round'; g.translate(32, 32); glifo(g, k, 52); }),
    raiz: () => texSkin('raiz2', 128, 256, g => {
      // raiz grossa de verdade: corpo afinando, casca com sombreado, galhos que se enrolam e musgo brilhando nas pontas
      const rnd = semeado(23);
      const corpo = (pts, w0, w1) => {
        const esq = [], dir = [];
        pts.forEach((p, i) => {
          const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
          let tx = b[0] - a[0], ty = b[1] - a[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
          const w = (w0 + (w1 - w0) * i / (pts.length - 1)) / 2;
          esq.push([p[0] - ty * w, p[1] + tx * w]); dir.push([p[0] + ty * w, p[1] - tx * w]);
        });
        g.beginPath(); esq.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); dir.reverse().forEach(p => g.lineTo(p[0], p[1])); g.closePath();
        const gr = g.createLinearGradient(30, 0, 98, 0); gr.addColorStop(0, '#1e130a'); gr.addColorStop(0.45, '#6b4527'); gr.addColorStop(0.6, '#4a2f1a'); gr.addColorStop(1, '#170e07');
        g.fillStyle = gr; g.fill();
        g.strokeStyle = 'rgba(20,12,6,0.9)'; g.lineWidth = 1.5; g.stroke();
        // veios da casca
        g.strokeStyle = 'rgba(150,110,70,0.35)'; g.lineWidth = 1;
        for (let k = 0; k < 3; k++) { g.beginPath(); pts.forEach((p, i) => { const off = (k - 1) * (w0 + (w1 - w0) * i / (pts.length - 1)) * 0.22; i ? g.lineTo(p[0] + off, p[1]) : g.moveTo(p[0] + off, p[1]); }); g.stroke(); }
        return pts[pts.length - 1];
      };
      const caminho = (x, y, ang, len, curva, n) => { const pts = []; for (let i = 0; i <= n; i++) { const t = i / n, a = ang + curva * t * t; pts.push([x, y]); x += Math.sin(a) * len / n; y -= Math.cos(a) * len / n; } return pts; };
      const pontas = [];
      const tronco = caminho(64, 258, 0.05, 220, -0.5, 18);
      // galhos saindo do tronco
      [[0.35, -1.1, 70, 1.4], [0.5, 1.0, 64, -1.6], [0.68, -0.8, 50, 1.8], [0.8, 0.9, 40, -1.5]].forEach(([t, ang, len, curva]) => {
        const p = tronco[Math.round(t * (tronco.length - 1))]; const pts = caminho(p[0], p[1], ang, len, curva, 10);
        pontas.push(corpo(pts, 14 - t * 8, 2));
      });
      pontas.push(corpo(tronco, 30, 4));
      // musgo e folhinhas brilhando nas pontas
      pontas.forEach(([x, y]) => {
        g.save(); g.shadowColor = '#66ff88'; g.shadowBlur = 14; g.fillStyle = 'rgba(110,255,140,0.9)';
        for (let k = 0; k < 3; k++) { g.beginPath(); g.ellipse(x + (rnd() - 0.5) * 10, y + (rnd() - 0.5) * 8, 5, 2.6, rnd() * 3, 0, 7); g.fill(); }
        g.restore();
      });
      g.save(); g.shadowColor = '#4dff7a'; g.shadowBlur = 10; g.fillStyle = 'rgba(70,200,90,0.75)';
      for (let k = 0; k < 9; k++) { const p = tronco[3 + Math.floor(rnd() * 12)]; g.beginPath(); g.ellipse(p[0] + (rnd() - 0.5) * 18, p[1], 4, 2, rnd() * 3, 0, 7); g.fill(); }
      g.restore();
    }),
    raio: () => texSkin('raio', 128, 512, g => {
      const rnd = semeado(99), pts = [[64, 0]];
      for (let y = 30; y <= 512; y += 30) pts.push([64 + (rnd() - 0.5) * 60, y]);
      const traco = (w, cor, blur) => { g.lineWidth = w; g.strokeStyle = cor; g.shadowColor = '#5ab8ff'; g.shadowBlur = blur; g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.stroke(); };
      traco(14, 'rgba(60,150,255,0.6)', 20); traco(6, '#bfe6ff', 10); traco(2.5, '#ffffff', 0);
      g.lineWidth = 3; g.strokeStyle = '#9fd6ff'; [4, 9, 13].forEach(i => { const [x, y] = pts[i]; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 70, y + 40); g.lineTo(x + (rnd() - 0.5) * 90, y + 70); g.stroke(); });
    }),
    arco: () => texSkin('arco', 128, 64, g => {
      const rnd = semeado(5); g.lineCap = 'round';
      [[10, 'rgba(60,150,255,0.5)'], [4, '#bfe6ff'], [1.5, '#ffffff']].forEach(([w, c]) => { const r2 = semeado(5); g.lineWidth = w; g.strokeStyle = c; g.beginPath(); g.moveTo(4, 32); for (let x = 16; x <= 124; x += 12) g.lineTo(x, 32 + (r2() - 0.5) * 40); g.stroke(); });
    }),
    racha: cor => texSkin('racha' + cor, 512, 512, g => {
      const rnd = semeado(cor & 255), ramo = (x, y, a, len, larg, p) => {
        const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
        g.lineWidth = larg; g.beginPath(); g.moveTo(x, y); g.lineTo((x + x2) / 2 + (rnd() - 0.5) * 18, (y + y2) / 2 + (rnd() - 0.5) * 18); g.lineTo(x2, y2); g.stroke();
        if (p < 3 && rnd() < 0.85) { ramo(x2, y2, a + (rnd() - 0.5) * 1.1, len * 0.7, larg * 0.7, p + 1); if (rnd() < 0.5) ramo(x2, y2, a + (rnd() - 0.5) * 1.6, len * 0.55, larg * 0.6, p + 1); }
      };
      g.lineCap = 'round';
      const desenhar = (w, est, blur) => { g.strokeStyle = est; g.shadowColor = corCss(cor); g.shadowBlur = blur; const r0 = rnd; for (let i = 0; i < 9; i++) ramo(256, 256, i / 9 * Math.PI * 2 + rnd() * 0.4, 60 + rnd() * 50, w, 0); };
      desenhar(16, 'rgba(10,8,6,0.95)', 0);
      const r2 = semeado(cor & 255); const salvo = rnd;
      g.globalCompositeOperation = 'lighter';
      // segunda passada com a mesma semente: o brilho fica dentro das rachaduras
      const rnd2 = semeado(cor & 255), ramo2 = (x, y, a, len, larg, p) => {
        const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
        g.lineWidth = larg; g.beginPath(); g.moveTo(x, y); g.lineTo((x + x2) / 2 + (rnd2() - 0.5) * 18, (y + y2) / 2 + (rnd2() - 0.5) * 18); g.lineTo(x2, y2); g.stroke();
        if (p < 3 && rnd2() < 0.85) { ramo2(x2, y2, a + (rnd2() - 0.5) * 1.1, len * 0.7, larg * 0.7, p + 1); if (rnd2() < 0.5) ramo2(x2, y2, a + (rnd2() - 0.5) * 1.6, len * 0.55, larg * 0.6, p + 1); }
      };
      g.strokeStyle = corCss(cor); g.shadowColor = corCss(cor); g.shadowBlur = 16;
      for (let i = 0; i < 9; i++) ramo2(256, 256, i / 9 * Math.PI * 2 + rnd2() * 0.4, 60 + rnd2() * 50, 6, 0);
    }),
    espiral: cor => texSkin('espiral' + cor, 512, 512, g => {
      g.lineCap = 'round';
      const volta = (w, est, blur) => { g.lineWidth = w; g.strokeStyle = est; g.shadowColor = corCss(cor); g.shadowBlur = blur;
        for (let b = 0; b < 3; b++) { g.beginPath(); for (let t = 0; t <= 1; t += 0.01) { const a = b / 3 * Math.PI * 2 + t * Math.PI * 3, r = 20 + t * 225, j = Math.sin(t * 60 + b) * 4; const x = 256 + Math.cos(a) * (r + j), y = 256 + Math.sin(a) * (r + j); t ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); } };
      volta(22, 'rgba(12,8,6,0.95)', 0); g.globalCompositeOperation = 'lighter'; volta(8, corCss(cor), 18);
    }),
    cratera: () => texSkin('cratera', 256, 256, g => {
      const grad = g.createRadialGradient(128, 128, 8, 128, 128, 124);
      grad.addColorStop(0, 'rgba(255,220,120,1)'); grad.addColorStop(0.3, 'rgba(255,90,10,0.95)'); grad.addColorStop(0.55, 'rgba(120,20,0,0.95)'); grad.addColorStop(0.75, 'rgba(25,18,14,0.95)'); grad.addColorStop(1, 'rgba(25,18,14,0)');
      g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
    }),
    tinta: () => texSkin('tinta', 128, 128, g => {
      const rnd = semeado(11); g.fillStyle = '#ffffff';
      g.beginPath(); g.arc(64, 64, 30, 0, 7); g.fill();
      for (let i = 0; i < 11; i++) { const a = rnd() * 6.28, d = 30 + rnd() * 26, r = 4 + rnd() * 10; g.beginPath(); g.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, r, 0, 7); g.fill(); g.lineWidth = r * 0.9; g.strokeStyle = '#fff'; g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + Math.cos(a) * d, 64 + Math.sin(a) * d); g.stroke(); }
    }),
    pegada: () => texSkin('pegada', 128, 128, g => {
      g.fillStyle = '#ffffff';
      g.beginPath(); g.ellipse(64, 80, 26, 22, 0, 0, 7); g.fill();
      [[-26, -18], [-9, -34], [9, -34], [26, -18]].forEach(([x, y]) => { g.beginPath(); g.ellipse(64 + x, 80 + y, 9, 12, x * 0.02, 0, 7); g.fill(); });
    }),
    lampada: () => texSkin('lampada', 128, 128, g => {
      g.strokeStyle = '#ffe14d'; g.lineWidth = 5; g.lineCap = 'round';
      for (let i = 0; i < 8; i++) { const a = -Math.PI / 2 + (i - 3.5) * 0.4; g.beginPath(); g.moveTo(64 + Math.cos(a) * 44, 52 + Math.sin(a) * 44); g.lineTo(64 + Math.cos(a) * 58, 52 + Math.sin(a) * 58); g.stroke(); }
      g.fillStyle = '#fff3a0'; g.beginPath(); g.arc(64, 52, 30, 0, 7); g.fill();
      g.fillStyle = '#ffd21a'; g.beginPath(); g.arc(64, 52, 22, 0, 7); g.fill();
      g.fillStyle = '#9a9aa0'; g.fillRect(50, 80, 28, 8); g.fillRect(52, 90, 24, 6); g.fillRect(56, 98, 16, 6);
    }),
    orbeNegra: () => texSkin('orbeNegra', 128, 128, g => {
      const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
      grad.addColorStop(0, 'rgba(0,0,0,1)'); grad.addColorStop(0.55, 'rgba(8,0,4,1)'); grad.addColorStop(0.68, 'rgba(255,40,40,1)'); grad.addColorStop(0.8, 'rgba(200,0,0,0.6)'); grad.addColorStop(1, 'rgba(120,0,0,0)');
      g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
    }),
    orbeNoite: () => texSkin('orbeNoite', 128, 128, g => {
      const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
      grad.addColorStop(0, 'rgba(0,0,6,1)'); grad.addColorStop(0.55, 'rgba(4,4,14,1)'); grad.addColorStop(0.68, 'rgba(60,170,255,1)'); grad.addColorStop(0.82, 'rgba(30,110,255,0.55)'); grad.addColorStop(1, 'rgba(0,60,255,0)');
      g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
    }),
    bola: () => texSkin('bola', 64, 64, g => {
      const grad = g.createRadialGradient(24, 22, 2, 32, 32, 30); grad.addColorStop(0, '#ffffff'); grad.addColorStop(0.35, 'rgba(255,255,255,0.95)'); grad.addColorStop(0.9, 'rgba(200,200,200,1)'); grad.addColorStop(1, 'rgba(200,200,200,0)');
      g.fillStyle = grad; g.beginPath(); g.arc(32, 32, 30, 0, 7); g.fill();
    })
  };
  // ---- peças reaproveitáveis ----
  // decalque no chão: textura transparente que aparece, (gira) e some
  function decalque(tex, x, z, r, cor, dur, o) {
    o = o || {};
    const mat = new THREE.MeshBasicMaterial({ map: tex, color: cor, transparent: true, opacity: 0, depthWrite: false, blending: o.normal ? THREE.NormalBlending : THREE.AdditiveBlending, side: THREE.DoubleSide });
    const m = camada(new THREE.PlaneGeometry(r * 2, r * 2), mat, x, z, o.y || 0.1);
    m.renderOrder = o.ordem || 7; m.rotation.z = o.rot !== undefined ? o.rot : Math.random() * 6.28;
    const op = o.opacidade || 1;
    E.efeitos.push({ t: 0, atualizar(dt) {
      this.t += dt; const k = this.t / dur;
      const entra = Math.min(1, this.t / (o.entra || 0.15)), sai = o.devagar ? 1 - k : Math.min(1, (dur - this.t) / (o.sai || 0.4));
      const pisca = o.pisca ? 0.75 + 0.25 * Math.sin(this.t * 17 + Math.sin(this.t * 7) * 2) : 1;
      mat.opacity = op * Math.max(0, Math.min(entra, sai)) * pisca;
      if (o.gira) m.rotation.z += dt * o.gira;
      if (o.cresce) m.scale.setScalar(o.cresce[0] + (o.cresce[1] - o.cresce[0]) * Math.min(1, this.t / (o.cresceEm || dur)));
      if (o.seguir) m.position.set(o.seguir.x, m.position.y, o.seguir.z);
      if (k >= 1 || (o.seguir && o.seguir.morto)) { E.mundo.remove(m); return true; }
    } });
    return m;
  }
  // figura em pé virada para a câmera (clarão, raio, lâmpada, marca de tinta)
  function figura(tex, x, y, z, tam, cor, dur, o) {
    o = o || {};
    const mat = new THREE.SpriteMaterial({ map: tex, color: cor, transparent: true, depthWrite: false, opacity: 0, blending: o.normal ? THREE.NormalBlending : THREE.AdditiveBlending });
    const s = new THREE.Sprite(mat); s.scale.set(tam * (o.largura || 1), tam, 1); s.position.set(x, y, z); s.renderOrder = o.ordem || 12;
    if (o.base && s.center) s.center.set(0.5, 0);
    E.mundo.add(s);
    const op = o.opacidade || 1;
    E.efeitos.push({ t: 0, atualizar(dt) {
      this.t += dt; const k = this.t / dur;
      const entra = Math.min(1, this.t / (o.entra || 0.08)), sai = o.devagar ? 1 - k : Math.min(1, (dur - this.t) / (o.sai || 0.25));
      mat.opacity = op * Math.max(0, Math.min(entra, sai));
      if (o.seguir) s.position.set(o.seguir.x + (o.dx || 0), (o.seguirY !== undefined ? o.seguirY : y) - (o.seguir.afundado || 0), o.seguir.z + (o.dz || 0));
      if (o.sobe) s.position.y += o.sobe * dt;
      if (o.cresce) { const c = o.cresce[0] + (o.cresce[1] - o.cresce[0]) * Math.min(1, this.t / (o.cresceEm || dur)); s.scale.set(tam * (o.largura || 1) * c, tam * c, 1); }
      if (o.altura) { const h = o.altura(this.t, dur); s.scale.set(tam * (o.largura || 1), tam * Math.max(0.001, h), 1); }
      if (k >= 1 || (o.seguir && o.seguir.morto)) { E.mundo.remove(s); return true; }
    } });
    return s;
  }
  // raiz saindo do chão: sobe rápido, fica, e afunda (devagar = afunda durante toda a duração)
  function raizSobe(x, z, alt, dur, devagar) {
    const sobe = 0.18;
    particulas(x, z, { n: Math.round(2 + alt * 2), cor: 0x3a2a1a, tam: 0.35 + alt * 0.12, cresce: 1.6, velH: 1.6 + alt * 0.5, velV: 2 + alt, gravidade: 9, vida: 0.55, opacidade: 0.9, y: 0.1 });
    decalque(TX.racha(0x3fdc5a), x, z, 0.35 + alt * 0.25, 0xffffff, dur, { normal: true, entra: 0.05, devagar: !!devagar, opacidade: 0.9 });
    emitir('faisca', x, 0.15, z, { n: 3, cor: 0x7dff9a, vel: 0.8, subida: 1.6, vida: 0.5 });
    figura(TX.raiz(), x, 0, z, alt, 0xffffff, dur, { normal: true, base: true, largura: 0.55, opacidade: 1, entra: 0.05, sai: 0.3, ordem: 11,
      altura: (t, d) => t < sobe ? t / sobe : devagar ? 1 - (t - sobe) / (d - sobe) * 0.95 : (t > d - 0.4 ? (d - t) / 0.4 : 1) });
  }
  // raio caindo do céu
  function raioCeu(x, z, cor) {
    figura(TX.raio(), x, 0, z, 13, cor || 0xffffff, 0.32, { base: true, largura: 0.28, entra: 0.02, sai: 0.18, ordem: 13 });
    figura(R.brilhoTex || TX.bola(), x, 0.6, z, 3.2, 0x7fc8ff, 0.3, { sai: 0.25 });
    emitir('faisca', x, 0.3, z, { n: 16, cor: 0x9fd6ff, vel: 5, subida: 3, grav: 10, vida: 0.4 });
    anelEfeito(x, z, 1.6, 0x4fb8ff, 0.35, true);
    decalque(TX.racha(0x2a7bff), x, z, 1.1, 0xffffff, 1.6, { normal: true, opacidade: 0.85 });
  }
  // chama negra com borda azul neon (núcleo escuro de fumaça + chama azul por fora)
  function chamaNegra(x, z, alt, dur, devagar) {
    labareda(x, z, 0x1650d8, alt * 1.12, dur, devagar);
    const fim = E.t + dur;
    E.efeitos.push({ acc: 0, atualizar(dt) {
      if (E.t > fim) return true;
      const resta = devagar ? Math.max(0.15, (fim - E.t) / dur) : 1;
      this.acc += dt * 16;
      while (this.acc >= 1) { this.acc -= 1; particulas(x + (Math.random() - 0.5) * 0.3, z + 0.05, { n: 1, cor: 0x020205, tam: 0.62 * (0.6 + resta * 0.4), cresce: 1.3, velH: 0.12, velV: 2.4 * resta * alt / 1.6, gravidade: -0.3, vida: 0.5, opacidade: 0.95, y: 0.1 }); }
    } });
  }
  // vulto negro do próprio herói (pose congelada no instante)
  function vulto(h, dur) {
    if (!THREE.SkeletonUtils || !THREE.SkeletonUtils.clone || !h.obj) return;
    let c; try { c = THREE.SkeletonUtils.clone(h.obj); } catch (e) { return; }
    const mat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6, depthWrite: false });
    c.traverse(n => { if (n.isMesh) { n.material = mat; n.renderOrder = 9; } if (n.name && /^arma_/.test(n.name)) n.visible = true; });
    c.position.set(h.x, -(h.afundado || 0), h.z); c.rotation.y = h.rot; E.mundo.add(c);
    E.efeitos.push({ t: 0, atualizar(dt) { this.t += dt; mat.opacity = 0.6 * (1 - this.t / dur); if (this.t >= dur) { E.mundo.remove(c); return true; } } });
  }
  // pontos ao longo da lâmina (_rb → _rp), para quem tem arma
  function pontoLamina(k) { return [_rb.x + (_rp.x - _rb.x) * k, _rb.y + (_rp.y - _rb.y) * k, _rb.z + (_rp.z - _rb.z) * k]; }
  // espaçamento do rastro da investida
  function passoRastro(h, iv, d) { if (iv.fxX !== undefined && Math.hypot(h.x - iv.fxX, h.z - iv.fxZ) < d) return false; iv.fxX = h.x; iv.fxZ = h.z; return true; }
  const atras = (h, iv, m) => [h.x - Math.sin(iv.ang) * m, h.z - Math.cos(iv.ang) * m];

  const FX_SKIN = {
    // ---------------- SOLDADO ----------------
    lava: {
      arma: (e, golpe, dt) => espadaEmChamas(e, golpe, dt),
      giro: (h, r) => espiralFogo(h, r),
      rastro: (h, iv) => { if (!passoRastro(h, iv, 0.8)) return; const [x, z] = atras(h, iv, 0.5); labareda(x, z, 0xff5a14, 1.1 + Math.random() * 0.4, 3.2, true); },
      ult: (h, x, z, i, u) => {
        labareda(x, z, 0xff4a10, 2.2 + Math.random() * 0.8, 1.1);
        agendar(0.08, () => labareda(x + (Math.random() - 0.5) * u.largura, z + (Math.random() - 0.5) * u.largura, 0xff8a2a, 1.4, 0.9));
        emitir('grande', x, 0.4, z, { n: 3, cor: 0xff3d00, vel: 0.8, subida: 4, vida: 0.6 });
      }
    },
    cacadora: {
      arma: (e, golpe, dt) => {
        e.fxAcc = (e.fxAcc || 0) + dt * (golpe ? 70 : 18);
        while (e.fxAcc >= 1) { e.fxAcc -= 1; const [x, y, z] = pontoLamina(0.15 + Math.random() * 0.85);
          emitir(Math.random() < 0.5 ? 'media' : 'faisca', x, y, z, { n: 1, cor: Math.random() < 0.5 ? 0x4dff7a : 0x1fbf4f, vel: golpe ? 0.5 : 0.2, subida: 0.7, vida: golpe ? 0.4 : 0.6 }); }
      },
      giro: (h, r) => {
        for (let i = 0; i < 14; i++) { const t = i / 13, a = t * Math.PI * 3.4, rr = 0.7 + (r - 0.7) * t;
          agendar(i * 0.035, () => { raizSobe(h.x + Math.cos(a) * rr, h.z + Math.sin(a) * rr, 0.8 + t * 0.7, 1.1); emitir('faisca', h.x + Math.cos(a) * rr, 0.3, h.z + Math.sin(a) * rr, { n: 4, cor: 0x5aff8c, vel: 1, subida: 2, vida: 0.5 }); }); }
      },
      rastro: (h, iv) => { if (!passoRastro(h, iv, 0.75)) return; const [x, z] = atras(h, iv, 0.5); raizSobe(x + (Math.random() - 0.5) * 0.6, z + (Math.random() - 0.5) * 0.6, 0.9 + Math.random() * 0.4, 3, true); },
      ult: (h, x, z) => {
        for (let k = 0; k < 3; k++) raizSobe(x + (Math.random() - 0.5) * 1.4, z + (Math.random() - 0.5) * 1.4, 2 + Math.random() * 1.2, 1.5);
        emitir('media', x, 0.4, z, { n: 8, cor: 0x4dff7a, vel: 1.5, subida: 3, vida: 0.6 });
        particulas(x, z, { n: 3, cor: 0x4a3a22, tam: 0.8, cresce: 2, velH: 2, velV: 1.4, gravidade: 3, vida: 0.7, opacidade: 0.7 });
      }
    },
    vilkronomita: {
      arma: (e, golpe, dt) => {
        e.fxAcc = (e.fxAcc || 0) + dt * (golpe ? 55 : 12);
        while (e.fxAcc >= 1) { e.fxAcc -= 1; const [x, y, z] = pontoLamina(0.55 + Math.random() * 0.45);
          emitir('faisca', x, y, z, { n: 1, cor: Math.random() < 0.4 ? 0xffffff : 0x5ab8ff, vel: golpe ? 2.2 : 1.2, subida: 0.4, grav: 4, vida: 0.22 }); }
        if (Math.random() < dt * (golpe ? 9 : 2.5)) { const [x, y, z] = pontoLamina(0.6 + Math.random() * 0.4); figura(TX.arco(), x, y, z, 0.35, 0xffffff, 0.09, { largura: 2, entra: 0.01, sai: 0.06 }); }
      },
      giro: (h, r) => {
        for (let i = 0; i < 16; i++) { const t = i / 15, a = t * Math.PI * 3.6, rr = 0.6 + (r - 0.6) * t;
          agendar(i * 0.03, () => { const x = h.x + Math.cos(a) * rr, z = h.z + Math.sin(a) * rr; figura(TX.arco(), x, 0.9, z, 1.3, 0xffffff, 0.2, { largura: 2, entra: 0.01, sai: 0.12 }); emitir('faisca', x, 0.9, z, { n: 6, cor: 0x9fd6ff, vel: 2.5, vida: 0.3 }); }); }
        anelEfeito(h.x, h.z, r, 0x4fb8ff, 0.4, true);
      },
      rastro: (h, iv) => {
        if (!passoRastro(h, iv, 0.7)) return; const [x, z] = atras(h, iv, 0.4);
        decalque(TX.racha(0x2a7bff), x, z, 0.9, 0xffffff, 3, { normal: true, devagar: true, opacidade: 0.9 });
        const fim = E.t + 2.4; E.efeitos.push({ atualizar(dt) { if (Math.random() < dt * 5) { emitir('faisca', x + (Math.random() - 0.5), 0.15, z + (Math.random() - 0.5), { n: 2, cor: 0x9fd6ff, vel: 1.5, subida: 1, grav: 6, vida: 0.25 }); if (Math.random() < 0.4) figura(TX.arco(), x + (Math.random() - 0.5) * 0.6, 0.2, z, 0.3, 0xffffff, 0.08, { largura: 2 }); } return E.t > fim; } });
      },
      ult: (h, x, z) => raioCeu(x, z)
    },
    viking: {
      arma: (e, golpe, dt) => {
        e.fxAcc = (e.fxAcc || 0) + dt * (golpe ? 60 : 14);
        while (e.fxAcc >= 1) { e.fxAcc -= 1; const [x, y, z] = pontoLamina(0.15 + Math.random() * 0.85);
          emitir(Math.random() < 0.65 ? 'media' : 'grande', x, y, z, { n: 1, cor: Math.random() < 0.5 ? 0x39ff14 : 0x1a9a20, vel: 0.25, subida: 0.5, vida: golpe ? 0.5 : 0.8 }); }
      },
      giro: (h, r) => { decalque(TX.espiral(0x39ff14), h.x, h.z, r, 0xffffff, 1.8, { normal: true, entra: 0.25, cresce: [0.3, 1], cresceEm: 0.35 }); emitir('media', h.x, 0.3, h.z, { n: 18, cor: 0x39ff14, vel: 0.4, subida: 1.5, vida: 0.8, raio: r }); },
      rastro: (h, iv) => { if (!passoRastro(h, iv, 0.8)) return; const [x, z] = atras(h, iv, 0.4); decalque(TX.racha(0x39ff14), x, z, 1.1, 0xffffff, 3.2, { normal: true, devagar: true }); emitir('media', x, 0.2, z, { n: 3, cor: 0x39ff14, vel: 0.2, subida: 0.8, vida: 0.8 }); },
      ult: (h, x, z, i, u) => { decalque(TX.racha(0x39ff14), x, z, u.largura * 1.1, 0xffffff, 2.6, { normal: true, entra: 0.08 }); emitir('media', x, 0.3, z, { n: 6, cor: 0x39ff14, vel: 0.6, subida: 2, vida: 0.7 }); }
    },
    samurai: {
      semRastro: true,
      arma: (e, golpe, dt) => {
        if (!golpe) return;
        e.fxAcc = (e.fxAcc || 0) + dt * 30;
        while (e.fxAcc >= 1) { e.fxAcc -= 1; const [x, y, z] = pontoLamina(0.3 + Math.random() * 0.7);
          particulas(x, z, { n: 1, cor: 0x0a0a0a, tam: 0.35, cresce: 2.2, velH: 0.1, velV: 0.3, gravidade: -0.4, vida: 0.6, opacidade: 0.7, y }); }
      },
      giro: (h, r) => {
        decalque(TX.espiral(0xff5a10), h.x, h.z, r, 0xffffff, 2.2, { normal: true, entra: 0.2, cresce: [0.3, 1], cresceEm: 0.3 });
        discoEfeito(h.x, h.z, r * 0.45, 0xff5a10, 1.6);
        for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; agendar(i * 0.03, () => particulas(h.x + Math.cos(a) * 1.4, h.z + Math.sin(a) * 1.4, { n: 2, cor: 0x0a0a0a, tam: 0.6, cresce: 2.4, velH: 0.6, velV: 0.8, gravidade: -0.3, vida: 0.9, opacidade: 0.75, y: 1 })); }
      },
      rastro: (h, iv) => {
        if (!passoRastro(h, iv, 0.9)) return; vulto(h, 0.6);
        const [x, z] = atras(h, iv, 0.3); decalque(TX.racha(0xff5a10), x, z, 1, 0xffffff, 2.8, { normal: true, devagar: true });
      },
      ult: (h, x, z, i, u) => {
        decalque(TX.cratera(), x, z, u.largura * 0.75, 0xffffff, 2.8, { normal: true, entra: 0.1 });
        decalque(TX.racha(0xff5a10), x, z, u.largura * 1.1, 0xffffff, 2.8, { normal: true, entra: 0.1 });
        for (let k = 0; k < 3; k++) agendar(0.1 + k * 0.25, () => particulas(x, z, { n: 3, cor: 0x0a0a0a, tam: 0.8, cresce: 2.6, velH: 0.5, velV: 1.6, gravidade: -0.3, vida: 1.2, opacidade: 0.75, y: 0.3, raio: 0.5 }));
        emitir('faisca', x, 0.3, z, { n: 8, cor: 0xffa040, vel: 2, subida: 3, grav: 8, vida: 0.5 });
      }
    },
    // ---------------- SUPORTE ----------------
    ciber: {
      cura: h => {
        figura(TX.codigo(), h.x, 2.6, h.z, 2.6, 0xffffff, 1.0, { seguir: h, seguirY: 2.6, cresce: [0.6, 1.1], cresceEm: 0.3 });
        decalque(TX.anelCircuito(), h.x, h.z, 7, 0x39ff88, 0.9, { cresce: [0.15, 1], cresceEm: 0.5, gira: 0.8 });
      },
      escudo: { cor: 0x9dffc4, tex: () => TX.escudoCircuito() },
      selo: (h, r, dur) => decalque(TX.seloCircuito(), h.x, h.z, r, 0x39ff88, dur, { cresce: [0.12, 1], cresceEm: 0.45, gira: 1.4 })
    },
    medicina: {
      cura: h => {
        figura(TX.caveiras(), h.x, 2.6, h.z, 2.6, 0xffffff, 1.0, { seguir: h, seguirY: 2.6, cresce: [0.6, 1.1], cresceEm: 0.3 });
        decalque(TX.anelOssos(), h.x, h.z, 7, 0xff3030, 0.9, { cresce: [0.15, 1], cresceEm: 0.5, gira: 0.8 });
      },
      escudo: { cor: 0xff4a4a, tex: () => TX.escudoCaveiras() },
      selo: (h, r, dur) => decalque(TX.seloCaveiras(), h.x, h.z, r, 0xff2a2a, dur, { cresce: [0.12, 1], cresceEm: 0.45, gira: 1.4 })
    },
    // ---------------- MAGO ----------------
    anubis: {
      chamas: (h, x, z, dur) => {
        decalque(TX.hieroAnel(), x, z, 3.2, 0xffb020, dur, { pisca: true, gira: 0.25, opacidade: 1 });
        decalque(TX.hieroAnel(), x, z, 3.2, 0xff6a10, dur, { pisca: true, gira: 0.25, opacidade: 0.5, rot: 0 });
        const fim = E.t + dur; E.efeitos.push({ atualizar(dt) { if (Math.random() < dt * 18) { const a = Math.random() * 6.28, rr = 2.4 + Math.random() * 0.8; emitir('faisca', x + Math.cos(a) * rr, 0.15, z + Math.sin(a) * rr, { n: 1, cor: 0xffc23a, vel: 0.1, subida: 1.2, vida: 0.6 }); } return E.t > fim; } });
      },
      ilusao: (h, clone, dur) => {
        const fim = E.t + dur;
        E.efeitos.push({ acc: 0, atualizar(dt) {
          if (E.t > fim || h.morto) return true;
          this.acc += dt * 14;
          while (this.acc >= 1) { this.acc -= 1; const k = Math.floor(Math.random() * 10);
            figura(TX.glifo(k), h.x + (Math.random() - 0.5) * 0.7, 0.3 + Math.random() * 1.5, h.z + 0.2 + (Math.random() - 0.5) * 0.3, 0.26, Math.random() < 0.5 ? 0xffc23a : 0xff8a1a, 0.6, { sobe: 0.25 }); }
        } });
      },
      triangulo: (h, A, B, C, dur) => {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute([A[0], 0, A[1], B[0], 0, B[1], C[0], 0, C[1]], 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute([0.5, 1, 1, 0, 0, 0], 2));
        [[0xffb020, 1], [0xff5a10, 0.45]].forEach(([cor, op]) => {
          const mat = new THREE.MeshBasicMaterial({ map: TX.hieroTri(), color: cor, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
          const m = new THREE.Mesh(geo, mat); m.position.y = 0.09; m.renderOrder = 7; E.mundo.add(m);
          E.efeitos.push({ t: 0, atualizar(dt) { this.t += dt; mat.opacity = op * Math.min(1, this.t / 0.15) * Math.min(1, (dur - this.t) / 0.5) * (0.78 + 0.22 * Math.sin(this.t * 15 + Math.sin(this.t * 6) * 2)); if (this.t > dur) { E.mundo.remove(m); return true; } } });
        });
      }
    },
    noturna: {
      projetil: () => ({ visual: 'orbeNoite', rastro: 0x2a8bff, impacto: 0x2a8bff }),
      chamas: (h, x, z, dur) => {
        for (let i = 0; i < 11; i++) { const a = i / 11 * Math.PI * 2; chamaNegra(x + Math.cos(a) * 2.7, z + Math.sin(a) * 2.7, 1.4 + Math.random() * 0.5, dur); }
        for (let i = 0; i < 4; i++) { const a = Math.random() * 6.28, rr = Math.random() * 1.6; chamaNegra(x + Math.cos(a) * rr, z + Math.sin(a) * rr, 0.9, dur); }
        anelEfeito(x, z, 3.2, 0x2a8bff, 0.5, true);
      },
      // o fogo negro vai consumindo o clone de baixo para cima até ele sumir
      clone: (c, consumido, dt) => {
        const alt = 1.8 * consumido;
        if (Math.random() < dt * 16) particulas(c.x + (Math.random() - 0.5) * 0.5, c.z, { n: 1, cor: 0x040408, tam: 0.45, cresce: 1.6, velH: 0.15, velV: 1.6, gravidade: -0.3, vida: 0.5, opacidade: 0.85, y: Math.random() * Math.max(0.2, alt) });
        if (Math.random() < dt * 22) emitir('faisca', c.x + (Math.random() - 0.5) * 0.6, Math.random() * Math.max(0.3, alt), c.z + 0.1, { n: 1, cor: 0x2a8bff, vel: 0.2, subida: 1.4, vida: 0.4 });
        c.obj.traverse(n => { if (n.isMesh && n.material && n.material.color) { if (!n.material.userData.corOrig) n.material.userData.corOrig = n.material.color.clone(); n.material.color.copy(n.material.userData.corOrig).multiplyScalar(Math.max(0.05, 1 - consumido)); } });
      },
      triangulo: (h, A, B, C, dur) => {
        chaoTriangulo(A, B, C, 0x1a4aff, dur);
        for (let k = 0; k < 16; k++) {
          const r1 = Math.random(), r2 = Math.random(), q = r1 + r2 > 1 ? [1 - r1, 1 - r2] : [r1, r2];
          chamaNegra(A[0] + (B[0] - A[0]) * q[0] + (C[0] - A[0]) * q[1], A[1] + (B[1] - A[1]) * q[0] + (C[1] - A[1]) * q[1], 2.6 + Math.random() * 1.2, dur, true);
        }
      }
    },
    // ---------------- ATIRADOR ----------------
    cosmos: {
      projetil: explode => ({ visual: 'orbeNegra', rastro: 0x8a0a0a, impacto: 0xff2a2a, tamanho: explode ? 1.25 : 1.0 }),
      aceleracao: (h, dur) => {
        decalque(R.brilhoTex || TX.bola(), h.x, h.z, 1.5, 0xff1a1a, dur, { seguir: h, opacidade: 0.7, pisca: true });
        aura(h, 0xff2a2a, dur, 30); aura(h, 0x8a0a0a, dur, 14);
      },
      explosao: (h, x, z) => {
        const r = CONFIG.atirador.explosaoRaio;
        figura(R.brilhoTex || TX.bola(), x, 1, z, r * 2.4, 0xffd27a, 0.22, { sai: 0.18 });
        emitir('grande', x, 0.8, z, { n: 10, cor: 0xff6a10, vel: 3, subida: 1.5, vida: 0.45 });
        emitir('grande', x, 0.8, z, { n: 6, cor: 0xffd27a, vel: 2, subida: 1, vida: 0.3 });
        emitir('faisca', x, 0.8, z, { n: 30, cor: 0xffa040, vel: 7, subida: 4, grav: 12, vida: 0.6 });
        particulas(x, z, { n: 10, cor: 0x1a1414, tam: 1.1, cresce: 2.6, velH: 2.6, velV: 2, gravidade: -0.4, vida: 1.2, raio: 0.5, opacidade: 0.75, y: 0.6 });
        anelEfeito(x, z, r * 1.2, 0xffe0b0, 0.35, true); anelEfeito(x, z, r * 0.8, 0xff3d00, 0.5, true);
        decalque(TX.cratera(), x, z, r * 0.6, 0x553322, 2.2, { normal: true, opacidade: 0.8 });
        tremer(x, z, 0.25, 0.25);
      },
      saltoSai: (h, x, z) => { for (let k = 0; k < 6; k++) { const a = k / 6 * 6.28; labareda(x + Math.cos(a) * 0.5, z + Math.sin(a) * 0.5, 0xff4a10, 1.2 + Math.random() * 0.5, 2, true); } emitir('faisca', x, 0.3, z, { n: 14, cor: 0xffa040, vel: 1, subida: 2, vida: 0.7 }); },
      saltoChega: (h, x, z) => { for (let k = 0; k < 5; k++) { const a = k / 5 * 6.28; labareda(x + Math.cos(a) * 0.6, z + Math.sin(a) * 0.6, 0xff6a1a, 1.6, 0.6); } emitir('grande', x, 0.5, z, { n: 4, cor: 0xff4a10, vel: 1.5, subida: 2, vida: 0.4 }); }
    },
    paintball: {
      projetil: () => { const rosa = (paintballCor = !paintballCor); return { visual: rosa ? 'tintaRosa' : 'tintaAmarela', rastro: rosa ? 0xff5ab4 : 0xffe14d, impacto: rosa ? 0xff5ab4 : 0xffe14d, corTinta: rosa ? 0xff5ab4 : 0xffe14d }; },
      acerto: (h, alvo, opc) => marcaTinta(alvo, (opc && opc.corTinta) || 0xff5ab4, 0.55),
      aceleracao: (h, dur) => figura(TX.lampada(), h.x, 2.75, h.z, 0.8, 0xffffff, dur, { normal: true, seguir: h, seguirY: 2.75 }),
      explosao: (h, x, z) => {
        const r = CONFIG.atirador.explosaoRaio;
        [0xff5ab4, 0xffe14d].forEach(c => { emitir('grande', x, 0.9, z, { n: 6, cor: c, vel: 4, subida: 2, grav: 6, vida: 0.5 }); emitir('faisca', x, 0.9, z, { n: 22, cor: c, vel: 7, subida: 4, grav: 14, vida: 0.6 }); });
        for (let k = 0; k < 5; k++) { const a = Math.random() * 6.28, d = Math.random() * r; decalque(TX.tinta(), x + Math.cos(a) * d, z + Math.sin(a) * d, 0.5 + Math.random() * 0.6, k % 2 ? 0xff5ab4 : 0xffe14d, 5, { normal: true, entra: 0.05, sai: 1 }); }
        E.entidades.forEach(e => { if (!e.morto && e !== h && inimigos(e, h) && Math.hypot(e.x - x, e.z - z) < r) marcaTinta(e, Math.random() < 0.5 ? 0xff5ab4 : 0xffe14d, 0.95); });
        anelEfeito(x, z, r, 0xff8ad0, 0.35, true);
      },
      saltoSai: (h, x, z) => decalque(TX.pegada(), x, z, 0.55, 0xff5ab4, 6, { normal: true, rot: -h.rot, entra: 0.05, sai: 1.5 })
    }
  };
  let paintballCor = false;

  /* ---------- efeitos dos ataques dos mobs ---------- */
  const texTeia = () => texSkin('teiaChao', 256, 256, g => {
    g.strokeStyle = '#ffffff'; g.lineWidth = 2.2;
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + Math.cos(a) * 124, 128 + Math.sin(a) * 124); g.stroke(); }
    for (let r = 18; r < 124; r += 17) { g.beginPath(); for (let i = 0; i <= 10; i++) { const a = i / 10 * Math.PI * 2, rr = r * (i % 2 ? 0.93 : 1); i ? g.lineTo(128 + Math.cos(a) * rr, 128 + Math.sin(a) * rr) : g.moveTo(128 + Math.cos(a) * rr, 128 + Math.sin(a) * rr); } g.stroke(); }
  });
  const alturaDe = a => (a.altura || 1.8) * (a.obj && a.obj.scale ? a.obj.scale.y : 1);
  const FX_MOB = {
    // maestro: notas roxas com brilho, e notas girando em volta de quem leva
    notas: { halo: 0xb26bff, rastro: 0xd9a0ff, impacto: 0xd9a0ff,
      saida: (e, ang) => { anelEfeito(e.x, e.z, 1.2, 0xb26bff, 0.35, true); emitir('faisca', e.x, 1.4, e.z, { n: 10, cor: 0xd9a0ff, vel: 1.2, subida: 1.5, vida: 0.5 }); },
      acerto: (a, crit) => { const y = alturaDe(a) * 0.6; for (let k = 0; k < 6; k++) { const ang = k / 6 * 6.28; emitir('media', a.x + Math.cos(ang) * 0.5, y, a.z + Math.sin(ang) * 0.5, { n: 1, cor: 0xc58bff, vel: 0.6, dir: [-Math.sin(ang), Math.cos(ang)], subida: 0.8, vida: 0.6 }); } anelEfeito(a.x, a.z, 1, 0xb26bff, 0.4, true); } },
    // veterano: clarão do tiro, rastro de bala e faíscas no impacto
    bala: { halo: 0xffd27a, rastro: 0xffe9b0, impacto: 0xfff1c4,
      saida: (e, ang) => { const x = e.x + Math.sin(ang) * 0.9, z = e.z + Math.cos(ang) * 0.9; figura(R.brilhoTex || TX.bola(), x, 1.2, z, 1.4, 0xffd27a, 0.1, { entra: 0.01, sai: 0.08 }); emitir('faisca', x, 1.2, z, { n: 8, cor: 0xffd27a, vel: 4, dir: [Math.sin(ang), Math.cos(ang)], espalha: 0.4, vida: 0.2 }); particulas(x, z, { n: 2, cor: 0x7a7a7a, tam: 0.4, cresce: 2, velH: 0.3, velV: 0.5, gravidade: -0.2, vida: 0.6, opacidade: 0.5, y: 1.2 }); },
      acerto: a => { emitir('faisca', a.x, alturaDe(a) * 0.55, a.z, { n: 14, cor: 0xffd27a, vel: 4, subida: 2, grav: 10, vida: 0.35 }); } },
    // dragão: bola de fogo com rastro de brasa e o alvo pegando fogo
    fogo: { halo: 0xff6a1a, rastro: 0xff8a2a, impacto: 0xff4a10,
      saida: (e, ang) => { emitir('grande', e.x + Math.sin(ang) * 1.2, 1.3, e.z + Math.cos(ang) * 1.2, { n: 3, cor: 0xff6a1a, vel: 1.5, dir: [Math.sin(ang), Math.cos(ang)], vida: 0.35 }); },
      acerto: a => { labareda(a.x, a.z, 0xff5a14, 1.4, 1.2); emitir('grande', a.x, 0.8, a.z, { n: 4, cor: 0xff6a1a, vel: 1.5, subida: 2, vida: 0.45 }); const fim = E.t + 1.2; E.efeitos.push({ atualizar(dt) { if (Math.random() < dt * 14) emitir('faisca', a.x + (Math.random() - 0.5) * 0.6, 0.3 + Math.random() * alturaDe(a) * 0.7, a.z, { n: 1, cor: 0xff8a2a, vel: 0.2, subida: 1.5, vida: 0.4 }); return E.t > fim || a.morto; } }); } },
    // barão: moeda girando com brilho dourado e chuva de moedas no impacto (o crítico é maior)
    moeda: { halo: 0xffd34d, rastro: 0xffe14d, impacto: 0xffe14d,
      saida: e => emitir('faisca', e.x, 1.3, e.z, { n: 8, cor: 0xffe14d, vel: 1, subida: 1, vida: 0.4 }),
      acerto: (a, crit) => { emitir('faisca', a.x, alturaDe(a) * 0.6, a.z, { n: crit ? 30 : 16, cor: 0xffd34d, vel: crit ? 5 : 3.5, subida: 3, grav: 12, vida: 0.6 }); anelEfeito(a.x, a.z, crit ? 1.8 : 1.1, 0xffd34d, 0.4, true); if (crit) aviso('Crítico do Barão!'); } },
    // aranha: teia brilhando no voo e grudada no chão enquanto prende
    teia: { halo: 0xe8f4ff, rastro: 0xffffff, impacto: 0xe8f4ff,
      acerto: a => { decalque(texTeia(), a.x, a.z, 1.1, 0xe8f4ff, 1.4, { normal: true, entra: 0.05, sai: 0.5, opacidade: 0.85, seguir: a }); emitir('faisca', a.x, 0.8, a.z, { n: 10, cor: 0xffffff, vel: 2, subida: 1, vida: 0.4 }); } },
    mordida: a => { emitir('faisca', a.x, alturaDe(a) * 0.5, a.z, { n: 10, cor: 0x9cff6b, vel: 2.5, subida: 1, grav: 8, vida: 0.35 }); anelEfeito(a.x, a.z, 0.9, 0x6bdc4a, 0.3, true); }
  };
  // mancha de tinta grudada no inimigo por 2 s (só o visual)
  function marcaTinta(e, cor, tam) {
    if (!e || e.morto) return;
    const alt = (e.altura || 1.8) * (e.obj && e.obj.scale ? e.obj.scale.y : 1);
    figura(TX.tinta(), e.x, alt * 0.55, e.z, tam, cor, 2, { normal: true, seguir: e, seguirY: alt * 0.55, dx: (Math.random() - 0.5) * 0.3, dz: 0.35, entra: 0.03, sai: 0.5, ordem: 12 });
  }

  function labareda(x, z, cor, alt, dur, devagar) {
    const sh = R.Fx && R.Fx.fogo(cor, 1);
    let m;
    if (sh) {
      const geo = new THREE.PlaneGeometry(alt * 0.7, alt); geo.translate && geo.translate(0, alt / 2, 0);
      m = new THREE.Mesh(geo, sh); m.userData.deFrente = true; deFrente(m);
    } else { m = projetilVisual('fogo', cor, alt); }
    m.position.set(x, sh ? 0.05 : alt * 0.4, z); m.renderOrder = 10; E.mundo.add(m);
    E.efeitos.push({ t: 0, atualizar(dt) {
      this.t += dt;
      // devagar: o fogo vai baixando aos poucos até apagar (rastro da investida)
      const resta = devagar ? Math.max(0, 1 - this.t / dur) : Math.min(1, (dur - this.t) / 0.35);
      if (sh) { deFrente(m); sh.uniforms.forca.value = Math.min(1, this.t / 0.2) * resta; m.scale.y = (0.6 + 0.4 * Math.min(1, this.t / 0.25)) * (devagar ? 0.35 + 0.65 * resta : 1); }
      else if (devagar && m.scale) m.scale.setScalar(alt * (0.3 + 0.7 * resta));
      if (this.t > dur) { E.mundo.remove(m); return true; }
    } });
  }
  function chaoTriangulo(A, B, C, cor, dur) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([A[0], 0, A[1], B[0], 0, B[1], C[0], 0, C[1]], 3));
    const sh = R.Fx && R.Fx.chao(cor, false);
    const mat = sh || new THREE.MeshBasicMaterial({ color: cor, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide });
    const m = new THREE.Mesh(geo, mat); m.position.y = 0.08; m.renderOrder = 6; E.mundo.add(m);
    E.efeitos.push({ t: 0, atualizar(dt) {
      this.t += dt;
      if (sh) { sh.uniforms.intensidade.value = Math.min(1, this.t / 0.15) * Math.min(1, (dur - this.t) / 0.4) * 1.1; if (this.t > dur) { E.mundo.remove(m); return true; } return; }
      mat.opacity = 0.35 + 0.15 * Math.sin(this.t * 14) * (1 - this.t / dur);
      if (this.t > dur) { E.mundo.remove(m); return true; }
    } });
    return m;
  }
  function ultSuporte(h) {
    const u = CONFIG.ultimate.suporte;
    h.travadoAte = E.t + 0.8;
    const tm = tema(h), fs = fxSkin(h);
    if (fs.selo) fs.selo(h, 2.2, 1.2); else circuloRunas(h.x, h.z, 2.2, tm.selo, 1.2);
    h.anim.tocar('habilidade3', { momento: 0.5, aoAcertar: () => {
      anelEfeito(h.x, h.z, u.raio, tm.selo, 0.8, true);
      if (!fs.selo) discoEfeito(h.x, h.z, u.raio, tm.selo, 0.5);
      if (fs.selo) fs.selo(h, u.raio, 1.8); else circuloRunas(h.x, h.z, u.raio, tm.selo, 1.6);
      emitir('faisca', h.x, 0.3, h.z, { n: 60, cor: tm.brilho, vel: 0.5, subida: 3, vida: 1.1, raio: u.raio });
      E.entidades.forEach(e => {
        if (e.morto || dist(e, h) > u.raio) return;
        if (aliado(e, h)) {
          if (remoto(e)) gancho('apoioRemoto', e, 'curaForte');
          else if (e.tipo !== 'torre') { curar(e, e.vidaMax * u.cura); anelEfeito(e.x, e.z, 1.3, tm.cura, 0.6, true); colunaLuz(e.x, e.z, tm.cura, 1, 0.7); }
        } else if (e.tipo !== 'torre' && !(e.tipo === 'serpente' && !e.emerso)) {
          controlar(e, { stun: u.stun, antiCura: [u.antiCura, u.antiCuraDur] });
          colunaLuz(e.x, e.z, tm.controle, 0.9, 0.5);
          if (!remoto(e)) anelEfeito(e.x, e.z, 1.1, tm.controle, 0.6, true);
        }
      });
    } });
  }
  function ultAtirador(h, ang, mira) {
    const c = CONFIG.atirador;
    const d = mira ? clamp(mira.dist, 2, c.distSalto) : c.distSalto;
    const [W, H] = E.def.tam, tm = tema(h);
    anelEfeito(h.x, h.z, 1.2, tm.principal, 0.35, true);
    emitir('faisca', h.x, 1, h.z, { n: 26, cor: tm.principal, vel: 2.5, subida: 1.5, vida: 0.4, alturaVar: 1 });
    const x0 = h.x, z0 = h.z;
    if (fxSkin(h).saltoSai) fxSkin(h).saltoSai(h, x0, z0);
    h.x = clamp(h.x + Math.sin(ang) * d, -W / 2 + 1, W / 2 - 1);
    h.z = clamp(h.z + Math.cos(ang) * d, -H / 2 + 1, H / 2 - 1);
    h.invulAte = Math.max(h.invulAte, E.t + 0.2);
    anelEfeito(h.x, h.z, 1.4, tm.principal, 0.4, true);
    discoEfeito(h.x, h.z, 1, tm.principal, 0.2);
    emitir('faisca', h.x, 0.2, h.z, { n: 30, cor: tm.faisca, vel: 4, subida: 2, vida: 0.45, grav: 6 });
    // rastro de luz entre os dois pontos
    for (let i = 1; i < 10; i++) emitir('faisca', x0 + (h.x - x0) * i / 10, 1, z0 + (h.z - z0) * i / 10, { n: 2, cor: tm.principal, vel: 0.3, vida: 0.35 });
    if (fxSkin(h).saltoChega) fxSkin(h).saltoChega(h, h.x, h.z);
    h.anim.tocar('habilidade3');
  }

  const HABILIDADES = {
    soldado: [
      (h, ang) => h.anim.tocar('ataque', { velocidade: bonus().velAtaque, momento: 0.45, aoAcertar: () => {
        const tm = tema(h);
        cone(h, h.rot, 3.0, 1.2, e => {
          causarDano(e, CLASSES.soldado.dano, h);
          emitir('faisca', e.x, 1.1, e.z, { n: 10, cor: tm.faisca, vel: 3.5, subida: 2, grav: 9, vida: 0.4 });
        });
        corteVisual(h, ang, tm.principal);
        emitir('faisca', h.x + Math.sin(ang) * 1.4, 1, h.z + Math.cos(ang) * 1.4, { n: 6, cor: tm.principal, vel: 1.5, dir: [Math.sin(ang), Math.cos(ang)], vida: 0.25 });
      } }),
      (h) => h.anim.tocar('habilidade1', { momento: 0.5, aoAcertar: () => {
        const tm = tema(h);
        anelEfeito(h.x, h.z, 3.2, tm.principal, 0.45, true);
        if (fxSkin(h).giro) fxSkin(h).giro(h, 3.2);
        // redemoinho: faíscas saindo girando + poeira
        for (let i = 0; i < 28; i++) {
          const a = i / 28 * Math.PI * 2;
          emitir('faisca', h.x + Math.cos(a) * 1.2, 1, h.z + Math.sin(a) * 1.2, { n: 1, cor: tm.faisca, vel: 5, dir: [-Math.sin(a), Math.cos(a)], espalha: 0.2, vida: 0.4, arrasto: 3 });
        }
        particulas(h.x, h.z, { n: 8, cor: tm.poeira, tam: 0.9, cresce: 2, velH: 4, velV: 0.6, gravidade: 1, vida: 0.6, raio: 1.5, opacidade: 0.6 });
        area(h.x, h.z, 3.2, h, e => causarDano(e, CLASSES.soldado.dano * 1.4, h));
      } }),
      (h, ang) => {
        h.investida = { ang, resta: 0.55, atingidos: new Set() };
        h.anim.tocar('habilidade2');
      },
      (h, ang) => ultSoldado(h, ang)
    ],
    suporte: [
      (h, ang) => h.anim.tocar('ataque', { velocidade: bonus().velAtaque, momento: 0.5, aoAcertar: () =>
        atirar(h, h.rot, { alvo: h.ultimoAlvo, raio: 0.8, restante: CLASSES.suporte.alcance + 1.5, vel: 18, dano: CLASSES.suporte.dano, cor: tema(h).principal, tamanho: 0.8, rastro: tema(h).brilho, impacto: tema(h).brilho }) }),
      (h) => h.anim.tocar('habilidade1', { momento: 0.55, aoAcertar: () => {
        const tm = tema(h), fs = fxSkin(h);
        if (fs.cura) fs.cura(h); else anelEfeito(h.x, h.z, 7, tm.cura, 0.8, true);
        E.entidades.forEach(e => { if (!e.morto && aliado(e, h) && dist(e, h) < 7 && e.tipo !== 'torre') {
          if (remoto(e)) gancho('apoioRemoto', e, 'cura'); else curar(e, e.vidaMax * 0.35);
          colunaLuz(e.x, e.z, tm.cura, 0.8, 0.6);
          emitir('faisca', e.x, 0.3, e.z, { n: 16, cor: tm.cura, vel: 0.4, subida: 2.6, vida: 0.9, raio: 0.6 });
        } });
      } }),
      (h) => h.anim.tocar('habilidade2', { momento: 0.3, aoAcertar: () => {
        const tm = tema(h);
        emitir('faisca', h.x, 1, h.z, { n: 30, cor: tm.brilho, vel: 4, subida: 1, vida: 0.5, arrasto: 4 });
        const vis = fxSkin(h).escudo;
        E.entidades.forEach(e => { if (!e.morto && aliado(e, h) && dist(e, h) < 6) { if (remoto(e)) { gancho('apoioRemoto', e, 'escudo'); e.escudo = 1; e.escudoAte = E.t + 4; bolha(e, 4, vis); } else { e.escudo = e.vidaMax * 0.4; e.escudoAte = E.t + 4; bolha(e, 4, vis); } } });
      } }),
      (h) => ultSuporte(h)
    ],
    mago: [
      (h, ang) => h.anim.tocar('ataque', { velocidade: bonus().velAtaque, momento: 0.5, aoAcertar: () =>
        atirar(h, h.rot, Object.assign({ alvo: h.ultimoAlvo, raio: 0.8, vel: 15, restante: CLASSES.mago.alcance + 1.5, dano: CLASSES.mago.dano, cor: tema(h).principal, tamanho: 0.9,
          rastro: tema(h).brasa, impacto: tema(h).brasa, efeito: e => aplicarSlow(e, 0.3, 0.2) }, fxSkin(h).projetil ? fxSkin(h).projetil(false) : {})) }),
      (h, ang, mira) => {
        const d = mira ? clamp(mira.dist, 2, 10) : 6;
        const x = h.x + Math.sin(ang) * d, z = h.z + Math.cos(ang) * d;
        const tm = tema(h);
        h.anim.tocar('habilidade1', { momento: 0.55, aoAcertar: () => {
          const fs = fxSkin(h);
          if (fs.chamas) {
            // visual da skin; o dano continua igual (a cada 0,5 s durante 2,5 s)
            fs.chamas(h, x, z, 2.5);
            for (let k = 1; k <= 5; k++) agendar(k * 0.5, () => area(x, z, 3.2, h, e => causarDano(e, CLASSES.mago.dano * 0.5, h, { semReacao: true })));
            return;
          }
          emitir('grande', x, 0.6, z, { n: 10, cor: tm.chama, vel: 2.5, subida: 1, vida: 0.5, raio: 1 });
          for (let q = 0; q < 7; q++) { const a = Math.random() * 6.28, rr = Math.sqrt(Math.random()) * 2.6; labareda(x + Math.cos(a) * rr, z + Math.sin(a) * rr, tm.chama, 1.1 + Math.random() * 0.8, 2.5); }
          discoEfeito(x, z, 3.2, tm.chama, 2.5, { intervalo: 0.5, fn: () => {
            area(x, z, 3.2, h, e => causarDano(e, CLASSES.mago.dano * 0.5, h, { semReacao: true }));
            emitir('media', x, 0.2, z, { n: 14, cor: tm.chama, vel: 0.3, subida: 2.4, vida: 0.7, raio: 3 });
            emitir('faisca', x, 0.2, z, { n: 10, cor: tm.brasa, vel: 0.4, subida: 3.5, vida: 0.9, raio: 3 });
          } });
        } });
      },
      async (h, ang, mira, alvo) => {
        if (!mira && alvo) ang += Math.PI;          // sem mira: foge do inimigo mais perto
        h.anim.tocar('habilidade2');
        fumaca(h.x, h.z, tema(h).fumaca, 12);
        emitir('faisca', h.x, 1, h.z, { n: 20, cor: tema(h).brasa, vel: 3, vida: 0.4, arrasto: 4 });
        const clone = await criarClone(h, 4, true);
        h.invisAte = E.t + 4; h.invulAte = E.t + 4; h.ilusao = true;
        if (fxSkin(h).ilusao) fxSkin(h).ilusao(h, clone, 4);
        const nx = h.x + Math.sin(ang) * 6, nz = h.z + Math.cos(ang) * 6;
        h.x = clamp(nx, -E.def.tam[0] / 2, E.def.tam[0] / 2); h.z = clamp(nz, -E.def.tam[1] / 2, E.def.tam[1] / 2);
        fumaca(h.x, h.z, tema(h).fumaca, 6);
        return clone;
      },
      (h, ang) => ultMago(h, ang)
    ],
    atirador: [
      // ataque básico: bola de energia que sai da mão
      (h, ang) => {
        h.anim.tocar('ataque', { velocidade: velAtaque(h), momento: 0.45, aoAcertar: () => {
          const explode = h.explosivoAte > E.t;
          const tm = tema(h);
          const fs = fxSkin(h), vis = fs.projetil ? fs.projetil(explode) : {};
          atirar(h, h.rot, Object.assign({ alvo: h.ultimoAlvo, raio: 0.8, vel: 24, restante: CLASSES.atirador.alcance + 1.5, dano: CLASSES.atirador.dano, cor: explode ? tm.explosivo : tm.principal, tamanho: explode ? 1.15 : 0.95,
            rastro: explode ? tm.brasa : tm.faisca, impacto: explode ? tm.explosivo : tm.principal }, vis, {
            efeito: (explode || fs.acerto) ? a => { if (fs.acerto) fs.acerto(h, a, vis); if (explode) explosaoEnergia(h, a.x, a.z); } : null }));
        } });
      },
      // Aceleração: ataques básicos mais rápidos por 5 s
      (h) => {
        h.anim.tocar('habilidade1');
        h.aceleradoAte = E.t + CONFIG.atirador.aceleracaoDur;
        const tm = tema(h);
        anelEfeito(h.x, h.z, 1.6, tm.principal, 0.6, true);
        emitir('faisca', h.x, 0.5, h.z, { n: 30, cor: tm.principal, vel: 3, subida: 3, vida: 0.5 });
        aura(h, tm.principal, CONFIG.atirador.aceleracaoDur, 22);
        aura(h, tm.faisca, CONFIG.atirador.aceleracaoDur, 25, true);
        if (fxSkin(h).aceleracao) fxSkin(h).aceleracao(h, CONFIG.atirador.aceleracaoDur);
      },
      // Explosão: as bolas que acertam explodem (dano dele + 5% de chance de crítico)
      (h) => {
        h.anim.tocar('habilidade2');
        h.explosivoAte = E.t + CONFIG.atirador.explosaoDur;
        const tm = tema(h);
        anelEfeito(h.x, h.z, 1.8, tm.explosivo, 0.6, true);
        emitir('media', h.x, 1, h.z, { n: 20, cor: tm.explosivo, vel: 3, subida: 1, vida: 0.5, arrasto: 3 });
        aura(h, tm.brasa, CONFIG.atirador.explosaoDur, 30, true);
      },
      // Salto: teleporta para onde mirou (2 pulos em até 15 s)
      (h, ang, mira) => ultAtirador(h, ang, mira)
    ]
  };
  function corteVisual(h, ang, cor) {
    // marca do golpe: só aparece para quem ataca (não vai para a rede), fina, no chão e bem apagada
    const m = new THREE.Mesh(new THREE.RingGeometry(2.55, 2.8, 24, 1, -0.9, 1.8),
      new THREE.MeshBasicMaterial({ color: cor || 0xfff1c4, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    m.rotation.x = -Math.PI / 2; m.rotation.z = ang - Math.PI / 2;
    m.position.set(h.x, 0.12, h.z); m.renderOrder = 6;
    E.mundo.add(m);
    E.efeitos.push({ t: 0, atualizar(dt) { this.t += dt; m.material.opacity = 0.28 * (1 - this.t / 0.18); if (this.t > 0.18) { E.mundo.remove(m); return true; } } });
  }
  function bolha(e, dur, vis) {
    if (vis && vis.tex) {
      // desenho da skin (circuitos, caveiras) girando por cima da bolha
      const mat = new THREE.MeshBasicMaterial({ map: vis.tex(), color: vis.cor, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
      if (mat.map && mat.map.wrapS !== undefined) { mat.map.wrapS = mat.map.wrapT = THREE.RepeatWrapping; if (mat.map.repeat) mat.map.repeat.set(3, 2); }
      const cap = new THREE.Mesh(new THREE.SphereGeometry(1.24, 24, 16), mat); cap.renderOrder = 10; E.mundo.add(cap);
      E.efeitos.push({ t: 0, atualizar(dt) { this.t += dt; cap.position.set(e.x, 1, e.z); cap.rotation.y += dt * 0.8; mat.opacity = 0.8 * Math.min(1, this.t / 0.15) * Math.min(1, Math.max(0, (dur - this.t) / 0.4)); if (this.t > dur || e.morto || e.escudo <= 0) { E.mundo.remove(cap); return true; } } });
    }
    const sh = R.Fx && R.Fx.escudo(vis && vis.cor ? vis.cor : 0x9fd8ff);
    const m = new THREE.Mesh(new THREE.SphereGeometry(1.2, 28, 18),
      sh || new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.25, depthWrite: false }));
    if (sh) { m.renderOrder = 9; E.efeitos.push({ t: 0, atualizar(dt) { this.t += dt; sh.uniforms.vida.value = Math.min(1, this.t / 0.15) * Math.min(1, Math.max(0, (dur - this.t) / 0.4)); if (this.t > dur || e.morto || e.escudo <= 0) return true; } }); }
    E.mundo.add(m);
    E.efeitos.push({ t: 0, atualizar(dt) {
      this.t += dt; m.position.set(e.x, 1, e.z);
      if (this.t > dur || e.escudo <= 0 || e.morto) { E.mundo.remove(m); return true; }
    } });
  }
  async function criarClone(h, dur, atacaSozinho) {
    const skinH = (P.skinEquipada || {})[h.classe] || 'default';
    const obj = await Skins.criarPersonagem({ classe: h.classe, genero: P.genero, cor: P.cor, skin: skinH });
    const c = nova({
      tipo: 'clone', time: h.time, donoHeroi: true, obj, anim: Skins.animador(obj), skin: skinH, classe: h.classe, durClone: dur,
      x: h.x + (atacaSozinho ? 0 : 1.2), z: h.z, rot: h.rot, vida: 1, vidaMax: 1, raio: 0.5,
      removerEm: E.t + dur, atacaSozinho, cdClone: 0
    });
    c.vida = 1e9; c.vidaMax = 1e9; c.invulAte = E.t + dur;
    obj.traverse(n => { if (n.isMesh && n.material) { n.material = n.material.clone(); n.material.transparent = true; n.material.opacity = 0.7; } });
    return c;
  }

  /* ======================= MOBS ======================= */
  async function criarMob(m) {
    const cfg = CONFIG.mobs[m.tipo]; if (!cfg) return null;
    const esc = CONFIG.escalaMapa[E.mapa] || 1;
    const obj = await Skins.criarMob(m.tipo, E.mapa);
    const def = Skins.CATALOGO.mobs[m.tipo];
    const e = nova({
      tipo: 'mob', especie: m.tipo, cfg, obj, anim: Skins.animador(obj),
      x: m.x, z: m.z, casa: { x: m.x, z: m.z }, rot: Math.random() * 6,
      vida: cfg.vida * esc, vidaMax: cfg.vida * esc, dano: cfg.dano * esc, raio: Math.max(0.6, def.altura * 0.35 * (Skins.CATALOGO.mapas[E.mapa] || { escalaMob: 1 }).escalaMob),
      vel: cfg.vel, alcance: cfg.alcance, ataques: 0, altura: def.altura
    });
    if (m.tipo === 'barao') camada(new THREE.CircleGeometry(2.4, 32), new THREE.MeshStandardMaterial({ color: 0xe3b44c, metalness: 0.7, roughness: 0.35 }), m.x, m.z, 0.07);   // piscina de moedas
    return e;
  }
  function iaMob(e, dt) {
    if (e.morto) {
      if (E.t >= e.renasceEm) {
        e.morto = false; e.vida = e.vidaMax; e.x = e.casa.x; e.z = e.casa.z; e.alvo = null;
        if (e.anim) e.anim.tocar('renascer');
      }
      return;
    }
    if (preso(e)) { e.anim.mover(0); return; }
    const h = E.heroi;
    // escolhe alvo: herói ou clone visíveis, fora de zona segura
    let alvo = e.alvo && !e.alvo.morto ? e.alvo : null;
    if (alvo && (invisivel(alvo) || zonaSegura(alvo.x, alvo.z) || dist(alvo, e.casa) > 18)) alvo = null;
    if (!alvo && h && !h.morto && !invisivel(h) && !zonaSegura(h.x, h.z) && dist(h, e) < 9) alvo = h;
    e.alvo = alvo;
    let vel = 0, alvoPos = null;
    if (alvo) {
      const d = dist(alvo, e);
      e.rot = girarPara(e.rot, Math.atan2(alvo.x - e.x, alvo.z - e.z), dt * 6);
      const alcanceAgora = e.especie === 'aranha' && e.grudada ? e.cfg.corpoACorpo : e.alcance;
      if (d > alcanceAgora * 0.9) { alvoPos = alvo; vel = e.vel; }
      else if (E.t >= e.prontoEm && !['ataque', 'dano'].includes(e.anim.estado)) atacarMob(e, alvo);
    } else if (dist(e, e.casa) > 0.8) {
      alvoPos = e.casa; vel = e.vel * 1.2;
      e.rot = girarPara(e.rot, Math.atan2(e.casa.x - e.x, e.casa.z - e.z), dt * 6);
    } else { curar(e, e.vidaMax * 0.2 * dt); e.grudada = false; }
    if (['ataque', 'dano'].includes(e.anim.estado)) vel = 0;
    if (vel && alvoPos) {
      const v = vel * lentidao(e) * dt;
      e.x += Math.sin(e.rot) * v; e.z += Math.cos(e.rot) * v;
    }
    e.anim.mover(vel * lentidao(e));
  }
  /* ---------- efeitos especiais ---------- */
  // partículas soltas: poeira, gotas, faíscas (sprites que sobem, caem e somem)
  function particulas(x, z, o) {
    o = Object.assign({ n: 12, cor: 0xffffff, tam: 0.5, cresce: 1.5, velH: 3, velV: 3, gravidade: 8, vida: 0.8, y: 0.3, opacidade: 0.9, raio: 0 }, o);
    for (let i = 0; i < o.n; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: R.texParticula, color: o.cor, transparent: true, depthWrite: false, opacity: o.opacidade }));
      const ang = Math.random() * Math.PI * 2, rr = o.raio * Math.sqrt(Math.random());
      const p = { x: x + Math.cos(ang) * rr, y: o.y, z: z + Math.sin(ang) * rr,
        vx: Math.cos(ang) * o.velH * (0.5 + Math.random() * 0.7), vz: Math.sin(ang) * o.velH * (0.5 + Math.random() * 0.7),
        vy: o.velV * (0.6 + Math.random() * 0.6), t: 0, vida: o.vida * (0.7 + Math.random() * 0.6) };
      s.position.set(p.x, p.y, p.z); s.scale.setScalar(o.tam); s.renderOrder = 9; E.mundo.add(s);
      E.efeitos.push({ atualizar(dt) {
        p.t += dt; p.vy -= o.gravidade * dt;
        p.x += p.vx * dt; p.y = Math.max(0.05, p.y + p.vy * dt); p.z += p.vz * dt;
        const k = p.t / p.vida;
        s.position.set(p.x, p.y, p.z); s.scale.setScalar(o.tam * (1 + (o.cresce - 1) * k));
        s.material.opacity = o.opacidade * (1 - k);
        if (k >= 1) { E.mundo.remove(s); return true; }
      } });
    }
  }
  // pedras que saltam do chão
  function pedras(x, z, n, cor, forca) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.2), new THREE.MeshLambertMaterial({ color: cor }));
      const ang = Math.random() * Math.PI * 2, v = forca * (0.6 + Math.random() * 0.6);
      const p = { x, y: 0.2, z, vx: Math.cos(ang) * v * 0.6, vz: Math.sin(ang) * v * 0.6, vy: v * 1.4, t: 0, gx: Math.random() * 8, gz: Math.random() * 8 };
      m.position.set(x, 0.2, z); m.scale.setScalar(0.6 + Math.random() * 0.9); E.mundo.add(m);
      E.efeitos.push({ atualizar(dt) {
        p.t += dt; p.vy -= 18 * dt; p.x += p.vx * dt; p.z += p.vz * dt; p.y += p.vy * dt;
        if (p.y < 0.1) { p.y = 0.1; p.vy = 0; p.vx *= 0.6; p.vz *= 0.6; }
        m.position.set(p.x, p.y, p.z); m.rotation.x += p.gx * dt; m.rotation.z += p.gz * dt;
        if (p.t > 1.4) { m.scale.multiplyScalar(0.85); }
        if (p.t > 1.8) { E.mundo.remove(m); return true; }
      } });
    }
  }
  function tremer(x, z, forca, dur) {
    const h = E.heroi; if (!h) return;
    const perto = clamp(1 - Math.hypot(h.x - x, h.z - z) / 22, 0, 1);
    if (perto > 0) E.tremor = { forca: forca * perto, dur, ate: E.t + dur };
  }
  // círculo de aviso no chão antes do golpe (dá tempo de fugir)
  function avisoChao(x, z, r, cor, dur) {
    const m = camada(new THREE.RingGeometry(r * 0.94, r, 48), new THREE.MeshBasicMaterial({ color: cor, transparent: true, opacity: 0.6, depthWrite: false }), x, z, 0.09);
    const dentro = camada(new THREE.CircleGeometry(r, 48), new THREE.MeshBasicMaterial({ color: cor, transparent: true, opacity: 0.12, depthWrite: false }), x, z, 0.085);
    m.renderOrder = dentro.renderOrder = 6;
    E.efeitos.push({ t: 0, atualizar(dt) {
      this.t += dt; const k = Math.min(1, this.t / dur);
      dentro.scale.setScalar(Math.max(0.01, k)); m.material.opacity = 0.35 + 0.35 * Math.abs(Math.sin(this.t * 10));
      if (this.t >= dur) { E.mundo.remove(m); E.mundo.remove(dentro); return true; }
    } });
  }
  function rachaduras(x, z, r, dur) {
    const tex = R.Fx && R.Fx.rachaduras && R.Fx.rachaduras(); if (!tex) return;
    const m = camada(new THREE.PlaneGeometry(r * 2, r * 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.9, depthWrite: false }), x, z, 0.075);
    m.rotation.z = Math.random() * 6.28;
    E.efeitos.push({ t: 0, atualizar(dt) { this.t += dt; m.material.opacity = 0.9 * Math.min(1, (dur - this.t) / 0.8); if (this.t > dur) { E.mundo.remove(m); return true; } } });
  }
  function efeitoPisao(x, z, r) {
    rachaduras(x, z, r * 0.9, 2.5);
    anelEfeito(x, z, r, 0xb9a27a, 0.55, true);
    anelEfeito(x, z, r * 0.6, 0x7a6448, 0.4, true);
    discoEfeito(x, z, r * 0.45, 0x5b4a36, 0.6);
    particulas(x, z, { n: 18, cor: 0xb8a68a, tam: 1.1, cresce: 2.4, velH: r * 1.6, velV: 1.2, gravidade: 2, vida: 0.9, raio: 1, opacidade: 0.75 });
    pedras(x, z, 9, 0x5d6168, 5);
    tremer(x, z, 0.5, 0.45);
  }
  function efeitoGolpeAgua(x, z, r) {
    anelEfeito(x, z, r, 0x5cc8e0, 0.6, true);
    for (let i = 1; i <= 3; i++) agendar(i * 0.18, () => anelEfeito(x, z, r * (0.5 + i * 0.25), 0x9fe6ff, 0.55, true));
    particulas(x, z, { n: 28, cor: 0x8fdcff, tam: 0.45, cresce: 1.2, velH: r * 0.9, velV: 8, gravidade: 14, vida: 1.0, raio: 1.4 });
    particulas(x, z, { n: 10, cor: 0xffffff, tam: 1.2, cresce: 2.2, velH: 2, velV: 1.5, gravidade: 1, vida: 0.7, raio: 1.5, opacidade: 0.6 });
    // poça que some devagar
    const poca = camada(new THREE.CircleGeometry(r * 0.75, 40), new THREE.MeshBasicMaterial({ color: 0x3f8fbf, transparent: true, opacity: 0.4, depthWrite: false }), x, z, 0.07);
    E.efeitos.push({ t: 0, atualizar(dt) { this.t += dt; poca.material.opacity = 0.4 * (1 - this.t / 2.2); if (this.t > 2.2) { E.mundo.remove(poca); return true; } } });
    tremer(x, z, 0.7, 0.6);
  }

  function atacarMob(e, alvo) {
    const c = e.cfg;
    e.prontoEm = E.t + c.intervalo;
    e.ataques++;
    const ang = Math.atan2(alvo.x - e.x, alvo.z - e.z);
    if (e.especie === 'golem') {
      // pisão (ataque) e, a cada 3 golpes, os dois punhos na terra soltando água (habilidade1)
      const agua = e.ataques % 3 === 0 && e.anim.tem && (e.anim.tem('habilidade1') || !e.anim.tem('ataque'));
      const r = agua ? c.golpeAgua : c.pisao;
      const momento = agua ? 0.28 : 0.32;
      const est = agua ? 'habilidade1' : 'ataque', cg = (Skins.CATALOGO.habilidades.golem || {})[est] || {};
      const dur = (cg.duracao || Skins.CATALOGO.duracoes[est] || 1) * momento;
      avisoChao(e.x, e.z, r, agua ? 0x5cc8e0 : 0xff6b4a, Math.max(0.25, dur));
      e.anim.tocar(agua ? 'habilidade1' : 'ataque', { momento, aoAcertar: () => {
        if (agua) efeitoGolpeAgua(e.x, e.z, r); else efeitoPisao(e.x, e.z, r);
        area(e.x, e.z, r, e, a => { causarDano(a, e.dano * (agua ? 1.2 : 1), e); if (agua) controlar(a, { stun: c.stunAgua }); });
      } });
      return;
    }
    if (e.especie === 'aranha') {
      if (!e.grudada) {
        e.anim.tocar('habilidade1', { momento: 0.5, aoAcertar: () => atirar(e, ang, { vel: 14, restante: c.alcance + 1, dano: e.dano * 0.5, visual: 'teia', tamanho: 1.1,
          halo: FX_MOB.teia.halo, rastro: FX_MOB.teia.rastro, impacto: FX_MOB.teia.impacto,
          efeito: a => { a.stunAte = E.t + c.stunTeia; aplicarSlow(a, c.slowTeia[0], c.slowTeia[1]); e.grudada = true; FX_MOB.teia.acerto(a); } }) });
      } else {
        e.anim.tocar('ataque', { momento: 0.5, aoAcertar: () => { if (dist(alvo, e) < c.corpoACorpo + 0.6) { causarDano(alvo, e.dano, e); FX_MOB.mordida(alvo); } } });
      }
      return;
    }
    let dano = e.dano;
    const critico = c.criticoQuinto && e.ataques % 5 === 0;
    if (critico) dano *= 1 + c.criticoQuinto;
    const fx = FX_MOB[c.projetil] || {};
    e.anim.tocar('ataque', { momento: 0.5, aoAcertar: () => {
      if (fx.saida) fx.saida(e, ang);
      atirar(e, ang, {
        vel: 13, restante: c.alcance + 1.5, dano, visual: c.projetil, tamanho: critico ? 1.5 : 1.1, verdadeiro: !!c.verdadeiro,
        halo: fx.halo, rastro: fx.rastro, impacto: fx.impacto,
        efeito: a => { if (c.slow) aplicarSlow(a, c.slow[0], c.slow[1]); if (fx.acerto) fx.acerto(a, critico); }
      });
    } });
  }

  /* ---------- serpente (Ascensão) ---------- */
  function corpoSerpente() {
    const g = new THREE.Group(), partes = [];
    const mat = new THREE.MeshStandardMaterial({ color: 0x148f77, roughness: 0.5 });
    const fin = new THREE.MeshStandardMaterial({ color: 0x5ff0e8, emissive: 0x1aa0a0, emissiveIntensity: 0.6 });
    for (let i = 0; i < 10; i++) {
      const r = 0.55 - i * 0.035;
      const s = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), i === 0 ? mat : mat);
      const f = new THREE.Mesh(new THREE.ConeGeometry(r * 0.35, r * 0.9, 6), fin); f.position.y = r * 0.9; s.add(f);
      g.add(s); partes.push(s);
    }
    const olhoM = new THREE.MeshBasicMaterial({ color: 0xffff88 });
    [-1, 1].forEach(l => { const o = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), olhoM); o.position.set(0.25 * l, 0.25, 0.4); partes[0].add(o); });
    g.userData.partes = partes;
    return g;
  }
  async function criarSerpente(cfgMapa) {
    const n = Math.max(1, Math.ceil(1 / cfgMapa.porJogadores));
    const esc = CONFIG.escalaMapa[E.mapa] || 1;
    for (let i = 0; i < n; i++) {
      const c = CONFIG.mobs.serpente;
      const obj = corpoSerpente();
      const e = nova({
        tipo: 'serpente', cfg: c, obj, x: 0, z: 30, casa: { x: 0, z: 30 }, vida: c.vida * esc, vidaMax: c.vida * esc,
        dano: c.dano * esc, raio: 0.9, vel: c.vel, emerso: false, subida: 0, naoAfundaAgua: true, rastro: []
      });
      E.serpentes.push(e);
    }
  }
  function pontoAguaPerto(x, z) {
    if (naAgua(x, z)) return { x, z };
    for (let r = 1.5; r <= 12; r += 1.5) {
      for (let k = 0; k < 16; k++) {
        const a = k / 16 * Math.PI * 2, px = x + Math.sin(a) * r, pz = z + Math.cos(a) * r;
        if (naAgua(px, pz)) return { x: px, z: pz };
      }
    }
    return null;
  }
  function iaSerpente(e, dt) {
    const partes = e.obj.userData.partes;
    if (e.morto) {
      e.obj.visible = false; e.emerso = false;
      if (E.t >= e.renasceEm) { e.morto = false; e.vida = e.vidaMax; e.obj.visible = true; }
      return;
    }
    const h = E.heroi;
    const valido = h && !h.morto && !invisivel(h) && !zonaSegura(h.x, h.z);
    const ponto = valido ? pontoAguaPerto(h.x, h.z) : null;
    if (ponto) {
      const d = Math.hypot(ponto.x - e.x, ponto.z - e.z);
      if (d > 0.5) {
        const ang = Math.atan2(ponto.x - e.x, ponto.z - e.z); e.rot = girarPara(e.rot, ang, dt * 5);
        const v = Math.min(d, e.vel * (e.emerso ? 0.4 : 1) * dt);
        e.x += Math.sin(e.rot) * v; e.z += Math.cos(e.rot) * v;
      }
      const perto = dist(h, e) < e.cfg.alcance + 2;
      e.subida = clamp(e.subida + (perto ? dt * 2 : -dt * 1.5), 0, 1);
      if (perto && e.subida > 0.8 && E.t >= e.prontoEm) {
        e.prontoEm = E.t + e.cfg.intervalo;
        anelEfeito(h.x, h.z, 1.2, 0x5ff0e8, 0.3, true);
        if (dist(h, e) < e.cfg.alcance + 0.5) causarDano(h, e.dano, e);
      }
    } else e.subida = clamp(e.subida - dt, 0, 1);
    e.emerso = e.subida > 0.3;
    // corpo ondulando, saindo da água
    e.rastro.unshift({ x: e.x, z: e.z }); if (e.rastro.length > 60) e.rastro.pop();
    partes.forEach((s, i) => {
      const r = e.rastro[Math.min(e.rastro.length - 1, i * 4)] || e;
      const alt = e.subida * (2.2 - i * 0.2) + Math.sin(E.t * 4 + i) * 0.15 - 0.6;
      s.position.set(r.x - e.x, alt, r.z - e.z);
    });
    e.obj.position.set(e.x, 0, e.z);
  }

  /* ======================= MINIONS E BARCOS ======================= */
  const TIPOS_ONDA = ['frente', 'frente', 'frente', 'balistico', 'carregador'];
  async function criarMinion(tipo, time, x, z) {
    const cfg = CONFIG.minions[tipo];
    const esc = CONFIG.escalaMapa[E.mapa] || 1;
    const obj = await Skins.criarMinion(tipo, time === 'neutro' ? 'neutro' : time);
    return nova({
      tipo: 'minion', especie: tipo, cfg, obj, anim: Skins.animador(obj), time,
      x, z, vida: cfg.vida * esc, vidaMax: cfg.vida * esc, dano: cfg.dano * esc, raio: 0.45,
      vel: CONFIG.minions.vel, alcance: cfg.alcance, altura: 0.8
    });
  }
  async function soltarOnda(o) {
    const d = o.def, membros = [];
    const doBarco = d.inicio === 'barco';
    for (let i = 0; i < TIPOS_ONDA.length; i++) {
      const p = doBarco ? d.barco[0] : (d.cavernaIni || d.ida[0]);
      const m = await criarMinion(TIPOS_ONDA[i], 'neutro', p[0] + (i % 2) * 0.8, p[1] + Math.floor(i / 2) * 0.8);
      m.rota = { def: d, fase: doBarco ? 'barco' : 'ida', i: 0 };
      membros.push(m);
    }
    if (doBarco) novoBarco(d, membros);
    return membros;
  }
  function novoBarco(d, membros) {
    const b = { pts: d.barco, i: 0, x: d.barco[0][0], z: d.barco[0][1], membros, desembarcou: false };
    b.obj = peca('barco_iso', 2.6, b.x, b.z, { sombra: false });
    membros.forEach((m, k) => { m.noBarco = b; m.vaga = k; m.rota.fase = 'barco'; });
    E.barcos.push(b);
  }
  function atualizarBarcos(dt) {
    for (let i = E.barcos.length - 1; i >= 0; i--) {
      const b = E.barcos[i];
      const alvo = b.pts[b.i + 1];
      if (alvo) {
        const dx = alvo[0] - b.x, dz = alvo[1] - b.z, d = Math.hypot(dx, dz), v = 4.2 * dt;
        if (d <= v) { b.x = alvo[0]; b.z = alvo[1]; b.i++; } else { b.x += dx / d * v; b.z += dz / d * v; }
        b.obj.position.set(b.x, 0, b.z);
        b.membros.forEach(m => { if (!m.morto) { m.x = b.x + (m.vaga % 3 - 1) * 0.7; m.z = b.z + (Math.floor(m.vaga / 3) - 0.5) * 0.7; m.anim.mover(0); } });
      } else if (!b.desembarcou) {
        b.desembarcou = true;
        b.membros.forEach(m => { m.noBarco = null; if (m.rota) { m.rota.fase = 'volta'; m.rota.i = 0; } });
        b.voltaEm = E.t + 6;
      } else if (E.t > b.voltaEm) {
        E.mundo.remove(b.obj); E.barcos.splice(i, 1);
      }
    }
  }
  function pontosFase(r) {
    const d = r.def;
    if (r.fase === 'ida') return d.ida;
    if (r.fase === 'volta') return d.volta || [];
    return [];
  }
  function iaMinion(e, dt) {
    if (e.morto) return;
    if (preso(e) || e.noBarco) { e.anim.mover(0); return; }
    // inimigo por perto?
    let alvo = null;
    if (e.cfg.dano > 0) {
      const raioBusca = e.alcance + (e.arenaRef ? 6 : CONFIG.minions.perseguir);
      let md = raioBusca;
      E.entidades.forEach(o => {
        if (o.morto || !inimigos(o, e) || o.tipo === 'clone' || remoto(o)) return;
        if (o.tipo === 'mob' || o.tipo === 'serpente') return;     // minions do mundo não brigam com mobs
        if (o.tipo === 'heroi' && (invisivel(o) || zonaSegura(o.x, o.z))) return;
        const d = dist(o, e); if (d < md) { md = d; alvo = o; }
      });
    }
    let vel = 0;
    if (alvo) {
      e.rot = girarPara(e.rot, Math.atan2(alvo.x - e.x, alvo.z - e.z), dt * 8);
      if (dist(alvo, e) > e.alcance) vel = e.vel;
      else if (E.t >= e.prontoEm && e.anim.estado !== 'ataque') {
        e.prontoEm = E.t + e.cfg.intervalo;
        const ang = e.rot;
        if (e.especie === 'balistico') e.anim.tocar('ataque', { momento: 0.5, aoAcertar: () => atirar(e, ang, { vel: 16, restante: e.alcance + 1, dano: e.dano, visual: 'flecha', tamanho: 0.9, rastro: 0xe8dcc0, impacto: 0xfff1c4 }) });
        else e.anim.tocar('ataque', { momento: 0.5, aoAcertar: () => { if (!alvo.morto && dist(alvo, e) < e.alcance + 0.8) causarDano(alvo, e.dano, e); } });
      }
    } else if (e.rota) {
      const pts = pontosFase(e.rota);
      const alvoP = pts[e.rota.i];
      if (alvoP) {
        const dx = alvoP[0] - e.x, dz = alvoP[1] - e.z, d = Math.hypot(dx, dz);
        if (d < 0.8) e.rota.i++;
        else { e.rot = girarPara(e.rot, Math.atan2(dx, dz), dt * 6); vel = e.vel; }
      } else if (e.rota.fase === 'ida' && e.rota.def.barco) {
        e.rota.fase = 'esperaBarco'; e.rota.desde = E.t;
      } else if (e.rota.fase !== 'esperaBarco') {
        e.morto = true; e.removerEm = E.t;          // entrou na caverna
      }
    } else if (e.arenaRef) {
      // minion de arena: segue a pista até o nexus inimigo
      const a = e.arenaRef, destinoX = e.time === 'azul' ? a.x + a.w / 2 - 6 : a.x - a.w / 2 + 6;
      const dx = destinoX - e.x, dz = a.z - e.z;
      e.rot = girarPara(e.rot, Math.atan2(dx, dz), dt * 6); vel = Math.abs(dx) > 1 ? e.vel : 0;
    }
    if (e.anim.estado === 'ataque') vel = 0;
    if (vel) { const v = vel * lentidao(e) * dt; e.x += Math.sin(e.rot) * v; e.z += Math.cos(e.rot) * v; }
    e.anim.mover(vel * lentidao(e));
  }
  function atualizarOndas(dt) {
    E.ondas.forEach(o => {
      if (E.t >= o.proxima) {
        o.proxima = E.t + o.def.intervalo;
        if (E.entidades.filter(e => e.tipo === 'minion' && !e.arenaRef).length < 40) soltarOnda(o);
      }
    });
    // embarque: quando toda a onda chegou ao cais (ou passou o tempo), o barco leva
    const esperando = E.entidades.filter(e => e.tipo === 'minion' && !e.morto && e.rota && e.rota.fase === 'esperaBarco');
    const porDef = new Map();
    esperando.forEach(m => { const k = m.rota.def; if (!porDef.has(k)) porDef.set(k, []); porDef.get(k).push(m); });
    porDef.forEach((lista, def) => {
      const aCaminho = E.entidades.some(e => e.tipo === 'minion' && !e.morto && e.rota && e.rota.def === def && e.rota.fase === 'ida');
      if (!aCaminho || E.t - Math.min(...lista.map(m => m.rota.desde)) > 8) novoBarco(def, lista);
    });
  }

  /* ======================= ARENAS ======================= */
  function montarArena(a, indice) {
    const g = new THREE.Group(); E.mundo.add(g);
    camada(uvRep(new THREE.PlaneGeometry(a.w, a.h), a.w / 4, a.h / 4), new THREE.MeshLambertMaterial({ map: texChao('areia_arena', 'margem_areia', 1, 1), color: 0xf0e0c0, transparent: true }), a.x, a.z, 0.035);
    camada(uvRep(new THREE.PlaneGeometry(a.w - 8, 5), (a.w - 8) / 4, 1.2), new THREE.MeshLambertMaterial({ map: texChao('caminho_pedra', 'caminho_terra', 1, 1), color: 0xd8d0c0, transparent: true }), a.x, a.z, 0.045);
    // cercado com portão ao sul
    const pedra = new THREE.MeshStandardMaterial({ color: 0xcfc6b0, roughness: 0.8 });
    const barreira = new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false });
    const lado = (x, z, w, d) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 1.1, d), pedra); m.position.set(x, 0.55, z); g.add(m);
      const b = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(w, d), 2.4), barreira); b.position.set(x, 2.3, z); if (d > w) b.rotation.y = Math.PI / 2; g.add(b);
    };
    const meiaW = a.w / 2, meiaH = a.h / 2, portao = 6;
    lado(a.x, a.z - meiaH, a.w, 0.6);
    lado(a.x - meiaW, a.z, 0.6, a.h); lado(a.x + meiaW, a.z, 0.6, a.h);
    lado(a.x - (meiaW + portao / 2) / 2, a.z + meiaH, meiaW - portao / 2, 0.6);
    lado(a.x + (meiaW + portao / 2) / 2, a.z + meiaH, meiaW - portao / 2, 0.6);
    const placa = textoSprite('ARENA ' + (indice + 1) + ' · 4 contra 4', 10, '#e3b44c'); placa.position.set(a.x, 5, a.z + meiaH + 1); g.add(placa);
    E.interacoes.push({ tipo: 'arena', x: a.x, z: a.z + meiaH + 3, raio: 5, arenaIndice: indice });
    const arena = Object.assign({}, a, { indice, torres: [], ativa: false, inicio: E.t, proxOnda: E.t + 3, fimEm: 0, grupo: g });
    // 6 torres por time (a última é o nexus)
    ['azul', 'vermelho'].forEach(time => {
      for (let k = 0; k < 6; k++) {
        const dx = (meiaW - 6) - k * 8.5, x = time === 'azul' ? a.x - dx : a.x + dx;
        arena.torres.push(criarTorre(time, x, a.z, k === 0, arena));
      }
    });
    return arena;
  }
  function criarTorre(time, x, z, nexus, arena) {
    const cor = time === 'azul' ? 0x2e5bff : 0xe0262b;
    const g = new THREE.Group();
    const pedra = new THREE.MeshStandardMaterial({ color: 0xbfb6a4, roughness: 0.8 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(nexus ? 2.2 : 1.3, nexus ? 2.6 : 1.6, 1.2, 10), pedra); base.position.y = 0.6; g.add(base);
    const corpo = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.9, nexus ? 3 : 4, 10), pedra); corpo.position.y = nexus ? 2.6 : 3.2; g.add(corpo);
    const cristal = new THREE.Mesh(new THREE.OctahedronGeometry(nexus ? 1.4 : 0.8), new THREE.MeshStandardMaterial({ color: cor, emissive: cor, emissiveIntensity: 0.7 }));
    cristal.position.y = nexus ? 5.4 : 5.8; g.add(cristal);
    g.userData.cristal = cristal;
    g.position.set(x, 0, z);
    return nova({ tipo: 'torre', time, obj: g, x, z, vida: CONFIG.torre.vida, vidaMax: CONFIG.torre.vida, raio: nexus ? 2.2 : 1.4, vel: 0, nexus, arenaRef: arena, altura: 6 });
  }
  function iaTorre(e) {
    if (e.morto) return;
    e.obj.userData.cristal.rotation.y += 0.02;
    if (E.t < e.prontoEm) return;
    let alvo = null, md = CONFIG.torre.alcance;
    // prioriza minions inimigos, depois heróis
    E.entidades.forEach(o => {
      if (o.morto || !inimigos(o, e) || !(o.tipo === 'minion' && o.arenaRef === e.arenaRef)) return;
      const d = dist(o, e); if (d < md) { md = d; alvo = o; }
    });
    if (!alvo && E.heroi && !E.heroi.morto && E.heroi.arena === e.arenaRef && inimigos(E.heroi, e) && dist(E.heroi, e) < CONFIG.torre.alcance) alvo = E.heroi;
    if (!alvo) return;
    e.prontoEm = E.t + CONFIG.torre.intervalo;
    const ang = Math.atan2(alvo.x - e.x, alvo.z - e.z), cor = e.time === 'azul' ? 0x7ea6ff : 0xff7a7a;
    if (alvo.tipo === 'minion') {
      atirar(e, ang, { vel: 20, restante: CONFIG.torre.alcance + 2, dano: alvo.vidaMax / CONFIG.torre.golpesParaMinion, y: 5, cor, tamanho: 1.1 });
      return;
    }
    // herói sem minions para protegê-lo: 3 disparos cada vez mais fortes (20%, 60%, 120% da vida)
    // a contagem fica no herói: duas torres juntas continuam a mesma sequência (3 disparos no total)
    const cfgT = CONFIG.torre, s = alvo.seqTorre;
    if (s && E.t - s.em < cfgT.intervalo * 0.9) { e.prontoEm = E.t + 0.2; return; }   // outra torre acabou de atirar nele
    const n = s && E.t - s.em < cfgT.esqueceSequencia + cfgT.intervalo ? Math.min(cfgT.sequencia.length - 1, s.n + 1) : 0;
    alvo.seqTorre = { n, em: E.t };
    atirar(e, ang, { vel: 22, restante: CONFIG.torre.alcance + 2, dano: alvo.vidaMax * cfgT.sequencia[n], verdadeiro: true, y: 5, cor, tamanho: 1.1 + n * 0.45 });
  }
  async function atualizarArenas() {
    for (const a of E.arenas) {
      const h = E.heroi;
      // quem não está inscrito só assiste: não entra
      if (h && !h.morto && h.arena !== a && dentroArena(a, h.x, h.z, 0.8)) {
        const dx = h.x - a.x, dz = h.z - a.z;
        if (Math.abs(dx) / (a.w / 2) > Math.abs(dz) / (a.h / 2)) h.x = a.x + (Math.sign(dx) || 1) * (a.w / 2 + 0.9);
        else h.z = a.z + (Math.sign(dz) || 1) * (a.h / 2 + 0.9);
      }
      if (a.fimEm && E.t > a.fimEm) reiniciarArena(a);
      const perto = h && (h.arena === a || dist(h, a) < 70);
      if (!perto || a.fimEm) continue;
      if (E.t >= a.proxOnda) {
        a.proxOnda = E.t + CONFIG.arena.minionsCada;
        const vivos = E.entidades.filter(e => e.arenaRef === a && e.tipo === 'minion' && !e.morto).length;
        if (vivos < 18) {
          for (const time of ['azul', 'vermelho']) {
            const nexus = a.torres.find(t => t.time === time && t.nexus);
            if (!nexus || nexus.morto) continue;
            for (let k = 0; k < 3; k++) {
              const m = await criarMinion(k === 2 ? 'balistico' : 'frente', time, nexus.x + (time === 'azul' ? 2.5 : -2.5), nexus.z + (k - 1) * 1.2);
              m.arenaRef = a;
            }
          }
        }
      }
    }
  }
  function verificarVitoria(a) {
    ['azul', 'vermelho'].forEach(time => {
      if (a.fimEm) return;
      if (a.torres.filter(t => t.time === time).every(t => t.morto)) {
        const venceu = time === 'vermelho' ? 'azul' : 'vermelho';
        a.fimEm = E.t + 10;
        const eu = E.heroi && E.heroi.arena === a;
        aviso('Arena ' + (a.indice + 1) + ': vitória do time ' + venceu + (eu ? (venceu === 'azul' ? ' · você venceu!' : ' · você perdeu') : ''));
        if (eu && venceu === 'azul') { ganhar(120, 200, true); P.pontosRank += 5; }
        if (eu) gancho('arenaFim', venceu === E.heroi.time);
      }
    });
  }
  function reiniciarArena(a) {
    a.fimEm = 0; a.inicio = E.t; a.proxOnda = E.t + 3;
    E.entidades.forEach(e => { if (e.arenaRef === a && e.tipo === 'minion') { e.morto = true; e.removerEm = E.t; } });
    a.torres.forEach(t => { t.morto = false; t.vida = t.vidaMax; t.obj.visible = true; });
    if (E.heroi && E.heroi.arena === a) { E.heroi.arena = null; E.heroi.time = 'jogador'; aviso('A partida acabou. Inscreva-se de novo no guichê para jogar outra.'); }
  }
  function inscreverArena(indice) {
    const a = E.arenas[indice], h = E.heroi;
    if (!a || !h) return 'Arena indisponível';
    if (h.arena) return 'Você já está inscrito';
    if (P.ouro < CONFIG.arena.inscricao) return 'Ouro insuficiente: a inscrição custa ' + CONFIG.arena.inscricao;
    P.ouro -= CONFIG.arena.inscricao; salvar();
    h.arena = a; h.time = 'azul'; a.inicio = E.t;
    h.x = a.x - a.w / 2 + 9; h.z = a.z + 2;
    hud();
    return null;
  }

  /* ======================= ITENS ======================= */
  function usarItem(item, mira) {
    const h = E.heroi; if (!h || h.morto || !P.inventario[item]) return false;
    P.inventario[item]--; salvar();
    if (item === 'cura') { curar(h, h.vidaMax); anelEfeito(h.x, h.z, 1.4, 0x6dff9c, 0.6, true); }
    if (item === 'vel') { h.velBonus = 0.5; h.velBonusAte = E.t + 4; }
    if (item === 'invis') { h.invisAte = E.t + 5; h.ilusao = false; }
    if (item === 'cacador') { h.cacadorAte = E.t + 60; }
    if (item === 'relogio') {
      const ang = mira ? mira.ang : h.rot, d = mira ? clamp(mira.dist, 3, 12) : 8;
      const p = atirar(h, ang, { vel: 14, restante: d, dano: 0, visual: 'brilho', cor: 0x9fd8ff, tamanho: 0.9 });
      const parar = (x, z) => { anelEfeito(x, z, 5, 0x9fd8ff, 0.8, true); area(x, z, 5, h, e => { e.congeladoAte = E.t + 5; }); };
      p.efeito = a => parar(a.x, a.z); p.aoAcabar = parar;
    }
    hud();
    return true;
  }
  function comprar(item) {
    const it = CONFIG.loja[item];
    if (!it) return 'Item desconhecido';
    if (P.ouro < it.preco) return 'Ouro insuficiente';
    P.ouro -= it.preco; P.inventario[item] = (P.inventario[item] || 0) + 1; salvar(); hud();
    return null;
  }

  /* ======================= AEROPORTO E PASSES ======================= */
  function comprarPasse(mapa, tipo) {
    const d = MAPAS.lista[mapa];
    if (C().estrelas < d.passe.nivel) return 'Precisa de nível ' + d.passe.nivel + ' (estrelas) com esta classe';
    const preco = d.passe.preco[tipo];
    if (P.ouro < preco) return 'Ouro insuficiente';
    const atual = P.passes[mapa];
    if (atual && atual.tipo === 'cidadania') return 'Você já tem cidadania em ' + d.nome;
    P.ouro -= preco;
    if (tipo === 'cidadania') P.passes[mapa] = { tipo, usos: Infinity };
    else P.passes[mapa] = { tipo, usos: (atual && atual.tipo !== 'cidadania' ? atual.usos : 0) + (tipo === 'ferias' ? 2 : 1) };
    salvar(); hud();
    return null;
  }
  async function viajar(mapa) {
    const p = P.passes[mapa];
    if (!p || !(p.usos > 0)) return 'Você não tem passe para ' + MAPAS.lista[mapa].nome;
    if (p.tipo !== 'cidadania') { p.usos--; if (p.usos <= 0) delete P.passes[mapa]; }
    salvar();
    await carregarMapa(mapa);
    aviso('Bem-vindo a ' + MAPAS.lista[mapa].nome);
    return null;
  }

  // Onde o herói volta: na arena, ao lado da última torre do campo dele (o nexus);
  // em equipe, perto de um companheiro vivo neste mapa; sozinho, no começo do mapa.
  function pontoRenascer(h) {
    if (h.arena) {
      const a = h.arena, nexus = a.torres.find(t => t.time === h.time && t.nexus);
      if (nexus) return [nexus.x + (a.x > nexus.x ? 3.5 : -3.5), nexus.z + 2.5];
      return [a.x - a.w / 2 + 9, a.z + 2];
    }
    const amigo = gancho('companheiroVivo');
    if (amigo && !zonaSeguraBloqueia(amigo)) {
      for (let k = 0; k < 8; k++) {
        const ang = k / 8 * Math.PI * 2, x = amigo.x + Math.cos(ang) * 2.5, z = amigo.z + Math.sin(ang) * 2.5;
        if (!naAgua(x, z) && Math.abs(x) < E.def.tam[0] / 2 && Math.abs(z) < E.def.tam[1] / 2) return [x, z];
      }
      return [amigo.x, amigo.z];
    }
    return [E.def.entrada[0], E.def.entrada[1]];
  }
  function zonaSeguraBloqueia(e) { return !!(e.arena || (E.arenas || []).some(a => dentroArena(a, e.x, e.z, 0))); }

  /* ======================= LAÇO ======================= */
  function passo(dt) {
    E.t += dt;
    if (E.agenda && E.agenda.length) {
      const prontos = E.agenda.filter(a => a.em <= E.t);
      E.agenda = E.agenda.filter(a => a.em > E.t);
      prontos.forEach(a => a.fn());
    }
    const h = E.heroi;
    if (h && h.salto && E.t > h.salto.ate) { h.cds[3] = E.t + CLASSES.atirador.cd[3]; h.salto = null; }
    // herói
    if (h) {
      if (h.morto) {
        if (E.t >= h.renasceEm) {
          h.morto = false; h.vida = h.vidaMax; h.escudo = 0;
          const lugar = pontoRenascer(h);
          h.x = lugar[0]; h.z = lugar[1];
          h.anim.tocar('renascer');
        }
        h.anim.mover(0);
      } else {
        let vel = 0;
        if (h.investida) {
          const iv = h.investida, v = 13 * dt;
          h.x += Math.sin(iv.ang) * v; h.z += Math.cos(iv.ang) * v; iv.resta -= dt;
          const tmI = tema(h);
          emitir('media', h.x - Math.sin(iv.ang) * 0.6, 0.3, h.z - Math.cos(iv.ang) * 0.6, { n: 2, cor: tmI.poeira, vel: 0.8, subida: 0.6, vida: 0.4 });
          if (fxSkin(h).rastro) fxSkin(h).rastro(h, iv);
          emitir('faisca', h.x, 0.9, h.z, { n: 2, cor: tmI.principal, vel: 3, dir: [-Math.sin(iv.ang), -Math.cos(iv.ang)], espalha: 0.3, vida: 0.25 });
          area(h.x, h.z, 1.4, h, e => {
            if (iv.atingidos.has(e)) return; iv.atingidos.add(e);
            emitir('faisca', e.x, 1, e.z, { n: 16, cor: tmI.faisca, vel: 5, subida: 2.5, grav: 10, vida: 0.45 });
            causarDano(e, CLASSES.soldado.dano * 1.6, h);
            if (e.tipo !== 'torre') { e.x += Math.sin(iv.ang) * 3; e.z += Math.cos(iv.ang) * 3; }
          });
          if (iv.resta <= 0) h.investida = null;
        } else if (h.classe === 'atirador' && Entrada.mag > 0.12 && h.anim && /^(ataque|habilidade1|habilidade2)$/.test(h.anim.estado || '') && !(h.travadoAte > E.t)) {
          // começou a andar no meio do tiro: o tiro é cancelado e ele só anda
          h.anim.aoAcertar = null; h.anim.cancelar && h.anim.cancelar();
        }
        if (!h.investida && !ocupadoHeroi(h) && Entrada.mag > 0.12) {
          const dir = Math.atan2(Entrada.x, Entrada.z);
          // atirando: o corpo fica virado para o alvo enquanto as pernas andam
          h.rot = girarPara(h.rot, dir, dt * 12);
          vel = h.vel * Entrada.mag * lentidao(h);
          h.x += Math.sin(dir) * vel * dt; h.z += Math.cos(dir) * vel * dt;
        }
        if (Entrada.atacando && E.t >= h.cds[0]) usar(0, Entrada.miraAtaque !== null ? { ang: Entrada.miraAtaque, dist: 10 } : null);
        h.anim.mover(vel);
      }
      h.x = clamp(h.x, -E.def.tam[0] / 2, E.def.tam[0] / 2);
      h.z = clamp(h.z, -E.def.tam[1] / 2, E.def.tam[1] / 2);
      empurrarSolidos(h);
    }
    // os outros
    for (const e of E.entidades) {
      const congelado = e.congeladoAte > E.t;
      if (e.anim && e.anim.mixer) e.anim.mixer.timeScale = congelado ? 0 : 1;
      if (e.tipo === 'mob') iaMob(e, dt);
      else if (e.tipo === 'minion') iaMinion(e, dt);
      else if (e.tipo === 'torre') iaTorre(e);
      else if (e.tipo === 'serpente') iaSerpente(e, dt);
      else if (e.tipo === 'clone') iaClone(e, dt);
    }
    gancho('passo', dt);
    atualizarFx(dt);
    if (R.Fx) R.Fx.atualizar(dt);
    atualizarVagalumes(dt);
    atualizarRastros(dt);
    // estrelinhas girando em cima de quem está atordoado
    if (Math.floor(E.t * 8) !== Math.floor((E.t - dt) * 8)) E.entidades.forEach(e => {
      if (e.morto || !(e.stunAte > E.t) || (e.obj && e.obj.visible === false)) return;
      const a = E.t * 7, hy = (e.altura || 1.8) * (e.obj && e.obj.scale ? e.obj.scale.y : 1) + 0.25;
      for (let i = 0; i < 3; i++) emitir('faisca', e.x + Math.cos(a + i * 2.09) * 0.45, hy, e.z + Math.sin(a + i * 2.09) * 0.45, { n: 1, cor: 0xffe36b, vel: 0, vida: 0.2 });
    });
    if (Math.floor(E.t / 60) !== Math.floor((E.t - dt) / 60) && aplicarTemporada(P)) { avisarTemporada(); salvar(); hud(); }
    atualizarOndas(dt); atualizarBarcos(dt); atualizarArenas(); atualizarChuva(dt);
    atualizarProjeteis(dt);
    for (let i = E.efeitos.length - 1; i >= 0; i--) if (E.efeitos[i].atualizar(dt) === true) E.efeitos.splice(i, 1);
    // remover o que acabou (minions mortos, clones)
    for (let i = E.entidades.length - 1; i >= 0; i--) {
      const e = E.entidades[i];
      if (e.removerEm !== undefined && E.t >= e.removerEm && (e.morto || e.tipo === 'clone')) {
        Skins.remover(e.obj); E.mundo.remove(e.obj); E.mundo.remove(e.barra); E.mundo.remove(e.sombra); if (e.seloSprite && e.seloSprite.parent) e.seloSprite.parent.remove(e.seloSprite);
        E.entidades.splice(i, 1);
      }
    }
    Skins.atualizar(dt);
    // posições na tela
    for (const e of E.entidades) {
      if (e.tipo !== 'serpente' && e.tipo !== 'torre') {
        // dentro do rio/lago o corpo afunda até as coxas (a água cobre as pernas)
        const fundo = !e.morto && !e.naoAfundaAgua && e.tipo !== 'clone' && naAgua(e.x, e.z) ? CONFIG.afundarAgua * (e.altura || 1.8) / 1.8 : 0;
        e.afundado = (e.afundado || 0) + (fundo - (e.afundado || 0)) * Math.min(1, dt * 6);
        e.obj.position.set(e.x, -e.afundado, e.z); e.obj.rotation.y = e.rot;
        if (e.afundado > 0.2 && (e.respingoEm || 0) < E.t && (e.anim && e.anim.velMov > 0.3)) {
          e.respingoEm = E.t + 0.35;
          emitir('faisca', e.x, 0.1, e.z, { n: 4, cor: 0xcfefff, vel: 1.2, subida: 1.4, grav: 6, vida: 0.4 });
          if (anelEfeito) anelEfeito(e.x, e.z, 0.9, 0xbfe8ff, 0.5, false);
        }
      }
      e.sombra.position.set(e.x, 0.06, e.z); e.sombra.visible = !e.morto && e.tipo !== 'serpente' && e.obj.visible !== false && !(e.afundado > 0.1);
      e.barra.position.set(e.x, (e.altura || 1.8) * (e.obj.scale ? e.obj.scale.y : 1) + 0.5 - (e.afundado || 0), e.z);
      desenharBarra(e);
      if (e === E.heroi && P.classe) selo(e, C().estrelas, true);
      if (e.seloSprite) atualizarSelo(e, dt);
    }
    if (h) visualHeroi(h);
  }
  function iaClone(c, dt) {
    const h = E.heroi;
    const k = clamp((c.removerEm - E.t) / 1, 0, 1);
    c.obj.traverse(n => { if (n.isMesh && n.material) n.material.opacity = 0.7 * k; });
    const fsC = fxSkin(c); if (fsC.clone) fsC.clone(c, clamp(1 - (c.removerEm - E.t) / (c.durClone || 4), 0, 1), dt);
    if (c.seguir && h) { c.x = h.x + Math.cos(h.rot) * 1.2; c.z = h.z - Math.sin(h.rot) * 1.2; c.rot = h.rot; c.anim.mover(h.anim.base === 'parado' ? 0 : 3); }
    if (c.atacaSozinho && E.t >= c.cdClone) {
      const alvo = alvoMaisPerto(c, 9);
      if (alvo) {
        c.cdClone = E.t + 1.1; c.rot = Math.atan2(alvo.x - c.x, alvo.z - c.z);
        c.anim.tocar('ataque', { momento: 0.5, aoAcertar: () => atirar(c, c.rot, { vel: 15, restante: 9.5, dano: CLASSES.mago.dano * 0.5, cor: 0xc58bff, tamanho: 0.8 }) });
      }
    }
  }
  function visualHeroi(h) {
    const invis = invisivel(h);
    if (h._invis !== invis) {
      h._invis = invis;
      h.obj.traverse(n => {
        if (!n.isMesh || !n.material) return;
        (Array.isArray(n.material) ? n.material : [n.material]).forEach(m => { m.transparent = invis; m.opacity = invis ? 0.35 : 1; m.needsUpdate = true; });
      });
    }
    // marcador do alvo do ataque básico (anel vermelho no chão)
    if (!h.marcaAlvo) {
      h.marcaAlvo = new THREE.Mesh(new THREE.RingGeometry(0.86, 0.95, 32), new THREE.MeshBasicMaterial({ color: 0xff5a4a, transparent: true, opacity: 0.45, depthWrite: false }));
      h.marcaAlvo.rotation.x = -Math.PI / 2; h.marcaAlvo.renderOrder = 7;
    }
    if (h.marcaAlvo.parent !== E.mundo) E.mundo.add(h.marcaAlvo);
    if (MIRA_AUX.ligada && h.alvoTravado && h.alvoTravado === h.alvoPreso && !alvoPreso(h)) h.alvoTravado = null;
    const ta = h.alvoTravado;
    const mostra = !!(ta && !ta.morto && h.travaAte > E.t && !(ta.obj && ta.obj.visible === false));
    h.marcaAlvo.visible = mostra;
    if (mostra) { const esc = Math.max(1, ta.raio * 1.3); h.marcaAlvo.position.set(ta.x, 0.12, ta.z); h.marcaAlvo.scale.setScalar(esc * (1 + 0.06 * Math.sin(E.t * 8))); }
    // olho cortado sobre a cabeça dentro da moita
    if (!h.olho) { h.olho = new THREE.Sprite(new THREE.SpriteMaterial({ map: R.olhoTex, depthWrite: false, transparent: true })); h.olho.scale.set(0.7, 0.7, 1); }
    if (h.olho.parent !== E.mundo) E.mundo.add(h.olho);
    h.olho.visible = naMoita(h.x, h.z) && !h.morto;
    h.olho.position.set(h.x, 2.9, h.z);
  }

  /* ======================= ENTRADA (joystick e mira) ======================= */
  const Entrada = { x: 0, z: 0, mag: 0, atacando: false, miraAtaque: null };

  /* ======================= TELA (HUD) ======================= */
  const $ = id => temDOM ? document.getElementById(id) : null;
  let avisoT = null;
  function aviso(txt) {
    if (!temDOM) { (E.avisos = E.avisos || []).push(txt); return; }
    const el = $('aviso'); if (!el) return;
    el.textContent = txt; el.hidden = false;
    clearTimeout(avisoT); avisoT = setTimeout(() => { el.hidden = true; }, 2600);
  }
  function hud() {
    if (!temDOM || !P.classe) return;
    const c = C(), r = rankInfo(c.estrelas), h = E.heroi;
    $('hudMapa').textContent = E.def ? E.def.nome : '';
    $('hudRank').innerHTML = `${CLASSES[P.classe].nome} · <b style="color:${CONFIG.coresElo[r.indice]}">${r.nome}</b> ★ ${r.estrelas}${r.indice < CONFIG.ranks.length - 1 ? '/50' : ''}` +
      ` · <small>${Math.floor(c.xp)}/${xpProximaEstrela(c.estrelas)} XP</small>` +
      (c.protecao ? ' · <span class="prot">proteção</span>' : '');
    $('hudOuro').textContent = Math.floor(P.ouro);
    Object.keys(CONFIG.loja).forEach(k => { const b = $('item_' + k); if (b) { b.querySelector('i').textContent = P.inventario[k] || 0; b.disabled = !P.inventario[k]; } });
    const cls = CLASSES[P.classe];
    $('bHab1').querySelector('span').textContent = cls.habs[0];
    $('bHab2').querySelector('span').textContent = cls.habs[1];
    $('bHab3').querySelector('span').textContent = cls.habs[2];
    if (h) $('hudVida').style.width = (100 * h.vida / h.vidaMax) + '%';
  }
  function hudQuadro() {
    if (!temDOM || !E.heroi) return;
    const h = E.heroi;
    $('hudVida').style.width = (100 * clamp(h.vida / h.vidaMax, 0, 1)) + '%';
    $('hudVidaTxt').textContent = Math.ceil(Math.max(0, h.vida)) + ' / ' + h.vidaMax;
    ['bAtaque', 'bHab1', 'bHab2', 'bHab3'].forEach((id, i) => {
      const resta = Math.max(0, h.cds[i] - E.t), el = $(id);
      const tot = i === 0 ? CLASSES[h.classe].cd[0] / velAtaque(h) : CLASSES[h.classe].cd[i];
      el.style.setProperty('--cd', (resta / tot * 100) + '%');
      let txt = resta > 0.05 && i > 0 ? Math.ceil(resta) : '';
      if (i === 3 && h.salto && E.t < h.salto.ate) txt = (CONFIG.atirador.saltos - h.salto.usados) + '×';   // pulos que sobram
      el.querySelector('b').textContent = txt;
    });
    // estados
    const tags = [];
    if (naAgua(h.x, h.z)) tags.push('na água: lento');
    if (naMoita(h.x, h.z)) tags.push('escondido na moita');
    if (zonaSegura(h.x, h.z)) tags.push('zona segura');
    if (dentroEvento(h)) tags.push('zona ranqueada');
    if (E.chuva && E.chuva.ativa) tags.push('chuva');
    if (h.arena) tags.push('arena · time azul');
    if (h.antiCuraAte > E.t) tags.push('cura cortada');
    if (h.aceleradoAte > E.t) tags.push('acelerado ' + Math.ceil(h.aceleradoAte - E.t) + ' s');
    if (h.explosivoAte > E.t) tags.push('tiros explosivos ' + Math.ceil(h.explosivoAte - E.t) + ' s');
    if (E.buffDano > 0) tags.push('+' + (E.buffDano * 100).toFixed(1) + '% dano');
    if (h.morto) tags.push('volta em ' + Math.max(0, Math.ceil(h.renasceEm - E.t)) + ' s');
    const txt = tags.join(' · ');
    const el = $('hudTags'); if (el.textContent !== txt) el.textContent = txt;
    // botão de interação
    const it = E.interacoes.find(i => Math.hypot(h.x - i.x, h.z - i.z) < i.raio);
    const bi = $('bInteragir');
    const rotulos = { loja: 'Abrir a loja', instrucoes: 'Instruções', aeroporto: 'Aeroporto', arena: 'Guichê da arena' };
    bi.hidden = !it || h.morto;
    if (it) { bi.textContent = rotulos[it.tipo]; bi.dataset.tipo = it.tipo; bi.dataset.arena = it.arenaIndice !== undefined ? it.arenaIndice : ''; }
  }

  function abrirModal(titulo, html, aoMontar) {
    $('modalTitulo').textContent = titulo;
    $('modalCorpo').innerHTML = html;
    $('modal').hidden = false;
    if (aoMontar) aoMontar($('modalCorpo'));
  }
  function fecharModal() { $('modal').hidden = true; }
  const fmt = n => n === Infinity ? '∞' : n;

  function telaLoja() {
    const linhas = Object.keys(CONFIG.loja).map(k => {
      const it = CONFIG.loja[k];
      return `<div class="linha"><div><b>${it.nome}</b><small>${it.desc}</small></div><div class="dir"><span class="preco">${it.preco} ouro</span><button class="acao" data-comprar="${k}" type="button">Comprar</button><small>você tem ${P.inventario[k] || 0}</small></div></div>`;
    }).join('');
    abrirModal('Lojinha de mantimentos', `<p class="nota">Seu ouro: <b>${Math.floor(P.ouro)}</b></p>${linhas}`, el => {
      el.querySelectorAll('[data-comprar]').forEach(b => b.addEventListener('click', () => {
        const erro = comprar(b.dataset.comprar); aviso(erro || 'Comprado: ' + CONFIG.loja[b.dataset.comprar].nome); telaLoja();
      }));
    });
  }
  function telaGraficos() {
    const Fx = global.Efeitos; if (!Fx) return;
    const q = Fx.qualidade;
    abrirModal('Gráficos', `
      <p class="nota">Alta liga o brilho nos efeitos (mais bonito, pesa um pouco). Baixa deixa o jogo mais leve em celulares mais simples.</p>
      <div class="botoes"><button class="acao ${q === 'alta' ? 'forte' : ''}" data-q="alta" type="button">Alta</button>
      <button class="acao ${q === 'baixa' ? 'forte' : ''}" data-q="baixa" type="button">Baixa</button></div>
      <p class="nota">A página recarrega para aplicar.</p>`, el => {
      el.querySelectorAll('[data-q]').forEach(b => b.addEventListener('click', () => { if (b.dataset.q === q) return fecharModal(); Fx.definirQualidade(b.dataset.q); global.location.reload(); }));
    });
    $('modalFechar').hidden = false;
  }
  function telaInstrucoes() {
    abrirModal('Como jogar', `
      <p>O objetivo é jogar junto com os amigos, ficar mais forte e se divertir.</p>
      <ul>
        <li><b>Andar:</b> arraste o dedo na metade esquerda da tela.</li>
        <li><b>Atacar:</b> toque no botão de ataque; segure para atacar sem parar.</li>
        <li><b>Habilidades:</b> toque para mirar sozinho, ou arraste o botão para escolher a direção, como nos MOBAs.</li>
        <li><b>Estrelas:</b> derrotando mobs, minions e jogadores você ganha XP. Cada estrela pede mais XP que a anterior: no primeiro rank, 50, 100, 150...; a partir do segundo, 1000 a mais por estrela, e o salto cresce 1000 a cada rank. 50 estrelas sobem o rank (Beginner até Immortal God, que não tem limite). A cada 2 meses começa uma nova temporada e todos voltam 2 ranks. Cada classe tem suas próprias estrelas.</li>
        <li><b>Força:</b> cada estrela dá +0,5% de poder e +0,2% de velocidade de ataque. Do Epic em diante também crítico e roubo de vida.</li>
        <li><b>Proteção:</b> a cada ${CONFIG.vitoriasProtecao} vitórias você ganha uma proteção que segura a primeira estrela que você perderia.</li>
        <li><b>Moitas:</b> dentro delas ninguém de fora vê você (aparece o olho cortado).</li>
        <li><b>Água:</b> rios e lagos deixam todos mais lentos.</li>
        <li><b>Viajar:</b> no aeroporto, no fim de cada mapa, compre passe simples (só ida), férias (ida e volta) ou cidadania (vitalícia).</li>
      </ul>`);
  }
  function telaAeroporto() {
    const linhas = MAPAS.ordem.filter(m => m !== E.mapa).map(m => {
      const d = MAPAS.lista[m], p = P.passes[m];
      const tem = p && p.usos > 0;
      const bloqueado = C().estrelas < d.passe.nivel;
      return `<div class="linha bloco"><div><b>${d.nome}</b><small>Nível ${d.passe.nivel} · ${tem ? 'seu passe: ' + p.tipo + ' (' + fmt(p.usos) + ' uso' + (p.usos === 1 ? '' : 's') + ')' : 'sem passe'}</small></div>
        <div class="botoes">
          ${['simples', 'ferias', 'cidadania'].map(t => `<button class="acao fina" type="button" data-passe="${m}" data-tipo="${t}" ${bloqueado ? 'disabled' : ''}>${{ simples: 'Simples', ferias: 'Férias', cidadania: 'Cidadania' }[t]} · ${d.passe.preco[t]}</button>`).join('')}
          <button class="acao forte" type="button" data-viajar="${m}" ${tem ? '' : 'disabled'}>Viajar</button>
        </div></div>`;
    }).join('');
    abrirModal('Aeroporto · zona segura', `<p class="nota">Ouro: <b>${Math.floor(P.ouro)}</b> · Estrelas desta classe: <b>${C().estrelas}</b>. Simples = só ida. Férias = ida e volta. Cidadania = ir e vir para sempre.</p>${linhas}`, el => {
      el.querySelectorAll('[data-passe]').forEach(b => b.addEventListener('click', () => { const e = comprarPasse(b.dataset.passe, b.dataset.tipo); aviso(e || 'Passe comprado'); telaAeroporto(); }));
      el.querySelectorAll('[data-viajar]').forEach(b => b.addEventListener('click', async () => { fecharModal(); const e = await viajar(b.dataset.viajar); if (e) aviso(e); }));
    });
  }
  function telaArena(indice) {
    const a = E.arenas[indice], h = E.heroi;
    abrirModal('Guichê da Arena ' + (indice + 1), `
      <p>Partidas de 4 contra 4. Cada time tem 6 torres; ganha quem derrubar as 6 do outro.</p>
      ${gancho('eventoArenaTexto') || ''}
      <p class="nota">As torres têm defesa: cada jogador tira no máximo ${Math.round(CONFIG.torre.limitePorJogador * 100)}% da vida de uma torre a cada ${CONFIG.torre.janelaLimite} s. Sem minions por perto, a torre derruba um herói em 3 disparos.</p>
      <p class="nota">Na arena, cair só tira estrela se for para o time rival. O tempo para voltar começa em ${CONFIG.arena.respawnBase} s e sobe ${CONFIG.arena.respawnPasso} s a cada 5 minutos, até ${CONFIG.arena.respawnMax} s.</p>
      <p class="nota">Quem não está inscrito só pode assistir de fora do cercado.</p>
      <button class="acao forte" id="bInscrever" type="button" ${h.arena ? 'disabled' : ''}>${h.arena ? 'Você já está inscrito' : 'Inscrever no time azul · ' + CONFIG.arena.inscricao + ' ouro'}</button>`, el => {
      const b = el.querySelector('#bInscrever');
      b.addEventListener('click', () => { const e = inscreverArena(indice); aviso(e || 'Inscrito! Derrube as torres vermelhas.'); if (!e) fecharModal(); });
    });
  }
  function telaRanking(qual) {
    const nomes = { clas: 'Ranking de Clãs', players: 'Ranking de Players', farm: 'Ranking de Farme', top: 'Ranking Top' };
    const meu = {
      clas: P.clan ? P.pontosRank : null,
      players: Object.values(P.classes).reduce((s, c) => s + c.estrelas, 0),
      farm: Math.floor(P.ouroTotal),
      top: Math.floor(P.danoTotal * bonus().poder)
    }[qual];
    const servidor = Jogo.rankingServidor && Jogo.rankingServidor[qual];
    if (!servidor) gancho('pedirRanking', qual);
    const lista = (servidor || []).slice(0, 30).map((l, i) => `<li><span>${i + 1}. ${l.nome}</span><b>${l.valor}</b></li>`).join('');
    abrirModal(nomes[qual], `
      ${lista ? '<ol class="rank">' + lista + '</ol>' : '<p class="nota">A lista dos 30 melhores aparece quando o servidor estiver ligado. Para entrar nela, sua pontuação precisa passar a do 30º colocado.</p>'}
      <div class="linha minha"><span>Sua posição</span><b>${meu === null ? 'Entre em um clã para pontuar' : meu}</b></div>`);
  }
  function telaPassaportes() {
    const l = Object.keys(P.passes).map(m => `<div class="linha"><span>${MAPAS.lista[m].nome}</span><b>${P.passes[m].tipo} · ${fmt(P.passes[m].usos)} uso(s)</b></div>`).join('');
    abrirModal('Passaportes', l || '<p class="nota">Você ainda não tem passes. Compre no aeroporto, no fim do mapa.</p>');
  }
  // trocar de herói só na praça do começo do mapa (onde o jogador nasce)
  function naPracaInicio(h) {
    if (!h || !E.def) return true;
    if (h.arena) return false;
    const [ex, ez] = E.def.entrada;
    const praca = (E.def.pracas || []).find(p => Math.hypot(ex - p.x, ez - p.z) < Math.max(p.w, p.h) / 2 + 3);
    if (praca) return Math.hypot(h.x - praca.x, h.z - praca.z) < Math.max(praca.w, praca.h) / 2 + 1.5;
    return Math.hypot(h.x - ex, h.z - ez) < 12;
  }
  function telaHeroi(primeiraVez) {
    if (!primeiraVez && E.heroi && !naPracaInicio(E.heroi)) { aviso('Para trocar de herói, volte à praça do começo do mapa'); return; }
    const classes = Object.keys(CLASSES).map(k => {
      const c = P.classes[k], r = rankInfo(c.estrelas);
      return `<button type="button" class="classe ${P.classe === k ? 'sel' : ''}" data-classe="${k}"><b>${CLASSES[k].nome}</b><small>${r.nome} ★ ${r.estrelas}</small><small>${CLASSES[k].habs.join(' · ')}</small></button>`;
    }).join('');
    const cores = CORES.map(c => `<button type="button" class="cor ${P.cor === c ? 'sel' : ''}" data-cor="${c}" style="background:${c}" aria-label="Cor ${c}"></button>`).join('');
    let escolha = { classe: P.classe || 'soldado', genero: P.genero, cor: P.cor };
    abrirModal(primeiraVez ? 'Escolha seu herói' : 'Trocar herói', `
      <div class="classes">${classes}</div>
      <div class="linha"><span>Versão</span><div class="botoes"><button type="button" class="acao fina ${escolha.genero === 'm' ? 'sel' : ''}" data-genero="m">Homem</button><button type="button" class="acao fina ${escolha.genero === 'f' ? 'sel' : ''}" data-genero="f">Mulher</button></div></div>
      <div class="linha"><span>Cor</span><div class="cores">${cores}</div></div>
      <p class="nota">As estrelas ficam guardadas em cada classe: trocar não leva a experiência junto.</p>
      <button class="acao forte" id="bConfirmarHeroi" type="button">Jogar</button>`, el => {
      const marcar = (sel, attr, val) => el.querySelectorAll(sel).forEach(b => b.classList.toggle('sel', b.dataset[attr] === val));
      if (!P.classe) marcar('[data-classe]', 'classe', escolha.classe);
      el.querySelectorAll('[data-classe]').forEach(b => b.addEventListener('click', () => { escolha.classe = b.dataset.classe; marcar('[data-classe]', 'classe', escolha.classe); }));
      el.querySelectorAll('[data-genero]').forEach(b => b.addEventListener('click', () => { escolha.genero = b.dataset.genero; marcar('[data-genero]', 'genero', escolha.genero); }));
      el.querySelectorAll('[data-cor]').forEach(b => b.addEventListener('click', () => { escolha.cor = b.dataset.cor; marcar('[data-cor]', 'cor', escolha.cor); }));
      el.querySelector('#bConfirmarHeroi').addEventListener('click', async () => {
        const mudouModelo = escolha.classe !== P.classe || escolha.genero !== P.genero;
        P.classe = escolha.classe; P.genero = escolha.genero; P.cor = escolha.cor; salvar();
        fecharModal();
        if (!E.heroi || mudouModelo) { await criarHeroi(); }
        else Skins.trocarCor(E.heroi.obj, P.cor);
        hud();
      });
    });
    if (!primeiraVez) $('modalFechar').hidden = false; else $('modalFechar').hidden = true;
  }

  function textoMira() { const b = temDOM && document.querySelector('[data-menu="mira"]'); if (b) b.textContent = 'Mira auxiliar: ' + (MIRA_AUX.ligada ? 'ligada' : 'desligada'); }
  // coluna de itens: arrasta pela alça para qualquer lugar e minimiza no "–" (fica salvo neste celular)
  function ligarItens() {
    const box = $('itens'); if (!box) return;
    const alca = box.querySelector('.alca'), min = box.querySelector('.min'); if (!alca || !min) return;
    const CH = 'vilkron_itens';
    let est = {}; try { est = JSON.parse(global.localStorage.getItem(CH) || '{}') || {}; } catch (e) {}
    const guardar = () => { try { global.localStorage.setItem(CH, JSON.stringify(est)); } catch (e) {} };
    const colocar = () => {
      box.classList.toggle('minimizado', !!est.min); min.textContent = est.min ? '+' : '–';
      min.setAttribute('aria-label', est.min ? 'Mostrar itens' : 'Minimizar itens');
      if (est.x === undefined) { box.classList.remove('movido'); box.style.left = box.style.top = ''; return; }
      const r = box.getBoundingClientRect(), W = global.innerWidth, H = global.innerHeight;
      const x = clamp(est.x, 4, Math.max(4, W - r.width - 4)), y = clamp(est.y, 4, Math.max(4, H - r.height - 4));
      box.classList.add('movido'); box.style.left = x + 'px'; box.style.top = y + 'px';
    };
    min.addEventListener('pointerdown', e => e.stopPropagation());
    min.addEventListener('click', e => { e.stopPropagation(); est.min = !est.min; guardar(); colocar(); });
    let id = null, ox = 0, oy = 0, mexeu = false;
    alca.addEventListener('pointerdown', e => {
      id = e.pointerId; mexeu = false; const r = box.getBoundingClientRect(); ox = e.clientX - r.left; oy = e.clientY - r.top;
      alca.setPointerCapture(e.pointerId); e.preventDefault();
    });
    alca.addEventListener('pointermove', e => {
      if (e.pointerId !== id) return; mexeu = true;
      est.x = e.clientX - ox; est.y = e.clientY - oy; colocar();
    });
    const soltar = e => { if (e.pointerId !== id) return; id = null; if (mexeu) guardar(); };
    alca.addEventListener('pointerup', soltar); alca.addEventListener('pointercancel', soltar);
    // dois toques na alça: volta para o lugar de fábrica
    let ultimo = 0; alca.addEventListener('click', () => { const t = Date.now(); if (t - ultimo < 350) { delete est.x; delete est.y; guardar(); colocar(); } ultimo = t; });
    global.addEventListener('resize', colocar);
    colocar();
  }
  function ligarControles() {
    textoMira(); ligarItens();
    const canvas = R.renderer.domElement;
    const joy = $('joy'), knob = joy.querySelector('i');
    let joyId = null, jx = 0, jy = 0;
    canvas.addEventListener('pointerdown', e => {
      if (joyId !== null || e.clientX > global.innerWidth * 0.55) return;
      joyId = e.pointerId; jx = e.clientX; jy = e.clientY;
      joy.style.left = jx + 'px'; joy.style.top = jy + 'px'; joy.hidden = false; knob.style.transform = '';
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', e => {
      if (e.pointerId !== joyId) return;
      let dx = e.clientX - jx, dy = e.clientY - jy; const d = Math.hypot(dx, dy), k = d > 60 ? 60 / d : 1;
      dx *= k; dy *= k; knob.style.transform = `translate(${dx}px, ${dy}px)`;
      Entrada.x = dx / 60; Entrada.z = dy / 60; Entrada.mag = Math.min(1, Math.hypot(Entrada.x, Entrada.z));
    });
    const soltar = e => { if (e.pointerId !== joyId) return; joyId = null; joy.hidden = true; Entrada.x = Entrada.z = Entrada.mag = 0; };
    canvas.addEventListener('pointerup', soltar); canvas.addEventListener('pointercancel', soltar);

    // teclado (computador)
    const teclas = {};
    const doTeclado = () => {
      if (joyId !== null) return;
      let x = 0, z = 0;
      if (teclas.a || teclas.arrowleft) x--; if (teclas.d || teclas.arrowright) x++;
      if (teclas.w || teclas.arrowup) z--; if (teclas.s || teclas.arrowdown) z++;
      Entrada.x = x; Entrada.z = z; Entrada.mag = Math.min(1, Math.hypot(x, z));
    };
    global.addEventListener('keydown', e => {
      const k = e.key.toLowerCase(); teclas[k] = true; doTeclado();
      if (k === 'j') Entrada.atacando = true;
      if (k === 'k') usar(1, null);
      if (k === 'l') usar(2, null);
      if (k === 'u') usar(3, null);
    });
    global.addEventListener('keyup', e => { const k = e.key.toLowerCase(); teclas[k] = false; doTeclado(); if (k === 'j') Entrada.atacando = false; });

    // ataque: segurar ataca sem parar
    // ataque: segurar ataca sem parar; arrastar o dedo escolhe a direção (mira assistida)
    const bA = $('bAtaque'), miraEl = $('mira');
    let idA = null, axc = 0, ayc = 0;
    bA.addEventListener('pointerdown', e => {
      e.preventDefault(); idA = e.pointerId; const r = bA.getBoundingClientRect();
      axc = r.left + r.width / 2; ayc = r.top + r.height / 2;
      try { bA.setPointerCapture(e.pointerId); } catch (er) {}
      Entrada.atacando = true; Entrada.miraAtaque = null; bA.classList.add('ativo');
    });
    bA.addEventListener('pointermove', e => {
      if (e.pointerId !== idA) return;
      const dx = e.clientX - axc, dy = e.clientY - ayc, d = Math.hypot(dx, dy);
      if (d > 16) { Entrada.miraAtaque = Math.atan2(dx, dy); miraEl.hidden = false; miraEl.dataset.ang = Entrada.miraAtaque; miraEl.dataset.dist = 1; }
      else { Entrada.miraAtaque = null; miraEl.hidden = true; }
    });
    const soltarA = e => { if (e.pointerId !== idA) return; idA = null; Entrada.atacando = false; Entrada.miraAtaque = null; miraEl.hidden = true; bA.classList.remove('ativo'); };
    ['pointerup', 'pointercancel'].forEach(t => bA.addEventListener(t, soltarA));

    // habilidades e relógio: toque mira sozinho, arrastar escolhe direção
    const mira = $('mira');
    function botaoMira(el, aoSoltar) {
      let id = null, cx = 0, cy = 0, dx = 0, dy = 0;
      el.addEventListener('pointerdown', e => {
        e.preventDefault(); id = e.pointerId; const r = el.getBoundingClientRect();
        cx = r.left + r.width / 2; cy = r.top + r.height / 2; dx = dy = 0;
        el.setPointerCapture(e.pointerId); el.classList.add('ativo');
      });
      el.addEventListener('pointermove', e => {
        if (e.pointerId !== id) return;
        dx = e.clientX - cx; dy = e.clientY - cy;
        const d = Math.hypot(dx, dy);
        if (d > 12) { mira.hidden = false; mira.dataset.ang = Math.atan2(dx, dy); mira.dataset.dist = Math.min(1, d / 90); }
        else mira.hidden = true;
      });
      const fim = e => {
        if (e.pointerId !== id) return;
        id = null; el.classList.remove('ativo'); mira.hidden = true;
        const d = Math.hypot(dx, dy);
        aoSoltar(d > 12 ? { ang: Math.atan2(dx, dy), dist: Math.min(1, d / 90) * 10 } : null);
      };
      el.addEventListener('pointerup', fim); el.addEventListener('pointercancel', fim);
    }
    botaoMira($('bHab1'), m => usar(1, m));
    botaoMira($('bHab2'), m => usar(2, m));
    botaoMira($('bHab3'), m => usar(3, m));
    Object.keys(CONFIG.loja).forEach(k => {
      const b = $('item_' + k);
      if (k === 'relogio') botaoMira(b, m => { if (!usarItem(k, m)) aviso('Sem relógio no inventário'); });
      else b.addEventListener('click', () => { if (!usarItem(k)) aviso('Compre na lojinha da praça do mapa 1'); });
    });

    $('bInteragir').addEventListener('click', () => {
      const t = $('bInteragir').dataset.tipo;
      if (t === 'loja') telaLoja();
      if (t === 'instrucoes') telaInstrucoes();
      if (t === 'aeroporto') telaAeroporto();
      if (t === 'arena') telaArena(Number($('bInteragir').dataset.arena));
    });
    $('modalFechar').addEventListener('click', fecharModal);
    $('bMenu').addEventListener('click', () => { const m = $('menu'); m.hidden = !m.hidden; });
    $('menu').querySelectorAll('[data-menu]').forEach(b => b.addEventListener('click', () => {
      $('menu').hidden = true;
      const q = b.dataset.menu;
      if (q === 'passaportes') telaPassaportes();
      else if (q === 'heroi') telaHeroi(false);
      else if (q === 'instrucoes') telaInstrucoes();
      else if (q === 'graficos') telaGraficos();
      else if (q === 'mira') {
        MIRA_AUX.ligada = !MIRA_AUX.ligada;
        try { global.localStorage.setItem('vilkron_mira_aux', MIRA_AUX.ligada ? '1' : '0'); } catch (e) {}
        if (!MIRA_AUX.ligada && E.heroi) { E.heroi.alvoPreso = null; E.heroi.travaAte = E.t + 2.5; }
        textoMira(); aviso('Mira auxiliar ' + (MIRA_AUX.ligada ? 'ligada: o alvo escolhido fica marcado até cair, sumir ou ficar longe' : 'desligada'));
      }
      else if (gancho('menu', q) === true) { /* tratado pelo painel online */ }
      else telaRanking(q);
    }));
  }
  function desenharMira() {
    const mira = $('mira'), h = E.heroi;
    if (!mira || mira.hidden || !h) { if (E.marcaMira) E.marcaMira.visible = false; return; }
    if (!E.marcaMira) {
      E.marcaMira = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 1), new THREE.MeshBasicMaterial({ color: 0xffe9b0, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }));
      E.marcaMira.rotation.x = -Math.PI / 2; E.marcaMira.renderOrder = 7;
    }
    if (E.marcaMira.parent !== E.mundo) E.mundo.add(E.marcaMira);
    const ang = Number(mira.dataset.ang), d = 2 + Number(mira.dataset.dist) * 8;
    E.marcaMira.visible = true;
    E.marcaMira.scale.set(1, d, 1);
    E.marcaMira.position.set(h.x + Math.sin(ang) * d / 2, 0.15, h.z + Math.cos(ang) * d / 2);
    E.marcaMira.rotation.z = ang + Math.PI;
  }

  /* ======================= INÍCIO ======================= */
  let relogio = null;
  const alvoCam = THREE.Vector3 ? new THREE.Vector3() : null;
  function quadro() {
    const dt = Math.min(0.05, relogio.getDelta());
    passo(dt);
    const h = E.heroi;
    if (h) {
      alvoCam.set(h.x, 13, h.z + 11);
      R.camera.position.lerp(alvoCam, 1 - Math.pow(0.001, dt));
      R.camera.lookAt(h.x, 0.8, h.z);
      // tremor da tela (pisão do golem, terremoto do soldado)
      if (E.tremor && E.tremor.ate > E.t) {
        const f = E.tremor.forca * (E.tremor.ate - E.t) / E.tremor.dur;
        R.camera.position.x += (Math.random() - 0.5) * f; R.camera.position.y += (Math.random() - 0.5) * f * 0.6;
      }
    }
    desenharMira(); hudQuadro();
    if (R.composer) R.composer.render(); else R.renderer.render(R.scene, R.camera);
    global.requestAnimationFrame(quadro);
  }
  async function iniciar() {
    if (P.viradaTemporada) { delete P.viradaTemporada; avisarTemporada(); salvar(); }
    iniciarCena(temDOM ? $('jogo') : null);
    await carregarMapa(P.mapa && MAPAS.lista[P.mapa] ? P.mapa : 'mapa1');
    if (temDOM) {
      ligarControles();
      $('carregando').hidden = true;
      relogio = new THREE.Clock();
      if (!P.classe) telaHeroi(true);
      else { await criarHeroi(); }
      // espera escolher o herói para começar a desenhar
      const esperar = () => (E.heroi ? quadro() : setTimeout(esperar, 100));
      esperar();
    }
  }

  // troca o perfil inteiro (vindo do servidor) sem perder a referência
  function avisarTemporada() {
    if (temDOM) setTimeout(() => aviso('Nova temporada! Todos voltaram ' + CONFIG.temporadaVolta + ' elos. Boa subida!'), 1500);
  }
  function aplicarPerfil(dados) {
    const novo = Object.assign(perfilPadrao(), dados || {});
    novo.classes = Object.assign(perfilPadrao().classes, (dados && dados.classes) || {});
    Object.keys(novo.classes).forEach(k => { novo.classes[k] = Object.assign({ xp: 0, estrelas: 0, protecao: false, vitorias: 0 }, novo.classes[k]); subirEstrelas(novo.classes[k]); });
    const virou = aplicarTemporada(novo);
    Object.keys(P).forEach(k => { delete P[k]; });
    Object.assign(P, novo);
    if (virou) { avisarTemporada(); salvar(); }
    hud();
  }
  const Jogo = global.Jogo = {
    CONFIG, CLASSES, CORES, iniciar, rankingServidor: null, ajustes: null, ganchos: G, poderes: PODERES,
    api: {
      get P() { return P; }, E, R, aviso, abrirModal, fecharModal, hud, salvar, ganhar, criarHeroi, nova, textoSprite,
      atirar, causarDano, bolha, anelEfeito, curar, controlar, emitir, aura, fumaca, tema, TEMAS, rankInfo, bonus, aplicarPerfil, carregarMapa, zonaSegura, naMoita, invisivel,
      telaHeroi, telaRanking, perfilPadrao, dist, selo, xpProximaEstrela, temporadaAtual, aplicarTemporada
    },
    // usado nos testes sem tela
    _t: { CONFIG, E, P, R, MIRA_AUX, naPracaInicio, xpProximaEstrela, aplicarTemporada, temporadaAtual, selo, passo, carregarMapa, criarHeroi, usar, usarItem, comprar, comprarPasse, viajar, inscreverArena, naAgua, naMoita, zonaSegura, causarDano, Entrada, rankInfo, bonus, ganhar, iniciarCena }
  };
  if (temDOM && !global.ESPERAR_LOGIN) global.addEventListener('load', () => Jogo.iniciar().catch(err => {
    const el = $('carregando'); if (el) el.innerHTML = '<div>NÃO FOI POSSÍVEL INICIAR<p>' + (err && err.message || err) + '</p></div>';
    console.error(err);
  }));
})(typeof window !== 'undefined' ? window : globalThis);
