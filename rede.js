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
  if (sb.auth.onAuthStateChange) sb.auth.onAuthStateChange(ev => { if (ev === 'PASSWORD_RECOVERY' && Rede.aoRecuperarSenha) Rede.aoRecuperarSenha(); });
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
  const CAMPOS = ['classe', 'genero', 'cor', 'clan', 'classes', 'passes', 'mapa', 'pontosRank', 'inventario', 'skinEquipada', 'temporada', 'eventoArena', 'viagem', 'retorno'];

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
    carregarChat();
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
    p.imortal = (r.papel === 'admin' || r.papel === 'moderador') && !!r.imortal;
    p.invisivel = (r.papel === 'admin' || r.papel === 'moderador') && !!r.invisivel;
    p.semVantagem = p.invisivel;          // invisível não ataca jogadores nem ganha PvP
  }

  function ouvirMeuPerfil() {
    sb.channel('perfil_' + Rede.eu.id)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'perfis', filter: 'id=eq.' + Rede.eu.id }, () => sincronizar())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensagens', filter: 'para=eq.' + Rede.eu.id }, () => Rede.lerMensagens())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'equipe_membros' }, () => carregarEquipe())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'convites_equipe', filter: 'para=eq.' + Rede.eu.id }, () => carregarEquipe())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat' }, m => receberChat(m.new))
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
  // vídeos das cinemáticas (Supabase Storage, pasta pública "cinematicas")
  Rede.enviarVideo = async (arquivo, slot) => {
    const ext = ((arquivo.name || '').split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp4';
    const caminho = 'video' + (slot + 1) + '_' + Date.now() + '.' + ext;
    const { error } = await sb.storage.from('cinematicas').upload(caminho, arquivo, { contentType: arquivo.type || 'video/mp4', upsert: true, cacheControl: '3600' });
    if (error) throw new Error(/row-level|policy|Unauthorized|403/i.test(error.message) ? 'Sem permissão para enviar (rode a parte 7 do SQL)' : /Bucket not found/i.test(error.message) ? 'Falta criar a pasta de vídeos (rode a parte 7 do SQL)' : error.message);
    const { data } = sb.storage.from('cinematicas').getPublicUrl(caminho);
    return { url: data.publicUrl, caminho, nome: arquivo.name || caminho, mb: +(arquivo.size / 1048576).toFixed(1) };
  };
  Rede.apagarVideo = async caminho => { const { error } = await sb.storage.from('cinematicas').remove([caminho]); if (error) throw error; };
  // o admin pode mudar dano/defesa a qualquer hora: busca de novo de tempos em tempos
  setInterval(() => { if (Rede.eu) carregarAjustes().catch(() => {}); }, 5 * 60 * 1000);

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
  const cacheNick = {};
  Rede.nicks = async ids => {
    const faltam = ids.filter(id => id && !cacheNick[id]);
    if (faltam.length) {
      const { data } = await sb.from('perfis').select('id, num, nick').in('id', faltam);
      (data || []).forEach(p => { cacheNick[p.id] = p; });
    }
    const m = {}; ids.forEach(id => { if (cacheNick[id]) m[id] = cacheNick[id]; }); return m;
  };
  Rede.nickJa = id => cacheNick[id] || null;

  /* ---------------- CONVERSAS (equipe, amigos, privado) ---------------- */
  // O servidor só entrega o que cada um pode ler (regras do SQL). Silenciados somem só aqui.
  Rede.chat = { mensagens: [], ids: new Set(), naoLidas: 0, bloqueados: new Set(), silenciados: new Set() };
  Rede.aoChat = null;            // a tela de conversa se pendura aqui
  async function carregarChat() {
    try {
      const [m, b, si] = await Promise.all([
        sb.from('chat').select('*').order('id', { ascending: false }).limit(200),
        sb.from('bloqueios').select('bloqueado'), sb.from('silenciados').select('silenciado')
      ]);
      Rede.chat.bloqueados = new Set((b.data || []).map(x => x.bloqueado));
      Rede.chat.silenciados = new Set((si.data || []).map(x => x.silenciado));
      const lista = (m.data || []).reverse();
      Rede.chat.mensagens = lista; Rede.chat.ids = new Set(lista.map(x => x.id));
      await Rede.nicks(Array.from(new Set(lista.map(x => x.de).concat(lista.map(x => x.para).filter(Boolean)))));
      if (Rede.aoChat) Rede.aoChat(null);
    } catch (e) { console.warn('chat', e.message); }
  }
  Rede.carregarChat = carregarChat;
  Rede.calado = id => Rede.chat.silenciados.has(id) || Rede.chat.bloqueados.has(id);
  async function receberChat(m) {
    if (!m || Rede.chat.ids.has(m.id)) return;
    Rede.chat.ids.add(m.id); Rede.chat.mensagens.push(m);
    if (Rede.chat.mensagens.length > 400) Rede.chat.mensagens.splice(0, 100);
    await Rede.nicks([m.de]);
    if (Rede.calado(m.de)) return;
    // balão sobre a cabeça: mensagens da equipe (e as minhas para a equipe)
    if (m.tipo === 'equipe') {
      const ent = m.de === Rede.eu.id ? J.api.E.heroi : (Rede.remotos.get(m.de) || {}).ent;
      if (ent && J.api.balao) J.api.balao(ent, m.texto);
    }
    if (m.de !== Rede.eu.id) Rede.chat.naoLidas++;
    if (Rede.aoChat) Rede.aoChat(m);
  }
  Rede.enviarChat = async (tipo, para, texto) => {
    const id = await rpc('enviar_chat', { p_tipo: tipo, p_para: para || null, p_texto: texto });
    // se o aviso ao vivo demorar, a própria mensagem já aparece
    receberChat({ id, de: Rede.eu.id, tipo, para: para || null, texto: String(texto).trim().slice(0, 200), criado_em: new Date().toISOString(), equipe: null });
    return id;
  };
  Rede.bloquear = async id => { const r = await rpc('bloquear', { p_outro: id }); Rede.chat.bloqueados.add(id); await carregarAmigos(); return r; };
  Rede.desbloquear = async id => { const r = await rpc('desbloquear', { p_outro: id }); Rede.chat.bloqueados.delete(id); return r; };
  Rede.silenciar = async (id, sim) => { const r = await rpc('silenciar', { p_outro: id, p_sim: sim }); if (sim) Rede.chat.silenciados.add(id); else Rede.chat.silenciados.delete(id); return r; };

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
      .on('broadcast', { event: 'fala' }, m => receberFala(m.payload))
      .on('broadcast', { event: 'torre' }, m => receberTorre(m.payload))
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
      i: global.Jogo.poderes.invisivel ? 1 : 0, b: J.api.naMoita(h.x, h.z) ? 1 : 0, a: h.arena ? 1 : 0,
      st: ((P.classes || {})[P.classe] || {}).estrelas || 0
    };
  }

  function enviarPos(t) {
    const p = minhaPos(); if (!p || !canal) return;
    const chave = [p.x, p.z, p.r, p.v, p.m, p.i, p.b, p.c, p.g, p.k, p.s, p.st].join('|');
    // 5x por segundo quando algo muda; 1x por segundo parado (economiza a cota do Supabase)
    if (t < enviarEm || (chave === ultimoEnvio && t < enviarEm + 0.8)) return;
    enviarEm = t + 0.2; ultimoEnvio = chave;
    mandar('pos', p);
  }

  Rede._receberPos = p => receberPos(p);   // usado nos testes
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
        r.rotulo = rotuloDom(p.u, p.n, true);
      } catch (e) { console.warn('jogador remoto', e); }
      finally { r.criando = false; }
    }
    if (r.ent && r.cor !== p.k) { global.Skins.trocarCor(r.ent.obj, p.k); r.cor = p.k; }
  }

  // nome em cima de cada jogador (HTML por cima do jogo): sempre visível e com o ▾ para adicionar, chamar e convidar
  function caixaRotulos() {
    let c = document.getElementById('rotulos');
    if (!c) { c = document.createElement('div'); c.id = 'rotulos'; document.body.appendChild(c); }
    return c;
  }
  function rotuloDom(uid, nick, comMenu) {
    if (typeof document === 'undefined') return null;
    const d = document.createElement('div'); d.className = 'rotJ'; d.dataset.uid = uid;
    const n = document.createElement('span'); n.textContent = nick; d.appendChild(n);
    if (comMenu) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'tri'; b.setAttribute('aria-label', 'Opções do jogador ' + nick); b.textContent = '▾';
      b.addEventListener('pointerdown', ev => ev.stopPropagation());
      b.addEventListener('click', ev => { ev.stopPropagation(); if (Rede.aoMenuJogador) Rede.aoMenuJogador(uid, n.textContent, Number(d.dataset.num) || null); });
      d.appendChild(b);
    }
    caixaRotulos().appendChild(d);
    return d;
  }
  let _v3 = null;
  function posRotulo(el, e, ver) {
    const A = J.api, cam = A.R && A.R.camera;
    if (!ver || !cam || !e.barra) { if (!el.hidden) el.hidden = true; return; }
    _v3 = _v3 || new THREE.Vector3();
    _v3.set(e.x, e.barra.position.y + 0.62, e.z).project(cam);
    if (_v3.z > 1 || Math.abs(_v3.x) > 1.1 || Math.abs(_v3.y) > 1.1) { if (!el.hidden) el.hidden = true; return; }
    if (el.hidden) el.hidden = false;
    el.style.transform = `translate(${((_v3.x + 1) / 2 * innerWidth).toFixed(1)}px, ${((1 - _v3.y) / 2 * innerHeight).toFixed(1)}px) translate(-50%, -100%)`;
  }
  function tirarEntidade(e) {
    const A = J.api, E = A.E;
    global.Skins.remover(e.obj);
    [e.obj, e.barra, e.sombra, e.seloSprite].forEach(o => { if (o && o.parent) o.parent.remove(o); });
    E.entidades = E.entidades.filter(x => x !== e);
    A.E.entidades = E.entidades;
  }
  function removerRemoto(uid) {
    const r = Rede.remotos.get(uid); if (!r) return;
    if (r.ent) tirarEntidade(r.ent);
    if (r.rotulo) r.rotulo.remove();
    Rede.remotos.delete(uid);
  }

  let meuRotulo = null;
  function passo(dt) {
    const A = J.api, E = A.E, agora = performance.now();
    enviarPos(E.t);
    // o seu nome também aparece em cima do seu herói
    const h = E.heroi;
    if (h && Rede.eu && typeof document !== 'undefined') {
      if (!meuRotulo || !meuRotulo.isConnected) { meuRotulo = rotuloDom(Rede.eu.id, Rede.eu.nick, false); meuRotulo.className = 'rotJ eu'; }
      if (meuRotulo.firstChild.textContent !== Rede.eu.nick) meuRotulo.firstChild.textContent = Rede.eu.nick;
      posRotulo(meuRotulo, h, !h.morto && h.obj.visible !== false);
    }
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
      if (r.rotulo) {
        const cls = Rede.aliado(uid) ? 'equipe' : amigo ? 'amigo' : 'outro';
        if (r.rotulo.dataset.cls !== cls) { r.rotulo.dataset.cls = cls; r.rotulo.className = 'rotJ ' + cls; }
        if (r.rotulo.firstChild.textContent !== p.n) r.rotulo.firstChild.textContent = p.n;
        r.rotulo.dataset.num = p.num || '';
        posRotulo(r.rotulo, e, ver && !e.morto);
      }
      // rank: amigos e equipe veem elo + estrelas; os outros só o elo
      if (p.st !== undefined && J.api.selo) J.api.selo(e, p.st, amigo);
    });
  }

  function receberAcao(a) {
    const r = Rede.remotos.get(a.u); if (!r || !r.ent || r.ent.morto) return;
    const e = r.ent; e.rot = a.a; r.p.r = a.a;
    if (e.classe === 'jin') {
      // Jin: Socos e Capoeira só trocam os golpes (sem animação própria)
      if (e.anim.usarConjunto && a.s === 0 && (e.anim.conjunto || 'normal') !== (a.m || 'normal')) e.anim.usarConjunto(a.m || 'normal');
      if (a.s === 0 || a.s === 3) e.anim.tocar(a.s === 0 ? 'ataque' : 'habilidade3');
    } else e.anim.tocar(a.s === 0 ? 'ataque' : 'habilidade' + a.s);
    // só o desenho: o dano chega separado, mandado por quem atirou. As cores seguem a skin dele.
    const tm = J.api.tema(e);
    if (a.s === 0 && e.classe !== 'soldado' && e.classe !== 'jin') {
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
  function receberFala(f) {
    if (!f || f.u === Rede.eu.id || !/^[a-z0-9_]{2,40}$/.test(f.p || '')) return;
    const r = Rede.remotos.get(f.u), h = J.api.E.heroi; if (!r || !r.ent || !h || Rede.chat.silenciados.has(f.u) || Rede.chat.bloqueados.has(f.u)) return;
    const d = Math.hypot(r.ent.x - h.x, r.ent.z - h.z); if (d > 26) return;
    const i = /^hab[1-3]$/.test(f.i) ? f.i : Math.max(0, Math.min(30, f.i | 0));
    J.api.tocarFala(f.p, i, Math.max(0.15, 1 - d / 26));
  }
  function receberEfeito(a) {
    if (a.para !== Rede.eu.id || Rede.aliado(a.de)) return;
    const r = Rede.remotos.get(a.de); if (!r) return;
    const h = J.api.E.heroi; if (!h || h.morto) return;
    if (J.api.zonaSegura(h.x, h.z) || global.Jogo.poderes.imortal) return;
    const emp = Array.isArray(a.empurrar) ? [Math.max(-10, Math.min(10, +a.empurrar[0] || 0)), Math.max(-10, Math.min(10, +a.empurrar[1] || 0))] : null;
    J.api.controlar(h, { stun: Math.min(5, a.stun || 0), slow: a.slow, antiCura: a.antiCura, empurrar: emp, empurrarT: Math.min(1, +a.empurrarT || 0.35) });
  }

  // dano de outro jogador numa torre de arena: todos veem a mesma torre perdendo vida
  function receberTorre(d) {
    if (!d || d.u === Rede.eu.id) return;
    const A = J.api, ar = (A.E.arenas || []).find(a => a.indice === d.a); if (!ar) return;
    const t = ar.torres[d.i]; if (!t || t.morto) return;
    A.causarDano(t, Math.min(Number(d.v) || 0, t.vidaMax * 0.1), null, { semLimite: true, verdadeiro: true, semReacao: true });
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
    G.danoTorre = d => mandar('torre', Object.assign({ u: Rede.eu.id }, d));
    // renascer perto da equipe: um companheiro vivo neste mapa
    G.companheiroVivo = () => {
      let melhor = null;
      Rede.remotos.forEach((r, uid) => { if (!melhor && r.ent && !r.ent.morto && Rede.equipe.has(uid)) melhor = r.ent; });
      return melhor;
    };
    G.arenaFim = venceu => contarEventoArena(venceu);
    G.eventoArenaTexto = () => {
      const ev = eventoAtivo(); if (!ev) return '';
      const P = J.api.P, seq = (P.eventoArena && P.eventoArena.id === ev.id) ? P.eventoArena.seq : 0;
      return `<div class="evento"><b>Evento: ${esc(ev.nome || 'Arena')}</b> · até ${new Date(ev.fim).toLocaleDateString('pt-BR')}<br>` +
        (ev.metas || []).map(m => `${m.vitorias} vitórias seguidas: ${premioTexto(m)}`).join('<br>') +
        `<br><small>Sua sequência agora: ${seq}</small></div>`;
    };
    // fala do meu herói: quem está perto ouve a mesma (mais baixo de longe)
    G.fala = (pasta, i) => mandar('fala', { u: Rede.eu.id, p: pasta, i });
    G.acao = (slot, ang) => {
      const h = J.api.E.heroi, m = h && h.classe === 'jin' && h.jinModo ? h.jinModo.nome : undefined;
      mandar('acao', { u: Rede.eu.id, s: slot, a: +ang.toFixed(2), m });
    };
    // baú do labirinto: o servidor confere o evento e entrega ouro/skin; XP e estrelas o jogo aplica
    G.premioLabirinto = async ciclo => {
      await sincronizar(true);
      const r = await rpc('premio_labirinto', { p_ciclo: ciclo });
      if (r && !r.repetido && r.ouro) { const P = J.api.P; P.ouro += r.ouro; P.ouroTotal += r.ouro; base += r.ouro; }
      if (r && r.skin && r.skin.id) sincronizar(true);
      return r;
    };
    // heróis de evento (Jin): liberados quando ganhos (guardados junto das skins) ou para o administrador
    G.temHeroi = k => {
      if (!Rede.eu) return false;
      if (Rede.eu.papel === 'admin') return true;
      const s = (Rede.eu.skins || {})[k];
      return !!(s && Object.prototype.hasOwnProperty.call(s, 'default') && (!s.default || new Date(s.default) > new Date()));
    };
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

  /* ---------------- EVENTO DA ARENA ---------------- */
  const esc = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function eventoAtivo() {
    const ev = global.Jogo.ajustes && global.Jogo.ajustes.arena_evento, agora = new Date();
    if (!ev || !ev.ativo || !ev.id || new Date(ev.inicio) > agora || new Date(ev.fim) < agora) return null;
    return ev;
  }
  function premioTexto(m) {
    const p = [];
    if (m.ouro > 0) p.push(m.ouro + ' de ouro');
    if (m.xp > 0) p.push(m.xp + ' XP');
    if (m.skin && m.skin.id) p.push('skin ' + m.skin.id + (m.skin.dias > 0 ? ' (' + m.skin.dias + ' dias)' : ''));
    return p.join(' + ') || 'nada';
  }
  Rede.premioTexto = premioTexto;
  async function contarEventoArena(venceu) {
    try { await carregarAjustes(); } catch (e) {}
    const ev = eventoAtivo(); if (!ev) return;
    const P = J.api.P;
    if (!P.eventoArena || P.eventoArena.id !== ev.id) P.eventoArena = { id: ev.id, seq: 0, pegos: [] };
    const e = P.eventoArena;
    e.seq = venceu ? e.seq + 1 : 0;
    J.api.salvar();
    if (venceu) J.api.aviso('Evento da arena: ' + e.seq + ' vitória(s) seguida(s)');
    for (let i = 0; i < (ev.metas || []).length; i++) {
      const m = ev.metas[i];
      if (e.pegos.indexOf(i) >= 0 || e.seq < m.vitorias) continue;
      try {
        const r = await rpc('premio_evento_arena', { p_meta: i, p_seq: e.seq });
        e.pegos.push(i); J.api.salvar();
        if (r && !r.repetido) {
          if (r.ouro) { P.ouro += r.ouro; P.ouroTotal += r.ouro; base += r.ouro; }
          if (r.xp) J.api.ganhar(r.xp, 0, false);
          J.api.aviso('Prêmio do evento: ' + premioTexto(m) + '!');
          if (r.skin) sincronizar(true);
        }
      } catch (err) { console.warn('evento', err.message); }
    }
  }

  /* ---------------- SKINS DO JOGADOR ---------------- */
  // {soldado: {dourado: null (para sempre) | "data de validade"}}
  Rede.minhasSkins = function (classe) {
    const s = (Rede.eu && Rede.eu.skins && Rede.eu.skins[classe]) || {}, agora = new Date();
    const l = [{ id: 'default', ate: null }];
    Object.keys(s).forEach(id => { if (!s[id] || new Date(s[id]) > agora) l.push({ id, ate: s[id] }); });
    // o administrador tem todas as skins, sem comprar
    if (Rede.eu && Rede.eu.papel === 'admin' && global.Skins) {
      ((global.Skins.CATALOGO.classes[classe] || {}).skins || []).forEach(k => { if (!l.some(x => x.id === k.id)) l.push({ id: k.id, ate: null }); });
    }
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
  // clã: o meu (com membros) e os convites que recebi
  Rede.cla = null;
  Rede.carregarCla = async () => {
    const eu = Rede.eu.id;
    const { data: m } = await sb.from('cla_membros').select('cla').eq('jogador', eu).maybeSingle();
    let cla = null, membros = [], convites = [];
    if (m && m.cla) {
      const r1 = await sb.from('clas').select('*').eq('id', m.cla).maybeSingle(); cla = r1.data;
      const r2 = await sb.from('cla_membros').select('jogador, entrou_em').eq('cla', m.cla); membros = r2.data || [];
    } else {
      const r3 = await sb.from('convites_cla').select('cla, de, clas(nome)').eq('para', eu);
      convites = (r3.data || []).map(c => ({ cla: c.cla, de: c.de, nome: (c.clas && c.clas.nome) || '?' }));
    }
    Rede.cla = cla;
    const ids = Array.from(new Set(membros.map(x => x.jogador).concat(convites.map(c => c.de))));
    const nicks = ids.length ? await Rede.nicks(ids) : {};
    return { cla, membros, convites, nicks };
  };
  Rede.depoisDeGastarNoServidor = row => { if (row) { J.api.P.ouro = row.ouro; base = row.ouro; receberPerfil(row); } };
})(typeof window !== 'undefined' ? window : globalThis);
