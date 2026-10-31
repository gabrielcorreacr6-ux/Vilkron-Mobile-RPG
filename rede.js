/* ============================================================
   REDE — login, perfil salvo no servidor e jogadores ao vivo (Supabase)
   Depende de: config-online.js, supabase-js v2, jogo.js
   - Cada mapa é um canal: as posições vão por "broadcast" ~5x por segundo.
   - A vida de cada jogador é controlada pelo celular dele: quem acerta
     manda um aviso de dano, quem cai avisa quem derrubou.
   - Ouro, estrelas, skins, banimentos e poderes passam pelas funções do
     supabase.sql, que conferem se é admin, moderador ou jogador.
   ============================================================ */
(function (global) {
  'use strict';
  // servidor.js tem prioridade (config-online.js fica só para versões antigas)
  const cfg = (global.SERVIDOR && global.SERVIDOR.url) ? global.SERVIDOR : (global.ONLINE || {});
  const ativo = !!(cfg.url && cfg.chave && global.supabase && global.supabase.createClient);
  global.ESPERAR_LOGIN = ativo;

  const Rede = global.Rede = {
    ativo, eu: null, sb: null, remotos: new Map(), amigos: new Set(), pedidos: [], amizades: [],
    equipe: new Set(), equipeId: null, lider: null, membros: [], convitesEquipe: [], aoConviteEquipe: null,
    aoMudarPerfil: null, aoMensagens: null, aoBanido: null
  };
  if (!ativo) return;

  const sb = Rede.sb = global.supabase.createClient(cfg.url, cfg.chave, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });

  async function rpc(nome, args) {
    const { data, error } = await sb.rpc(nome, args || {});
    if (error) throw new Error(limparErro(error.message));
    return data;
  }
  function limparErro(m) { return String(m || 'Erro').replace(/^.*?ERROR:\s*/, ''); }
  Rede.rpc = rpc;

  /* ---------------- LOGIN ---------------- */
  // Cadastro e login com e-mail (Gmail, Hotmail/Outlook) e senha
  const site = () => global.location.origin + global.location.pathname;
  const DOMINIOS = ['gmail.com', 'hotmail.com', 'hotmail.com.br', 'outlook.com', 'outlook.com.br', 'live.com'];
  Rede.emailValido = email => /^[^\s@]+@[^\s@]+$/.test(email) && DOMINIOS.indexOf(email.split('@')[1].toLowerCase()) >= 0;
  function traduzir(m) {
    m = String(m || '');
    if (/invalid login credentials/i.test(m)) return 'E-mail ou senha errados';
    if (/email not confirmed/i.test(m)) return 'Confirme o e-mail primeiro: abra o link que enviamos para você';
    if (/already registered|already exists/i.test(m)) return 'Esse e-mail já tem cadastro. Use Entrar.';
    if (/password should be at least/i.test(m)) return 'A senha precisa ter pelo menos 6 caracteres';
    if (/rate limit|too many/i.test(m)) return 'Muitas tentativas. Espere alguns minutos e tente de novo.';
    return m;
  }
  Rede.entrar = async (email, senha) => {
    const { data, error } = await sb.auth.signInWithPassword({ email: email.trim().toLowerCase(), password: senha });
    if (error) throw new Error(traduzir(error.message));
    return data.session;
  };
  Rede.cadastrar = async (email, senha) => {
    email = email.trim().toLowerCase();
    if (!Rede.emailValido(email)) throw new Error('Use um e-mail Gmail, Hotmail ou Outlook');
    const { data, error } = await sb.auth.signUp({ email, password: senha, options: { emailRedirectTo: site() } });
    if (error) throw new Error(traduzir(error.message));
    return data.session;          // vazio quando o Supabase pede confirmação por e-mail
  };
  Rede.esqueciSenha = async email => {
    const { error } = await sb.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: site() });
    if (error) throw new Error(traduzir(error.message));
  };
  Rede.novaSenha = async senha => {
    const { error } = await sb.auth.updateUser({ password: senha });
    if (error) throw new Error(traduzir(error.message));
  };
  Rede.aoRecuperarSenha = null;
  sb.auth.onAuthStateChange(ev => { if (ev === 'PASSWORD_RECOVERY' && Rede.aoRecuperarSenha) Rede.aoRecuperarSenha(); });
  Rede.sair = async () => { try { await sincronizar(true); } catch (e) {} await sb.auth.signOut(); global.location.reload(); };
  Rede.sessao = async () => (await sb.auth.getSession()).data.session;
  Rede.uid = () => Rede.eu && Rede.eu.id;

  Rede.lerPerfil = async () => {
    const s = await Rede.sessao(); if (!s) return null;
    const { data, error } = await sb.from('perfis').select('*').eq('id', s.user.id).maybeSingle();
    if (error) throw new Error(limparErro(error.message));
    return data;
  };
  Rede.criarPerfil = nick => rpc('criar_perfil', { p_nick: nick });
  Rede.motivoBan = async () => {
    const { data } = await sb.from('banimentos').select('motivo, ate, criado_em').eq('alvo', Rede.eu.id)
      .is('removido_em', null).order('criado_em', { ascending: false }).limit(1);
    return data && data[0];
  };
  Rede.banido = row => !!(row && row.banido_ate && new Date(row.banido_ate) > new Date());

  /* ---------------- PERFIL ↔ JOGO ---------------- */
  let J = null, base = 0, danoBase = 0, versao = 1, sincT = null, sincronizando = false;
  const CAMPOS = ['classe', 'genero', 'cor', 'clan', 'classes', 'passes', 'mapa', 'pontosRank', 'inventario', 'skinEquipada'];

  // começa o jogo com o que está no servidor (ou com o perfil local na primeira vez)
  Rede.prepararJogo = function () {
    J = global.Jogo;
    const eu = Rede.eu, d = eu.dados || {};
    let inicial = d;
    if (!d.classes) {
      // primeira vez online: aproveita o progresso que já estava neste celular
      try {
        const local = JSON.parse(global.localStorage.getItem('jogo25d_perfil_v1') || 'null');
        if (local) { inicial = {}; CAMPOS.forEach(k => { if (local[k] !== undefined) inicial[k] = local[k]; }); }
      } catch (e) {}
    }
    J.api.aplicarPerfil(Object.assign({}, inicial, { nome: eu.nick, ouro: eu.ouro, ouroTotal: eu.ouro_total, danoTotal: eu.dano_total }));
    base = eu.ouro; danoBase = eu.dano_total; versao = eu.versao;
    aplicarPoderes(eu);
    instalarGanchos();
    ouvirMeuPerfil();
    carregarAjustes();
    carregarAmigos();
    carregarEquipe();
    setInterval(() => sincronizar(), 15000);
    setInterval(() => carregarEquipe(), 20000);
    if (global.document && global.document.addEventListener)
      global.document.addEventListener('visibilitychange', () => { if (global.document.hidden) sincronizar(true); });
  };

  function dadosDoJogo() {
    const P = J.api.P, d = {};
    CAMPOS.forEach(k => { if (P[k] !== undefined) d[k] = P[k]; });
    return d;
  }

  async function sincronizar(agora) {
    if (!J || !Rede.eu || sincronizando) return;
    if (Rede.banido(Rede.eu)) return;
    sincronizando = true;
    try {
      const P = J.api.P;
      const antes = P.ouro, danoAntes = P.danoTotal;
      const r = await rpc('salvar_progresso', {
        p_dados: dadosDoJogo(),
        p_ouro_delta: Math.round(antes - base),
        p_dano_delta: Math.round(danoAntes - danoBase),
        p_versao: versao
      });
      P.ouro = r.ouro + (P.ouro - antes);       // o que mudou enquanto salvava continua valendo
      base = r.ouro; danoBase = danoAntes;
      receberPerfil(r);
    } catch (e) {
      if (/banida/i.test(e.message)) { const r = await Rede.lerPerfil(); if (r) receberPerfil(r); }
      else console.warn('salvar', e.message);
    } finally { sincronizando = false; }
  }
  Rede.sincronizar = sincronizar;
  function agendarSinc() { clearTimeout(sincT); sincT = setTimeout(() => sincronizar(), 6000); }

  // o servidor mandou o perfil (depois de salvar, ou porque o admin/moderador mexeu)
  function receberPerfil(r) {
    const antigo = Rede.eu;
    Rede.eu = r;
    if (r.versao !== versao) {
      // admin deu ou tirou estrelas: vale o que está no servidor
      const P = J.api.P;
      J.api.aplicarPerfil(Object.assign({}, r.dados, { nome: r.nick, ouro: P.ouro, ouroTotal: P.ouroTotal, danoTotal: P.danoTotal }));
      versao = r.versao;
    }
    aplicarPoderes(r);
    if (Rede.banido(r) && global.Rede.aoBanido) global.Rede.aoBanido(r);
    if (Rede.aoMudarPerfil) Rede.aoMudarPerfil(r, antigo);
    J.api.hud();
  }

  function aplicarPoderes(r) {
    const p = global.Jogo.poderes;
    p.imortal = r.papel === 'admin' && !!r.imortal;
    p.invisivel = (r.papel === 'admin' || r.papel === 'moderador') && !!r.invisivel;
    p.semVantagem = p.invisivel;          // invisível não ataca jogadores nem ganha PvP
  }

  function ouvirMeuPerfil() {
    sb.channel('perfil_' + Rede.eu.id)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'perfis', filter: 'id=eq.' + Rede.eu.id }, () => sincronizar())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensagens', filter: 'para=eq.' + Rede.eu.id }, () => Rede.lerMensagens())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'equipe_membros' }, () => carregarEquipe())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'convites_equipe', filter: 'para=eq.' + Rede.eu.id }, () => carregarEquipe())
      .subscribe();
  }

  Rede.lerMensagens = async () => {
    try {
      const l = await rpc('ler_mensagens');
      if (l && l.length && Rede.aoMensagens) Rede.aoMensagens(l);
      return l || [];
    } catch (e) { return []; }
  };

  async function carregarAjustes() {
    const { data } = await sb.from('config').select('chave, valor');
    const a = {}; (data || []).forEach(l => { a[l.chave] = l.valor; });
    global.Jogo.ajustes = a;
    return a;
  }
  Rede.carregarAjustes = carregarAjustes;

  /* ---------------- AMIGOS ---------------- */
  async function carregarAmigos() {
    const eu = Rede.eu.id;
    const { data } = await sb.from('amizades').select('de, para, aceita');
    Rede.amizades = data || [];
    Rede.amigos = new Set(Rede.amizades.filter(a => a.aceita).map(a => (a.de === eu ? a.para : a.de)));
    Rede.pedidos = Rede.amizades.filter(a => !a.aceita && a.para === eu).map(a => a.de);
    atualizarTimes();
    return Rede.amizades;
  }

  /* ---------------- EQUIPE (até 4, não se ferem) ---------------- */
  // Só a equipe é aliada no combate. Amigos fora da equipe aparecem no minimapa, mas podem lutar.
  Rede.aliado = uid => Rede.equipe.has(uid);
  function atualizarTimes() {
    Rede.remotos.forEach((r, uid) => {
      if (!r.ent) return;
      r.ent.time = Rede.aliado(uid) ? 'jogador' : 'r_' + uid;
      const cor = Rede.aliado(uid) ? 'equipe' : 'outro';
      if (r.corRotulo !== cor && r.rotulo && r.rotulo.parent) {
        r.rotulo.parent.remove(r.rotulo);
        r.rotulo = J.api.textoSprite(r.p.n, 2.2, Rede.aliado(uid) ? '#9fd8ff' : '#ffb4a8'); r.rotulo.renderOrder = 11; J.api.E.mundo.add(r.rotulo);
      }
      r.corRotulo = cor;
    });
  }
  let convitesVistos = new Set();
  async function carregarEquipe() {
    if (!Rede.eu) return;
    const eu = Rede.eu.id;
    const { data: m } = await sb.from('equipe_membros').select('jogador, equipe, entrou_em');
    const { data: eqs } = await sb.from('equipes').select('id, lider');
    const { data: cv } = await sb.from('convites_equipe').select('equipe, de, para, criado_em').eq('para', eu);
    Rede.membros = m || [];
    Rede.equipeId = Rede.membros.length ? Rede.membros[0].equipe : null;
    const minha = (eqs || []).find(e => e.id === Rede.equipeId);
    Rede.lider = minha ? minha.lider : null;
    Rede.equipe = new Set(Rede.membros.map(x => x.jogador).filter(u => u !== eu));
    Rede.convitesEquipe = cv || [];
    Rede.convitesEquipe.forEach(c => {
      const k = c.equipe + '|' + c.criado_em;
      if (!convitesVistos.has(k)) { convitesVistos.add(k); if (Rede.aoConviteEquipe) Rede.aoConviteEquipe(c); }
    });
    atualizarTimes();
    return Rede.membros;
  }
  Rede.carregarEquipe = carregarEquipe;
  Rede.carregarAmigos = carregarAmigos;
  Rede.nicks = async ids => {
    if (!ids.length) return {};
    const { data } = await sb.from('perfis').select('id, num, nick').in('id', ids);
    const m = {}; (data || []).forEach(p => { m[p.id] = p; }); return m;
  };

  /* ---------------- JOGADORES AO VIVO ---------------- */
  let canal = null, enviarEm = 0, ultimoEnvio = '', ultimoDrop = 0;

  function entrarMapa(mapa) {
    if (canal) { sb.removeChannel(canal); canal = null; }
    Rede.remotos.clear();                    // as entidades antigas sumiram junto com o mapa
    canal = sb.channel('mapa_' + mapa, { config: { broadcast: { self: false }, presence: { key: Rede.eu.id } } });
    canal
      .on('broadcast', { event: 'pos' }, m => receberPos(m.payload))
      .on('broadcast', { event: 'acao' }, m => receberAcao(m.payload))
      .on('broadcast', { event: 'dano' }, m => receberDano(m.payload))
      .on('broadcast', { event: 'apoio' }, m => receberApoio(m.payload))
      .on('broadcast', { event: 'abate' }, m => receberAbate(m.payload))
      .on('broadcast', { event: 'efeito' }, m => receberEfeito(m.payload))
      .on('presence', { event: 'leave' }, m => removerRemoto(m.key))
      .subscribe(st => { if (st === 'SUBSCRIBED') { canal.track({ nick: Rede.eu.nick }); enviarEm = 0; ultimoEnvio = ''; } });
  }
  function mandar(evento, payload) {
    if (canal) canal.send({ type: 'broadcast', event: evento, payload });
  }

  function minhaPos() {
    const h = J.api.E.heroi, P = J.api.P; if (!h) return null;
    return {
      u: Rede.eu.id, n: Rede.eu.nick, num: Rede.eu.num, p: Rede.eu.papel,
      c: P.classe, g: P.genero, k: P.cor, s: (P.skinEquipada || {})[P.classe] || 'default',
      x: +h.x.toFixed(2), z: +h.z.toFixed(2), r: +h.rot.toFixed(2),
      v: Math.max(0, Math.round(h.vida)), vm: h.vidaMax, m: h.morto ? 1 : 0,
      i: global.Jogo.poderes.invisivel ? 1 : 0, b: J.api.naMoita(h.x, h.z) ? 1 : 0, a: h.arena ? 1 : 0
    };
  }

  function enviarPos(t) {
    const p = minhaPos(); if (!p || !canal) return;
    const chave = [p.x, p.z, p.r, p.v, p.m, p.i, p.b, p.c, p.g, p.k, p.s].join('|');
    // 5x por segundo quando algo muda; 1x por segundo parado (economiza a cota do Supabase)
    if (t < enviarEm || (chave === ultimoEnvio && t < enviarEm + 0.8)) return;
    enviarEm = t + 0.2; ultimoEnvio = chave;
    mandar('pos', p);
  }

  async function receberPos(p) {
    if (!p || !p.u || p.u === Rede.eu.id) return;
    let r = Rede.remotos.get(p.u);
    if (!r) { r = { criando: false, ent: null, p }; Rede.remotos.set(p.u, r); }
    r.p = p; r.visto = performance.now();
    const visual = p.c + p.g + p.s;
    if ((!r.ent || r.visual !== visual) && !r.criando) {
      r.criando = true;
      try {
        const obj = await global.Skins.criarPersonagem({ classe: p.c, genero: p.g, cor: p.k, skin: p.s });
        if (Rede.remotos.get(p.u) !== r) { global.Skins.remover(obj); return; }
        if (r.ent) tirarEntidade(r.ent);
        const A = J.api;
        r.ent = A.nova({
          tipo: 'remoto', uid: p.u, nick: p.n, num: p.num, classe: p.c, skin: p.s, time: Rede.aliado(p.u) ? 'jogador' : 'r_' + p.u,
          obj, anim: global.Skins.animador(obj), x: p.x, z: p.z, rot: p.r, vida: p.v, vidaMax: p.vm, raio: 0.6
        });
        r.visual = visual; r.cor = p.k;
        r.rotulo = A.textoSprite(p.n, 2.2, Rede.aliado(p.u) ? '#9fd8ff' : '#ffb4a8'); r.corRotulo = Rede.aliado(p.u) ? 'equipe' : 'outro';
        r.rotulo.renderOrder = 11; A.E.mundo.add(r.rotulo);
      } catch (e) { console.warn('jogador remoto', e); }
      finally { r.criando = false; }
    }
    if (r.ent && r.cor !== p.k) { global.Skins.trocarCor(r.ent.obj, p.k); r.cor = p.k; }
  }

  function tirarEntidade(e) {
    const A = J.api, E = A.E;
    global.Skins.remover(e.obj);
    [e.obj, e.barra, e.sombra].forEach(o => { if (o && o.parent) o.parent.remove(o); });
    E.entidades = E.entidades.filter(x => x !== e);
    A.E.entidades = E.entidades;
  }
  function removerRemoto(uid) {
    const r = Rede.remotos.get(uid); if (!r) return;
    if (r.ent) tirarEntidade(r.ent);
    if (r.rotulo && r.rotulo.parent) r.rotulo.parent.remove(r.rotulo);
    Rede.remotos.delete(uid);
  }

  function passo(dt) {
    const A = J.api, E = A.E, agora = performance.now();
    enviarPos(E.t);
    const souAdmin = Rede.eu.papel === 'admin';
    Rede.remotos.forEach((r, uid) => {
      if (agora - (r.visto || 0) > 8000) { removerRemoto(uid); return; }   // sumiu sem avisar
      const e = r.ent, p = r.p; if (!e) return;
      const k = 1 - Math.exp(-dt * 12);
      const ax = e.x, az = e.z;
      e.x += (p.x - e.x) * k; e.z += (p.z - e.z) * k;
      const d = Math.atan2(Math.sin(p.r - e.rot), Math.cos(p.r - e.rot)); e.rot += d * k;
      if (Math.hypot(p.x - e.x, p.z - e.z) > 12) { e.x = p.x; e.z = p.z; }  // teleporte (renasceu, viajou)
      e.vida = p.v; e.vidaMax = p.vm;
      if (p.m && !e.morto) { e.morto = true; e.anim.tocar('morte'); }
      else if (!p.m && e.morto) { e.morto = false; e.anim.tocar('renascer'); }
      if (!e.morto) e.anim.mover(Math.hypot(e.x - ax, e.z - az) / Math.max(dt, 1e-3));
      if (e.escudo && e.escudoAte < E.t) e.escudo = 0;
      e.invisivelRede = !!p.i; e.naMoita = !!p.b;
      const amigo = Rede.amigos.has(uid) || Rede.aliado(uid);
      // invisível (admin/moderador): só o admin vê, meio transparente. Moita: só amigos veem.
      const ver = (!p.i || souAdmin) && (!p.b || amigo);
      e.obj.visible = ver;
      if (e.obj.visible && p.i && souAdmin && !e._fantasma) { e._fantasma = true; e.obj.traverse(n => { if (n.isMesh && n.material) [].concat(n.material).forEach(m => { m.transparent = true; m.opacity = 0.4; }); }); }
      if (r.rotulo) { r.rotulo.visible = ver && !e.morto; r.rotulo.position.set(e.x, 3.1, e.z); }
    });
  }

  function receberAcao(a) {
    const r = Rede.remotos.get(a.u); if (!r || !r.ent || r.ent.morto) return;
    const e = r.ent; e.rot = a.a; r.p.r = a.a;
    e.anim.tocar(a.s === 0 ? 'ataque' : 'habilidade' + a.s);
    // só o desenho: o dano chega separado, mandado por quem atirou. As cores seguem a skin dele.
    const tm = J.api.tema(e);
    if (a.s === 0 && e.classe !== 'soldado') {
      const cls = global.Jogo.CLASSES[e.classe];
      setTimeout(() => { if (e.obj.parent) J.api.atirar(e, a.a, { soVisual: true, dano: 0, vel: e.classe === 'atirador' ? 24 : 16, restante: cls.alcance, cor: tm.principal, rastro: tm.brasa || tm.faisca || tm.principal, tamanho: 0.9 }); }, 250);
    }
    if (a.s > 0) {
      J.api.emitir('faisca', e.x, 1, e.z, { n: a.s === 3 ? 40 : 22, cor: tm.principal, vel: 3, subida: 2, vida: 0.5 });
      J.api.anelEfeito(e.x, e.z, a.s === 3 ? 3 : 1.6, tm.principal, 0.5, true);
    }
  }

  function receberDano(d) {
    if (d.para !== Rede.eu.id) return;
    const r = Rede.remotos.get(d.de); if (!r || !r.ent) return;
    if (Rede.aliado(d.de)) return;                 // da mesma equipe: ninguém se fere
    const h = J.api.E.heroi; if (!h || h.morto) return;
    J.api.causarDano(h, Math.min(Number(d.v) || 0, 2000), r.ent, { verdadeiro: !!d.vd });
  }

  function receberApoio(a) {
    if (a.para !== Rede.eu.id) return;
    const h = J.api.E.heroi, E = J.api.E; if (!h || h.morto) return;
    if (a.t === 'cura') J.api.curar(h, h.vidaMax * 0.35);
    if (a.t === 'curaForte') J.api.curar(h, h.vidaMax * 0.5);
    if (a.t === 'escudo') { h.escudo = h.vidaMax * 0.4; h.escudoAte = E.t + 4; J.api.bolha(h, 4); }
  }

  // stun, lentidão e corte de cura vindos de outro jogador
  function receberEfeito(a) {
    if (a.para !== Rede.eu.id || Rede.aliado(a.de)) return;
    const r = Rede.remotos.get(a.de); if (!r) return;
    const h = J.api.E.heroi; if (!h || h.morto) return;
    if (J.api.zonaSegura(h.x, h.z) || global.Jogo.poderes.imortal) return;
    J.api.controlar(h, { stun: Math.min(5, a.stun || 0), slow: a.slow, antiCura: a.antiCura });
  }

  async function receberAbate(a) {
    if (a.de !== Rede.eu.id) return;
    try {
      const r = await rpc('recompensa_pvp', { p_vitima: a.vitima });
      const P = J.api.P;
      if (r.ouro) { P.ouro += r.ouro; P.ouroTotal += r.ouro; base += r.ouro; }
      if (r.xp) J.api.ganhar(r.xp, 0, false);
      const nome = (Rede.remotos.get(a.vitima) || {}).p;
      if (r.tipo !== 'repetido') J.api.aviso('Você derrubou ' + (nome ? nome.n : 'um jogador') + ' · +' + (r.xp || 0) + ' XP · +' + (r.ouro || 0) + ' ouro');
    } catch (e) { console.warn('pvp', e.message); }
  }

  /* ---------------- GANCHOS DO JOGO ---------------- */
  function instalarGanchos() {
    const G = global.Jogo.ganchos;
    G.passo = passo;
    G.mapaCarregado = entrarMapa;
    G.salvou = agendarSinc;
    G.acao = (slot, ang) => mandar('acao', { u: Rede.eu.id, s: slot, a: +ang.toFixed(2) });
    G.danoRemoto = (alvo, v, opc) => mandar('dano', { de: Rede.eu.id, para: alvo.uid, v: Math.round(v), vd: opc && opc.verdadeiro ? 1 : 0 });
    G.apoioRemoto = (alvo, tipo) => mandar('apoio', { de: Rede.eu.id, para: alvo.uid, t: tipo });
    G.efeitoRemoto = (alvo, ef) => { if (!global.Jogo.poderes.semVantagem) mandar('efeito', Object.assign({ de: Rede.eu.id, para: alvo.uid }, ef)); };
    G.mortoPorJogador = origem => mandar('abate', { de: origem.uid, vitima: Rede.eu.id });
    G.mobAbatido = async e => {
      const t = Date.now(); if (t - ultimoDrop < 4000) return; ultimoDrop = t;
      try {
        const ganhos = await rpc('sortear_drop', { p_mapa: J.api.E.mapa, p_mob: e.especie });
        (ganhos || []).forEach(g => {
          const P = J.api.P;
          if (g.tipo === 'skin') J.api.aviso('Prêmio! Skin ' + g.skin + ' (' + g.classe + ')' + (g.dias > 0 ? ' por ' + g.dias + ' dia(s)' : ''));
          if (g.tipo === 'item') { P.inventario[g.item] = (P.inventario[g.item] || 0) + (Number(g.qtd) || 1); J.api.aviso('Prêmio! Item: ' + g.item); J.api.salvar(); }
          if (g.tipo === 'ouro') { const q = Number(g.qtd) || 0; P.ouro += q; P.ouroTotal += q; base += q; J.api.aviso('Prêmio! +' + q + ' ouro'); }
        });
        if ((ganhos || []).some(g => g.tipo === 'skin')) { const r = await Rede.lerPerfil(); if (r) receberPerfil(r); }
        J.api.hud();
      } catch (er) { /* sem prêmio */ }
    };
    G.pedirRanking = async qual => {
      try {
        const l = await rpc('ranking', { p_qual: qual });
        global.Jogo.rankingServidor = global.Jogo.rankingServidor || {};
        global.Jogo.rankingServidor[qual] = (l || []).map(x => ({ nome: x.nick, valor: x.valor }));
        setTimeout(() => { if (global.Jogo.rankingServidor) delete global.Jogo.rankingServidor[qual]; }, 60000);
        J.api.telaRanking(qual);
      } catch (e) {}
    };
    // o mapa já foi carregado antes dos ganchos existirem
    if (J.api.E.mapa) entrarMapa(J.api.E.mapa);
  }

  /* ---------------- SKINS DO JOGADOR ---------------- */
  // {soldado: {dourado: null (para sempre) | "data de validade"}}
  Rede.minhasSkins = function (classe) {
    const s = (Rede.eu && Rede.eu.skins && Rede.eu.skins[classe]) || {}, agora = new Date();
    const l = [{ id: 'default', ate: null }];
    Object.keys(s).forEach(id => { if (!s[id] || new Date(s[id]) > agora) l.push({ id, ate: s[id] }); });
    return l;
  };
  Rede.temSkin = (classe, id) => id === 'default' || Rede.minhasSkins(classe).some(s => s.id === id);
  Rede.lojaAtiva = async () => {
    const agora = new Date().toISOString();
    const { data, error } = await sb.from('loja_skins').select('*').lte('inicio', agora).gte('fim', agora).order('fim');
    if (error) throw new Error(error.message);
    return data || [];
  };
  Rede.lojaTodas = async () => {
    const { data } = await sb.from('loja_skins').select('*').gte('fim', new Date(Date.now() - 7 * 864e5).toISOString()).order('inicio', { ascending: false });
    return data || [];
  };
  Rede.comprarSkin = async id => {
    await sincronizar(true);                     // garante que o ouro do jogo está no servidor
    const r = await rpc('comprar_skin', { p_item: id });
    J.api.P.ouro = r.ouro; base = r.ouro;
    receberPerfil(r);
    return r;
  };
  Rede.depoisDeGastarNoServidor = row => { if (row) { J.api.P.ouro = row.ouro; base = row.ouro; receberPerfil(row); } };
})(typeof window !== 'undefined' ? window : globalThis);
