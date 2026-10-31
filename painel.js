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
  const CLASSES_NOMES = { soldado: 'Soldado', suporte: 'Suporte', mago: 'Mago', atirador: 'Atirador' };
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
      Rede.aoConviteEquipe = c => conviteEquipe(c);
      Rede.aoMudarPerfil = r => { atualizarMenus(r); };
      Rede.prepararJogo();                    // perfil do servidor antes de montar o mapa
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
      ['equipe', 'Equipe'], ['skins_loja', 'Loja de skins'], ['skins_minhas', 'Minhas skins'], ['amigos', 'Amigos'],
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

    global.Jogo.ganchos.menu = q => {
      const f = {
        equipe: telaEquipe, skins_loja: telaLojaSkins, skins_minhas: telaMinhasSkins, amigos: telaAmigos, mensagens: telaMensagens,
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
    modal('Loja de skins', `<p class="nota">Seu ouro: <b>${Math.floor(P.ouro)}</b>. Todas as skins são limitadas. Cada skin serve só para a classe dela.</p>
      ${linhas || '<p class="nota">Nenhuma skin na loja agora. Volte depois!</p>'}`, el => {
      el.querySelectorAll('[data-comprar]').forEach(b => b.addEventListener('click', async () => {
        b.disabled = true;
        const r = await tentar(() => Rede.comprarSkin(Number(b.dataset.comprar)), 'Skin comprada! Equipe em Minhas skins');
        if (r) telaLojaSkins(); else b.disabled = false;
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
    if (eq && !Rede.temSkin(P.classe, eq)) { P.skinEquipada[P.classe] = 'default'; J().salvar(); J().criarHeroi(); aviso('Sua skin de teste acabou'); }
  }, 60000);

  /* ---------- amigos ---------- */
  async function telaAmigos() {
    const Rede = global.Rede;
    await Rede.carregarAmigos();
    const ids = Array.from(new Set(Rede.amizades.map(a => (a.de === Rede.eu.id ? a.para : a.de))));
    const n = await Rede.nicks(ids);
    const amigos = Array.from(Rede.amigos), pedidos = Rede.pedidos;
    const enviados = Rede.amizades.filter(a => !a.aceita && a.de === Rede.eu.id).map(a => a.para);
    const nome = id => n[id] ? esc(n[id].nick) + ' <small class="inline">#' + n[id].num + '</small>' : '?';
    modal('Amigos', `
      <p class="nota">Seu ID: <b>${Rede.eu.num}</b>. Amigos aparecem no minimapa e dão visão dos inimigos perto deles. Para não se ferirem, chame-os para a sua Equipe.</p>
      <div class="linha"><input id="iAmigo" class="campo" inputmode="numeric" placeholder="ID do amigo"><button class="acao" id="bAddAmigo" type="button">Adicionar</button></div>
      ${pedidos.length ? '<h3 class="sub">Pedidos para você</h3>' + pedidos.map(id => `<div class="linha"><span>${nome(id)}</span><div class="botoes">
        <button class="acao fina forte" data-aceitar="${id}" type="button">Aceitar</button><button class="acao fina" data-recusar="${id}" type="button">Recusar</button></div></div>`).join('') : ''}
      <h3 class="sub">Amigos</h3>
      ${amigos.map(id => `<div class="linha"><span>${nome(id)} ${Rede.remotos.has(id) ? '<small class="inline online">neste mapa</small>' : ''}</span>
        <button class="acao fina" data-remover="${id}" type="button">Remover</button></div>`).join('') || '<p class="nota">Nenhum ainda.</p>'}
      ${enviados.length ? '<h3 class="sub">Esperando resposta</h3>' + enviados.map(id => `<div class="linha"><span>${nome(id)}</span></div>`).join('') : ''}`, el => {
      el.querySelector('#bAddAmigo').addEventListener('click', async () => {
        const num = Number(el.querySelector('#iAmigo').value);
        if (!num) return aviso('Digite o ID');
        if (await tentar(() => Rede.rpc('pedir_amizade', { p_num: num }), r => r) !== undefined) telaAmigos();
      });
      el.querySelectorAll('[data-aceitar]').forEach(b => b.addEventListener('click', async () => { await tentar(() => Rede.rpc('responder_amizade', { p_de: b.dataset.aceitar, p_aceitar: true }), 'Amizade aceita'); telaAmigos(); }));
      el.querySelectorAll('[data-recusar]').forEach(b => b.addEventListener('click', async () => { await tentar(() => Rede.rpc('responder_amizade', { p_de: b.dataset.recusar, p_aceitar: false })); telaAmigos(); }));
      el.querySelectorAll('[data-remover]').forEach(b => b.addEventListener('click', async () => { await tentar(() => Rede.rpc('desfazer_amizade', { p_outro: b.dataset.remover })); telaAmigos(); }));
    });
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
    .filter(k => k.id !== 'default').map(k => `<option value="${k.id}">${CLASSES_NOMES[c]} · ${esc(k.nome || k.id)}</option>`).join('')).join('')}</datalist>`;
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
    const abas = { banir: 'Banir', punir: 'Punir', doar: 'Doar ouro', invisivel: eu.invisivel ? 'Ficar visível' : 'Ficar invisível' };
    const corpo = {
      banir: formBan,
      punir: `<div class="form"><p class="nota">Tira de 1 a 5 estrelas da classe e manda o motivo para o jogador.</p>
        <input id="fPunNum" class="campo" inputmode="numeric" placeholder="ID do jogador">
        <div class="linha2">${selClasse('fPunClasse')}<input id="fPunQtd" class="campo" type="number" min="1" max="5" value="1"></div>
        <input id="fPunMotivo" class="campo" maxlength="200" placeholder="Motivo, ex.: Punição por mau comportamento no chat">
        <button class="acao forte" id="fPunir" type="button">Punir</button></div>`,
      doar: formDoar(1000),
      invisivel: `<p class="nota">Invisível, nenhum jogador vê você (só o administrador). Serve para observar: enquanto estiver invisível você não ataca jogadores nem ganha recompensas de batalha.</p>
        <button class="acao forte" id="fInvis" type="button">${eu.invisivel ? 'Ficar visível' : 'Ficar invisível'}</button>`
    }[aba];
    modal('Moderação', abasHtml(abas, aba) + corpo, el => {
      ligarAbas(el, telaModeracao);
      if (aba === 'banir') ligarBan(el);
      if (aba === 'doar') ligarDoar(el);
      if (aba === 'punir') el.querySelector('#fPunir').addEventListener('click', () =>
        tentar(() => Rede.rpc('ajustar_estrelas', { p_num: Number(el.querySelector('#fPunNum').value), p_classe: el.querySelector('#fPunClasse').value,
          p_estrelas: -Math.min(5, Math.max(1, Number(el.querySelector('#fPunQtd').value) || 1)), p_xp: 0, p_motivo: el.querySelector('#fPunMotivo').value }), r => r));
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
    const abas = { jogadores: 'Jogadores', banimentos: 'Banimentos', recompensas: 'Recompensas', premios: 'Prêmios dos mobs', loja: 'Loja de skins', evento: 'Evento da arena', moderadores: 'Moderadores', poderes: 'Meus poderes' };
    const f = { jogadores: admJogadores, banimentos: admBanimentos, recompensas: admRecompensas, premios: admPremios, loja: admLoja, evento: admEvento, moderadores: admModeradores, poderes: admPoderes }[aba];
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
        <h4>Banimento</h4>${formBan}
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
      ligarDoar(el, num); ligarBan(el, num);
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
      <div class="linha"><div><b>Invisível</b><small>Nenhum jogador vê você. Enquanto invisível você não ataca jogadores.</small></div><button class="acao ${eu.invisivel ? 'forte' : ''}" id="pInvis" type="button">${eu.invisivel ? 'Ligado' : 'Desligado'}</button></div>`;
    adm(topo, html, el => {
      const trocar = async (imortal, invisivel) => {
        const r = await tentar(() => global.Rede.rpc('meus_poderes', { p_imortal: imortal, p_invisivel: invisivel }));
        if (r) { global.Rede.depoisDeGastarNoServidor(r); telaAdmin('poderes'); }
      };
      el.querySelector('#pImortal').addEventListener('click', () => trocar(!eu.imortal, null));
      el.querySelector('#pInvis').addEventListener('click', () => trocar(null, !eu.invisivel));
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
      const lado = grande ? 150 : 64, dpr = Math.min(2, global.devicePixelRatio || 1);
      if (c.width !== lado * dpr) { c.width = c.height = lado * dpr; c.style.width = c.style.height = lado + 'px'; }
      if (fundoMapa !== E.mapa) { fundo = desenharFundo(def, 512, Math.round(512 * def.tam[1] / def.tam[0])); fundoMapa = E.mapa; }
      const g = c.getContext('2d'), [W, H] = def.tam;
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, lado, lado);
      // pequeno: segue você (60 m em volta). Grande: o mapa inteiro.
      const vista = grande ? Math.max(W, H) : 60;
      const cx = grande ? 0 : h.x, cz = grande ? 0 : h.z, k = lado / vista;
      const tx = x => (x - cx) * k + lado / 2, tz = z => (z - cz) * k + lado / 2;
      g.save(); g.beginPath(); g.rect(0, 0, lado, lado); g.clip();
      g.fillStyle = '#121a10'; g.fillRect(0, 0, lado, lado);
      g.drawImage(fundo, tx(-W / 2), tz(-H / 2), W * k, H * k);
      const Rede = global.Rede, souAdmin = Rede && Rede.eu && Rede.eu.papel === 'admin';
      const amigos = [];
      if (Rede && Rede.remotos) Rede.remotos.forEach((r, uid) => { if (r.ent && (Rede.amigos.has(uid) || Rede.aliado(uid)) && !r.ent.morto) amigos.push(r.ent); });
      const olhos = [h].concat(amigos);
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
          if (olhos.some(o => Math.hypot(o.x - e.x, o.z - e.z) < VISAO)) ponto(e.x, e.z, '#f59e0b', grande ? 2.4 : 2);
        }
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
