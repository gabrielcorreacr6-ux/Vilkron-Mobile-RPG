/* ============================================================
   MAPAS — layout dos 6 mapas (só dados; quem desenha é o jogo.js)
   Unidade: metros. x cresce para a direita, z cresce para baixo da tela.
   ============================================================ */
(function (global) {
  'use strict';

  // Altura (fração da imagem, de baixo para cima) do ponto que encosta no chão.
  // Construções com base de pedra desenhada apoiam pelo meio da base.
  const ANCORAS = {
    aeroporto_iso: 0.33, aeroporto_cima: 0.34, loja_vermelha: 0.24, loja_azul: 0.24,
    barraca_iso: 0.25, barraca_frente: 0.2, caverna_iso: 0.24, caverna_frente: 0.2,
    cais_iso: 0.12, cais_lado: 0.1, barco_iso: 0.25, barco_lado: 0.2, fonte: 0.22,
    mural: 0.04, banco_1: 0.06, banco_2: 0.06, jardineira: 0.15, vaso_redondo_1: 0.12,
    vaso_redondo_2: 0.12, arvore_1: 0.02, pinheiro_1: 0.02, moita_1: 0.03,
    poste_simples: 0.02, poste_duplo: 0.02
  };

  // Praça de nascimento (loja e barraca só no mapa 1)
  function praca(x, z, completa) {
    const d = [
      { img: 'fonte', h: 3.2, x: x, z: z },
      { img: 'poste_simples', h: 3.6, x: x - 10, z: z - 10 }, { img: 'poste_simples', h: 3.6, x: x + 10, z: z - 10 },
      { img: 'poste_simples', h: 3.6, x: x - 10, z: z + 10 }, { img: 'poste_simples', h: 3.6, x: x + 10, z: z + 10 },
      { img: 'banco_1', h: 1.3, x: x - 4.5, z: z + 6.5 }, { img: 'banco_2', h: 1.3, x: x + 4.5, z: z + 6.5 },
      { img: 'vaso_redondo_1', h: 1.3, x: x - 8, z: z + 3.5 }, { img: 'vaso_redondo_2', h: 1.3, x: x + 8, z: z + 3.5 }
    ];
    if (completa) {
      d.push({ img: 'loja_vermelha', h: 4.6, x: x - 6, z: z - 6.5, interacao: 'loja' });
      d.push({ img: 'barraca_iso', h: 4.6, x: x + 6, z: z - 6.5, interacao: 'instrucoes' });
      d.push({ img: 'mural', h: 2.6, x: x, z: z - 9 });
      d.push({ img: 'jardineira', h: 1.2, x: x - 2.8, z: z + 9 }, { img: 'jardineira', h: 1.2, x: x + 2.8, z: z + 9 });
    }
    return d;
  }

  const lista = {
    /* ---------------- 1. FLORESTA ---------------- */
    mapa1: {
      nome: 'Floresta do Início', tam: [220, 160], ceu: '#9fcfe0', nevoa: [45, 95],
      chao: { tex: 'grama_mapa1', tint: '#dfe8d4', metrosPorRepeticao: 6 },
      entrada: [-88, 6],
      pracas: [{ x: -88, z: 0, w: 24, h: 24 }],
      caminhos: [{ largura: 4.5, pts: [[-76, 0], [-62, -8], [-48, -24], [-30, -38], [-8, -42], [14, -34], [26, -14], [20, 8], [2, 22], [-18, 34], [-32, 52], [-12, 64], [20, 62], [44, 48], [58, 24], [62, 0], [74, -22], [92, -38]] }],
      rios: [{ largura: 9, pts: [[2, 84], [6, 56], [-2, 30], [6, 4], [2, -24], [-6, -50], [-2, -84]] }],
      lagos: [{ x: -45, z: -60, r: 11 }, { x: 78, z: 46, r: 10 }],
      aeroporto: { x: 98, z: -46 },
      decor: praca(-88, 0, true).concat([
        { img: 'caverna_iso', h: 6, x: 90, z: -14 }, { img: 'caverna_frente', h: 5.5, x: -72, z: 38 },
        { img: 'cais_iso', h: 1.8, x: 11, z: -6 }, { img: 'cais_iso', h: 1.8, x: -1, z: 59 }
      ]),
      floresta: { qtd: 170, semente: 11, tint: '#ffffff' },
      moitas: [[-58, -14], [-40, -30], [-20, -47], [4, -47], [22, -24], [29, 0], [10, 16], [-8, 28], [-26, 44], [-22, 62], [8, 69], [34, 58], [54, 36], [67, 10], [67, -12], [80, -27]],
      mobs: [
        { tipo: 'maestro', x: -44, z: -12 }, { tipo: 'veterano', x: -20, z: -54 },
        { tipo: 'dragao', x: 34, z: -26 }, { tipo: 'barao', x: 38, z: 8 }, { tipo: 'aranha', x: -30, z: 42 }
      ],
      minions: [{
        intervalo: 45, cavernaIni: [90, -12], cavernaFim: [-72, 40],
        ida: [[88, -10], [70, -8], [48, -2], [28, -6], [11, -6]],
        barco: [[5, -6], [6, 4], [-2, 30], [5, 55]],
        volta: [[-1, 59], [-24, 52], [-50, 45], [-70, 41]]
      }],
      passe: { nivel: 0, preco: { simples: 10, ferias: 18, cidadania: 150 } }
    },

    /* ---------------- 2. CHUVA ---------------- */
    mapa2: {
      nome: 'Vale da Chuva', tam: [220, 160], ceu: '#7f98a6', nevoa: [32, 80],
      chao: { tex: 'grama_mapa2', reserva: 'grama_mapa1', tint: '#7fa08a', metrosPorRepeticao: 6 },
      entrada: [88, -6],
      pracas: [{ x: 88, z: 0, w: 22, h: 22 }],
      caminhos: [{ largura: 4.5, pts: [[77, 0], [62, 8], [48, 24], [30, 38], [8, 42], [-14, 34], [-26, 14], [-20, -8], [-2, -22], [18, -34], [32, -52], [12, -64], [-20, -62], [-44, -48], [-58, -24], [-62, 0], [-74, 22], [-90, 38]] }],
      rios: [{ largura: 9, pts: [[66, -84], [60, -50], [55, -18], [56, 20], [62, 50], [68, 84]] }],
      lagos: [{ x: 45, z: 60, r: 11 }, { x: -76, z: -46, r: 10 }],
      aeroporto: { x: -98, z: 46 },
      decor: praca(88, 0, false).concat([
        { img: 'caverna_iso', h: 6, x: -90, z: 30 }, { img: 'cais_iso', h: 1.8, x: 49, z: 20 }
      ]),
      floresta: { qtd: 160, semente: 23, tint: '#8fb0a8' },
      moitas: [[58, 14], [40, 30], [20, 47], [-4, 47], [-22, 24], [-29, 0], [-10, -16], [8, -28], [26, -44], [22, -62], [-8, -69], [-34, -58], [-54, -36], [-67, -10], [-67, 12], [-80, 27]],
      mobs: [
        { tipo: 'aranha', x: 44, z: 32 }, { tipo: 'barao', x: 18, z: 52 }, { tipo: 'golem', x: 2, z: 6 },
        { tipo: 'dragao', x: -36, z: -14 }, { tipo: 'veterano', x: 26, z: -50 }, { tipo: 'maestro', x: -42, z: -60 }
      ],
      // minions chegam de barco no início e vão até a caverna perto do aeroporto
      minions: [{
        intervalo: 45, inicio: 'barco', cavernaFim: [-90, 32],
        barco: [[66, -84], [60, -50], [55, -18], [56, 20]],
        volta: [[49, 20], [32, 24], [10, 30], [-20, 26], [-50, 20], [-76, 30], [-88, 32]]
      }],
      chuva: { slow: 0.20 },      // a chuva deixa todos 20% mais lentos
      passe: { nivel: 5, preco: { simples: 60, ferias: 100, cidadania: 800 } }
    },

    /* ---------------- 3. RANQUEADO ---------------- */
    mapa3: {
      nome: 'Vale Ranqueado', tam: [280, 180], ceu: '#b3d4e0', nevoa: [50, 110],
      chao: { tex: 'grama_mapa3', reserva: 'grama_mapa1', tint: '#d6d08a', metrosPorRepeticao: 6 },
      entrada: [-118, 6],
      pracas: [{ x: -118, z: 0, w: 22, h: 22 }],
      caminhos: [{ largura: 5, pts: [[-106, 0], [-88, -14], [-66, -24], [-44, -18], [-26, -4], [0, 0], [26, 4], [44, 18], [66, 24], [88, 10], [100, -14], [112, -36], [122, -48]] }],
      rios: [{ largura: 8, pts: [[-104, 40], [-90, 30], [-70, 36], [-48, 52], [-20, 62], [10, 74], [30, 94]] }],
      lagos: [{ x: 42, z: -52, r: 13 }, { x: 72, z: 62, r: 10 }],
      aeroporto: { x: 128, z: -56 },
      eventoRank: { x: 0, z: 0, r: 24 },
      cachoeira: { x: -104, z: 44 },
      decor: praca(-118, 0, false).concat([
        { img: 'caverna_iso', h: 6, x: 118, z: -18 }, { img: 'caverna_frente', h: 6.5, x: -104, z: 44 }
      ]),
      floresta: { qtd: 230, semente: 37, tint: '#e8d890' },
      moitas: [[-80, -26], [-56, -30], [-36, -24], [-20, 16], [20, 18], [26, -18], [-18, -18], [52, 32], [78, 28], [94, -2], [106, -26], [-60, 6]],
      mobs: [
        { tipo: 'maestro', x: -72, z: -42 }, { tipo: 'veterano', x: -40, z: -48 }, { tipo: 'aranha', x: -20, z: 38 },
        { tipo: 'dragao', x: 30, z: -32 }, { tipo: 'barao', x: 52, z: 42 }, { tipo: 'maestro', x: 82, z: 42 },
        { tipo: 'aranha', x: 94, z: -36 }
      ],
      buffPorMob: 0.003,          // cada mob derrotado: +0,3% de dano
      minions: [{
        intervalo: 45, cavernaIni: [118, -16], cavernaFim: [-104, 44],
        ida: [[116, -14], [96, -6], [72, 0], [44, 0], [20, 0], [0, 0], [-22, -2], [-44, 6], [-66, 14], [-86, 26], [-102, 40]]
      }],
      passe: { nivel: 10, preco: { simples: 120, ferias: 200, cidadania: 1500 } }
    },

    /* ---------------- 4. ARENAS ---------------- */
    arenas: {
      nome: 'Campo das Arenas', tam: [320, 200], ceu: '#a6cbe0', nevoa: [55, 120],
      chao: { tex: 'grama_mapa1', tint: '#cfe3b0', metrosPorRepeticao: 6 },
      entrada: [-140, 46],
      pracas: [{ x: -140, z: 40, w: 22, h: 22 }],
      caminhos: [{ largura: 5, pts: [[-128, 40], [-100, 30], [-70, 6], [-30, 2], [0, 12], [30, 2], [70, 6], [100, 30], [134, 40]] }],
      rios: [],
      lagos: [{ x: -110, z: 74, r: 9 }, { x: 116, z: 76, r: 9 }],
      aeroporto: { x: 146, z: 48 },
      arenas: [{ x: -70, z: -48, w: 110, h: 46 }, { x: 70, z: -48, w: 110, h: 46 }],
      decor: praca(-140, 40, false).concat([
        { img: 'caverna_iso', h: 6, x: -134, z: 4 }, { img: 'caverna_iso', h: 6, x: 134, z: 4 },
        { img: 'caverna_frente', h: 5.5, x: -134, z: -26 }, { img: 'caverna_frente', h: 5.5, x: 134, z: -26 }
      ]),
      floresta: { qtd: 160, semente: 51, tint: '#f0f8e0', zMin: 18 },
      moitas: [[-90, 54], [-50, 60], [-10, 66], [30, 60], [70, 56], [-30, 24], [30, 24]],
      mobs: [
        { tipo: 'maestro', x: -90, z: 72 }, { tipo: 'veterano', x: -40, z: 74 }, { tipo: 'dragao', x: 0, z: 80 },
        { tipo: 'barao', x: 40, z: 72 }, { tipo: 'aranha', x: 90, z: 74 }
      ],
      minions: [
        { intervalo: 45, cavernaIni: [-134, 6], cavernaFim: [134, -24], ida: [[-130, 10], [-100, 18], [-60, 20], [-20, 22], [20, 22], [60, 20], [100, 6], [130, -22]] },
        { intervalo: 45, cavernaIni: [134, 6], cavernaFim: [-134, -24], ida: [[130, 14], [100, 28], [60, 30], [20, 32], [-20, 32], [-60, 30], [-100, 8], [-130, -22]] }
      ],
      passe: { nivel: 15, preco: { simples: 180, ferias: 300, cidadania: 2200 } }
    },

    /* ---------------- 5. ASCENSÃO ---------------- */
    ascensao: {
      nome: 'Ascensão', tam: [240, 180], ceu: '#8fc4d8', nevoa: [45, 100],
      chao: { tex: 'grama_mapa1', tint: '#a8d8c0', metrosPorRepeticao: 6 },
      aguaBase: true,                // quase tudo é água; terra só nas ilhas e passarelas
      ilhas: [
        { x: -96, z: 0, r: 20 }, { x: -52, z: -36, r: 15 }, { x: -40, z: 40, r: 14 }, { x: -5, z: 0, r: 17 },
        { x: 36, z: -38, r: 15 }, { x: 40, z: 40, r: 14 }, { x: 92, z: 4, r: 21 }
      ],
      entrada: [-98, 4],
      pracas: [{ x: -98, z: -2, w: 16, h: 16 }],
      caminhos: [
        { largura: 3.5, pts: [[-82, -6], [-52, -36], [-5, 0], [36, -38], [78, -2]] },
        { largura: 3.5, pts: [[-5, 0], [-40, 40]] }, { largura: 3.5, pts: [[-5, 0], [40, 40]] }
      ],
      rios: [], lagos: [],
      aeroporto: { x: 100, z: -6 },
      serpente: { vida: 2500, dano: 70, alcance: 10, porJogadores: 4 },
      decor: praca(-98, -2, false).concat([{ img: 'caverna_iso', h: 6, x: 96, z: 18 }]),
      floresta: { qtd: 110, semente: 61, tint: '#9fe0c8', soIlhas: true },
      moitas: [[-60, -30], [-46, 44], [0, 8], [30, -32], [46, 36]],
      mobs: [
        { tipo: 'maestro', x: -54, z: -40 }, { tipo: 'veterano', x: 38, z: -42 }, { tipo: 'dragao', x: -42, z: 44 },
        { tipo: 'barao', x: 42, z: 44 }, { tipo: 'aranha', x: -8, z: 6 }
      ],
      minions: [{
        intervalo: 45, cavernaIni: [-96, -10], cavernaFim: [96, 16],
        ida: [[-90, -8], [-82, -6], [-52, -36], [-5, 0], [36, -38], [78, -2], [94, 14]]
      }],
      passe: { nivel: 20, preco: { simples: 250, ferias: 420, cidadania: 3000 } }
    },

    /* ---------------- 6. REPOUSO ---------------- */
    repouso: {
      nome: 'Jardim do Repouso', tam: [180, 140], ceu: '#c7dfee', nevoa: [50, 100],
      chao: { tex: 'grama_repouso', reserva: 'grama_mapa1', tint: '#d8f0c0', metrosPorRepeticao: 6 },
      entrada: [-76, 6],
      pracas: [{ x: -76, z: 0, w: 18, h: 18 }, { x: 0, z: -24, w: 34, h: 18 }],
      caminhos: [{ largura: 4.5, pts: [[-66, 0], [-40, -6], [-18, -14], [0, -14], [22, -14], [44, -6], [62, -18], [78, -30]] }],
      rios: [{ largura: 7, pts: [[-44, 72], [-30, 44], [-34, 24]] }],
      lagos: [{ x: -36, z: 14, r: 9 }, { x: 42, z: 32, r: 12 }],
      aeroporto: { x: 82, z: -36 },
      podio: { x: 0, z: -26, zonaSegura: 20 },
      decor: praca(-76, 0, false),
      floresta: { qtd: 120, semente: 71, tint: '#ffd6e0' },
      moitas: [[-50, 20], [20, 40], [56, 10], [-10, 30]],
      mobs: [], minions: [],
      pvpLivre: true,
      passe: { nivel: 5, preco: { simples: 80, ferias: 140, cidadania: 1000 } }
    }
  };

  global.MAPAS = {
    ANCORAS,
    ordem: ['mapa1', 'mapa2', 'mapa3', 'arenas', 'ascensao', 'repouso'],
    lista
  };
})(typeof window !== 'undefined' ? window : globalThis);
