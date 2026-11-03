/* ============================================================
   PAINEL — telas do modo online e minimapa
   - Login com Google, criação do nick, tela de banido
   - Menu ⋮ (canto superior esquerdo): loja de skins, minhas skins,
     amigos, mensagens, moderação (moderador), meu ID, sair
   - Menu ☰ (canto superior direito): só o administrador
   - Minimapa ao lado do ⋮ (toque duas vezes para ampliar)
   ============================================================ */
(function (global) {
  'use strict';
  const doc = global.document;
  const $ = id => doc.getElementById(id);
  const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const CLASSES_NOMES = { soldado: 'Soldado', jin: 'Jin (Soldado)', suporte: 'Suporte', phil: 'Phil (Suporte)', violet: 'Violet (Suporte)', mago: 'Mago', merlin: 'Merlin (Mago)', atirador: 'Atirador', gigante: 'Gigante (Atirador)' };
  const dataBR = d => d ? new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
  const ateBR = d => (!d || String(d).indexOf('infinity') >= 0 || new Date(d).getFullYear() > 9000) ? 'para sempre' : 'até ' + dataBR(d);

  function J() { return global.Jogo.api; }
  function modal(titulo, html, aoMontar) {
    J().abrirModal(titulo, html, aoMontar);
    $('modalFechar').hidden = false;
  }
  function aviso(t) { J().aviso(t); }
  async function tentar(fn, ok) {
    try { const r = await fn(); if (ok) aviso(typeof ok === 'function' ? ok(r) : ok); return r; }
    catch (e) { aviso(e.message || String(e)); return undefined; }
  }

  /* ======================= TELA CHEIA (login, nick, banido) ======================= */
  function telaCheia(html) {
    let t = $('telaOnline');
    if (!t) { t = doc.createElement('div'); t.id = 'telaOnline'; doc.body.appendChild(t); }
    t.innerHTML = '<div class="cartao caixa">' + html + '</div>';
    t.hidden = false;
    $('carregando').hidden = true;
    return t;
  }
  function fecharTelaCheia() { const t = $('telaOnline'); if (t) t.hidden = true; }

  // Cadastro e login com e-mail e senha (Gmail, Hotmail ou Outlook)
  const CHAVE_NICK = 'vilkron_nick_pendente';
  function telaLogin(aviso, aba) {
    aba = aba || 'entrar';
    const abaHtml = (k, n) => `<button type="button" class="aba ${aba === k ? 'sel' : ''}" data-aba="${k}">${n}</button>`;
    const corpo = {
      entrar: `
        <input id="lEmail" class="campo" type="email" autocomplete="email" placeholder="E-mail (Gmail, Hotmail ou Outlook)">
        <input id="lSenha" class="campo" type="password" autocomplete="current-password" placeholder="Senha">
        <button class="acao forte grande" id="lIr" type="button">Entrar</button>
        <button class="link" id="lEsqueci" type="button">Esqueci a senha</button>`,
      criar: `
        <input id="lNick" class="campo" maxlength="16" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Nick (3 a 16 letras, números ou _)">
        <input id="lEmail" class="campo" type="email" autocomplete="email" placeholder="E-mail (Gmail, Hotmail ou Outlook)">
        <input id="lSenha" class="campo" type="password" autocomplete="new-password" placeholder="Senha (mínimo 6)">
        <input id="lSenha2" class="campo" type="password" autocomplete="new-password" placeholder="Repita a senha">
        <button class="acao forte grande" id="lIr" type="button">Criar conta</button>`,
      esqueci: `
        <p class="nota">Digite o e-mail da conta. Vamos mandar um link para você criar uma senha nova.</p>
        <input id="lEmail" class="campo" type="email" autocomplete="email" placeholder="E-mail">
        <button class="acao forte grande" id="lIr" type="button">Mandar link</button>`
    }[aba];
    const t = telaCheia(`
      <h1>VILKRON</h1>
      ${aba !== 'esqueci' ? '<div class="abas centro">' + abaHtml('entrar', 'Entrar') + abaHtml('criar', 'Criar conta') + '</div>' : ''}
      ${aviso ? '<p class="' + (aviso.ok ? 'certo' : 'erro') + '">' + esc(aviso.texto || aviso) + '</p>' : ''}
      ${corpo}
      ${aba === 'esqueci' ? '<button class="link" data-aba="entrar" type="button">Voltar</button>' : ''}`);
    t.querySelectorAll('[data-aba]').forEach(b => b.addEventListener('click', () => telaLogin(null, b.dataset.aba)));
    const v = id => (t.querySelector('#' + id) || {}).value || '';
    const ir = async () => {
      const botao = t.querySelector('#lIr'); botao.disabled = true;
      try {
        const Rede = global.Rede;
        if (aba === 'entrar') {
          await Rede.entrar(v('lEmail'), v('lSenha'));
          comecar();
        } else if (aba === 'criar') {
          const nick = v('lNick').trim();
          if (!/^[A-Za-z0-9_]{3,16}$/.test(nick)) throw new Error('O nick precisa ter de 3 a 16 letras, números ou _');
          if (v('lSenha').length < 6) throw new Error('A senha precisa ter pelo menos 6 caracteres');
          if (v('lSenha') !== v('lSenha2')) throw new Error('As duas senhas não são iguais');
          try { global.localStorage.setItem(CHAVE_NICK, nick); } catch (e) {}
          const sessao = await Rede.cadastrar(v('lEmail'), v('lSenha'));
          if (sessao) comecar();
          else telaLogin({ ok: true, texto: 'Conta criada! Abra o e-mail que enviamos, toque no link de confirmação e depois entre aqui.' }, 'entrar');
        } else {
          await Rede.esqueciSenha(v('lEmail'));
          telaLogin({ ok: true, texto: 'Pronto! Veja seu e-mail e toque no link para criar a senha nova.' }, 'entrar');
        }
      } catch (e) { botao.disabled = false; const p = t.querySelector('.erro, .certo'); if (p) p.remove(); botao.insertAdjacentHTML('beforebegin', '<p class="erro">' + esc(e.message) + '</p>'); }
    };
    t.querySelector('#lIr').addEventListener('click', ir);
    t.querySelectorAll('input').forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') ir(); }));
    const esq = t.querySelector('#lEsqueci'); if (esq) esq.addEventListener('click', () => telaLogin(null, 'esqueci'));
  }
  function telaNovaSenha(erro) {
    const t = telaCheia(`<h1>Senha nova</h1>
      ${erro ? '<p class="erro">' + esc(erro) + '</p>' : ''}
      <input id="nS1" class="campo" type="password" autocomplete="new-password" placeholder="Senha nova (mínimo 6)">
      <input id="nS2" class="campo" type="password" autocomplete="new-password" placeholder="Repita a senha">
      <button class="acao forte grande" id="nIr" type="button">Salvar senha</button>`);
    t.querySelector('#nIr').addEventListener('click', async () => {
      const a = t.querySelector('#nS1').value, b = t.querySelector('#nS2').value;
      if (a.length < 6) return telaNovaSenha('A senha precisa ter pelo menos 6 caracteres');
      if (a !== b) return telaNovaSenha('As duas senhas não são iguais');
      try { await global.Rede.novaSenha(a); global.location.replace(global.location.pathname); } catch (e) { telaNovaSenha(e.message); }
    });
  }

  function telaNick(erro) {
    return new Promise(resolve => {
      const t = telaCheia(`
        <h1>Crie seu nick</h1>
        <p class="nota">De 3 a 16 letras, números ou _. É o nome que todos vão ver e não dá para trocar depois.</p>
        ${erro ? '<p class="erro">' + esc(erro) + '</p>' : ''}
        <input id="iNick" class="campo" maxlength="16" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="SeuNick">
        <button class="acao forte grande" id="bNick" type="button">Começar</button>`);
      const ir = async () => {
        const nick = t.querySelector('#iNick').value.trim();
        try { resolve(await global.Rede.criarPerfil(nick)); }
        catch (e) { resolve(telaNick(e.message)); }
      };
      t.querySelector('#bNick').addEventListener('click', ir);
      t.querySelector('#iNick').addEventListener('keydown', e => { if (e.key === 'Enter') ir(); });
    });
  }

  async function telaBanido(row) {
    const b = await global.Rede.motivoBan().catch(() => null);
    const t = telaCheia(`
      <h1>Conta banida</h1>
      <p><b>${esc(row.nick)}</b> (ID ${row.num}) está banido ${esc(ateBR(row.banido_ate))}.</p>
      ${b ? '<p class="nota">Motivo: ' + esc(b.motivo) + '</p>' : ''}
      <button class="acao" id="bSairBan" type="button">Sair da conta</button>`);
    t.querySelector('#bSairBan').addEventListener('click', () => global.Rede.sair());
  }

  /* ======================= INÍCIO ======================= */
  let comecou = false;
  async function comecar() {
    const Rede = global.Rede;
    instalarMinimapa();
    if (!Rede || !Rede.ativo) return;           // offline: o jogo.js começa sozinho
    try {
      Rede.aoRecuperarSenha = () => telaNovaSenha();
      if (/type=recovery/.test(global.location.hash)) { telaNovaSenha(); return; }
      const s = await Rede.sessao();
      if (!s) { telaLogin(); return; }
      if (comecou) return; comecou = true;
      let eu = await Rede.lerPerfil();
      if (!eu) {
        // nick escolhido no cadastro (quando precisou confirmar o e-mail antes)
        let pend = null; try { pend = global.localStorage.getItem(CHAVE_NICK); } catch (e) {}
        if (pend) { try { eu = await Rede.criarPerfil(pend); } catch (e) { eu = await telaNick(e.message); } }
        else eu = await telaNick();
        try { global.localStorage.removeItem(CHAVE_NICK); } catch (e) {}
      }
      Rede.eu = eu;
      if (Rede.banido(eu)) { telaBanido(eu); return; }
      fecharTelaCheia();
      $('carregando').hidden = false;
      instalarMenus(eu);
      Rede.aoBanido = r => { telaBanido(r); };
      Rede.aoMensagens = mostrarMensagens;
      Rede.aoMenuJogador = menuJogador;
      Rede.aoConviteEquipe = c => conviteEquipe(c);
      Rede.aoMudarPerfil = r => { atualizarMenus(r); };
      Rede.prepararJogo();                    // perfil do servidor antes de montar o mapa
      await tocarCinematicas();               // vídeos do admin (pula depois de 5 s)
      await global.Jogo.iniciar();
      if (eu.papel === 'moderador') {
        const pago = await Rede.rpc('receber_salario').catch(() => 0);
        if (pago > 0) { aviso('Salário de moderador: +' + pago + ' ouro'); Rede.sincronizar(); }
      }
      Rede.lerMensagens();
    } catch (e) {
      console.error(e);
      telaLogin('Não foi possível conectar: ' + (e.message || e));
    }
  }

  /* ======================= MENUS ======================= */
  function instalarMenus(eu) {
    const menu = $('menu');
    const itens = [
      ['conversas', 'Conversas'], ['equipe', 'Equipe'], ['cla', 'Clã'], ['skins_loja', 'Loja'], ['skins_minhas', 'Minhas skins'], ['amigos', 'Amigos'],
      ['mensagens', 'Mensagens'], ['moderacao', 'Moderação'], ['meuid', 'Meu ID'], ['sair', 'Sair da conta']
    ];
    const primeiro = menu.querySelector('[data-menu]');
    const bloco = doc.createDocumentFragment();
    itens.forEach(([q, nome]) => {
      const b = doc.createElement('button'); b.type = 'button'; b.dataset.menu = q; b.textContent = nome;
      if (q === 'moderacao') b.id = 'menuModeracao';
      bloco.appendChild(b);
    });
    bloco.appendChild(doc.createElement('hr'));
    menu.insertBefore(bloco, primeiro);

    // ☰ do administrador
    const bAdmin = doc.createElement('button');
    bAdmin.id = 'bAdmin'; bAdmin.type = 'button'; bAdmin.className = 'caixa'; bAdmin.setAttribute('aria-label', 'Menu do administrador');
    bAdmin.innerHTML = '<i></i>';
    bAdmin.addEventListener('click', telaAdmin);
    $('topo').appendChild(bAdmin);

    // botão de conversa (com o número de mensagens novas)
    const bChat = doc.createElement('button');
    bChat.id = 'bChat'; bChat.type = 'button'; bChat.className = 'caixa hud'; bChat.setAttribute('aria-label', 'Conversas');
    bChat.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H10l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" fill="currentColor"/></svg><b hidden></b>';
    bChat.addEventListener('click', () => telaChat());
    doc.body.appendChild(bChat);
    global.Rede.aoChat = m => { marcarNaoLidas(); if (chatAberto && chatAberto.atualizar) chatAberto.atualizar(m); };

    global.Jogo.ganchos.menu = q => {
      const f = {
        conversas: () => telaChat(), equipe: telaEquipe, cla: telaCla, skins_loja: telaLojaSkins, skins_minhas: telaMinhasSkins, amigos: telaAmigos, mensagens: telaMensagens,
        moderacao: telaModeracao, meuid: telaMeuId, sair: () => global.Rede.sair()
      }[q];
      if (f) { f(); return true; }
      return false;
    };
    atualizarMenus(eu);
  }
  function atualizarMenus(eu) {
    const m = $('menuModeracao'); if (m) m.hidden = eu.papel !== 'moderador';
    const a = $('bAdmin'); if (a) a.hidden = eu.papel !== 'admin';
  }

  function telaMeuId() {
    const eu = global.Rede.eu;
    modal('Meu ID', `<p>Nick: <b>${esc(eu.nick)}</b></p><p>ID: <b class="grandeId">${eu.num}</b></p>
      <p class="nota">Passe o ID para seus amigos te adicionarem.${eu.papel !== 'jogador' ? ' Você é <b>' + eu.papel + '</b>.' : ''}</p>`);
  }

  /* ---------- mensagens ---------- */
  let caixaMensagens = [];
  function mostrarMensagens(l) {
    // não cobre a escolha do herói de quem acabou de entrar
    const E = global.Jogo && J().E;
    if (!E || !E.heroi || !$('modal').hidden) { setTimeout(() => mostrarMensagens(l), 1500); return; }
    caixaMensagens = l.concat(caixaMensagens).slice(0, 50);
    const html = l.map(m => `<div class="linha"><div>${esc(m.texto)}<small>${dataBR(m.criado_em)}</small></div></div>`).join('');
    modal('Mensagem da administração', html);
  }
  async function telaMensagens() {
    const { data } = await global.Rede.sb.from('mensagens').select('*').order('criado_em', { ascending: false }).limit(30);
    const html = (data || []).map(m => `<div class="linha"><div>${esc(m.texto)}<small>${dataBR(m.criado_em)}</small></div></div>`).join('');
    modal('Mensagens', html || '<p class="nota">Nenhuma mensagem.</p>');
  }

  /* ---------- loja de skins ---------- */
  async function telaLojaSkins() {
    const Rede = global.Rede;
    const lista = await tentar(() => Rede.lojaAtiva());
    if (!lista) return;
    const P = J().P;
    const linhas = lista.map(l => {
      global.Skins.registrarSkin(l.classe, { id: l.skin, nome: l.nome, aceitaCor: false });
      const tem = Rede.temSkin(l.classe, l.skin) && Rede.minhasSkins(l.classe).find(s => s.id === l.skin && !s.ate);
      const resta = l.estoque ? l.estoque - l.vendidas : null;
      const esgotada = resta !== null && resta <= 0;
      return `<div class="linha"><div><b>${esc(l.nome)}</b><small>${CLASSES_NOMES[l.classe]} · vale para homem e mulher</small>
        <small>Sai da loja em ${dataBR(l.fim)}${resta !== null ? ' · restam ' + Math.max(0, resta) : ''}</small></div>
        <div class="dir"><span class="preco">${l.preco} ouro</span>
        <button class="acao" type="button" data-comprar="${l.id}" ${tem || esgotada ? 'disabled' : ''}>${tem ? 'Você tem' : esgotada ? 'Esgotada' : 'Comprar'}</button></div></div>`;
    }).join('');
    const pr = precos();
    modal('Loja', `<p class="nota">Seu ouro: <b>${Math.floor(P.ouro)}</b>.</p>
      <h3 class="sub">Serviços</h3>
      <div class="linha"><div><b>Criar um clã</b><small>Você vira o líder e chama quem quiser (até 30 membros).</small></div>
        <div class="dir"><span class="preco">${pr.cla} ouro</span><button class="acao" type="button" id="lCla">${Rede.cla ? 'Você já tem clã' : 'Criar'}</button></div></div>
      <div class="linha"><div><b>Trocar de nick</b><small>Seu nick hoje: ${esc(Rede.eu.nick)}</small></div>
        <div class="dir"><span class="preco">${pr.nick} ouro</span><button class="acao" type="button" id="lNick">Trocar</button></div></div>
      <h3 class="sub">Skins</h3><p class="nota">Todas as skins são limitadas. Cada skin serve só para a classe dela.</p>
      ${linhas || '<p class="nota">Nenhuma skin na loja agora. Volte depois!</p>'}`, el => {
      el.querySelector('#lCla').addEventListener('click', () => telaCla());
      el.querySelector('#lNick').addEventListener('click', () => telaTrocarNick());
      el.querySelectorAll('[data-comprar]').forEach(b => b.addEventListener('click', async () => {
        b.disabled = true;
        const r = await tentar(() => Rede.comprarSkin(Number(b.dataset.comprar)), 'Skin comprada! Equipe em Minhas skins');
        if (r) telaLojaSkins(); else b.disabled = false;
      }));
    });
  }

  // preços dos serviços (o administrador muda na aba Preços)
  function precos() {
    const p = (global.Jogo.ajustes && global.Jogo.ajustes.precos) || {};
    return { cla: p.cla !== undefined ? Number(p.cla) : 5000, nick: p.nick !== undefined ? Number(p.nick) : 2000 };
  }
  function telaTrocarNick() {
    const Rede = global.Rede, pr = precos();
    modal('Trocar de nick', `<p class="nota">Custa <b>${pr.nick} ouro</b>. Seu ouro: <b>${Math.floor(J().P.ouro)}</b>. De 3 a 16 letras, números ou _.</p>
      <div class="form"><input id="nNick" class="campo" maxlength="16" autocomplete="off" placeholder="Novo nick" value="${esc(Rede.eu.nick)}">
      <button class="acao forte" id="nTrocar" type="button">Trocar por ${pr.nick} ouro</button></div>`, el => {
      el.querySelector('#nTrocar').addEventListener('click', async () => {
        const nick = el.querySelector('#nNick').value.trim();
        if (!/^[A-Za-z0-9_]{3,16}$/.test(nick)) return aviso('O nick precisa ter de 3 a 16 letras, números ou _');
        await Rede.sincronizar(true);
        const r = await tentar(() => Rede.rpc('trocar_nick', { p_nick: nick }));
        if (r) { Rede.depoisDeGastarNoServidor(r); aviso('Agora você é ' + r.nick); J().fecharModal(); }
      });
    });
  }
  // ---- clã ----
  async function telaCla() {
    const Rede = global.Rede, pr = precos();
    const d = await tentar(() => Rede.carregarCla()); if (!d) return;
    const eu = Rede.eu.id, souLider = d.cla && d.cla.lider === eu;
    const nome = id => d.nicks[id] ? esc(d.nicks[id].nick) + ' <small class="inline">#' + d.nicks[id].num + '</small>' : '?';
    let html;
    if (d.cla) {
      const membros = d.membros.slice().sort((a, b) => (a.jogador === d.cla.lider ? -1 : b.jogador === d.cla.lider ? 1 : 0));
      html = `<h3 class="sub">🏰 ${esc(d.cla.nome)} <small class="inline">${membros.length}/30</small></h3>
        <p class="nota">Os pontos do ranking de clãs vêm dos eventos ranqueados de cada membro.</p>
        ${membros.map(m => `<div class="linha"><span>${m.jogador === d.cla.lider ? '👑 ' : ''}${m.jogador === eu ? '<b>Você</b>' : nome(m.jogador)}${m.jogador !== eu && Rede.remotos.has(m.jogador) ? ' <small class="inline online">neste mapa</small>' : ''}</span>
          ${souLider && m.jogador !== eu ? `<button class="acao fina" type="button" data-expulsar="${m.jogador}">Expulsar</button>` : ''}</div>`).join('')}
        <h3 class="sub">Chamar para o clã</h3>
        <div class="linha"><input id="cNum" class="campo" inputmode="numeric" placeholder="ID do jogador"><button class="acao" id="cChamar" type="button">Chamar</button></div>
        <p class="nota">Também dá para chamar tocando no ▾ ao lado do nome de quem está no mapa.</p>
        <button class="acao" id="cSair" type="button">Sair do clã</button>`;
    } else {
      html = `${d.convites.length ? '<h3 class="sub">Convites para você</h3>' + d.convites.map(c => `<div class="linha"><span>🏰 ${esc(c.nome)} <small class="inline">por ${nome(c.de)}</small></span><div class="botoes">
          <button class="acao fina forte" type="button" data-aceitar="${c.cla}">Entrar</button><button class="acao fina" type="button" data-recusar="${c.cla}">Recusar</button></div></div>`).join('') : ''}
        <h3 class="sub">Criar um clã</h3>
        <p class="nota">Custa <b>${pr.cla} ouro</b> (seu ouro: <b>${Math.floor(J().P.ouro)}</b>). Você vira o líder.</p>
        <div class="form"><input id="cNome" class="campo" maxlength="20" placeholder="Nome do clã (3 a 20 letras)"><button class="acao forte" id="cCriar" type="button">Criar por ${pr.cla} ouro</button></div>`;
    }
    modal('Clã', html, el => {
      const depois = r => { if (r !== undefined) telaCla(); };
      const q = id => el.querySelector(id);
      if (q('#cCriar')) q('#cCriar').addEventListener('click', async () => {
        const nomeCla = q('#cNome').value.trim();
        if (nomeCla.length < 3) return aviso('O nome do clã precisa de pelo menos 3 letras');
        await Rede.sincronizar(true);
        const r = await tentar(() => Rede.rpc('criar_cla', { p_nome: nomeCla }));
        if (r) { Rede.depoisDeGastarNoServidor(r); aviso('Clã criado!'); telaCla(); }
      });
      if (q('#cChamar')) q('#cChamar').addEventListener('click', async () => depois(await tentar(() => Rede.rpc('convidar_cla', { p_num: Number(q('#cNum').value) }), r => r)));
      if (q('#cSair')) q('#cSair').addEventListener('click', async () => { await Rede.sincronizar(true); depois(await tentar(() => Rede.rpc('sair_cla'), r => r)); });
      el.querySelectorAll('[data-expulsar]').forEach(b => b.addEventListener('click', async () => depois(await tentar(() => Rede.rpc('expulsar_cla', { p_jogador: b.dataset.expulsar }), r => r))));
      el.querySelectorAll('[data-aceitar]').forEach(b => b.addEventListener('click', async () => { await Rede.sincronizar(true); depois(await tentar(() => Rede.rpc('responder_convite_cla', { p_cla: Number(b.dataset.aceitar), p_aceitar: true }), r => r)); }));
      el.querySelectorAll('[data-recusar]').forEach(b => b.addEventListener('click', async () => depois(await tentar(() => Rede.rpc('responder_convite_cla', { p_cla: Number(b.dataset.recusar), p_aceitar: false }), r => r))));
    });
  }
  // ---- ▾ ao lado do nome de outro jogador ----
  function menuJogador(uid, nick, num) {
    const Rede = global.Rede, amigo = Rede.amigos.has(uid), naEquipe = Rede.aliado(uid);
    modal(nick, `<p class="nota">${num ? 'ID #' + num : ''}${amigo ? ' · seu amigo' : ''}${naEquipe ? ' · na sua equipe' : ''}</p>
      <div class="botoes coluna">
        <button class="acao" type="button" data-j="amigo" ${amigo ? 'disabled' : ''}>${amigo ? 'Já é seu amigo' : '➕ Adicionar amigo'}</button>
        <button class="acao" type="button" data-j="equipe" ${naEquipe ? 'disabled' : ''}>${naEquipe ? 'Já está na sua equipe' : '⚔️ Chamar para a equipe'}</button>
        <button class="acao" type="button" data-j="cla">🏰 Convidar para o clã</button>
        <button class="acao" type="button" data-j="conversa">💬 Conversa privada</button>
      </div>
      ${!amigo && !naEquipe ? '<p class="nota">Para a equipe, vocês precisam ser amigos antes.</p>' : ''}`, el => {
      el.querySelectorAll('[data-j]').forEach(b => b.addEventListener('click', async () => {
        const o = b.dataset.j;
        if (o === 'conversa') return telaChat('privado', uid);
        if (!num) return aviso('Esse jogador ainda não carregou');
        const rpc = { amigo: 'pedir_amizade', equipe: 'convidar_equipe', cla: 'convidar_cla' }[o];
        const r = await tentar(() => Rede.rpc(rpc, { p_num: num }), x => x);
        if (r !== undefined) { if (o === 'equipe') Rede.carregarEquipe(); J().fecharModal(); }
      }));
    });
  }
  function telaMinhasSkins() {
    const Rede = global.Rede, P = J().P;
    P.skinEquipada = P.skinEquipada || {};
    const html = Object.keys(CLASSES_NOMES).map(c => {
      const minhas = Rede.minhasSkins(c), eq = P.skinEquipada[c] || 'default';
      return `<h3 class="sub">${CLASSES_NOMES[c]}</h3>` + minhas.map(s => {
        const nome = s.id === 'default' ? 'Padrão' : ((global.Skins.CATALOGO.classes[c].skins.find(x => x.id === s.id) || {}).nome || s.id);
        return `<div class="linha"><div><b>${esc(nome)}</b><small>${s.ate ? 'Teste até ' + dataBR(s.ate) : 'Para sempre'}</small></div>
          <button class="acao fina ${eq === s.id ? 'sel' : ''}" type="button" data-classe="${c}" data-skin="${esc(s.id)}">${eq === s.id ? 'Equipada' : 'Equipar'}</button></div>`;
      }).join('');
    }).join('');
    modal('Minhas skins', '<p class="nota">A skin vale para o homem e para a mulher da mesma classe.</p>' + html, el => {
      el.querySelectorAll('[data-skin]').forEach(b => b.addEventListener('click', async () => {
        P.skinEquipada[b.dataset.classe] = b.dataset.skin; J().salvar();
        if (b.dataset.classe === P.classe) await J().criarHeroi();
        telaMinhasSkins();
      }));
    });
  }
  // skin de teste venceu: volta para a padrão
  setInterval(() => {
    const Rede = global.Rede; if (!Rede || !Rede.eu || !global.Jogo || !J().P.skinEquipada) return;
    const P = J().P, eq = P.skinEquipada[P.classe];
    // só tira a skin se ela venceu de verdade (perfil já carregado e não é o admin, que tem todas)
    if (eq && eq !== 'default' && Rede.eu.skins && Rede.eu.papel !== 'admin' && !Rede.temSkin(P.classe, eq)) { P.skinEquipada[P.classe] = 'default'; J().salvar(); J().criarHeroi(); aviso('Sua skin de teste acabou'); }
  }, 60000);

  /* ---------- amigos ---------- */
  async function telaAmigos() {
    const Rede = global.Rede;
    await Rede.carregarAmigos();
    if (Rede.carregarChat && !Rede.chat.carregado) { Rede.chat.carregado = true; await Rede.carregarChat(); }
    const bloq = Array.from(Rede.chat.bloqueados);
    const ids = Array.from(new Set(Rede.amizades.map(a => (a.de === Rede.eu.id ? a.para : a.de)).concat(bloq)));
    const n = await Rede.nicks(ids);
    const amigos = Array.from(Rede.amigos), pedidos = Rede.pedidos;
    const enviados = Rede.amizades.filter(a => !a.aceita && a.de === Rede.eu.id).map(a => a.para);
    const nome = id => n[id] ? esc(n[id].nick) + ' <small class="inline">#' + n[id].num + '</small>' : '?';
    modal('Amigos', `
      <p class="nota">Seu ID: <b>${Rede.eu.num}</b>. Amigos aparecem no minimapa e dão visão dos inimigos perto deles. Para não se ferirem, chame-os para a sua Equipe.</p>
      <div class="linha"><input id="iAmigo" class="campo" inputmode="numeric" placeholder="ID do amigo"><button class="acao" id="bAddAmigo" type="button">Adicionar</button></div>
      ${pedidos.length ? '<h3 class="sub">Pedidos para você</h3>' + pedidos.map(id => `<div class="linha"><span>${nome(id)}</span><div class="botoes">
        <button class="acao fina forte" data-aceitar="${id}" type="button">Aceitar</button><button class="acao fina" data-recusar="${id}" type="button">Recusar</button><button class="acao fina" data-bloquear="${id}" type="button">Bloquear</button></div></div>`).join('') : ''}
      <h3 class="sub">Amigos</h3>
      ${amigos.map(id => `<div class="linha"><span>${nome(id)} ${Rede.remotos.has(id) ? '<small class="inline online">neste mapa</small>' : ''}${Rede.chat.silenciados.has(id) ? ' <small class="inline">silenciado</small>' : ''}</span>
        <div class="botoes"><button class="acao fina forte" data-conversar="${id}" type="button">Conversar</button>
        <button class="acao fina" data-silenciar="${id}" type="button">${Rede.chat.silenciados.has(id) ? 'Tirar silêncio' : 'Silenciar'}</button>
        <button class="acao fina" data-bloquear="${id}" type="button">Bloquear</button>
        <button class="acao fina" data-remover="${id}" type="button">Excluir</button></div></div>`).join('') || '<p class="nota">Nenhum ainda.</p>'}
      ${bloq.length ? '<h3 class="sub">Bloqueados</h3>' + bloq.map(id => `<div class="linha"><span>${nome(id)}</span><button class="acao fina" data-desbloquear="${id}" type="button">Desbloquear</button></div>`).join('') : ''}
      ${enviados.length ? '<h3 class="sub">Esperando resposta</h3>' + enviados.map(id => `<div class="linha"><span>${nome(id)}</span></div>`).join('') : ''}`, el => {
      el.querySelector('#bAddAmigo').addEventListener('click', async () => {
        const num = Number(el.querySelector('#iAmigo').value);
        if (!num) return aviso('Digite o ID');
        if (await tentar(() => Rede.rpc('pedir_amizade', { p_num: num }), r => r) !== undefined) telaAmigos();
      });
      el.querySelectorAll('[data-aceitar]').forEach(b => b.addEventListener('click', async () => { await tentar(() => Rede.rpc('responder_amizade', { p_de: b.dataset.aceitar, p_aceitar: true }), 'Amizade aceita'); telaAmigos(); }));
      el.querySelectorAll('[data-recusar]').forEach(b => b.addEventListener('click', async () => { await tentar(() => Rede.rpc('responder_amizade', { p_de: b.dataset.recusar, p_aceitar: false })); telaAmigos(); }));
      el.querySelectorAll('[data-remover]').forEach(b => b.addEventListener('click', async () => { await tentar(() => Rede.rpc('desfazer_amizade', { p_outro: b.dataset.remover }), 'Amizade desfeita'); telaAmigos(); }));
      el.querySelectorAll('[data-conversar]').forEach(b => b.addEventListener('click', () => telaChat('privado', b.dataset.conversar)));
      el.querySelectorAll('[data-silenciar]').forEach(b => b.addEventListener('click', async () => { const id = b.dataset.silenciar; await tentar(() => Rede.silenciar(id, !Rede.chat.silenciados.has(id)), r => r); telaAmigos(); }));
      el.querySelectorAll('[data-bloquear]').forEach(b => b.addEventListener('click', async () => { await tentar(() => Rede.bloquear(b.dataset.bloquear), r => r); telaAmigos(); }));
      el.querySelectorAll('[data-desbloquear]').forEach(b => b.addEventListener('click', async () => { await tentar(() => Rede.desbloquear(b.dataset.desbloquear), r => r); telaAmigos(); }));
    });
  }

  /* ---------- conversas: equipe, amigos e privado ---------- */
  let chatAberto = null;
  function marcarNaoLidas() {
    const b = $('bChat'); if (!b) return; const n = global.Rede.chat.naoLidas, i = b.querySelector('b');
    const aberto = !!(chatAberto && $('modal') && !$('modal').hidden && doc.querySelector('#chatLista, .pessoa, [data-chataba]')); if (!aberto) chatAberto = null;
    i.hidden = !n || aberto; i.textContent = n > 9 ? '9+' : n;
  }
  const horaBR = d => new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  async function telaChat(aba, para) {
    const Rede = global.Rede, eu = Rede.eu.id;
    aba = aba || (chatAberto && chatAberto.aba) || 'equipe';
    Rede.chat.naoLidas = 0; marcarNaoLidas();
    await Promise.all([Rede.carregarAmigos(), Rede.carregarEquipe ? Rede.carregarEquipe() : null]);
    const msgs = Rede.chat.mensagens;
    const daVez = m => !(m.de !== eu && Rede.calado(m.de)) && (aba === 'equipe' ? m.tipo === 'equipe' : aba === 'amigos' ? m.tipo === 'amigos'
      : m.tipo === 'privado' && para && ((m.de === eu && m.para === para) || (m.de === para && m.para === eu)));
    // conversas privadas: quem já falou com você + seus amigos
    const pessoas = Array.from(new Set(msgs.filter(m => m.tipo === 'privado').map(m => m.de === eu ? m.para : m.de).concat(Array.from(Rede.amigos)))).filter(id => id && id !== eu);
    await Rede.nicks(pessoas.concat(para ? [para] : []));
    const nk = id => { const n = Rede.nickJa(id); return n ? esc(n.nick) : '?'; };
    const linha = m => `<div class="msg ${m.de === eu ? 'eu' : ''}"><b>${m.de === eu ? 'Você' : nk(m.de)}</b><span>${esc(m.texto)}</span><small>${horaBR(m.criado_em)}</small></div>`;
    const abaB = (k, n) => `<button type="button" class="aba ${aba === k ? 'sel' : ''}" data-chataba="${k}">${n}</button>`;
    let corpo;
    if (aba === 'privado' && !para) {
      corpo = pessoas.length ? pessoas.map(id => {
        const ult = msgs.filter(m => m.tipo === 'privado' && (m.de === id || m.para === id)).slice(-1)[0];
        return `<button type="button" class="pessoa" data-com="${id}"><b>${nk(id)}</b>${Rede.chat.silenciados.has(id) ? ' <small class="inline">silenciado</small>' : ''}<small>${ult ? esc(ult.texto).slice(0, 40) : 'Comece uma conversa'}</small></button>`;
      }).join('') : '<p class="nota">Nenhuma conversa ainda. Adicione amigos em Amigos.</p>';
    } else {
      const semEquipe = aba === 'equipe' && !(Rede.membros && Rede.membros.length);
      const topoPriv = aba === 'privado' ? `<div class="linha"><button type="button" class="acao fina" data-chataba="privado">‹ Voltar</button><b>${nk(para)}</b>
        <div class="botoes"><button type="button" class="acao fina" data-silenciar="${para}">${Rede.chat.silenciados.has(para) ? 'Tirar silêncio' : 'Silenciar'}</button>
        <button type="button" class="acao fina" data-bloquear="${para}">Bloquear</button></div></div>` : '';
      corpo = `${topoPriv}
        ${semEquipe ? '<p class="nota">Você não está em uma equipe. Crie ou entre numa equipe (menu ⋮ → Equipe) para conversar com ela; as mensagens aparecem num balão em cima da cabeça.</p>' : ''}
        ${aba === 'amigos' ? '<p class="nota">Todos os seus amigos leem o que você escreve aqui.</p>' : ''}
        <div class="chatLista" id="chatLista">${msgs.filter(daVez).map(linha).join('') || '<p class="nota">Nenhuma mensagem ainda.</p>'}</div>
        <div class="chatEnviar"><input id="chatTexto" class="campo" maxlength="200" placeholder="Escreva uma mensagem" ${semEquipe ? 'disabled' : ''}><button class="acao forte" id="chatIr" type="button" ${semEquipe ? 'disabled' : ''}>Enviar</button></div>`;
    }
    modal('Conversas', `<div class="abas">${abaB('equipe', 'Equipe')}${abaB('amigos', 'Amigos')}${abaB('privado', 'Privado')}</div>${corpo}`, el => {
      chatAberto = { aba, para };
      el.querySelectorAll('[data-chataba]').forEach(b => b.addEventListener('click', () => telaChat(b.dataset.chataba, null)));
      el.querySelectorAll('[data-com]').forEach(b => b.addEventListener('click', () => telaChat('privado', b.dataset.com)));
      el.querySelectorAll('[data-silenciar]').forEach(b => b.addEventListener('click', async () => { const id = b.dataset.silenciar; await tentar(() => Rede.silenciar(id, !Rede.chat.silenciados.has(id)), r => r); telaChat('privado', id); }));
      el.querySelectorAll('[data-bloquear]').forEach(b => b.addEventListener('click', async () => { if (await tentar(() => Rede.bloquear(b.dataset.bloquear), r => r) !== undefined) telaChat('privado', null); }));
      const lista = el.querySelector('#chatLista'), txt = el.querySelector('#chatTexto'), ir = el.querySelector('#chatIr');
      if (lista) lista.scrollTop = lista.scrollHeight;
      const mandar = async () => {
        const t = txt.value.trim(); if (!t) return;
        ir.disabled = true;
        const ok = await tentar(() => Rede.enviarChat(aba, aba === 'privado' ? para : null, t));
        ir.disabled = false; if (ok !== undefined) { txt.value = ''; txt.focus(); }
      };
      if (ir) { ir.addEventListener('click', mandar); txt.addEventListener('keydown', e => { if (e.key === 'Enter') mandar(); }); }
      chatAberto.atualizar = m => {
        if (!lista || !lista.isConnected) return;
        if (m && !daVez(m)) return;
        if (m) { const vazio = lista.querySelector('.nota'); if (vazio) vazio.remove(); lista.insertAdjacentHTML('beforeend', linha(m)); }
        else lista.innerHTML = Rede.chat.mensagens.filter(daVez).map(linha).join('');
        lista.scrollTop = lista.scrollHeight; Rede.chat.naoLidas = 0; marcarNaoLidas();
      };
    });
    // fechou a janela: volta a contar as novas
    const fechar = $('modalFechar'); if (fechar && !fechar.dataset.chat) { fechar.dataset.chat = '1'; fechar.addEventListener('click', () => { chatAberto = null; marcarNaoLidas(); }); }
  }

  /* ---------- equipe ---------- */
  async function conviteEquipe(c) {
    const n = await global.Rede.nicks([c.de]);
    const quem = n[c.de] ? n[c.de].nick : 'Um amigo';
    const abrir = () => {
      if (!J().E.heroi || !$('modal').hidden) { setTimeout(abrir, 1500); return; }
      modal('Convite de equipe', `<p><b>${esc(quem)}</b> chamou você para a equipe dele.</p>
        <p class="nota">Na equipe (até 4 jogadores) ninguém fere ninguém. Se você já está em outra equipe, sai dela ao aceitar.</p>
        <div class="botoes"><button class="acao forte" id="cAceitar" type="button">Aceitar</button><button class="acao" id="cRecusar" type="button">Recusar</button></div>`, el => {
        el.querySelector('#cAceitar').addEventListener('click', async () => { await tentar(() => global.Rede.rpc('responder_convite_equipe', { p_equipe: c.equipe, p_aceitar: true }), r => r); await global.Rede.carregarEquipe(); J().fecharModal(); });
        el.querySelector('#cRecusar').addEventListener('click', async () => { await tentar(() => global.Rede.rpc('responder_convite_equipe', { p_equipe: c.equipe, p_aceitar: false }), r => r); await global.Rede.carregarEquipe(); J().fecharModal(); });
      });
    };
    abrir();
  }
  async function telaEquipe() {
    const Rede = global.Rede;
    await Promise.all([Rede.carregarAmigos(), Rede.carregarEquipe()]);
    const eu = Rede.eu.id, souLider = Rede.lider === eu;
    const ids = Array.from(new Set(Rede.membros.map(m => m.jogador).concat(Array.from(Rede.amigos), Rede.convitesEquipe.map(c => c.de))));
    const n = await Rede.nicks(ids);
    const nome = id => n[id] ? esc(n[id].nick) + ' <small class="inline">#' + n[id].num + '</small>' : '?';
    const membros = Rede.membros.slice().sort((a, b) => (a.jogador === Rede.lider ? -1 : b.jogador === Rede.lider ? 1 : 0));
    const fora = Array.from(Rede.amigos).filter(id => !Rede.membros.some(m => m.jogador === id));
    const cheia = membros.length >= 4;
    modal('Equipe', `
      <p class="nota">Até 4 jogadores. Na equipe ninguém fere ninguém, a cura e o escudo do suporte valem para todos e vocês se veem no minimapa.</p>
      ${Rede.convitesEquipe.length ? '<h3 class="sub">Convites para você</h3>' + Rede.convitesEquipe.map(c => `<div class="linha"><span>${nome(c.de)}</span><div class="botoes">
        <button class="acao fina forte" type="button" data-aceitar="${c.equipe}">Entrar</button><button class="acao fina" type="button" data-recusar="${c.equipe}">Recusar</button></div></div>`).join('') : ''}
      <h3 class="sub">Sua equipe ${membros.length ? '(' + membros.length + '/4)' : ''}</h3>
      ${membros.length ? membros.map(m => `<div class="linha"><span>${m.jogador === Rede.lider ? '👑 ' : ''}${m.jogador === eu ? '<b>Você</b>' : nome(m.jogador)}
          ${m.jogador !== eu && Rede.remotos.has(m.jogador) ? ' <small class="inline online">neste mapa</small>' : ''}</span>
          ${souLider && m.jogador !== eu ? `<button class="acao fina" type="button" data-expulsar="${m.jogador}">Expulsar</button>` : ''}</div>`).join('')
        + '<button class="acao" id="eSair" type="button">Sair da equipe</button>'
        : '<p class="nota">Você ainda não está em uma equipe. Chame um amigo abaixo para criar a sua.</p>'}
      <h3 class="sub">Chamar amigos</h3>
      ${fora.length ? fora.map(id => `<div class="linha"><span>${nome(id)}${Rede.remotos.has(id) ? ' <small class="inline online">neste mapa</small>' : ''}</span>
        <button class="acao fina" type="button" data-chamar="${n[id] ? n[id].num : ''}" ${cheia ? 'disabled' : ''}>${cheia ? 'Equipe cheia' : 'Chamar'}</button></div>`).join('')
        : '<p class="nota">Só amigos podem entrar na equipe. Adicione amigos em ⋮ › Amigos.</p>'}`, el => {
      const depois = async r => { if (r !== undefined) { await Rede.carregarEquipe(); telaEquipe(); } };
      el.querySelectorAll('[data-chamar]').forEach(b => b.addEventListener('click', async () => depois(await tentar(() => Rede.rpc('convidar_equipe', { p_num: Number(b.dataset.chamar) }), r => r))));
      el.querySelectorAll('[data-expulsar]').forEach(b => b.addEventListener('click', async () => depois(await tentar(() => Rede.rpc('expulsar_equipe', { p_jogador: b.dataset.expulsar }), r => r))));
      el.querySelectorAll('[data-aceitar]').forEach(b => b.addEventListener('click', async () => depois(await tentar(() => Rede.rpc('responder_convite_equipe', { p_equipe: Number(b.dataset.aceitar), p_aceitar: true }), r => r))));
      el.querySelectorAll('[data-recusar]').forEach(b => b.addEventListener('click', async () => depois(await tentar(() => Rede.rpc('responder_convite_equipe', { p_equipe: Number(b.dataset.recusar), p_aceitar: false }), r => r))));
      const sair = el.querySelector('#eSair');
      if (sair) sair.addEventListener('click', async () => depois(await tentar(() => Rede.rpc('sair_equipe'), r => r)));
    });
  }

  /* ======================= FORMULÁRIOS REUSADOS ======================= */
  // sugestões de skins já cadastradas (o campo continua aceitando qualquer nome)
  const listaSkins = () => `<datalist id="dlSkins">${Object.keys(CLASSES_NOMES).map(c => ((global.Skins.CATALOGO.classes[c] || {}).skins || [])
    .filter(k => k.id !== 'default').map(k => `<option value="${k.id}">${CLASSES_NOMES[c]} · ${esc(k.nome || k.id)}</option>`).join('')).join('')}
    <option value="default">Dar um herói: escolha a classe do herói e use "default" (o jogador não precisa comprar)</option></datalist>`;
  const selClasse = (id) => `<select id="${id}" class="campo">${Object.keys(CLASSES_NOMES).map(c => `<option value="${c}">${CLASSES_NOMES[c]}</option>`).join('')}</select>`;
  const formBan = `
    <div class="form">
      <input id="fBanNum" class="campo" inputmode="numeric" placeholder="ID do jogador">
      <div class="linha2"><input id="fBanQtd" class="campo" type="number" min="1" value="1">
        <select id="fBanUni" class="campo"><option value="1">dia(s)</option><option value="30">mês(es)</option><option value="365">ano(s)</option><option value="0">para sempre</option></select></div>
      <input id="fBanMotivo" class="campo" maxlength="200" placeholder="Motivo (obrigatório)">
      <div class="botoes"><button class="acao forte" id="fBanir" type="button">Banir</button><button class="acao" id="fDesbanir" type="button">Tirar banimento</button></div>
    </div>`;
  function ligarBan(el, numInicial) {
    if (numInicial) { const i = el.querySelector('#fBanNum'); i.value = numInicial; i.hidden = true; }
    el.querySelector('#fBanir').addEventListener('click', () => {
      const num = Number(el.querySelector('#fBanNum').value), uni = Number(el.querySelector('#fBanUni').value);
      const dias = uni === 0 ? null : Math.max(1, Number(el.querySelector('#fBanQtd').value) || 1) * uni;
      tentar(() => global.Rede.rpc('banir', { p_num: num, p_dias: dias, p_motivo: el.querySelector('#fBanMotivo').value }), r => r);
    });
    el.querySelector('#fDesbanir').addEventListener('click', () => {
      tentar(() => global.Rede.rpc('desbanir', { p_num: Number(el.querySelector('#fBanNum').value) }), r => r);
    });
  }
  const formDoar = max => `
    <div class="form">
      <input id="fDoarNum" class="campo" inputmode="numeric" placeholder="ID do jogador">
      <input id="fDoarQtd" class="campo" type="number" min="1" ${max ? 'max="' + max + '"' : ''} placeholder="Quantidade de ouro${max ? ' (até ' + max + ' por jogador por dia)' : ''}">
      <button class="acao forte" id="fDoar" type="button">Doar ouro</button>
    </div>`;
  function ligarDoar(el, numInicial) {
    if (numInicial) { const i = el.querySelector('#fDoarNum'); i.value = numInicial; i.hidden = true; }
    el.querySelector('#fDoar').addEventListener('click', () =>
      tentar(() => global.Rede.rpc('doar_ouro', { p_num: Number(el.querySelector('#fDoarNum').value), p_quantia: Number(el.querySelector('#fDoarQtd').value) }), r => r));
  }

  /* ======================= MODERADOR (⋮ > Moderação) ======================= */
  function telaModeracao(aba) {
    const Rede = global.Rede, eu = Rede.eu;
    aba = aba || 'banir';
    const abas = { banir: 'Banir', punir: 'Punir', doar: 'Doar ouro', invisivel: eu.invisivel ? 'Ficar visível' : 'Ficar invisível', teleporte: 'Teleporte', imortal: 'Imortal' };
    const corpo = {
      banir: formBan,
      punir: `<div class="form"><p class="nota">Tira de 1 a 5 estrelas da classe e manda o motivo para o jogador.</p>
        <input id="fPunNum" class="campo" inputmode="numeric" placeholder="ID do jogador">
        <div class="linha2">${selClasse('fPunClasse')}<input id="fPunQtd" class="campo" type="number" min="1" max="5" value="1"></div>
        <input id="fPunMotivo" class="campo" maxlength="200" placeholder="Motivo, ex.: Punição por mau comportamento no chat">
        <button class="acao forte" id="fPunir" type="button">Punir</button></div>`,
      doar: formDoar(1000),
      invisivel: `<p class="nota">Invisível, nenhum jogador vê você (só o administrador). Serve para observar: enquanto estiver invisível você não ataca jogadores nem ganha recompensas de batalha.</p>
        <button class="acao forte" id="fInvis" type="button">${eu.invisivel ? 'Ficar visível' : 'Ficar invisível'}</button>`,
      teleporte: `<p class="nota">Vai direto para qualquer mapa, sem aeroporto e sem comprar passe.</p>
        <div class="botoes">${global.MAPAS.ordem.concat(global.MAPAS.eventos || []).map(m => `<button class="acao fina ${J().E.mapa === m ? 'sel' : ''}" type="button" data-teleporte="${m}">${esc(global.MAPAS.lista[m].nome)}</button>`).join('')}</div>`,
      imortal: `<p class="nota">Imortal: nada tira sua vida (mobs, torres, jogadores).</p>
        <button class="acao forte" id="fImortal" type="button">${eu.imortal ? 'Desligar imortal' : 'Ligar imortal'}</button>`
    }[aba];
    modal('Moderação', abasHtml(abas, aba) + corpo, el => {
      ligarAbas(el, telaModeracao);
      if (aba === 'banir') ligarBan(el);
      if (aba === 'doar') ligarDoar(el);
      if (aba === 'punir') el.querySelector('#fPunir').addEventListener('click', () =>
        tentar(() => Rede.rpc('ajustar_estrelas', { p_num: Number(el.querySelector('#fPunNum').value), p_classe: el.querySelector('#fPunClasse').value,
          p_estrelas: -Math.min(5, Math.max(1, Number(el.querySelector('#fPunQtd').value) || 1)), p_xp: 0, p_motivo: el.querySelector('#fPunMotivo').value }), r => r));
      if (aba === 'teleporte') el.querySelectorAll('[data-teleporte]').forEach(b => b.addEventListener('click', async () => {
        J().fecharModal(); const e = await J().teleportar(b.dataset.teleporte); if (e) aviso(e);
      }));
      if (aba === 'imortal') el.querySelector('#fImortal').addEventListener('click', async () => {
        const r = await tentar(() => Rede.rpc('meus_poderes', { p_imortal: !eu.imortal, p_invisivel: null }));
        if (r) { Rede.depoisDeGastarNoServidor(r); aviso(r.imortal ? 'Imortal ligado' : 'Imortal desligado'); telaModeracao('imortal'); }
      });
      if (aba === 'invisivel') el.querySelector('#fInvis').addEventListener('click', async () => {
        const r = await tentar(() => Rede.rpc('meus_poderes', { p_imortal: null, p_invisivel: !eu.invisivel }));
        if (r) { Rede.depoisDeGastarNoServidor(r); aviso(r.invisivel ? 'Você está invisível' : 'Você está visível'); telaModeracao('invisivel'); }
      });
    });
  }
  function abasHtml(abas, atual) {
    return '<div class="abas">' + Object.keys(abas).map(k => `<button type="button" class="aba ${k === atual ? 'sel' : ''}" data-aba="${k}">${abas[k]}</button>`).join('') + '</div>';
  }
  function ligarAbas(el, fn) { el.querySelectorAll('[data-aba]').forEach(b => b.addEventListener('click', () => fn(b.dataset.aba))); }

  /* ======================= ADMINISTRADOR (☰) ======================= */
  let jogadorSel = null;
  function telaAdmin(aba) {
    if (typeof aba !== 'string') aba = 'jogadores';
    const abas = { jogadores: 'Jogadores', banimentos: 'Banimentos', recompensas: 'Recompensas', premios: 'Prêmios dos mobs', balanco: 'Dano e defesa', loja: 'Loja de skins', evento: 'Evento da arena', labirinto: 'Labirinto', precos: 'Preços', cinematicas: 'Cinemáticas', moderadores: 'Moderadores', poderes: 'Meus poderes' };
    const f = { jogadores: admJogadores, banimentos: admBanimentos, recompensas: admRecompensas, premios: admPremios, balanco: admBalanco, loja: admLoja, evento: admEvento, labirinto: admLabirinto, precos: admPrecos, cinematicas: admCinematicas, moderadores: admModeradores, poderes: admPoderes }[aba];
    f(abasHtml(abas, aba), el => ligarAbas(el, telaAdmin));
  }
  const adm = (topo, html, ligar, montarAbas) => modal('Administrador', topo + html, el => { montarAbas(el); if (ligar) ligar(el); });

  // ---- jogadores ----
  async function admJogadores(topo, abas) {
    const Rede = global.Rede;
    let html = `<div class="linha"><input id="aBusca" class="campo" placeholder="ID ou parte do nick"><button class="acao" id="aBuscar" type="button">Buscar</button></div><div id="aResultados"></div>`;
    if (jogadorSel) {
      const p = jogadorSel;
      const cls = (p.dados && p.dados.classes) || {};
      html += `<div class="ficha">
        <h3 class="sub">${esc(p.nick)} · ID ${p.num} · ${p.papel}</h3>
        <p class="nota">Ouro ${p.ouro} · ${Object.keys(CLASSES_NOMES).map(c => CLASSES_NOMES[c] + ' ★' + ((cls[c] || {}).estrelas || 0)).join(' · ')}
        ${global.Rede.banido(p) ? '<br><b class="erro">Banido ' + esc(ateBR(p.banido_ate)) + '</b>' : ''}</p>
        <h4>Doar ouro</h4>${formDoar(0)}
        <h4>Estrelas e experiência</h4>
        <div class="form"><div class="linha2">${selClasse('aEstClasse')}<input id="aEstQtd" class="campo" type="number" placeholder="Estrelas (+ ou -)"></div>
          <input id="aEstXp" class="campo" type="number" placeholder="XP (+ ou -)">
          <input id="aEstMotivo" class="campo" maxlength="200" placeholder="Motivo (obrigatório para retirar)">
          <button class="acao forte" id="aEst" type="button">Aplicar</button></div>
        <h4>Banimento</h4>${p.papel === 'admin' ? '<p class="nota">O administrador não pode ser banido.</p>' : formBan}
        <h4>Dar skin</h4>
        <div class="form"><div class="linha2">${selClasse('aSkClasse')}<input id="aSkId" class="campo" list="dlSkins" placeholder="skin (ex.: lava)">${listaSkins()}</div>
          <p class="nota">Doar não tira a skin de você.</p>
          <select id="aSkDias" class="campo"><option value="0">Permanente</option><option value="1">Teste 1 dia</option><option value="3">Teste 3 dias</option><option value="7">Teste 7 dias</option></select>
          <button class="acao forte" id="aSk" type="button">Dar skin</button></div>
        <h4>Moderador</h4>
        <div class="botoes">${p.papel === 'moderador'
          ? '<button class="acao" id="aMod0" type="button">Retirar moderador</button>'
          : p.papel === 'jogador' ? '<button class="acao forte" id="aMod1" type="button">Nomear moderador</button>' : ''}</div>
        ${p.papel === 'moderador' ? `<div class="form"><p class="nota">Pagamento em ouro</p>
          <div class="linha2"><input id="aSalOuro" class="campo" type="number" min="0" placeholder="Ouro"><input id="aSalDias" class="campo" type="number" min="1" placeholder="A cada X dias"></div>
          <input id="aSalPor" class="campo" type="number" min="0" placeholder="Durante quantos dias (vazio = sem prazo)">
          <button class="acao forte" id="aSal" type="button">Salvar pagamento</button></div>` : ''}
      </div>`;
    }
    adm(topo, html, el => {
      const buscar = async () => {
        const txt = el.querySelector('#aBusca').value.trim(); if (!txt) return;
        const l = await tentar(() => Rede.rpc('buscar_jogador', { p_texto: txt }));
        el.querySelector('#aResultados').innerHTML = (l || []).map(p => `<button type="button" class="linha resultado" data-sel="${p.num}">
          <span>${esc(p.nick)} <small class="inline">#${p.num}</small></span><small class="inline">${p.papel}${Rede.banido(p) ? ' · banido' : ''}</small></button>`).join('') || '<p class="nota">Ninguém encontrado.</p>';
        el.querySelectorAll('[data-sel]').forEach(b => b.addEventListener('click', () => { jogadorSel = l.find(p => String(p.num) === b.dataset.sel); telaAdmin('jogadores'); }));
      };
      el.querySelector('#aBuscar').addEventListener('click', buscar);
      el.querySelector('#aBusca').addEventListener('keydown', e => { if (e.key === 'Enter') buscar(); });
      if (!jogadorSel) return;
      const p = jogadorSel, num = p.num;
      const recarregar = async () => { const l = await Rede.rpc('buscar_jogador', { p_texto: String(num) }).catch(() => null); if (l && l[0]) jogadorSel = l[0]; telaAdmin('jogadores'); };
      ligarDoar(el, num); if (el.querySelector('#fBanir')) ligarBan(el, num);
      el.querySelector('#fDoar').addEventListener('click', () => setTimeout(recarregar, 600));
      el.querySelector('#aEst').addEventListener('click', async () => {
        const r = await tentar(() => Rede.rpc('ajustar_estrelas', { p_num: num, p_classe: el.querySelector('#aEstClasse').value,
          p_estrelas: Number(el.querySelector('#aEstQtd').value) || 0, p_xp: Number(el.querySelector('#aEstXp').value) || 0,
          p_motivo: el.querySelector('#aEstMotivo').value }), r => r);
        if (r) recarregar();
      });
      el.querySelector('#aSk').addEventListener('click', () => {
        const id = el.querySelector('#aSkId').value.trim().toLowerCase();
        if (!/^[a-z0-9_]{2,24}$/.test(id)) return aviso('Nome da skin: letras minúsculas, números ou _');
        tentar(() => Rede.rpc('dar_skin', { p_num: num, p_classe: el.querySelector('#aSkClasse').value, p_skin: id, p_dias: Number(el.querySelector('#aSkDias').value) }), r => r);
      });
      const m0 = el.querySelector('#aMod0'), m1 = el.querySelector('#aMod1');
      if (m0) m0.addEventListener('click', async () => { if (await tentar(() => Rede.rpc('definir_moderador', { p_num: num, p_sim: false }), r => r)) recarregar(); });
      if (m1) m1.addEventListener('click', async () => { if (await tentar(() => Rede.rpc('definir_moderador', { p_num: num, p_sim: true }), r => r)) recarregar(); });
      const sal = el.querySelector('#aSal');
      if (sal) sal.addEventListener('click', () => tentar(() => Rede.rpc('definir_salario', { p_num: num,
        p_ouro: Number(el.querySelector('#aSalOuro').value) || 0, p_dias: Number(el.querySelector('#aSalDias').value) || 1,
        p_por_dias: Number(el.querySelector('#aSalPor').value) || 0 }), r => r));
    }, abas);
  }

  // ---- relatório de banimentos ----
  async function admBanimentos(topo, abas) {
    const l = await tentar(() => global.Rede.rpc('relatorio_banimentos')) || [];
    const html = l.map(b => `<div class="linha bloco"><div><b>${esc(b.alvo_nick)}</b> <small class="inline">#${b.alvo_num}</small>
      <small>Banido por ${esc(b.por_nick)} (${b.por_papel}) em ${dataBR(b.criado_em)} · ${esc(ateBR(b.ate))}</small>
      <small>Motivo: ${esc(b.motivo)}</small>
      ${b.removido_em ? '<small>Banimento retirado por ' + esc(b.removido_por_nick || '?') + ' em ' + dataBR(b.removido_em) + '</small>' : ''}</div>
      ${!b.removido_em && new Date(b.ate) > new Date() ? `<button class="acao fina" type="button" data-desbanir="${b.alvo_num}">Tirar banimento</button>` : ''}</div>`).join('');
    adm(topo, html || '<p class="nota">Nenhum banimento ainda.</p>', el => {
      el.querySelectorAll('[data-desbanir]').forEach(b => b.addEventListener('click', async () => {
        if (await tentar(() => global.Rede.rpc('desbanir', { p_num: Number(b.dataset.desbanir) }), r => r)) telaAdmin('banimentos');
      }));
    }, abas);
  }

  // ---- recompensas por mob em cada mapa e PvP ----
  let mapaRec = 'mapa1';
  async function admRecompensas(topo, abas) {
    const aj = await global.Rede.carregarAjustes();
    const MAPAS = global.MAPAS, CFG = global.Jogo.CONFIG;
    const d = MAPAS.lista[mapaRec], escala = CFG.escalaMapa[mapaRec] || 1;
    const especies = Array.from(new Set((d.mobs || []).map(m => m.tipo).concat(d.serpente ? ['serpente'] : [])));
    const tipos = especies.map(t => ({ id: t, cfg: CFG.mobs[t] })).filter(t => t.cfg)
      .concat((d.minions && d.minions.length) || d.arenas ? ['frente', 'balistico', 'carregador'].map(t => ({ id: t, cfg: CFG.minions[t], minion: true })) : []);
    const atual = (aj.mobs || {})[mapaRec] || {};
    const pvp = aj.pvp || {};
    const nomeMob = t => (global.Skins.CATALOGO.mobs[t] || {}).nome || ({ frente: 'Minion de frente', balistico: 'Minion balístico', carregador: 'Minion carregador', serpente: 'Serpente' }[t] || t);
    const html = `
      <div class="linha"><span>Mapa</span><select id="rMapa" class="campo curto">${MAPAS.ordem.map(m => `<option value="${m}" ${m === mapaRec ? 'selected' : ''}>${esc(MAPAS.lista[m].nome)}</option>`).join('')}</select></div>
      <p class="nota">Vazio = valor padrão (aparece apagado).</p>
      <div class="tabela"><div class="cab"><span>Mob</span><span>XP</span><span>Ouro</span></div>
      ${tipos.map(t => `<div class="lin"><span>${esc(nomeMob(t.id))}</span>
        <input class="campo" type="number" min="0" data-mob="${t.id}" data-k="xp" placeholder="${Math.round(t.cfg.xp * escala)}" value="${atual[t.id] && atual[t.id].xp !== undefined ? atual[t.id].xp : ''}">
        <input class="campo" type="number" min="0" data-mob="${t.id}" data-k="ouro" placeholder="${Math.round(t.cfg.ouro * escala)}" value="${atual[t.id] && atual[t.id].ouro !== undefined ? atual[t.id].ouro : ''}"></div>`).join('')}</div>
      <button class="acao forte" id="rSalvarMobs" type="button">Salvar recompensas deste mapa</button>
      <h3 class="sub">Batalha entre jogadores</h3>
      <div class="linha"><span>Diferença de estrelas para contar como "muito experiente"</span><input id="pDif" class="campo curto" type="number" min="1" value="${pvp.diferenca || 50}"></div>
      <div class="tabela"><div class="cab"><span>Quem derruba quem</span><span>XP</span><span>Ouro</span></div>
      ${[['normal', 'Níveis parecidos'], ['experiente_mata_novato', 'Experiente derruba novato'], ['novato_mata_experiente', 'Novato derruba experiente']].map(([k, n]) =>
        `<div class="lin"><span>${n}</span><input class="campo" type="number" min="0" data-pvp="${k}" data-k="xp" value="${(pvp[k] || {}).xp || 0}">
         <input class="campo" type="number" min="0" data-pvp="${k}" data-k="ouro" value="${(pvp[k] || {}).ouro || 0}"></div>`).join('')}</div>
      <button class="acao forte" id="rSalvarPvp" type="button">Salvar batalha entre jogadores</button>`;
    adm(topo, html, el => {
      el.querySelector('#rMapa').addEventListener('change', e => { mapaRec = e.target.value; telaAdmin('recompensas'); });
      el.querySelector('#rSalvarMobs').addEventListener('click', async () => {
        const mobs = Object.assign({}, aj.mobs || {}), m = {};
        el.querySelectorAll('[data-mob]').forEach(i => { if (i.value !== '') { m[i.dataset.mob] = m[i.dataset.mob] || {}; m[i.dataset.mob][i.dataset.k] = Number(i.value); } });
        mobs[mapaRec] = m;
        if (await tentar(() => global.Rede.rpc('salvar_config', { p_chave: 'mobs', p_valor: mobs }), 'Recompensas salvas') !== undefined) global.Rede.carregarAjustes();
      });
      el.querySelector('#rSalvarPvp').addEventListener('click', () => {
        const v = { diferenca: Number(el.querySelector('#pDif').value) || 50 };
        el.querySelectorAll('[data-pvp]').forEach(i => { v[i.dataset.pvp] = v[i.dataset.pvp] || {}; v[i.dataset.pvp][i.dataset.k] = Number(i.value) || 0; });
        tentar(() => global.Rede.rpc('salvar_config', { p_chave: 'pvp', p_valor: v }), 'Batalha entre jogadores salva');
      });
    }, abas);
  }

  // ---- prêmios ao derrubar mobs (skins, itens, ouro) ----
  async function admPremios(topo, abas) {
    const aj = await global.Rede.carregarAjustes();
    const drops = Array.isArray(aj.drops) ? aj.drops : [];
    const MAPAS = global.MAPAS, CFG = global.Jogo.CONFIG;
    const descr = d => (d.tipo === 'skin' ? 'Skin ' + d.skin + ' (' + CLASSES_NOMES[d.classe] + ') · ' + (d.dias > 0 ? 'teste ' + d.dias + ' dia(s)' : 'permanente')
      : d.tipo === 'item' ? (d.qtd || 1) + '× ' + ((CFG.loja[d.item] || {}).nome || d.item) : d.qtd + ' de ouro');
    const html = `
      <p class="nota">Cada vez que alguém derruba o mob escolhido, o prêmio sai com a chance indicada.</p>
      ${drops.map((d, i) => `<div class="linha"><div><b>${esc(descr(d))}</b><small>${d.mapa === '*' ? 'Todos os mapas' : esc(MAPAS.lista[d.mapa].nome)} · ${d.mob === '*' ? 'qualquer mob' : esc(d.mob)} · ${d.chance}%</small></div>
        <button class="acao fina" type="button" data-tirar="${i}">Tirar</button></div>`).join('') || '<p class="nota">Nenhum prêmio configurado.</p>'}
      <h3 class="sub">Novo prêmio</h3>
      <div class="form">
        <div class="linha2"><select id="dMapa" class="campo"><option value="*">Todos os mapas</option>${MAPAS.ordem.map(m => `<option value="${m}">${esc(MAPAS.lista[m].nome)}</option>`).join('')}</select>
        <select id="dMob" class="campo"><option value="*">Qualquer mob</option>${Object.keys(CFG.mobs).map(m => `<option value="${m}">${esc((global.Skins.CATALOGO.mobs[m] || {}).nome || m)}</option>`).join('')}</select></div>
        <select id="dTipo" class="campo"><option value="skin">Skin</option><option value="item">Item</option><option value="ouro">Ouro</option></select>
        <div class="linha2" data-para="skin">${selClasse('dClasse')}<input id="dSkin" class="campo" placeholder="nome do arquivo da skin"></div>
        <select id="dDias" class="campo" data-para="skin"><option value="0">Permanente</option><option value="1">Teste 1 dia</option><option value="3">Teste 3 dias</option><option value="7">Teste 7 dias</option></select>
        <select id="dItem" class="campo" data-para="item" hidden>${Object.keys(CFG.loja).map(k => `<option value="${k}">${esc(CFG.loja[k].nome)}</option>`).join('')}</select>
        <input id="dQtd" class="campo" type="number" min="1" value="1" placeholder="Quantidade" data-para="item ouro" hidden>
        <div class="linha"><span>Chance (%)</span><input id="dChance" class="campo curto" type="number" min="0.01" max="100" step="0.01" value="1"></div>
        <button class="acao forte" id="dAdd" type="button">Adicionar prêmio</button>
      </div>`;
    adm(topo, html, el => {
      const salvar = async lista => { if (await tentar(() => global.Rede.rpc('salvar_config', { p_chave: 'drops', p_valor: lista }), 'Prêmios salvos') !== undefined) telaAdmin('premios'); };
      const tipo = el.querySelector('#dTipo');
      const mostrar = () => el.querySelectorAll('[data-para]').forEach(c => { c.hidden = c.dataset.para.split(' ').indexOf(tipo.value) < 0; });
      tipo.addEventListener('change', mostrar); mostrar();
      el.querySelectorAll('[data-tirar]').forEach(b => b.addEventListener('click', () => salvar(drops.filter((_, i) => i !== Number(b.dataset.tirar)))));
      el.querySelector('#dAdd').addEventListener('click', () => {
        const d = { mapa: el.querySelector('#dMapa').value, mob: el.querySelector('#dMob').value, tipo: tipo.value, chance: Number(el.querySelector('#dChance').value) || 0 };
        if (d.tipo === 'skin') {
          d.classe = el.querySelector('#dClasse').value; d.skin = el.querySelector('#dSkin').value.trim().toLowerCase(); d.dias = Number(el.querySelector('#dDias').value);
          if (!/^[a-z0-9_]{2,24}$/.test(d.skin)) return aviso('Nome da skin: letras minúsculas, números ou _');
        }
        if (d.tipo === 'item') { d.item = el.querySelector('#dItem').value; d.qtd = Number(el.querySelector('#dQtd').value) || 1; }
        if (d.tipo === 'ouro') d.qtd = Number(el.querySelector('#dQtd').value) || 1;
        salvar(drops.concat([d]));
      });
    }, abas);
  }

  // ---- loja de skins ----
  async function admLoja(topo, abas) {
    const l = await global.Rede.lojaTodas();
    const agora = new Date();
    const local = d => { const x = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return x.toISOString().slice(0, 16); };
    const html = `
      <p class="nota">O nome do arquivo é o fim do modelo: soldado_m_<b>dourado</b>.glb e soldado_f_<b>dourado</b>.glb na pasta assets/chars.</p>
      ${l.map(s => {
        const estado = new Date(s.inicio) > agora ? 'agendada' : new Date(s.fim) < agora ? 'encerrada' : 'na loja';
        return `<div class="linha"><div><b>${esc(s.nome)}</b> <small class="inline">${CLASSES_NOMES[s.classe]} · ${esc(s.skin)}</small>
          <small>${estado} · ${s.preco} ouro · ${dataBR(s.inicio)} até ${dataBR(s.fim)} · vendidas ${s.vendidas}${s.estoque ? '/' + s.estoque : ''}</small></div>
          ${estado !== 'encerrada' ? `<button class="acao fina" type="button" data-tirar="${s.id}">Tirar</button>` : ''}</div>`;
      }).join('') || '<p class="nota">Nenhuma skin cadastrada.</p>'}
      <h3 class="sub">Colocar skin na loja</h3>
      <div class="form">
        <div class="linha2">${selClasse('lClasse')}<input id="lSkin" class="campo" list="dlSkins" placeholder="skin (ex.: lava)">${listaSkins()}</div>
        <input id="lNome" class="campo" placeholder="Nome que aparece na loja">
        <input id="lPreco" class="campo" type="number" min="0" placeholder="Preço em ouro">
        <label class="rotulo">Entra na loja em<input id="lIni" class="campo" type="datetime-local" value="${local(agora)}"></label>
        <label class="rotulo">Sai da loja em<input id="lFim" class="campo" type="datetime-local" value="${local(new Date(agora.getTime() + 7 * 864e5))}"></label>
        <input id="lEst" class="campo" type="number" min="0" placeholder="Unidades à venda (vazio = sem limite de unidades)">
        <button class="acao forte" id="lAdd" type="button">Colocar na loja</button>
      </div>`;
    adm(topo, html, el => {
      el.querySelectorAll('[data-tirar]').forEach(b => b.addEventListener('click', async () => {
        if (await tentar(() => global.Rede.rpc('loja_tirar_skin', { p_item: Number(b.dataset.tirar) }), 'Skin retirada da loja') !== undefined) telaAdmin('loja');
      }));
      el.querySelector('#lAdd').addEventListener('click', async () => {
        const skin = el.querySelector('#lSkin').value.trim().toLowerCase();
        if (!/^[a-z0-9_]{2,24}$/.test(skin)) return aviso('Nome do arquivo: letras minúsculas, números ou _');
        const r = await tentar(() => global.Rede.rpc('loja_por_skin', {
          p_classe: el.querySelector('#lClasse').value, p_skin: skin, p_nome: el.querySelector('#lNome').value.trim() || skin,
          p_preco: Number(el.querySelector('#lPreco').value) || 0,
          p_inicio: new Date(el.querySelector('#lIni').value).toISOString(), p_fim: new Date(el.querySelector('#lFim').value).toISOString(),
          p_estoque: Number(el.querySelector('#lEst').value) || 0 }), 'Skin colocada na loja');
        if (r !== undefined) telaAdmin('loja');
      });
    }, abas);
  }

  // ---- evento da arena: prêmios por vitórias seguidas, no período que o admin escolher ----
  async function admEvento(topo, abas) {
    const aj = await global.Rede.carregarAjustes();
    const ev = aj.arena_evento && aj.arena_evento.id ? aj.arena_evento : null;
    const agora = new Date();
    const local = d => { const x = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return x.toISOString().slice(0, 16); };
    const metas = (ev && ev.metas) || [];
    const estado = !ev ? 'nenhum evento' : !ev.ativo ? 'desligado' : new Date(ev.inicio) > agora ? 'agendado' : new Date(ev.fim) < agora ? 'encerrado' : 'acontecendo agora';
    const linhaMeta = (m, i) => `<div class="form meta" data-meta="${i}">
        <div class="linha2"><input class="campo" type="number" min="1" data-k="vitorias" placeholder="Vitórias seguidas" value="${m.vitorias || ''}">
          <input class="campo" type="number" min="0" data-k="ouro" placeholder="Ouro" value="${m.ouro || ''}"></div>
        <div class="linha2"><input class="campo" type="number" min="0" data-k="xp" placeholder="XP" value="${m.xp || ''}">
          <select class="campo" data-k="classe">${Object.keys(CLASSES_NOMES).map(c => `<option value="${c}" ${m.skin && m.skin.classe === c ? 'selected' : ''}>${CLASSES_NOMES[c]}</option>`).join('')}</select></div>
        <div class="linha2"><input class="campo" list="dlSkins" data-k="skin" placeholder="Skin (vazio = sem skin)" value="${esc((m.skin && m.skin.id) || '')}">
          <select class="campo" data-k="dias"><option value="0">Permanente</option>${[1, 3, 7].map(d => `<option value="${d}" ${m.skin && +m.skin.dias === d ? 'selected' : ''}>Teste ${d} dia(s)</option>`).join('')}</select></div>
        <button class="acao fina" type="button" data-tirarmeta="${i}">Tirar esta meta</button></div>`;
    const html = `
      <p class="nota">Durante o período do evento, quem ganhar a quantidade de partidas seguidas na arena recebe o prêmio (uma vez por meta). Perder zera a sequência.</p>
      <p class="nota">Situação: <b>${estado}</b></p>
      <div class="form">
        <input id="eNome" class="campo" maxlength="40" placeholder="Nome do evento (ex.: Noite das Bruxas)" value="${esc((ev && ev.nome) || '')}">
        <label class="rotulo">Começa em<input id="eIni" class="campo" type="datetime-local" value="${local(ev ? new Date(ev.inicio) : agora)}"></label>
        <label class="rotulo">Termina em<input id="eFim" class="campo" type="datetime-local" value="${local(ev ? new Date(ev.fim) : new Date(agora.getTime() + 864e5))}"></label>
        <label class="rotulo"><input id="eAtivo" type="checkbox" ${!ev || ev.ativo ? 'checked' : ''}> Evento ligado</label>
      </div>
      <h3 class="sub">Metas e prêmios</h3>
      ${listaSkins()}
      <div id="eMetas">${(metas.length ? metas : [{ vitorias: 10 }]).map(linhaMeta).join('')}</div>
      <div class="botoes"><button class="acao" id="eMais" type="button">+ Meta</button>
        <button class="acao forte" id="eSalvar" type="button">Salvar evento</button></div>
      <p class="nota">Salvar um evento novo (outro nome ou outras datas) zera as sequências e os prêmios já pegos.</p>`;
    adm(topo, html, el => {
      const ler = () => Array.from(el.querySelectorAll('.meta')).map(d => {
        const v = k => d.querySelector(`[data-k="${k}"]`).value.trim();
        const m = { vitorias: Number(v('vitorias')) || 0, ouro: Number(v('ouro')) || 0, xp: Number(v('xp')) || 0 };
        if (v('skin')) m.skin = { classe: v('classe'), id: v('skin').toLowerCase(), dias: Number(v('dias')) || 0 };
        return m;
      });
      el.querySelector('#eMais').addEventListener('click', () => {
        const box = el.querySelector('#eMetas'), n = box.querySelectorAll('.meta').length;
        box.insertAdjacentHTML('beforeend', linhaMeta({}, n));
      });
      el.querySelector('#eMetas').addEventListener('click', e => { const b = e.target.closest('[data-tirarmeta]'); if (b) b.parentElement.remove(); });
      el.querySelector('#eSalvar').addEventListener('click', async () => {
        const metas = ler().filter(m => m.vitorias > 0);
        if (!metas.length) return aviso('Coloque pelo menos uma meta com o número de vitórias');
        if (metas.some(m => !m.ouro && !m.xp && !m.skin)) return aviso('Toda meta precisa de um prêmio (ouro, XP ou skin)');
        if (metas.some(m => m.skin && !/^[a-z0-9_]{2,24}$/.test(m.skin.id))) return aviso('Nome da skin: letras minúsculas, números ou _');
        const ini = new Date(el.querySelector('#eIni').value), fim = new Date(el.querySelector('#eFim').value);
        if (!(fim > ini)) return aviso('O fim precisa ser depois do começo');
        const nome = el.querySelector('#eNome').value.trim() || 'Evento da arena';
        const valor = { id: nome + '|' + ini.toISOString() + '|' + fim.toISOString(), nome, ativo: el.querySelector('#eAtivo').checked,
          inicio: ini.toISOString(), fim: fim.toISOString(), metas };
        if (await tentar(() => global.Rede.rpc('salvar_config', { p_chave: 'arena_evento', p_valor: valor }), 'Evento salvo') !== undefined) telaAdmin('evento');
      });
    }, abas);
  }

  // ---- preços dos serviços da loja ----
  async function admPrecos(topo, abas) {
    await global.Rede.carregarAjustes();
    const pr = precos();
    const html = `<p class="nota">Valores em ouro cobrados na Loja (⋮ › Loja).</p>
      <div class="form">
        <label class="rotulo">Criar um clã<input id="pCla" class="campo" type="number" min="0" value="${pr.cla}"></label>
        <label class="rotulo">Trocar de nick<input id="pNick" class="campo" type="number" min="0" value="${pr.nick}"></label>
        <button class="acao forte" id="pSalvar" type="button">Salvar preços</button></div>`;
    adm(topo, html, el => {
      el.querySelector('#pSalvar').addEventListener('click', async () => {
        const valor = { cla: Math.max(0, Number(el.querySelector('#pCla').value) || 0), nick: Math.max(0, Number(el.querySelector('#pNick').value) || 0) };
        if (await tentar(() => global.Rede.rpc('salvar_config', { p_chave: 'precos', p_valor: valor }), 'Preços salvos') !== undefined) { global.Jogo.ajustes.precos = valor; telaAdmin('precos'); }
      });
    }, abas);
  }

  // ---- labirinto: mapa de evento (abre pelas cavernas dos minions) ----
  async function admLabirinto(topo, abas) {
    const aj = await global.Rede.carregarAjustes();
    const c = aj.labirinto && typeof aj.labirinto === 'object' ? aj.labirinto : {};
    const agora = new Date(), pr = c.premio || {}, sk = pr.skin || {};
    const local = d => { const x = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return x.toISOString().slice(0, 16); };
    const ativoAgora = J().labAtivo && J().labAtivo();
    const html = `
      <p class="nota">Com o evento ligado, as cavernas dos minions de todos os mapas viram a entrada do labirinto. Quem morre lá dentro perde 3 estrelas e sai do mapa; quem pega o baú ganha o prêmio e sai também.</p>
      <p class="nota">Situação: <b>${ativoAgora ? 'aberto agora' : c.ativo ? 'ligado, fora do horário' : 'desligado'}</b>${ativoAgora && J().labRelogio ? ' · ' + (J().labRelogio().fase === 'mudando' ? 'mudando as paredes' : 'portas abertas') : ''}</p>
      <div class="form">
        <label class="rotulo"><input id="lAtivo" type="checkbox" ${c.ativo ? 'checked' : ''}> Evento do labirinto ligado</label>
        <label class="rotulo">Começa em<input id="lIni" class="campo" type="datetime-local" value="${local(c.inicio ? new Date(c.inicio) : agora)}"></label>
        <label class="rotulo">Termina em<input id="lFim" class="campo" type="datetime-local" value="${local(c.fim ? new Date(c.fim) : new Date(agora.getTime() + 3 * 864e5))}"></label>
        <label class="rotulo">Paredes mudam a cada (minutos)<input id="lInt" class="campo" type="number" min="2" max="240" value="${c.intervalo || 30}"></label>
        <div class="linha2"><label class="rotulo">Tentativas por jogador<input id="lTent" class="campo" type="number" min="1" max="20" value="${c.tentativas || 3}"></label>
          <label class="rotulo">Entradas extras para quem já ganhou<input id="lTentG" class="campo" type="number" min="0" max="20" value="${c.tentativasGanhador || 0}"></label></div>
      </div>
      <h3 class="sub">Prêmio do baú</h3>
      ${listaSkins()}
      <div class="form">
        <div class="linha2"><input id="lOuro" class="campo" type="number" min="0" placeholder="Ouro" value="${pr.ouro || ''}">
          <input id="lXp" class="campo" type="number" min="0" placeholder="XP" value="${pr.xp || ''}"></div>
        <div class="linha2"><input id="lEstrelas" class="campo" type="number" min="0" max="50" placeholder="Estrelas" value="${pr.estrelas || ''}">
          <select id="lClasse" class="campo">${Object.keys(CLASSES_NOMES).map(k => `<option value="${k}" ${sk.classe === k ? 'selected' : ''}>${CLASSES_NOMES[k]}</option>`).join('')}</select></div>
        <div class="linha2"><input id="lSkin" class="campo" list="dlSkins" placeholder="Skin (vazio = sem skin)" value="${esc(sk.id || '')}">
          <select id="lDias" class="campo"><option value="0">Permanente</option>${[1, 3, 7].map(d => `<option value="${d}" ${+sk.dias === d ? 'selected' : ''}>Teste ${d} dia(s)</option>`).join('')}</select></div>
      </div>
      <div class="botoes"><button class="acao forte" id="lSalvar" type="button">Salvar labirinto</button></div>
      <p class="nota">Mudar as datas começa um evento novo: as tentativas de todos voltam a contar do zero.</p>`;
    adm(topo, html, el => {
      el.querySelector('#lSalvar').addEventListener('click', async () => {
        const v = id => el.querySelector(id).value.trim();
        const ini = new Date(v('#lIni')), fim = new Date(v('#lFim'));
        if (!(fim > ini)) return aviso('O fim precisa ser depois do começo');
        const premio = { ouro: Number(v('#lOuro')) || 0, xp: Number(v('#lXp')) || 0, estrelas: Math.min(50, Number(v('#lEstrelas')) || 0) };
        if (v('#lSkin')) {
          const id = v('#lSkin').toLowerCase();
          if (!/^[a-z0-9_]{2,24}$/.test(id)) return aviso('Nome da skin: letras minúsculas, números ou _');
          premio.skin = { classe: v('#lClasse'), id, dias: Number(v('#lDias')) || 0 };
        }
        if (!premio.ouro && !premio.xp && !premio.estrelas && !premio.skin) return aviso('Coloque um prêmio (ouro, XP, estrelas ou skin)');
        const valor = { id: ini.toISOString() + '|' + fim.toISOString(), ativo: el.querySelector('#lAtivo').checked, inicio: ini.toISOString(), fim: fim.toISOString(),
          intervalo: Math.max(2, Math.min(240, Number(v('#lInt')) || 30)), tentativas: Math.max(1, Number(v('#lTent')) || 3),
          tentativasGanhador: Math.max(0, Number(v('#lTentG')) || 0), premio };
        if (await tentar(() => global.Rede.rpc('salvar_config', { p_chave: 'labirinto', p_valor: valor }), 'Labirinto salvo') !== undefined) { global.Jogo.ajustes.labirinto = valor; telaAdmin('labirinto'); }
      });
    }, abas);
  }

  // ---- dano e defesa: geral (vale em todo lugar) ou só num mapa (vale por cima do geral) ----
  let escopoBalanco = 'geral';
  async function admBalanco(topo, abas) {
    const aj = await global.Rede.carregarAjustes();
    const b = aj.balanco && typeof aj.balanco === 'object' ? aj.balanco : {};
    const MAPAS = global.MAPAS, CFG = global.Jogo.CONFIG;
    const atual = escopoBalanco === 'geral' ? (b.geral || {}) : ((b.mapas || {})[escopoBalanco] || {});
    const grupos = [
      ['Heróis', Object.keys(CLASSES_NOMES).map(k => [k, CLASSES_NOMES[k]])],
      ['Mobs', Object.keys(CFG.mobs).map(k => [k, k[0].toUpperCase() + k.slice(1)])],
      ['Minions', Object.keys(CFG.minions).filter(k => typeof CFG.minions[k] === 'object').map(k => [k, k[0].toUpperCase() + k.slice(1)])],
      ['Arena', [['torre', 'Torres']]]
    ];
    const ph = escopoBalanco === 'geral' ? ['100', '0'] : ['geral', 'geral'];
    const html = `
      <p class="nota"><b>Dano</b> em %: 100 é o normal, 150 bate 50% mais forte, 50 bate a metade. <b>Defesa</b> em %: quanto do dano recebido é ignorado (0 a 90). Vazio = sem mudança.</p>
      <p class="nota">Em <b>Geral</b> vale para todos os mapas (o melhor lugar para os heróis). Escolhendo um mapa, o valor dele vale só ali, por cima do geral.</p>
      <div class="linha"><span>Onde vale</span><select id="bEscopo" class="campo curto"><option value="geral">Geral (todos os mapas)</option>${MAPAS.ordem.map(m => `<option value="${m}" ${escopoBalanco === m ? 'selected' : ''}>${esc(MAPAS.lista[m].nome)}</option>`).join('')}</select></div>
      ${grupos.map(([titulo, itens]) => `<h3 class="sub">${titulo}</h3>` + itens.map(([k, nome]) => `<div class="linha"><span>${esc(nome)}</span><div class="botoes">
        <label class="rotulo inline">Dano %<input class="campo curto" style="width:76px" type="number" min="0" max="1000" data-bal="${k}" data-k="dano" placeholder="${ph[0]}" value="${atual[k] && atual[k].dano !== undefined ? atual[k].dano : ''}"></label>
        <label class="rotulo inline">Defesa %<input class="campo curto" style="width:76px" type="number" min="0" max="90" data-bal="${k}" data-k="defesa" placeholder="${ph[1]}" value="${atual[k] && atual[k].defesa !== undefined ? atual[k].defesa : ''}"></label></div></div>`).join('')).join('')}
      <div class="botoes"><button class="acao" id="bLimpar" type="button">Limpar ${escopoBalanco === 'geral' ? 'o geral' : 'este mapa'}</button><button class="acao forte" id="bSalvar" type="button">Salvar</button></div>`;
    adm(topo, html, el => {
      el.querySelector('#bEscopo').value = escopoBalanco;
      el.querySelector('#bEscopo').addEventListener('change', e => { escopoBalanco = e.target.value; telaAdmin('balanco'); });
      const salvar = async limpar => {
        const novo = { geral: Object.assign({}, b.geral || {}), mapas: Object.assign({}, b.mapas || {}) };
        const tab = {};
        if (!limpar) el.querySelectorAll('[data-bal]').forEach(i => {
          if (i.value === '') return;
          let v = Number(i.value); if (!isFinite(v)) return;
          v = i.dataset.k === 'defesa' ? Math.max(0, Math.min(90, v)) : Math.max(0, Math.min(1000, v));
          (tab[i.dataset.bal] = tab[i.dataset.bal] || {})[i.dataset.k] = v;
        });
        if (escopoBalanco === 'geral') novo.geral = tab; else { if (Object.keys(tab).length) novo.mapas[escopoBalanco] = tab; else delete novo.mapas[escopoBalanco]; }
        if (await tentar(() => global.Rede.rpc('salvar_config', { p_chave: 'balanco', p_valor: novo }), limpar ? 'Valores apagados' : 'Dano e defesa salvos') !== undefined) {
          global.Jogo.ajustes = Object.assign({}, global.Jogo.ajustes, { balanco: novo }); telaAdmin('balanco');
        }
      };
      el.querySelector('#bSalvar').addEventListener('click', () => salvar(false));
      el.querySelector('#bLimpar').addEventListener('click', () => salvar(true));
    }, abas);
  }

  // ---- cinemáticas: até 2 vídeos que passam depois do login, antes da escolha do herói ----
  async function admCinematicas(topo, abas) {
    const aj = await global.Rede.carregarAjustes();
    const lista = (aj.cinematicas && Array.isArray(aj.cinematicas.videos)) ? aj.cinematicas.videos : [];
    const slot = i => {
      const v = lista[i];
      return `<div class="form"><h3 class="sub">Vídeo ${i + 1}</h3>
        ${v ? `<p class="nota"><b>${esc(v.nome || 'vídeo')}</b> · ${v.mb ? v.mb + ' MB' : ''}</p><video src="${esc(v.url)}" controls muted playsinline preload="metadata" style="width:100%;max-height:180px;border-radius:8px;background:#000"></video>` : '<p class="nota">Vazio</p>'}
        <input class="campo" type="file" accept="video/mp4,video/webm,video/quicktime" data-arquivo="${i}">
        <div class="botoes"><button class="acao forte" type="button" data-enviar="${i}">${v ? 'Substituir' : 'Enviar'}</button>${v ? `<button class="acao" type="button" data-remover="${i}">Remover</button>` : ''}</div>
        <p class="nota" data-estado="${i}" hidden></p></div>`;
    };
    const html = `<p class="nota">Os vídeos passam para todos os jogadores sempre que entram no jogo, logo depois do login e antes da escolha do herói. Dá para pular depois de 5 segundos. Use MP4 de até 50 MB (limite do plano grátis do Supabase).</p>${slot(0)}${slot(1)}`;
    adm(topo, html, el => {
      const guardar = async videos => global.Rede.rpc('salvar_config', { p_chave: 'cinematicas', p_valor: { videos: videos.filter(Boolean) } });
      el.querySelectorAll('[data-enviar]').forEach(b => b.addEventListener('click', async () => {
        const i = Number(b.dataset.enviar), arq = el.querySelector(`[data-arquivo="${i}"]`).files[0], est = el.querySelector(`[data-estado="${i}"]`);
        if (!arq) return aviso('Escolha o arquivo do vídeo primeiro');
        if (arq.size > 50 * 1024 * 1024) return aviso('O vídeo passa de 50 MB: diminua a qualidade ou corte um pedaço');
        b.disabled = true; est.hidden = false; est.textContent = 'Enviando ' + (arq.size / 1048576).toFixed(1) + ' MB... não feche esta janela';
        try {
          const novo = await global.Rede.enviarVideo(arq, i);
          const videos = lista.slice(); const velho = videos[i]; videos[i] = novo;
          await guardar(videos);
          if (velho && velho.caminho) global.Rede.apagarVideo(velho.caminho).catch(() => {});
          aviso('Vídeo ' + (i + 1) + ' salvo'); telaAdmin('cinematicas');
        } catch (e) { est.textContent = 'Não deu certo: ' + (e.message || e); b.disabled = false; }
      }));
      el.querySelectorAll('[data-remover]').forEach(b => b.addEventListener('click', async () => {
        const i = Number(b.dataset.remover), videos = lista.slice(), velho = videos[i]; videos[i] = null;
        if (await tentar(() => guardar(videos), 'Vídeo removido') !== undefined) { if (velho && velho.caminho) global.Rede.apagarVideo(velho.caminho).catch(() => {}); telaAdmin('cinematicas'); }
      }));
    }, abas);
  }

  /* ---------- tocar as cinemáticas (depois do login, antes do herói) ---------- */
  async function tocarCinematicas() {
    let aj = null; try { aj = await global.Rede.carregarAjustes(); } catch (e) { return; }
    const videos = (aj && aj.cinematicas && Array.isArray(aj.cinematicas.videos)) ? aj.cinematicas.videos.filter(v => v && v.url) : [];
    for (const v of videos) await tocarUm(v);
  }
  function tocarUm(v) {
    return new Promise(fim => {
      const t = doc.createElement('div'); t.id = 'cinematica';
      t.innerHTML = `<video playsinline preload="auto"></video><button type="button" class="pular" disabled>Pular em 5</button><button type="button" class="som" hidden>🔊 Ligar o som</button>`;
      doc.body.appendChild(t);
      const vid = t.querySelector('video'), pular = t.querySelector('.pular'), som = t.querySelector('.som');
      let acabou = false, falta = 5;
      const sair = () => { if (acabou) return; acabou = true; clearInterval(rel); try { vid.pause(); } catch (e) {} t.remove(); fim(); };
      const rel = setInterval(() => { falta--; if (falta > 0) pular.textContent = 'Pular em ' + falta; else { pular.textContent = 'Pular ›'; pular.disabled = false; } }, 1000);
      pular.addEventListener('click', () => { if (!pular.disabled) sair(); });
      som.addEventListener('click', () => { vid.muted = false; som.hidden = true; vid.play().catch(() => {}); });
      vid.addEventListener('ended', sair); vid.addEventListener('error', sair);
      vid.src = v.url;
      // celular só deixa tocar com som depois de um toque: se não deixar, toca mudo com o botão de som
      vid.play().catch(() => { vid.muted = true; som.hidden = false; vid.play().catch(sair); });
      setTimeout(() => { if (!acabou && vid.readyState === 0) sair(); }, 15000);   // não carregou: segue o jogo
    });
  }

  async function admModeradores(topo, abas) {
    const l = await tentar(() => global.Rede.rpc('listar_moderadores')) || [];
    const html = l.map(m => `<div class="linha"><div><b>${esc(m.nick)}</b> <small class="inline">#${m.num}</small>
      <small>${m.ouro ? m.ouro + ' de ouro a cada ' + m.a_cada_dias + ' dia(s)' + (m.ate ? ' até ' + dataBR(m.ate) : ' sem prazo') : 'sem pagamento'}</small></div>
      <button class="acao fina" type="button" data-ver="${m.num}">Abrir</button></div>`).join('');
    adm(topo, (html || '<p class="nota">Nenhum moderador. Busque o jogador em Jogadores e toque em Nomear moderador.</p>'), el => {
      el.querySelectorAll('[data-ver]').forEach(b => b.addEventListener('click', async () => {
        const r = await tentar(() => global.Rede.rpc('buscar_jogador', { p_texto: b.dataset.ver }));
        if (r && r[0]) { jogadorSel = r[0]; telaAdmin('jogadores'); }
      }));
    }, abas);
  }

  function admPoderes(topo, abas) {
    const eu = global.Rede.eu;
    const html = `
      <div class="linha"><div><b>Imortal</b><small>Nada tira sua vida.</small></div><button class="acao ${eu.imortal ? 'forte' : ''}" id="pImortal" type="button">${eu.imortal ? 'Ligado' : 'Desligado'}</button></div>
      <div class="linha"><div><b>Invisível</b><small>Nenhum jogador vê você. Enquanto invisível você não ataca jogadores.</small></div><button class="acao ${eu.invisivel ? 'forte' : ''}" id="pInvis" type="button">${eu.invisivel ? 'Ligado' : 'Desligado'}</button></div>
      <h3 class="sub">Teleporte</h3><p class="nota">Vai direto para qualquer mapa, sem aeroporto nem passe.</p>
      <div class="botoes">${global.MAPAS.ordem.concat(global.MAPAS.eventos || []).map(m => `<button class="acao fina ${J().E.mapa === m ? 'sel' : ''}" type="button" data-teleporte="${m}">${esc(global.MAPAS.lista[m].nome)}</button>`).join('')}</div>`;
    adm(topo, html, el => {
      const trocar = async (imortal, invisivel) => {
        const r = await tentar(() => global.Rede.rpc('meus_poderes', { p_imortal: imortal, p_invisivel: invisivel }));
        if (r) { global.Rede.depoisDeGastarNoServidor(r); telaAdmin('poderes'); }
      };
      el.querySelector('#pImortal').addEventListener('click', () => trocar(!eu.imortal, null));
      el.querySelector('#pInvis').addEventListener('click', () => trocar(null, !eu.invisivel));
      el.querySelectorAll('[data-teleporte]').forEach(b => b.addEventListener('click', async () => {
        if (global.Rede.eu.papel !== 'admin' && global.Rede.eu.papel !== 'moderador') return aviso('Só administrador e moderador');
        J().fecharModal(); const e = await J().teleportar(b.dataset.teleporte); if (e) aviso(e);
      }));
    }, abas);
  }

  /* ======================= MINIMAPA ======================= */
  // Amigos aparecem a qualquer distância; inimigos só perto de você ou perto de um amigo.
  const VISAO = 24;
  function instalarMinimapa() {
    const topo = $('topo'); if (!topo || $('minimapa')) return;
    const c = doc.createElement('canvas');
    c.id = 'minimapa'; c.className = 'caixa'; c.setAttribute('aria-label', 'Minimapa (toque duas vezes para ampliar)');
    const vaga = doc.createElement('div'); vaga.id = 'miniVaga'; vaga.appendChild(c);
    topo.insertBefore(vaga, $('bMenu').nextSibling);
    let grande = false, ultimoToque = 0;
    const alternar = () => { grande = !grande; c.classList.toggle('grande', grande); };
    c.addEventListener('pointerup', () => { const t = Date.now(); if (t - ultimoToque < 350) { alternar(); ultimoToque = 0; } else ultimoToque = t; });
    c.addEventListener('dblclick', e => e.preventDefault());

    let fundo = null, fundoMapa = null;
    const ICONES_MOB = { golem: '🗿', dragao: '🐉', aranha: '🕷', aranha_robo: '🤖', barao: '🎩', maestro: '🎻', veterano: '🪖', serpente: '🐍' };
    function desenharFundo(def, w, h) {
      const f = doc.createElement('canvas'); f.width = w; f.height = h;
      const g = f.getContext('2d'), [W, H] = def.tam, sx = w / W, sz = h / H;
      const px = x => (x + W / 2) * sx, pz = z => (z + H / 2) * sz;
      g.fillStyle = def.aguaBase ? '#2f6f8f' : '#2f4a2a'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#3d5c34'; (def.ilhas || []).forEach(i => { g.beginPath(); g.arc(px(i.x), pz(i.z), i.r * sx, 0, 7); g.fill(); });
      const linha = (pts, larg, cor) => { if (!pts || pts.length < 2) return; g.strokeStyle = cor; g.lineWidth = Math.max(1.5, larg * sx); g.lineCap = g.lineJoin = 'round'; g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo : g.moveTo).call(g, px(p[0]), pz(p[1]))); g.stroke(); };
      (def.caminhos || []).forEach(c2 => linha(c2.pts, c2.largura, '#a88a5a'));
      (def.rios || []).forEach(r => linha(r.pts, r.largura, '#3f8fbf'));
      g.fillStyle = '#3f8fbf'; (def.lagos || []).forEach(l => { g.beginPath(); g.arc(px(l.x), pz(l.z), l.r * sx, 0, 7); g.fill(); });
      g.fillStyle = '#c9b48a'; (def.pracas || []).forEach(p => { g.beginPath(); g.arc(px(p.x), pz(p.z), (Math.max(p.w, p.h) / 2 + 1) * sx, 0, 7); g.fill(); });
      (def.arenas || []).forEach(a => { g.strokeStyle = '#e3b44c'; g.lineWidth = 1.5; g.strokeRect(px(a.x - a.w / 2), pz(a.z - a.h / 2), a.w * sx, a.h * sz); });
      if (def.aeroporto) { g.fillStyle = '#f3ecd8'; g.font = 'bold ' + Math.max(10, 8 * sx) + 'px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('✈', px(def.aeroporto.x), pz(def.aeroporto.z)); }
      return f;
    }

    function desenhar() {
      setTimeout(desenhar, 150);
      if (!global.Jogo || !global.Jogo.api) return;
      const A = global.Jogo.api, E = A.E, def = E.def, h = E.heroi;
      if (!def || !h) { c.hidden = true; return; }
      c.hidden = false;
      const lado = grande ? 230 : 64, dpr = Math.min(2, global.devicePixelRatio || 1);
      if (c.width !== lado * dpr) { c.width = c.height = lado * dpr; c.style.width = c.style.height = lado + 'px'; }
      if (fundoMapa !== E.mapa) {
        fundo = desenharFundo(def, 512, Math.round(512 * def.tam[1] / def.tam[0])); fundoMapa = E.mapa;
        // foto de verdade do mapa, vista de cima (espera as texturas carregarem; tira de novo depois)
        clearTimeout(desenhar.foto1); clearTimeout(desenhar.foto2);
        const tirar = () => { if (fundoMapa !== E.mapa || !A.fotoMapa) return; const f = A.fotoMapa(640); if (f) fundo = f; };
        desenhar.foto1 = setTimeout(tirar, 2500); desenhar.foto2 = setTimeout(tirar, 9000);
      }
      const g = c.getContext('2d'), [W, H] = def.tam;
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, lado, lado);
      // pequeno: segue você (60 m em volta). Grande: o mapa inteiro.
      const vista = grande ? Math.max(W, H) : 60;
      const cx = grande ? 0 : h.x, cz = grande ? 0 : h.z, k = lado / vista;
      const tx = x => (x - cx) * k + lado / 2, tz = z => (z - cz) * k + lado / 2;
      g.save(); g.beginPath(); g.rect(0, 0, lado, lado); g.clip();
      g.fillStyle = '#121a10'; g.fillRect(0, 0, lado, lado);
      g.drawImage(fundo, tx(-W / 2), tz(-H / 2), W * k, H * k);
      // labirinto: só aparecem as salas que você já viu (o resto fica escuro)
      if (E.lab) {
        const L = E.lab;
        if (desenhar.labVersao !== L.versao && A.fotoMapa) { desenhar.labVersao = L.versao; setTimeout(() => { const f = A.fotoMapa(640); if (f) fundo = f; }, 400); }
        g.fillStyle = 'rgba(8,10,12,0.93)';
        for (let r = 0; r < L.n; r++) for (let c2 = 0; c2 < L.n; c2++) {
          if (L.vistos.has(r + ',' + c2)) continue;
          g.fillRect(tx(L.x0 + c2 * L.T) - 0.5, tz(L.z0 + r * L.T) - 0.5, L.T * k + 1, L.T * k + 1);
        }
        g.fillStyle = '#e3b44c'; g.beginPath(); g.arc(tx(L.bau.x), tz(L.bau.z), grande ? 4 : 3, 0, 7); g.fill();
      }
      const Rede = global.Rede, souAdmin = Rede && Rede.eu && Rede.eu.papel === 'admin';
      const amigos = [];
      if (Rede && Rede.remotos) Rede.remotos.forEach((r, uid) => { if (r.ent && (Rede.amigos.has(uid) || Rede.aliado(uid)) && !r.ent.morto) amigos.push(r.ent); });
      const olhos = [h].concat(amigos);
      const mobs = [];
      const ponto = (x, z, cor, r) => { g.fillStyle = cor; g.beginPath(); g.arc(tx(x), tz(z), r, 0, 7); g.fill(); g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 1; g.stroke(); };
      // inimigos (outros jogadores, mobs e minions vermelhos) só com visão
      E.entidades.forEach(e => {
        if (e.morto || e === h) return;
        const amigo = e.tipo === 'remoto' && (Rede.amigos.has(e.uid) || Rede.aliado(e.uid));
        if (amigo) return;
        if (e.tipo === 'remoto') {
          if ((e.invisivelRede && !souAdmin) || e.naMoita) return;
          if (!olhos.some(o => Math.hypot(o.x - e.x, o.z - e.z) < VISAO)) return;
          ponto(e.x, e.z, '#ef4444', grande ? 3.4 : 3);
        } else if (e.tipo === 'mob' || e.tipo === 'serpente' && e.emerso) {
          // mobs sempre aparecem no mapa, com o ícone de cada um
          mobs.push(e);
        }
      });
      mobs.forEach(e => {
        // aranhas do labirinto só aparecem nas salas já vistas
        if (E.lab && e.labA) { const c = E.lab.cel(e.x, e.z); if (e.obj.visible === false || (c && !E.lab.vistos.has(c[0] + ',' + c[1]))) return; }
        const ic = ICONES_MOB[e.especie || e.tipo] || '★', chefe = e.especie === 'golem' || e.tipo === 'serpente' || e.especie === 'dragao';
        const r = grande ? (chefe ? 8 : 6.5) : (chefe ? 5 : 3.6);
        g.fillStyle = chefe ? 'rgba(127,29,29,0.85)' : 'rgba(120,53,15,0.8)';
        g.beginPath(); g.arc(tx(e.x), tz(e.z), r, 0, 7); g.fill();
        g.strokeStyle = chefe ? '#fca5a5' : '#fbbf24'; g.lineWidth = 1.2; g.stroke();
        if (grande || chefe) { g.font = Math.round(r * 1.35) + 'px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ic, tx(e.x), tz(e.z) + 0.5); }
        // barrinha de vida no mapa grande
        if (grande) { const v = Math.max(0, e.vida / e.vidaMax); g.fillStyle = '#111'; g.fillRect(tx(e.x) - 7, tz(e.z) + r + 1, 14, 2.5); g.fillStyle = '#ef4444'; g.fillRect(tx(e.x) - 7, tz(e.z) + r + 1, 14 * v, 2.5); }
      });
      amigos.forEach(e => ponto(e.x, e.z, '#5aa9ff', grande ? 3.6 : 3.2));
      // você: triângulo na direção que olha
      g.save(); g.translate(tx(h.x), tz(h.z)); g.rotate(-h.rot + Math.PI);
      g.fillStyle = '#e3b44c'; g.beginPath(); g.moveTo(0, -5); g.lineTo(4, 4); g.lineTo(-4, 4); g.closePath(); g.fill();
      g.strokeStyle = '#1a1408'; g.stroke(); g.restore();
      g.restore();
    }
    desenhar();
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', comecar);
  else comecar();
})(window);
