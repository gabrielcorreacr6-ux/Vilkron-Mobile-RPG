/* ============================================================
   SISTEMA DE SKINS + ANIMAÇÃO — Three.js r128 (THREE global)

   - Personagens: 4 classes x 2 gêneros, cor escolhida, skins futuras
   - Mobs com variantes e escala por mapa; minions neutros e de time
   - Texturas do mapa com cor reserva
   - Animações: toca clipes do Mixamo (.fbx/.glb) quando existem e,
     enquanto não existem, anima por código (respirar, andar, atacar,
     levar dano, morrer). A aranha é montada e animada só por código.

   Arquivo ausente nunca quebra o jogo: vira forma provisória animada.

   Scripts necessários, nesta ordem:
     three.min.js (r128)
     examples/js/loaders/GLTFLoader.js      (modelos .glb)
     examples/js/libs/fflate.min.js         (exigido pelo FBXLoader)
     examples/js/loaders/FBXLoader.js       (arquivos do Mixamo)
     examples/js/utils/SkeletonUtils.js     (clonar bonecos com ossos)
     skins.js
   ============================================================ */
(function (global) {
  'use strict';
  const THREE = global.THREE;
  const BASE = 'assets/';
  const ALTURA_HEROI = 1.8;

  /* ================= CATÁLOGO ================= */
  // Skin nova: adicione em "skins" da classe e suba
  // assets/chars/{classe}_{m|f}_{id}.glb (ou .fbx)
  const CATALOGO = {
    classes: {
      suporte:  { nome: 'Suporte',  corPadrao: '#3fc1b0', skins: [
        { id: 'default', nome: 'Padrão', aceitaCor: true, preco: 0 } ] },
      soldado:  { nome: 'Soldado',  corPadrao: '#c0392b', skins: [
        { id: 'default', nome: 'Padrão', aceitaCor: true, preco: 0 } ] },
      mago:     { nome: 'Mago',     corPadrao: '#8e44ad', skins: [
        { id: 'default', nome: 'Padrão', aceitaCor: true, preco: 0 } ] },
      atirador: { nome: 'Atirador', corPadrao: '#d68910', skins: [
        { id: 'default', nome: 'Padrão', aceitaCor: true, preco: 0 } ] }
    },
    generos: { m: 'Homem', f: 'Mulher' },

    mapas: {
      mapa1:    { escalaMob: 1.0,  variante: 'default' },
      mapa2:    { escalaMob: 1.25, variante: 'chuva' },
      mapa3:    { escalaMob: 1.5,  variante: 'anciao' },
      arenas:   { escalaMob: 1.5,  variante: 'default' },
      ascensao: { escalaMob: 1.8,  variante: 'ascensao' },
      repouso:  { escalaMob: 1.0,  variante: 'default' }
    },

    // anim: 'humanoide' (Mixamo), 'quadrupede', 'aranha' (só código), 'livre'
    mobs: {
      maestro:  { nome: 'Maestro',        altura: 1.9, cor: '#7f8c8d', anim: 'humanoide' },
      veterano: { nome: 'Veterano',       altura: 1.7, cor: '#a0522d', anim: 'humanoide' },
      dragao:   { nome: 'Pequeno Dragão', altura: 1.2, cor: '#c0392b', anim: 'quadrupede' },
      barao:    { nome: 'Barão do Ouro',  altura: 1.5, cor: '#d4ac0d', anim: 'humanoide' },
      aranha:   { nome: 'Aranha',         altura: 1.0, cor: '#5b2c8f', cor2: '#9cff3a', anim: 'aranha' },
      golem:    { nome: 'Golem da Chuva', altura: 4.5, cor: '#2e86c1', anim: 'humanoide' },
      serpente: { nome: 'Serpente',       altura: 3.0, cor: '#148f77', anim: 'livre' }
    },

    // Os três minions usam o mesmo goblin (minions/frente_neutro.glb); o que muda são os
    // objetos montados por código: adaga, arco com aljava, ou um saco de ouro nas costas.
    minions: {
      frente:     { altura: 0.8, cor: '#95a5a6', modelo: 'frente', aderecos: ['adaga'] },
      balistico:  { altura: 0.8, cor: '#7f8c8d', modelo: 'frente', aderecos: ['arco', 'aljava'] },
      carregador: { altura: 0.8, cor: '#f1c40f', modelo: 'frente', aderecos: ['saco'] }
    },
    times: { neutro: null, azul: '#2e5bff', vermelho: '#e0262b' },

    // Formatos tentados, em ordem, para modelos de personagens e mobs
    formatosModelo: ['glb', 'fbx'],

    // ANIMAÇÕES: liste aqui só os arquivos que você já subiu em
    // assets/anims/<pasta>/<estado>.fbx — o jogo não pede o que não está listado.
    // Estados: parado, andar, correr, ataque, habilidade1, habilidade2,
    //          habilidade3, dano, morte
    // A busca vai do mais específico ao geral. Ex. para o Soldado homem:
    //   soldado_m -> soldado -> humanoide
    formatoAnim: 'fbx',
    // Quanto tempo (segundos) cada animação de uma vez dura no jogo.
    // O clipe é acelerado ou freado para caber. Ajuste à vontade.
    duracoes: { ataque: 0.9, habilidade1: 1.0, habilidade2: 0.8, habilidade3: 1.3, dano: 0.45, morte: 1.6 },
    // Ajustes por classe: qual animação do arquivo usar em cada habilidade
    // (clipe = nome da animação no .glb) e quantas voltas o corpo dá por código.
    // variacoes: o ataque básico alterna entre esses golpes (os que existirem no arquivo)
    // andando: atirar correndo (as pernas seguem a corrida, os braços atiram)
    // Variações: pedaços de combos viram golpes separados (de/ate = fração da animação,
    // golpe = momento do acerto dentro do pedaço). A sequência segue em ordem, como um combo,
    // e recomeça se o jogador parar de atacar.
    habilidades: {
      soldado: {
        habilidade1: { clipe: 'extra_golpe_carregado', voltas: 1 },
        habilidade3: { clipe: 'extra_golpe_chao' },
        ataque: { variacoes: [
          { clipe: 'extra_combo', de: 0.0, ate: 0.28, golpe: 0.55 },
          { clipe: 'extra_combo', de: 0.28, ate: 0.52, golpe: 0.45 },
          { clipe: 'extra_combo', de: 0.52, ate: 0.95, golpe: 0.2 },
          { clipe: 'ataque', golpe: 0.38 },
          { clipe: 'extra_combo_1', de: 0.1, ate: 0.28, golpe: 0.5 },
          { clipe: 'extra_combo_1', de: 0.28, ate: 0.58, golpe: 0.4 },
          { clipe: 'extra_combo_1', de: 0.58, ate: 0.8, golpe: 0.55 },
          { clipe: 'extra_golpe_para_cima', golpe: 0.33 },
          { clipe: 'extra_combo_2', de: 0.05, ate: 0.3, golpe: 0.8 },
          { clipe: 'extra_combo_2', de: 0.3, ate: 0.55, golpe: 0.6 },
          { clipe: 'extra_combo_2', de: 0.55, ate: 0.73, golpe: 0.7 },
          { clipe: 'extra_combo_2', de: 0.73, ate: 0.97, golpe: 0.4 }
        ] }
      },
      // atirador de energia: sem arma, a bola sai da mão; pode atirar correndo
      atirador: {
        ataque: { andando: true, variacoes: [
          { clipe: 'ataque', golpe: 0.5 },
          { clipe: 'extra_lancar_7', de: 0.1, ate: 0.7, golpe: 0.45 },
          { clipe: 'extra_lancar_4', de: 0.0, ate: 0.65, golpe: 0.42 },
          { clipe: 'extra_lancar_3', de: 0.1, ate: 0.75, golpe: 0.46 }
        ] },
        habilidade3: { clipe: 'habilidade1', duracao: 0.5 }
      },
      mago: { habilidade3: { clipe: 'extra_magia_longa' } },
      suporte: { habilidade2: { duracao: 1.2 }, habilidade3: { clipe: 'habilidade1' } }
    },

    // ARMAS: arquivos em assets/armas/<nome>.glb (origem já no ponto da pegada).
    // modo 'empunhar' = segue a mão (golpes); 'vertical' = sempre em pé;
    // 'frente' = cano sempre para onde o personagem olha.
    armas: {
      espada:  { modo: 'empunhar' },
      cajado:  { modo: 'vertical' },
      rifle:   { modo: 'frente' },
      pistola: { modo: 'frente' }
    },
    // arma de cada classe; uma habilidade pode trocar de arma enquanto dura
    armasDaClasse: {
      soldado:  { padrao: 'espada' },
      suporte:  { padrao: 'cajado' }
    },
    animacoes: {
      humanoide: [],   // ex.: ['parado','andar','correr','dano','morte']
      suporte: [], soldado: [], mago: [], atirador: [],
      maestro: [], veterano: [], barao: [], golem: [], dragao: [],
      minion: []
    },

    texturas: [
      'grama_mapa1', 'grama_mapa2', 'grama_mapa3', 'grama_repouso',
      'caminho_terra', 'caminho_pedra', 'concreto_praca',
      'rio', 'lago', 'margem_areia', 'agua_ascensao', 'areia_arena',
      'aeroporto_piso'
    ],
    corTexturaFallback: {
      grama: '#5a9e3a', caminho: '#9c7a4b', concreto: '#b8b8b8',
      rio: '#2a8fbd', lago: '#2fa3a8', margem: '#d9c48c',
      agua: '#123d6b', areia: '#d8c39a', aeroporto: '#cfcfcf'
    }
  };

  /* ================= PERFIL DE SKINS DO JOGADOR ================= */
  // Fonte da verdade: servidor (ex.: Supabase). localStorage é só cache.
  const CHAVE_LOCAL = 'skins_perfil_v1';
  function perfilPadrao() {
    const p = { classe: 'suporte', genero: 'm', cores: {}, equipada: {}, desbloqueadas: {} };
    Object.keys(CATALOGO.classes).forEach(c => {
      p.cores[c] = CATALOGO.classes[c].corPadrao;
      p.desbloqueadas[c] = ['default'];
      p.equipada[c + '_m'] = 'default';
      p.equipada[c + '_f'] = 'default';
    });
    return p;
  }
  let perfil = perfilPadrao();
  try {
    const salvo = JSON.parse(global.localStorage.getItem(CHAVE_LOCAL) || 'null');
    if (salvo) perfil = Object.assign(perfilPadrao(), salvo);
  } catch (e) { /* sem storage: segue com o padrão */ }
  function salvarLocal() {
    try { global.localStorage.setItem(CHAVE_LOCAL, JSON.stringify(perfil)); } catch (e) {}
  }

  const Perfil = {
    get: () => JSON.parse(JSON.stringify(perfil)),
    importar(dados) { perfil = Object.assign(perfilPadrao(), dados || {}); salvarLocal(); },
    exportar: () => JSON.stringify(perfil),
    escolher(classe, genero) {
      if (!CATALOGO.classes[classe] || !CATALOGO.generos[genero]) return false;
      perfil.classe = classe; perfil.genero = genero; salvarLocal(); return true;
    },
    definirCor(classe, hex) { perfil.cores[classe] = hex; salvarLocal(); },
    desbloquear(classe, skinId) {
      const lista = perfil.desbloqueadas[classe];
      if (lista && lista.indexOf(skinId) < 0) lista.push(skinId);
      salvarLocal();
    },
    // a skin vale para as duas versões (homem e mulher) da mesma classe; nunca para outra classe
    equipar(classe, skinId) {
      if ((perfil.desbloqueadas[classe] || []).indexOf(skinId) < 0) return false;
      perfil.equipada[classe] = skinId;
      perfil.equipada[classe + '_m'] = skinId; perfil.equipada[classe + '_f'] = skinId;
      salvarLocal(); return true;
    }
  };

  /* ================= CARREGAMENTO ================= */
  const cacheArquivos = {};
  function carregarArquivo(url) {
    if (cacheArquivos[url]) return cacheArquivos[url];
    // modelo embutido em script (para hospedagens que não servem .glb)
    const emb = global.MODELOS_EMBUTIDOS && global.MODELOS_EMBUTIDOS[url];
    if (emb && THREE.GLTFLoader) {
      cacheArquivos[url] = new Promise(resolve => {
        const bin = global.atob(emb), buf = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
        new THREE.GLTFLoader().parse(buf.buffer, '', resolve, () => resolve(null));
      });
      return cacheArquivos[url];
    }
    cacheArquivos[url] = new Promise(resolve => {
      const ext = url.split('.').pop().toLowerCase();
      const Loader = ext === 'fbx' ? THREE.FBXLoader : THREE.GLTFLoader;
      if (!Loader) return resolve(null);
      new Loader().load(url,
        r => resolve(ext === 'fbx' ? { scene: r, animations: r.animations || [] } : r),
        undefined, () => resolve(null));
    });
    return cacheArquivos[url];
  }
  async function carregarModelo(caminhoSemExtensao) {
    for (const ext of CATALOGO.formatosModelo) {
      const r = await carregarArquivo(caminhoSemExtensao + '.' + ext);
      if (r) return r;
    }
    return null;
  }

  // Cópia independente: ossos próprios e materiais próprios (para piscar e tingir)
  function clonar(gltf) {
    const cena = (THREE.SkeletonUtils && THREE.SkeletonUtils.clone)
      ? THREE.SkeletonUtils.clone(gltf.scene) : gltf.scene.clone(true);
    cena.traverse(n => {
      if (!n.isMesh) return;
      n.material = Array.isArray(n.material) ? n.material.map(m => m.clone()) : n.material.clone();
    });
    return cena;
  }

  // Ajusta qualquer modelo (Meshy, Tripo, Mixamo em cm...) à altura do jogo,
  // com os pés no chão e centralizado
  function normalizar(obj, altura) {
    if (!THREE.Box3) return;
    const caixa = new THREE.Box3().setFromObject(obj);
    const tam = new THREE.Vector3(); caixa.getSize(tam);
    if (!(tam.y > 0)) return;
    obj.scale.multiplyScalar(altura / tam.y);
    const c2 = new THREE.Box3().setFromObject(obj);
    const centro = new THREE.Vector3(); c2.getCenter(centro);
    obj.position.x -= centro.x;
    obj.position.z -= centro.z;
    obj.position.y -= c2.min.y;
  }

  function temOssos(obj) {
    let sim = false;
    obj.traverse(n => { if (n.isSkinnedMesh) sim = true; });
    return sim;
  }

  /* ================= COR DO JOGADOR ================= */
  // Pinta só o cinza claro neutro (pele, branco, dourado e detalhes ficam intactos)
  function tingirPixels(data, r, g, b) {
    for (let i = 0; i < data.length; i += 4) {
      const R = data[i], G = data[i + 1], B = data[i + 2];
      const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
      const lum = (R + G + B) / 765;
      const sat = mx ? (mx - mn) / mx : 0;
      if (sat < 0.12 && lum > 0.42 && lum < 0.86) {
        const k = lum / 0.66;   // mantém sombra e brilho do desenho
        data[i]     = Math.min(255, r * k);
        data[i + 1] = Math.min(255, g * k);
        data[i + 2] = Math.min(255, b * k);
      }
    }
    return data;
  }

  const cacheTingidas = {};
  function texturaTingida(orig, hex) {
    const chave = orig.uuid + hex;
    if (cacheTingidas[chave]) return cacheTingidas[chave];
    const img = orig.image;
    const cv = global.document.createElement('canvas');
    cv.width = img.width; cv.height = img.height;
    const ctx = cv.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const dados = ctx.getImageData(0, 0, cv.width, cv.height);
    const c = new THREE.Color(hex);
    tingirPixels(dados.data, c.r * 255, c.g * 255, c.b * 255);
    ctx.putImageData(dados, 0, 0);
    const t = new THREE.CanvasTexture(cv);
    t.encoding = orig.encoding; t.flipY = orig.flipY;
    t.wrapS = orig.wrapS; t.wrapT = orig.wrapT;
    t.needsUpdate = true;
    cacheTingidas[chave] = t;
    return t;
  }

  function aplicarCor(obj, hex) {
    const cor = new THREE.Color(hex);
    obj.traverse(n => {
      if (!n.isMesh) return;
      (Array.isArray(n.material) ? n.material : [n.material]).forEach(m => {
        if (!m || !m.color || m.userData.semTinta) return;   // armas não recebem a cor do jogador
        const mapa = m.userData.mapOriginal || m.map;
        if (mapa && mapa.image && mapa.image.width && global.document) {
          m.userData.mapOriginal = mapa;
          m.map = texturaTingida(mapa, hex);
          m.needsUpdate = true;
          return;
        }
        const nome = (m.name || '').toLowerCase();
        const c = m.userData.corOriginal || m.color.clone();
        const cinzaClaro = Math.abs(c.r - c.g) < 0.06 && Math.abs(c.g - c.b) < 0.06 && c.r > 0.6;
        if (nome.indexOf('tint') < 0 && !cinzaClaro && !m.userData.tingivel) return;
        m.userData.corOriginal = c;
        m.userData.tingivel = true;
        m.color.copy(cor);
      });
    });
  }

  /* ================= FORMAS PROVISÓRIAS ================= */
  function boneco(altura, cor, corTinta) {
    const g = new THREE.Group();
    const matCorpo = new THREE.MeshLambertMaterial({ color: corTinta || cor, name: 'tint' });
    const matPele = new THREE.MeshLambertMaterial({ color: '#e0b08a' });
    const corpo = new THREE.Mesh(new THREE.CylinderGeometry(altura * 0.18, altura * 0.22, altura * 0.55, 10), matCorpo);
    corpo.position.y = altura * 0.42;
    const cabeca = new THREE.Mesh(new THREE.SphereGeometry(altura * 0.15, 12, 10), matPele);
    cabeca.position.y = altura * 0.82;
    const pernas = new THREE.Mesh(new THREE.CylinderGeometry(altura * 0.16, altura * 0.12, altura * 0.18, 8),
      new THREE.MeshLambertMaterial({ color: '#333' }));
    pernas.position.y = altura * 0.09;
    g.add(corpo, cabeca, pernas);
    g.userData.provisorio = true;
    return g;
  }
  function criatura(altura, cor) {
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.SphereGeometry(altura * 0.4, 14, 12),
      new THREE.MeshLambertMaterial({ color: cor }));
    m.scale.set(1.1, 1, 1.3);
    m.position.y = altura * 0.45;
    const olho = new THREE.Mesh(new THREE.SphereGeometry(altura * 0.07, 8, 6),
      new THREE.MeshBasicMaterial({ color: '#fff' }));
    olho.position.set(0, altura * 0.6, altura * 0.48);
    g.add(m, olho);
    g.userData.provisorio = true;
    return g;
  }

  /* ================= ARANHA (montada por código) ================= */
  // Frente da aranha = +Z. h = altura de referência.
  function criarAranha(h, cor, corMarca) {
    const g = new THREE.Group();
    const matCorpo = new THREE.MeshStandardMaterial({ color: cor, roughness: 0.75 });
    const matMarca = new THREE.MeshStandardMaterial({ color: corMarca, emissive: corMarca, emissiveIntensity: 0.55 });
    const matOlho = new THREE.MeshStandardMaterial({ color: '#111118', roughness: 0.2, metalness: 0.3 });

    const corpo = new THREE.Group();
    corpo.position.y = h * 0.45;
    g.add(corpo);

    const cefalo = new THREE.Mesh(new THREE.SphereGeometry(h * 0.22, 16, 12), matCorpo);
    cefalo.position.z = h * 0.22;
    cefalo.scale.set(1, 0.85, 1.05);
    const abd = new THREE.Mesh(new THREE.SphereGeometry(h * 0.38, 18, 14), matCorpo);
    abd.position.set(0, h * 0.08, -h * 0.3);
    abd.scale.set(1, 0.85, 1.15);
    corpo.add(cefalo, abd);

    // marcas brilhantes nas costas
    [[0, 0.33, -0.12, 0.09], [0, 0.3, -0.32, 0.12], [0.16, 0.25, -0.3, 0.06], [-0.16, 0.25, -0.3, 0.06]]
      .forEach(([x, y, z, r]) => {
        const m = new THREE.Mesh(new THREE.SphereGeometry(h * r, 10, 8), matMarca);
        m.position.set(h * x, h * y, h * z);
        m.scale.set(1, 0.35, 1.6);
        corpo.add(m);
      });

    // olhos e presas
    [[-0.07, 0.07, 0.04], [0.07, 0.07, 0.04], [-0.12, 0.03, 0.025], [0.12, 0.03, 0.025]].forEach(([x, y, r]) => {
      const o = new THREE.Mesh(new THREE.SphereGeometry(h * r, 10, 8), matOlho);
      o.position.set(h * x, h * y, h * 0.42);
      corpo.add(o);
    });
    [-1, 1].forEach(l => {
      const p = new THREE.Mesh(new THREE.ConeGeometry(h * 0.03, h * 0.12, 8), matCorpo);
      p.position.set(h * 0.06 * l, -h * 0.1, h * 0.4);
      p.rotation.x = Math.PI * 0.85;
      corpo.add(p);
    });

    // 8 patas: pivô (gira para frente/trás) > elevação (sobe/desce) > joelho
    const aberturas = [0.95, 0.35, -0.3, -0.9];
    const L1 = h * 0.5, L2 = h * 0.8;
    const pernas = [];
    [-1, 1].forEach(lado => {
      aberturas.forEach((a, i) => {
        const pivo = new THREE.Group();
        pivo.position.set(h * 0.13 * lado, 0, h * (0.3 - i * 0.1));
        const baseY = lado > 0 ? -a : Math.PI + a;
        pivo.rotation.y = baseY;
        const elev = new THREE.Group();
        elev.rotation.z = 0.7;
        pivo.add(elev);

        const coxa = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.04, h * 0.05, L1, 8), matCorpo);
        coxa.rotation.z = -Math.PI / 2;
        coxa.position.x = L1 / 2;
        elev.add(coxa);

        const joelho = new THREE.Group();
        joelho.position.x = L1;
        joelho.rotation.z = -2.0;
        elev.add(joelho);
        const anelJ = new THREE.Mesh(new THREE.SphereGeometry(h * 0.055, 10, 8), matMarca);
        joelho.add(anelJ);

        const tibia = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.022, h * 0.04, L2, 8), matCorpo);
        tibia.rotation.z = -Math.PI / 2;
        tibia.position.x = L2 / 2;
        joelho.add(tibia);
        const anelT = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.036, h * 0.036, h * 0.05, 10), matMarca);
        anelT.rotation.z = -Math.PI / 2;
        anelT.position.x = L2 * 0.45;
        joelho.add(anelT);

        corpo.add(pivo);
        pernas.push({ pivo, elev, joelho, lado, i, baseY, baseElev: 0.7, baseJoelho: -2.0 });
      });
    });

    g.userData.aranha = { corpo, abd, pernas, h };
    return g;
  }

  /* ================= ANIMAÇÃO ================= */
  const UMA_VEZ = { ataque: 1, habilidade1: 1, habilidade2: 1, habilidade3: 1, dano: 1, morte: 1 };
  const DURACAO = { ataque: 0.45, habilidade1: 0.7, habilidade2: 0.7, habilidade3: 0.7, dano: 0.3, morte: 0.8 };
  // nomes comuns de clipes embutidos no modelo -> estado do jogo
  const APELIDOS = [
    ['morte', /death|die|dying|morte/i], ['dano', /hit|damage|react|dano/i],
    ['correr', /run|correr/i], ['andar', /walk|andar/i],
    ['habilidade1', /skill ?1|habilidade ?1|cast|spell/i],
    ['habilidade2', /skill ?2|habilidade ?2/i], ['habilidade3', /skill ?3|habilidade ?3/i],
    ['ataque', /attack|ataque|slash|shoot|punch|swing/i], ['parado', /idle|parado|stand/i]
  ];
  const ATIVOS = new Set();

  function clipeServe(corpo, clip) {
    if (!THREE.PropertyBinding || !clip.tracks.length) return false;
    for (let i = 0; i < Math.min(5, clip.tracks.length); i++) {
      const nome = THREE.PropertyBinding.parseTrackName(clip.tracks[i].name).nodeName;
      if (nome && corpo.getObjectByName(nome)) return true;
    }
    return false;
  }

  class Animador {
    constructor(raiz, corpo, tipo, altura) {
      this.raiz = raiz; this.corpo = corpo; this.tipo = tipo; this.h = altura;
      this.mixer = null; this.acoes = {};
      this.estado = 'parado'; this.base = 'parado';
      this.t = Math.random() * 10; this.tEstado = 0;
      this.morto = false; this.flash = 0; this.velMov = 0;
      this.limiarCorrer = 4; this.aoTerminar = null;
      this.pose0 = {
        px: corpo.position.x, py: corpo.position.y, pz: corpo.position.z,
        rx: corpo.rotation.x, ry: corpo.rotation.y, rz: corpo.rotation.z,
        sx: corpo.scale.x, sy: corpo.scale.y, sz: corpo.scale.z
      };
      this.materiais = [];
      corpo.traverse(n => {
        if (!n.isMesh) return;
        (Array.isArray(n.material) ? n.material : [n.material]).forEach(m => {
          if (m && m.emissive && this.materiais.indexOf(m) < 0) {
            m.userData.emissiveOriginal = m.emissive.clone();
            this.materiais.push(m);
          }
        });
      });
    }

    adicionarClipe(estado, clip) {
      if (!THREE.AnimationMixer || !clipeServe(this.corpo, clip)) return false;
      if (!this.mixer) {
        this.mixer = new THREE.AnimationMixer(this.corpo);
        this.mixer.addEventListener('finished', e => {
          if (this.acaoCima && e.action === this.acaoCima) { this.acaoCima.fadeOut(0.15); this.acaoCima = null; if (this.estado === 'ataque') this._concluir(); return; }
          if (e.action === this.acoes[this.estado]) this._concluir();
        });
      }
      const c = clip.clone(); c.name = estado;
      noLugar(c);
      const acao = this.mixer.clipAction(c);
      if (UMA_VEZ[estado]) { acao.setLoop(THREE.LoopOnce, 1); acao.clampWhenFinished = true; }
      this.acoes[estado] = acao;
      const cfgE = this.config && this.config[estado];
      const alvo = (cfgE && cfgE.duracao) || CATALOGO.duracoes[estado];
      this.escalas = this.escalas || {};
      this.escalas[estado] = (UMA_VEZ[estado] && alvo && c.duration > 0) ? c.duration / alvo : 1;
      if (estado === this.estado || (estado === this.base && !this.acoes[this.estado])) this._tocarAcao(estado, 0);
      return true;
    }

    tem(estado) { return !!this.acoes[estado]; }

    // outro golpe para o ataque básico: cada ataque usa o próximo da lista
    adicionarVariacaoAtaque(clip, v) {
      v = v || {};
      if (!this.mixer || !clipeServe(this.corpo, clip)) return false;
      if (!this.varAtaque) this.varAtaque = [{ acao: this.acoes.ataque, escala: this.escalas.ataque }];
      let c = (v.de !== undefined || v.ate !== undefined) ? recortar(clip, v.de || 0, v.ate === undefined ? 1 : v.ate) : clip.clone();
      c.name = 'ataque_v' + this.varAtaque.length;
      noLugar(c);
      const acao = this.mixer.clipAction(c);
      acao.setLoop(THREE.LoopOnce, 1); acao.clampWhenFinished = true;
      this.varAtaque.push({ acao, escala: c.duration > 0 ? c.duration / CATALOGO.duracoes.ataque : 1, golpe: v.golpe });
      this.iVar = -1;
      return true;
    }

    // atirar andando: só tronco, braços e cabeça; as pernas continuam a andar/correr
    adicionarAtaqueAndando(clip, soCima) {
      if (!this.mixer || !clipeServe(this.corpo, clip)) return false;
      const c = clip.clone(); c.name = 'ataque_andando';
      if (soCima) c.tracks = c.tracks.filter(t => /spine|neck|head|shoulder|arm|hand/i.test(THREE.PropertyBinding.parseTrackName(t.name).nodeName || ''));
      noLugar(c);
      if (!c.tracks.length) return false;
      const acao = this.mixer.clipAction(c);
      acao.setLoop(THREE.LoopOnce, 1); acao.clampWhenFinished = true;
      this.ataqueAndando = { acao, escala: clip.duration > 0 ? clip.duration / CATALOGO.duracoes.ataque : 1 };
      return true;
    }

    // Chamar todo quadro com a velocidade atual: escolhe parado/andar/correr sozinho
    mover(velocidade) {
      this.velMov = velocidade;
      this.base = velocidade < 0.05 ? 'parado' : (velocidade >= this.limiarCorrer ? 'correr' : 'andar');
      if (!this.morto && !UMA_VEZ[this.estado] && this.estado !== this.base) this.tocar(this.base);
    }

    // tocar('ataque'), tocar('habilidade1', { aoTerminar: fn }), tocar('morte'), tocar('renascer')
    tocar(estado, op) {
      op = op || {};
      if (estado === 'renascer') {
        this.morto = false; this._restaurarPose();
        estado = this.base;
      } else if (this.morto) return;
      if (estado === this.estado && !UMA_VEZ[estado]) return;
      if (estado === 'morte') this.morto = true;
      // ataque correndo: braços atiram por cima da corrida, sem parar as pernas
      if (estado === 'ataque' && this.ataqueAndando && this.velMov > 0.3 && this.acoes[this.base]) {
        this.estado = 'ataque'; this.tEstado = 0;
        this.aoTerminar = op.aoTerminar || null; this.aoAcertar = op.aoAcertar || null;
        this.momento = op.momento !== undefined ? op.momento : 0.5;
        if (this.acaoAtual !== this.acoes[this.base]) this._tocarAcao(this.base, 0.15);
        const a = this.ataqueAndando;
        a.acao.reset().setEffectiveTimeScale(a.escala * (op.velocidade || 1)).setEffectiveWeight(6).fadeIn(0.08).play();
        this.acaoCima = a.acao;
        return;
      }
      if (this.acaoCima) { this.acaoCima.fadeOut(0.1); this.acaoCima = null; }
      // golpes alternados no ataque básico
      if (estado === 'ataque' && this.varAtaque && this.varAtaque.length > 1) {
        if (this.t - (this.ultimoAtaque || -99) > 1.6) this.iVar = -1;   // parou de atacar: combo recomeça
        this.ultimoAtaque = this.t;
        this.iVar = (this.iVar + 1) % this.varAtaque.length;
        const v = this.varAtaque[this.iVar];
        this.varAtaque.forEach(o => { if (o.acao !== v.acao && o.acao.getEffectiveWeight() > 0) o.acao.fadeOut(0.15); });
        this.acoes.ataque = v.acao; this.escalas.ataque = v.escala;
      }
      this.estado = estado; this.tEstado = 0;
      this.aoTerminar = op.aoTerminar || null;
      // aoAcertar: chamado no meio do golpe (momento = fração da animação, padrão 0.5)
      this.aoAcertar = op.aoAcertar || null;
      this.momento = op.momento !== undefined ? op.momento : 0.5;
      if (estado === 'ataque' && this.varAtaque && this.varAtaque.length > 1 && this.varAtaque[this.iVar].golpe !== undefined) this.momento = this.varAtaque[this.iVar].golpe;
      if (estado === 'dano') this.flash = 0.25;
      const fade = op.fade !== undefined ? op.fade : 0.2;
      if (this.acoes[estado]) this._tocarAcao(estado, fade, op.velocidade);
      else if (!UMA_VEZ[estado] && this.acoes[this._baseDisponivel()]) this._tocarAcao(this._baseDisponivel(), fade);
    }

    _baseDisponivel() {
      if (this.acoes[this.base]) return this.base;
      if (this.base === 'correr' && this.acoes.andar) return 'andar';
      return 'parado';
    }

    _tocarAcao(estado, fade, velocidade) {
      const nova = this.acoes[estado];
      if (!nova) return;
      const escala = ((this.escalas && this.escalas[estado]) || 1) * (velocidade || 1);
      if (nova === this.acaoAtual) {
        if (UMA_VEZ[estado]) nova.reset().setEffectiveTimeScale(escala).play();   // mesmo golpe de novo: recomeça
        return;
      }
      Object.keys(this.acoes).forEach(k => {
        const a = this.acoes[k];
        if (a !== nova && (a.isRunning() || a.getEffectiveWeight() > 0)) a.fadeOut(fade);
      });
      nova.reset().setEffectiveTimeScale(escala).setEffectiveWeight(1).fadeIn(fade).play();
      this.acaoAtual = nova;
    }

    _concluir() {
      const cb = this.aoTerminar; this.aoTerminar = null;
      if (this.estado !== 'morte') {
        this.estado = null;
        this.tocar(this.base, { fade: 0.15 });
      }
      if (cb) cb();
    }

    _restaurarPose() {
      const p = this.pose0, c = this.corpo;
      c.position.set(p.px, p.py, p.pz);
      c.rotation.set(p.rx, p.ry, p.rz);
      c.scale.set(p.sx, p.sy, p.sz);
    }

    atualizar(dt) {
      this.t += dt; this.tEstado += dt;
      if (this.mixer) this.mixer.update(dt);

      const temClipe = !!this.acoes[this.estado];
      const dur = (CATALOGO.duracoes[this.estado] && !temClipe ? Math.min(CATALOGO.duracoes[this.estado], DURACAO[this.estado] || 9) : DURACAO[this.estado]) || 0;
      const p = dur ? Math.min(1, this.tEstado / dur) : 0;

      // momento do golpe (para aplicar o dano no instante certo)
      if (this.aoAcertar) {
        const acao = (this.estado === 'ataque' && this.acaoCima) || this.acoes[this.estado];
        const prog = acao ? acao.time / acao.getClip().duration : p;
        if (prog >= this.momento) { const f = this.aoAcertar; this.aoAcertar = null; f(); }
      }

      if (this.tipo === 'aranha') this._aranha(p);
      else if (!temClipe) { this._generico(p); if (this.tipo === 'quadrupede') this._dragao(p); }
      else this._restaurarPose();

      // giro do corpo inteiro por código (ex.: giro do Soldado)
      const cfg = this.config && this.config[this.estado];
      if (cfg && cfg.voltas) {
        const acao = this.acoes[this.estado];
        const prog = acao ? Math.min(1, acao.time / acao.getClip().duration) : p;
        const e = prog < 0.5 ? 2 * prog * prog : 1 - Math.pow(-2 * prog + 2, 2) / 2;   // acelera e freia
        this.corpo.rotation.y = this.pose0.ry + e * Math.PI * 2 * cfg.voltas;
      }

      this._atualizarArmas();

      // fim dos estados de uma vez feitos por código
      if (!temClipe && UMA_VEZ[this.estado] && this.tEstado >= dur) {
        if (this.estado !== 'morte') this._concluir();
        else if (this.aoTerminar) { const cb = this.aoTerminar; this.aoTerminar = null; cb(); }
      }

      // piscar vermelho ao levar dano
      if (this.flash > 0 || this._piscando) {
        this.flash = Math.max(0, this.flash - dt);
        const k = this.flash / 0.25;
        this.materiais.forEach(m => {
          m.emissive.copy(m.userData.emissiveOriginal);
          if (k > 0) m.emissive.lerp(new THREE.Color(1, 0.15, 0.1), k * 0.85);
        });
        this._piscando = this.flash > 0;
      }
    }

    // Dragão: esqueleto simples (dr_*) criado para a malha parada do Meshy, animado aqui
    _dragao(p) {
      if (this._dr === undefined) {
        const o = n => this.corpo.getObjectByName('dr_' + n);
        this._dr = o('corpo') ? { pescoco: o('pescoco'), cabeca: o('cabeca'), cauda1: o('cauda1'), cauda2: o('cauda2'),
          asaE: o('asaE'), asaD: o('asaD'), FE: o('perna_FE'), FD: o('perna_FD'), TE: o('perna_TE'), TD: o('perna_TD') } : null;
      }
      const b = this._dr; if (!b) return;
      const t = this.t, est = this.estado, k = Math.sin(Math.PI * p);
      const anda = est === 'andar' || est === 'correr', f = est === 'correr' ? 13 : 9, fase = t * f;
      const r = (o, x, y, z) => { if (o) o.rotation.set(x || 0, y || 0, z || 0); };
      // pernas em pares cruzados, como um lagarto
      const passo = anda ? Math.sin(fase) * 0.55 : 0;
      r(b.FE, passo); r(b.TD, passo); r(b.FD, -passo); r(b.TE, -passo);
      // asas: respiram paradas, batem andando, abrem no ataque, caem na morte
      let asa = 0.1 * Math.sin(t * 2.1);
      if (anda) asa = 0.35 * Math.sin(fase * 0.5) - 0.1;
      if (est === 'ataque') asa = -0.55 * k;
      if (est === 'habilidade1' || est === 'habilidade2') asa = -0.7 * Math.abs(Math.sin(t * 14));
      if (est === 'morte') asa = 0.7 * Math.min(1, p * 1.5);
      r(b.asaE, 0, 0, asa); r(b.asaD, 0, 0, -asa);
      // pescoço e cabeça: puxa para trás e dá o bote no ataque (o fogo sai no meio)
      let pesc = 0.06 * Math.sin(t * 1.3), cab = 0;
      if (anda) pesc = 0.08 * Math.sin(fase * 2);
      if (est === 'ataque') { pesc = p < 0.4 ? -0.45 * (p / 0.4) : -0.45 + 0.9 * Math.min(1, (p - 0.4) / 0.25); cab = -pesc * 0.4; }
      if (est === 'dano') pesc = -0.35 * k;
      if (est === 'morte') pesc = 0.5 * Math.min(1, p * 1.4);
      r(b.pescoco, pesc); r(b.cabeca, cab, 0.12 * Math.sin(t * 0.7));
      // cauda balançando
      const cauda = (anda ? 0.3 : 0.18) * Math.sin(t * (anda ? f * 0.5 : 2));
      r(b.cauda1, 0, cauda); r(b.cauda2, 0, cauda * 1.3);
    }

    _generico(p) {
      const c = this.corpo, o = this.pose0, h = this.h, t = this.t;
      this._restaurarPose();
      const quad = this.tipo === 'quadrupede';
      const k = Math.sin(Math.PI * p);
      switch (this.estado) {
        case 'parado':
          c.scale.y = o.sy * (1 + 0.015 * Math.sin(t * 2.2));
          break;
        case 'andar':
        case 'correr': {
          const corre = this.estado === 'correr';
          const f = corre ? 13 : 9;
          c.position.y = o.py + Math.abs(Math.sin(t * f)) * h * (corre ? 0.07 : 0.04);
          if (quad) c.rotation.x = o.rx + Math.sin(t * f) * 0.05;
          else c.rotation.z = o.rz + Math.sin(t * f) * 0.04;
          if (corre) c.rotation.x = o.rx + 0.12;
          break;
        }
        case 'ataque':
          c.position.z = o.pz + k * h * 0.18;
          c.rotation.x = o.rx + k * 0.18;
          break;
        case 'habilidade1': case 'habilidade2': case 'habilidade3':
          c.position.y = o.py + k * h * 0.12;
          c.scale.x = o.sx * (1 + 0.08 * k);
          c.scale.y = o.sy * (1 + 0.08 * k);
          c.scale.z = o.sz * (1 + 0.08 * k);
          break;
        case 'dano':
          c.rotation.z = o.rz + Math.sin(this.tEstado * 55) * 0.07 * (1 - p);
          c.position.z = o.pz - k * h * 0.05;
          break;
        case 'morte': {
          const e = 1 - Math.pow(1 - p, 3);
          if (quad) c.rotation.z = o.rz + e * Math.PI / 2;
          else c.rotation.x = o.rx - e * Math.PI / 2;
          break;
        }
      }
    }

    _aranha(p) {
      const A = this.corpo.userData.aranha;
      if (!A) return this._generico(p);
      const t = this.t, h = A.h, k = Math.sin(Math.PI * p);
      const andando = this.estado === 'andar' || this.estado === 'correr';
      const f = this.estado === 'correr' ? 18 : 11;
      const amp = andando ? 1 : 0.12;
      const freq = andando ? f : 2.5;

      A.corpo.position.set(0, h * 0.45, 0);
      A.corpo.rotation.set(0, 0, 0);
      A.abd.rotation.set(0, 0, 0);
      A.abd.scale.set(1, 0.85 + 0.02 * Math.sin(t * 2.5), 1.15);
      if (andando) A.corpo.position.y += Math.abs(Math.sin(t * f)) * h * 0.03;

      A.pernas.forEach(pe => {
        // grupos alternados: (E1, D2, E3, D4) contra (D1, E2, D3, E4)
        const fase = ((pe.i + (pe.lado > 0 ? 1 : 0)) % 2) ? Math.PI : 0;
        const s = Math.sin(t * freq + fase);
        const lev = Math.max(0, Math.cos(t * freq + fase));
        pe.pivo.rotation.y = pe.baseY + (pe.lado > 0 ? -1 : 1) * s * 0.32 * amp;
        pe.elev.rotation.z = pe.baseElev + lev * 0.28 * amp;
        pe.joelho.rotation.z = pe.baseJoelho;
      });

      switch (this.estado) {
        case 'ataque':   // ergue as patas da frente e dá o bote
          A.corpo.position.z = k * h * 0.3;
          A.corpo.rotation.x = -k * 0.25;
          A.pernas.forEach(pe => { if (pe.i === 0) { pe.elev.rotation.z = pe.baseElev + k * 0.9; pe.joelho.rotation.z = pe.baseJoelho + k * 0.6; } });
          break;
        case 'habilidade1': case 'habilidade2': case 'habilidade3':   // aponta o abdômen e lança teia
          A.abd.rotation.x = -k * 0.6;
          A.corpo.position.y -= k * h * 0.08;
          break;
        case 'dano':
          A.corpo.rotation.z = Math.sin(this.tEstado * 55) * 0.08 * (1 - p);
          break;
        case 'morte': {
          const e = 1 - Math.pow(1 - p, 3);
          A.corpo.position.y = h * 0.45 * (1 - 0.6 * e);
          A.pernas.forEach(pe => {
            pe.elev.rotation.z = pe.baseElev + e * 0.9;
            pe.joelho.rotation.z = pe.baseJoelho - e * 0.7;
          });
          break;
        }
      }
    }
  }

  async function carregarAnimacoes(anim, pastas) {
    if (!temOssos(anim.corpo)) return;
    for (const pasta of pastas) {
      for (const estado of (CATALOGO.animacoes[pasta] || [])) {
        if (anim.tem(estado)) continue;
        const r = await carregarArquivo(`${BASE}anims/${pasta}/${estado}.${CATALOGO.formatoAnim}`);
        const clip = r && r.animations && r.animations[0];
        if (clip) anim.adicionarClipe(estado, clip);
      }
    }
  }

  const ESTADOS = ['parado', 'andar', 'correr', 'ataque', 'habilidade1', 'habilidade2', 'habilidade3', 'dano', 'morte'];
  function clipesEmbutidos(anim, animacoes) {
    const lista = animacoes || [];
    // 0º: animação escolhida para a habilidade em CATALOGO.habilidades
    Object.keys(anim.config || {}).forEach(estado => {
      const nome = anim.config[estado].clipe;
      const clip = nome && lista.find(c => c.name === nome);
      if (clip) anim.adicionarClipe(estado, clip);
    });
    // 1º: nome exato do estado (arquivos preparados para o jogo)
    lista.forEach(clip => { if (ESTADOS.indexOf(clip.name) >= 0 && !anim.tem(clip.name)) anim.adicionarClipe(clip.name, clip); });
    // variações do ataque básico e ataque andando
    const cfgA = anim.config && anim.config.ataque;
    if (cfgA && cfgA.variacoes && anim.tem('ataque')) {
      cfgA.variacoes.forEach(v => {
        if (typeof v === 'string') v = { clipe: v };
        const nome = v.clipe === 'ataque' ? (cfgA.clipe || 'ataque') : v.clipe;
        const clip = lista.find(c => c.name === nome);
        if (clip) anim.adicionarVariacaoAtaque(clip, v);
      });
      if (anim.varAtaque && anim.varAtaque.length > 1) anim.varAtaque.shift();   // a original já está entre as variações
    }
    if (cfgA && cfgA.andando) {
      const proprio = lista.find(c => c.name === 'extra_atirar_andando');   // se um dia vier pronto do Meshy
      const base = lista.find(c => c.name === (cfgA.clipe || 'ataque'));
      if (proprio) anim.adicionarAtaqueAndando(proprio, false);
      else if (base) anim.adicionarAtaqueAndando(base, true);
    }
    // 2º: nomes comuns em inglês (Idle, Walking, Attack...)
    lista.forEach(clip => {
      if (ESTADOS.indexOf(clip.name) >= 0 || /^extra_/.test(clip.name)) return;
      const par = APELIDOS.find(([, re]) => re.test(clip.name));
      if (par && !anim.tem(par[0])) anim.adicionarClipe(par[0], clip);
    });
  }

  // Pedaço de uma animação (de/ate = fração da duração): vira um clipe novo começando em 0
  function recortar(clip, de, ate) {
    const t0 = clip.duration * de, t1 = clip.duration * ate;
    const trilhas = clip.tracks.map(t => {
      const n = t.clone();
      if (n.trim) { n.trim(t0, t1); n.shift(-t0); }
      return n;
    });
    if (THREE.AnimationClip) return new THREE.AnimationClip(clip.name + '_' + de, t1 - t0, trilhas);
    const c = clip.clone(); c.tracks = trilhas; c.duration = t1 - t0; return c;
  }

  // Tira o deslocamento do quadril para frente/lados: o jogo é quem move o boneco
  function noLugar(clip) {
    clip.tracks.forEach(t => {
      if (!/hips\.position$/i.test(t.name) || t.getValueSize() !== 3) return;
      const v = t.values, x0 = v[0], z0 = v[2];
      t.values = v.slice();
      for (let i = 0; i < t.values.length; i += 3) { t.values[i] = x0; t.values[i + 2] = z0; }
    });
  }

  // Coloca o modelo dentro de uma "raiz": o jogo move a raiz, a animação mexe no corpo
  function montar(corpo, info, tipoAnim, altura, gltf, pastas) {
    const raiz = new THREE.Group();
    raiz.add(corpo);
    raiz.userData.skin = info;
    const anim = new Animador(raiz, corpo, tipoAnim, altura);
    anim.config = CATALOGO.habilidades[info.classe || info.id] || null;
    raiz.userData.animador = anim;
    ATIVOS.add(anim);
    if (gltf) clipesEmbutidos(anim, gltf.animations);
    if (gltf && pastas) carregarAnimacoes(anim, pastas);   // em segundo plano
    return raiz;
  }

  /* ================= API: PERSONAGENS ================= */
  async function criarPersonagem(opcoes) {
    const o = Object.assign({}, { classe: perfil.classe, genero: perfil.genero }, opcoes);
    const def = CATALOGO.classes[o.classe];
    if (!def) throw new Error('Classe desconhecida: ' + o.classe);
    // A skin é da CLASSE: a mesma skin vale para o homem e para a mulher daquela classe.
    // Arquivos: assets/chars/<classe>_m_<skin>.glb e <classe>_f_<skin>.glb
    const skinId = o.skin || perfil.equipada[o.classe] || perfil.equipada[o.classe + '_' + o.genero] || 'default';
    let skin = def.skins.find(s => s.id === skinId);
    if (!skin) { skin = { id: skinId, nome: skinId, aceitaCor: false }; if (skinId !== 'default') def.skins.push(skin); }
    const cor = o.cor || perfil.cores[o.classe] || def.corPadrao;

    let gltf = await carregarModelo(`${BASE}chars/${o.classe}_${o.genero}_${skin.id}`);
    if (!gltf && skin.id !== 'default') {
      // modelo da skin ainda não foi enviado: usa o padrão para não travar
      skin = def.skins[0];
      gltf = await carregarModelo(`${BASE}chars/${o.classe}_${o.genero}_default`);
    }
    let corpo;
    if (gltf) {
      corpo = clonar(gltf);
      normalizar(corpo, ALTURA_HEROI);
      if (skin.aceitaCor) aplicarCor(corpo, cor);
    } else {
      corpo = boneco(ALTURA_HEROI, def.corPadrao, cor);
    }
    const info = { tipo: 'personagem', classe: o.classe, genero: o.genero, skin: skin.id, cor };
    const raiz = montar(corpo, info, 'humanoide', ALTURA_HEROI, gltf,
      [`${o.classe}_${o.genero}`, o.classe, 'humanoide']);
    const armas = CATALOGO.armasDaClasse[o.classe];
    if (gltf && armas && !o.semArmas) carregarArmas(raiz.userData.animador, armas);   // em segundo plano
    return raiz;
  }

  // Troca a skin mantendo posição, rotação e lugar na cena
  async function trocarSkin(objAtual, opcoes) {
    const atual = objAtual.userData.skin || {};
    const novo = await criarPersonagem(Object.assign({}, atual, opcoes));
    novo.position.copy(objAtual.position);
    novo.quaternion.copy(objAtual.quaternion);
    if (objAtual.parent) { objAtual.parent.add(novo); objAtual.parent.remove(objAtual); }
    remover(objAtual);
    return novo;
  }

  function trocarCor(obj, hex) {
    aplicarCor(obj, hex);
    if (obj.userData.skin) obj.userData.skin.cor = hex;
  }

  /* ================= API: MOBS E MINIONS ================= */
  async function criarMob(id, mapa) {
    const def = CATALOGO.mobs[id];
    if (!def) throw new Error('Mob desconhecido: ' + id);
    const m = CATALOGO.mapas[mapa] || CATALOGO.mapas.mapa1;
    let gltf = await carregarModelo(`${BASE}mobs/${id}_${m.variante}`);
    if (!gltf && m.variante !== 'default') gltf = await carregarModelo(`${BASE}mobs/${id}_default`);

    let corpo;
    if (def.anim === 'aranha' && !(gltf && gltf.animations && gltf.animations.length)) {
      gltf = null;   // sem animação no arquivo: usa a aranha montada por código
      corpo = criarAranha(def.altura, def.cor, def.cor2 || '#9cff3a');
    } else if (gltf) {
      corpo = clonar(gltf);
      normalizar(corpo, def.altura);
    } else {
      corpo = def.anim === 'humanoide' ? boneco(def.altura, def.cor) : criatura(def.altura, def.cor);
    }
    const raiz = montar(corpo, { tipo: 'mob', id, mapa, variante: m.variante },
      def.anim, def.altura, gltf, def.anim === 'humanoide' ? [id, 'humanoide'] : [id]);
    raiz.scale.multiplyScalar(m.escalaMob);
    return raiz;
  }

  async function criarMinion(tipo, time) {
    const def = CATALOGO.minions[tipo];
    if (!def) throw new Error('Minion desconhecido: ' + tipo);
    const t = CATALOGO.times[time] !== undefined ? time : 'neutro';
    let gltf = await carregarModelo(`${BASE}minions/${tipo}_${t}`);
    if (!gltf && t !== 'neutro') gltf = await carregarModelo(`${BASE}minions/${tipo}_neutro`);
    if (!gltf && def.modelo && def.modelo !== tipo) gltf = await carregarModelo(`${BASE}minions/${def.modelo}_neutro`);
    let corpo;
    if (gltf) {
      corpo = clonar(gltf);
      normalizar(corpo, def.altura);
      if (CATALOGO.times[t]) aplicarCor(corpo, CATALOGO.times[t]);
      (def.aderecos || []).forEach(n => montarAdereco(corpo, n));
    } else {
      corpo = boneco(def.altura, def.cor, CATALOGO.times[t] || def.cor);
    }
    return montar(corpo, { tipo: 'minion', minion: tipo, time: t }, 'humanoide', def.altura, gltf,
      ['minion_' + tipo, 'minion', 'humanoide']);
  }

  /* ================= ADEREÇOS DOS MINIONS (feitos por código) ================= */
  // Medidas em metros, no espaço do personagem: +Z = frente, +Y = cima, +X = esquerda dele.
  function matAdereco(cor, extra) {
    const m = new THREE.MeshStandardMaterial(Object.assign({ color: cor, roughness: 0.75, metalness: 0 }, extra || {}));
    m.userData.semTinta = true; return m;
  }
  const ADERECOS = {
    adaga: { osso: 'righthand', pos: [0, -0.02, 0.05], fazer() {
      const g = new THREE.Group();
      const lamina = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.012, 0.24), matAdereco(0xc9d1d6, { metalness: 0.8, roughness: 0.3 }));
      lamina.position.z = 0.14;
      const guarda = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.02, 0.02), matAdereco(0x6b4a2b));
      const cabo = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.08, 8), matAdereco(0x4a3020));
      cabo.rotation.x = Math.PI / 2; cabo.position.z = -0.04;
      g.add(lamina, guarda, cabo); return g;
    } },
    arco: { osso: 'lefthand', pos: [0, 0, 0.02], fazer() {
      const g = new THREE.Group();
      // arco de madeira curvado para a frente, em pé
      const curva = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.014, 6, 20, Math.PI * 0.75), matAdereco(0x7a4b25));
      curva.rotation.y = -Math.PI / 2; curva.rotation.x = 0;
      curva.rotation.z = -Math.PI * 0.375;
      curva.position.z = -0.30;               // o meio do arco fica na mão
      const corda = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.555, 4), matAdereco(0xe8e2d0));
      corda.position.z = -0.185;
      g.add(curva, corda); return g;
    } },
    aljava: { osso: 'spine2', pos: [-0.06, 0.03, -0.15], fazer() {
      const g = new THREE.Group();
      const tubo = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.3, 10), matAdereco(0x6b4423));
      g.add(tubo);
      for (let i = 0; i < 4; i++) {
        const haste = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.16, 4), matAdereco(0xd8c08a));
        haste.position.set((i % 2 - 0.5) * 0.04, 0.2, (Math.floor(i / 2) - 0.5) * 0.04);
        const pena = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.004), matAdereco(i % 2 ? 0xd94b3d : 0xf2f2f2));
        pena.position.set(haste.position.x, 0.27, haste.position.z);
        g.add(haste, pena);
      }
      g.rotation.z = -0.35; return g;
    } },
    saco: { osso: 'spine2', pos: [0, -0.02, -0.22], fazer() {
      const g = new THREE.Group();
      const saco = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), matAdereco(0x9a7a4a));
      saco.scale.set(1.15, 1.25, 0.95);
      const boca = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.06, 10), matAdereco(0x7d6038));
      boca.position.y = 0.19;
      g.add(saco, boca);
      for (let i = 0; i < 5; i++) {
        const moeda = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.008, 12), matAdereco(0xf1c40f, { metalness: 0.8, roughness: 0.3 }));
        moeda.position.set((i - 2) * 0.025, 0.23 + (i % 2) * 0.012, (i % 3 - 1) * 0.02);
        moeda.rotation.set(0.4 * (i - 2), 0, 0.3 * (i % 2));
        g.add(moeda);
      }
      return g;
    } }
  };
  function montarAdereco(corpo, nome) {
    const def = ADERECOS[nome]; if (!def || !THREE.Box3) return null;
    const osso = acharOsso(corpo, def.osso); if (!osso) return null;
    const obj = def.fazer(); obj.name = 'adereco_' + nome;
    corpo.updateMatrixWorld(true);
    const qc = new THREE.Quaternion(), qo = new THREE.Quaternion(), so = new THREE.Vector3(), sc = new THREE.Vector3();
    corpo.getWorldQuaternion(qc); osso.getWorldQuaternion(qo); osso.getWorldScale(so); corpo.getWorldScale(sc);
    // fica de pé e para a frente do personagem na pose de repouso; depois acompanha o osso
    obj.quaternion.copy(qo.clone().invert().multiply(qc));
    const alvo = new THREE.Vector3(); osso.getWorldPosition(alvo);
    alvo.add(new THREE.Vector3(def.pos[0], def.pos[1], def.pos[2]).applyQuaternion(qc));
    osso.worldToLocal(alvo);
    obj.position.copy(alvo);
    obj.scale.set(1 / so.x, 1 / so.y, 1 / so.z);
    osso.add(obj);
    return obj;
  }

  /* ================= ARMAS NA MÃO ================= */
  const _qa = THREE.Quaternion ? new THREE.Quaternion() : null;
  const _qb = THREE.Quaternion ? new THREE.Quaternion() : null;
  const _va = THREE.Vector3 ? new THREE.Vector3() : null;
  const _vb = THREE.Vector3 ? new THREE.Vector3() : null;
  const limpo = n => (n || '').replace(/[:_\s]/g, '').toLowerCase();

  function acharOsso(raiz, fim) {
    let r = null;
    raiz.traverse(o => { if (!r && o.isBone && limpo(o.name).endsWith(fim)) r = o; });
    return r;
  }

  function montarArma(anim, nome, gltf) {
    const mao = acharOsso(anim.corpo, 'righthand');
    if (!mao) return null;
    const def = CATALOGO.armas[nome] || { modo: 'empunhar' };
    const modelo = clonar(gltf);
    modelo.traverse(n => {
      if (!n.isMesh) return;
      (Array.isArray(n.material) ? n.material : [n.material]).forEach(m => { if (m) m.userData.semTinta = true; });
    });
    const suporte = new THREE.Group();
    suporte.name = 'arma_' + nome;
    suporte.add(modelo);
    mao.add(suporte);

    // pegada: entre o pulso e a base dos dedos (ossos filhos diretos da mão)
    const filho = f => mao.children.find(c => limpo(c.name).endsWith(f));
    const ind = filho('righthandindex1') || filho('righthandmiddle1') || filho('righthandring1');
    const min = filho('righthandpinky1');
    let meio = new THREE.Vector3(0, 1, 0), atravessa = new THREE.Vector3(1, 0, 0);
    if (ind && min) {
      meio = ind.position.clone().add(min.position).multiplyScalar(0.5);
      atravessa = ind.position.clone().sub(min.position).normalize();
    }
    suporte.position.copy(meio).multiplyScalar(0.6);
    if (def.modo === 'empunhar') {
      // ponta da arma para o lado do polegar, atravessando a palma
      const Y = atravessa, Z = meio.clone().normalize();
      Z.sub(Y.clone().multiplyScalar(Z.dot(Y))).normalize();
      const X = new THREE.Vector3().crossVectors(Y, Z);
      suporte.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
    }
    // comprimento para a frente (até a boca do cano), medido no próprio modelo
    let ponta = 0.3;
    if (THREE.Box3) { const cx = new THREE.Box3().setFromObject(modelo); if (isFinite(cx.max.z)) ponta = Math.max(0.1, cx.max.z); }
    return { nome, obj: suporte, mao, modo: def.modo, ponta };
  }

  // Ponto de onde sai o tiro: a boca da arma que está na mão agora (no mundo)
  const _vp = new THREE.Vector3(), _vf = new THREE.Vector3();
  function pontaArma(obj, saida) {
    const anim = obj && obj.userData && obj.userData.animador;
    if (!anim || !obj.parent) return false;
    if (!anim.armas) {
      // sem arma (atirador de energia, mago): sai da mão direita
      anim._maoDir = anim._maoDir || acharOsso(anim.corpo, 'righthand');
      if (!anim._maoDir || !anim._maoDir.getWorldPosition) return false;
      obj.updateMatrixWorld(true);
      anim._maoDir.getWorldPosition(saida);
      saida.x += Math.sin(obj.rotation.y) * 0.25; saida.z += Math.cos(obj.rotation.y) * 0.25;
      return true;
    }
    const quer = (anim.trocasArma && anim.trocasArma[anim.estado]) || anim.armaPadrao;
    const a = anim.armas[quer];
    if (!a || !a.obj.visible || !a.obj.getWorldPosition || a.modo !== 'frente') return false;
    obj.updateMatrixWorld(true);
    a.obj.getWorldPosition(_vp);
    // a boca fica para a frente do personagem (modo 'frente') ou da própria arma
    if (a.modo === 'frente') { _vf.set(Math.sin(obj.rotation.y), 0, Math.cos(obj.rotation.y)); }
    else { _vf.set(0, 0, 1); a.obj.getWorldDirection ? a.obj.getWorldDirection(_vf) : null; }
    const esc = obj.scale ? obj.scale.y : 1;
    saida.copy(_vp).add(_vf.multiplyScalar(a.ponta * esc));
    return true;
  }

  async function carregarArmas(anim, cfg) {
    for (const chave of Object.keys(cfg)) {
      const nome = cfg[chave];
      if (!(anim.armas && anim.armas[nome])) {
        const g = await carregarModelo(`${BASE}armas/${nome}`);
        const a = g && montarArma(anim, nome, g);
        if (!a) continue;
        anim.armas = anim.armas || {};
        anim.armas[nome] = a;
      }
      if (chave === 'padrao') anim.armaPadrao = nome;
      else { anim.trocasArma = anim.trocasArma || {}; anim.trocasArma[chave] = nome; }
    }
  }

  Animador.prototype._atualizarArmas = function () {
    if (!this.armas) return;
    const quer = (this.trocasArma && this.trocasArma[this.estado]) || this.armaPadrao;
    let alguma = false;
    Object.keys(this.armas).forEach(n => { this.armas[n].obj.visible = (n === quer); if (n === quer) alguma = true; });
    if (!alguma) return;
    const a = this.armas[quer];
    this.raiz.updateMatrixWorld(true);
    // tamanho real em metros, qualquer que seja a escala dos ossos
    a.mao.getWorldScale(_va); this.raiz.getWorldScale(_vb);
    a.obj.scale.set(_vb.x / _va.x, _vb.y / _va.y, _vb.z / _va.z);
    if (a.modo !== 'empunhar') {
      // em pé / para a frente do personagem, mesmo com o pulso torto na animação
      this.corpo.getWorldQuaternion(_qa);
      a.mao.getWorldQuaternion(_qb);
      a.obj.quaternion.copy(_qb.invert().multiply(_qa));
    }
  };

  /* ================= ANIMAÇÃO: API ================= */
  function animador(obj) { return obj && obj.userData ? obj.userData.animador : null; }
  function atualizar(dt) { ATIVOS.forEach(a => a.atualizar(dt)); }
  function remover(obj) { const a = animador(obj); if (a) ATIVOS.delete(a); }

  /* ================= TEXTURAS DO MAPA ================= */
  const cacheTex = {};
  function corFallback(nome) {
    const chave = Object.keys(CATALOGO.corTexturaFallback).find(k => nome.indexOf(k) === 0);
    return CATALOGO.corTexturaFallback[chave] || '#888888';
  }
  // copia: outra cópia independente da mesma imagem (para animar separado)
  function textura(nome, repeticaoX, repeticaoY, copia) {
    const rx = repeticaoX || 1, ry = repeticaoY || rx;
    const chave = nome + '|' + rx + '|' + ry + (copia ? '|' + copia : '');
    if (cacheTex[chave]) return cacheTex[chave];
    let tex;
    if (global.document) {
      const cv = global.document.createElement('canvas');
      cv.width = cv.height = 4;
      const ctx = cv.getContext('2d');
      ctx.fillStyle = corFallback(nome); ctx.fillRect(0, 0, 4, 4);
      tex = new THREE.CanvasTexture(cv);
      new THREE.TextureLoader().load(`${BASE}tex/${nome}.jpg`, img => {
        tex.image = img.image; tex.needsUpdate = true;
      }, undefined, () => {});
    } else {
      tex = new THREE.Texture();
    }
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(rx, ry);
    if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
    cacheTex[chave] = tex;
    return tex;
  }

  /* ================= LOJA DE SKINS (gancho futuro) ================= */
  function skinsDaClasse(classe) {
    const def = CATALOGO.classes[classe];
    if (!def) return [];
    const minhas = perfil.desbloqueadas[classe] || [];
    return def.skins.map(s => Object.assign({}, s, {
      desbloqueada: minhas.indexOf(s.id) >= 0,
      equipada: (perfil.equipada[classe] || 'default') === s.id
    }));
  }
  function registrarSkin(classe, skin) {
    const def = CATALOGO.classes[classe];
    if (!def || def.skins.some(s => s.id === skin.id)) return false;
    def.skins.push(Object.assign({ aceitaCor: true, preco: 0 }, skin));
    return true;
  }

  global.Skins = {
    CATALOGO, Perfil,
    criarPersonagem, trocarSkin, trocarCor, pontaArma,
    criarMob, criarMinion, criarAranha, textura,
    animador, atualizar, remover,
    skinsDaClasse, registrarSkin,
    _tingirPixels: tingirPixels,
    _clipesEmbutidos: clipesEmbutidos
  };
})(typeof window !== 'undefined' ? window : globalThis);

/* ---------------- EXEMPLO DE USO ----------------
const relogio = new THREE.Clock();
const heroi = await Skins.criarPersonagem({ classe: 'soldado', genero: 'm', cor: '#e33' });
scene.add(heroi);
const aranha = await Skins.criarMob('aranha', 'mapa1');
scene.add(aranha);

function loop() {
  const dt = relogio.getDelta();
  Skins.atualizar(dt);                          // anima todo mundo, uma vez por quadro
  Skins.animador(heroi).mover(velocidadeHeroi); // parado / andar / correr sozinho
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

// quando o jogador aperta os botões:
Skins.animador(heroi).tocar('ataque');                       // volta sozinho a andar/parado
Skins.animador(heroi).tocar('habilidade1', { aoTerminar: soltarGiro });
Skins.animador(heroi).tocar('dano');                         // tranco + pisca vermelho
Skins.animador(heroi).tocar('morte');  // ... depois: tocar('renascer')
-------------------------------------------------- */
