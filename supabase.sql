-- ============================================================
-- VILKRON — banco de dados do jogo online (Supabase)
-- Como usar: Supabase > SQL Editor > New query > cole TUDO > Run.
-- Pode rodar de novo depois de atualizações: ele recria as funções
-- sem apagar os jogadores.
-- ============================================================

-- E-mail do administrador do jogo
create or replace function public.email_admin() returns text
language sql immutable as $$ select 'gabrieldejesus617@gmail.com'::text $$;

-- ---------------- TABELAS ----------------
create table if not exists public.perfis (
  id          uuid primary key references auth.users(id) on delete cascade,
  num         bigint generated always as identity unique,        -- ID curto do jogador (ex.: 1024)
  nick        text not null unique check (nick ~ '^[A-Za-z0-9_]{3,16}$'),
  papel       text not null default 'jogador' check (papel in ('jogador', 'moderador', 'admin')),
  ouro        bigint not null default 120 check (ouro >= 0),
  ouro_total  bigint not null default 0,
  dano_total  bigint not null default 0,
  estrelas    int not null default 0,                            -- soma das 4 classes (para o ranking)
  dados       jsonb not null default '{}'::jsonb,                -- classes, inventário, passes, mapa, cor...
  versao      int not null default 1,                            -- muda quando o admin mexe no perfil
  skins       jsonb not null default '{}'::jsonb,                -- {"soldado": {"dourado": null | "data de validade"}}
  banido_ate  timestamptz,
  imortal     boolean not null default false,
  invisivel   boolean not null default false,
  salvo_em    timestamptz not null default now(),
  criado_em   timestamptz not null default now()
);
create index if not exists perfis_nick_lower on public.perfis (lower(nick));

create table if not exists public.config (
  chave text primary key,
  valor jsonb not null
);
insert into public.config (chave, valor) values
  ('mobs', '{}'::jsonb),        -- {"mapa1": {"maestro": {"xp": 40, "ouro": 25}}}
  ('pvp', '{"diferenca": 50,
            "normal": {"xp": 30, "ouro": 20},
            "experiente_mata_novato": {"xp": 5, "ouro": 0},
            "novato_mata_experiente": {"xp": 120, "ouro": 100}}'::jsonb),
  ('drops', '[]'::jsonb)        -- [{"mapa":"mapa1","mob":"barao","tipo":"skin","classe":"soldado","skin":"dourado","dias":3,"chance":2}]
on conflict (chave) do nothing;

create table if not exists public.banimentos (
  id           bigint generated always as identity primary key,
  alvo         uuid not null references public.perfis(id) on delete cascade,
  por          uuid not null references public.perfis(id) on delete cascade,
  motivo       text not null,
  ate          timestamptz not null,                              -- 'infinity' = para sempre
  criado_em    timestamptz not null default now(),
  removido_em  timestamptz,
  removido_por uuid references public.perfis(id) on delete set null
);

create table if not exists public.mensagens (
  id        bigint generated always as identity primary key,
  para      uuid not null references public.perfis(id) on delete cascade,
  de        uuid references public.perfis(id) on delete set null,
  texto     text not null,
  lida      boolean not null default false,
  criado_em timestamptz not null default now()
);

create table if not exists public.loja_skins (
  id        bigint generated always as identity primary key,
  classe    text not null check (classe in ('soldado', 'suporte', 'mago', 'atirador')),
  skin      text not null check (skin ~ '^[a-z0-9_]{2,24}$'),
  nome      text not null,
  preco     int not null check (preco >= 0),
  inicio    timestamptz not null default now(),
  fim       timestamptz not null,
  estoque   int,                                                  -- vazio = sem limite de unidades
  vendidas  int not null default 0
);

create table if not exists public.salarios (
  moderador  uuid primary key references public.perfis(id) on delete cascade,
  ouro       int not null check (ouro > 0),
  a_cada_dias int not null check (a_cada_dias > 0),
  ate        timestamptz,                                         -- vazio = sem prazo
  pago_ate   timestamptz not null default now()
);

create table if not exists public.doacoes_mod (
  moderador uuid not null references public.perfis(id) on delete cascade,
  alvo      uuid not null references public.perfis(id) on delete cascade,
  dia       date not null default current_date,
  total     int not null default 0,
  primary key (moderador, alvo, dia)
);

create table if not exists public.abates (
  assassino uuid not null references public.perfis(id) on delete cascade,
  vitima    uuid not null references public.perfis(id) on delete cascade,
  em        timestamptz not null default now()
);
create index if not exists abates_par on public.abates (assassino, vitima, em desc);

create table if not exists public.amizades (
  de     uuid not null references public.perfis(id) on delete cascade,
  para   uuid not null references public.perfis(id) on delete cascade,
  aceita boolean not null default false,
  primary key (de, para),
  check (de <> para)
);

create table if not exists public.registro (
  id        bigint generated always as identity primary key,
  por       uuid references public.perfis(id) on delete set null,
  alvo      uuid references public.perfis(id) on delete set null,
  acao      text not null,
  detalhe   text,
  criado_em timestamptz not null default now()
);

-- ---------------- SEGURANÇA (RLS) ----------------
-- Ninguém escreve direto nas tabelas: tudo passa pelas funções abaixo,
-- que conferem quem é admin, moderador ou jogador.
alter table public.perfis      enable row level security;
alter table public.config      enable row level security;
alter table public.banimentos  enable row level security;
alter table public.mensagens   enable row level security;
alter table public.loja_skins  enable row level security;
alter table public.salarios    enable row level security;
alter table public.doacoes_mod enable row level security;
alter table public.abates      enable row level security;
alter table public.amizades    enable row level security;
alter table public.registro    enable row level security;

create or replace function public.meu_papel() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select papel from perfis where id = auth.uid()), 'nenhum')
$$;

drop policy if exists perfis_ler on public.perfis;
create policy perfis_ler on public.perfis for select to authenticated using (true);
drop policy if exists config_ler on public.config;
create policy config_ler on public.config for select to authenticated using (true);
drop policy if exists loja_ler on public.loja_skins;
create policy loja_ler on public.loja_skins for select to authenticated using (true);
drop policy if exists msg_ler on public.mensagens;
create policy msg_ler on public.mensagens for select to authenticated using (para = auth.uid());
drop policy if exists ban_ler on public.banimentos;
create policy ban_ler on public.banimentos for select to authenticated
  using (alvo = auth.uid() or public.meu_papel() in ('admin', 'moderador'));
drop policy if exists amz_ler on public.amizades;
create policy amz_ler on public.amizades for select to authenticated using (de = auth.uid() or para = auth.uid());
drop policy if exists sal_ler on public.salarios;
create policy sal_ler on public.salarios for select to authenticated
  using (moderador = auth.uid() or public.meu_papel() = 'admin');
drop policy if exists reg_ler on public.registro;
create policy reg_ler on public.registro for select to authenticated using (public.meu_papel() = 'admin');

-- ---------------- AJUDANTES ----------------
create or replace function public._eu() returns perfis
language plpgsql stable security definer set search_path = public as $$
declare p perfis;
begin
  select * into p from perfis where id = auth.uid();
  if p.id is null then raise exception 'Crie seu nick primeiro'; end if;
  if p.banido_ate is not null and p.banido_ate > now() then raise exception 'Conta banida'; end if;
  return p;
end $$;

create or replace function public._por_num(p_num bigint) returns perfis
language plpgsql stable security definer set search_path = public as $$
declare p perfis;
begin
  select * into p from perfis where num = p_num;
  if p.id is null then raise exception 'Jogador com ID % não existe', p_num; end if;
  return p;
end $$;

create or replace function public._soma_estrelas(d jsonb) returns int
language sql immutable as $$
  select coalesce(sum(coalesce((v ->> 'estrelas')::int, 0)), 0)::int
  from jsonb_each(coalesce(d -> 'classes', '{}'::jsonb)) as t(k, v)
  where jsonb_typeof(v) = 'object'
$$;

create or replace function public._estrelas_classe(d jsonb) returns int
language sql immutable as $$
  select coalesce((d -> 'classes' -> (d ->> 'classe') ->> 'estrelas')::int, 0)
$$;

-- ---------------- JOGADOR ----------------
create or replace function public.criar_perfil(p_nick text) returns perfis
language plpgsql security definer set search_path = public as $$
declare p perfis; meu_email text;
begin
  if auth.uid() is null then raise exception 'Entre com o Google primeiro'; end if;
  select * into p from perfis where id = auth.uid();
  if p.id is not null then return p; end if;
  if p_nick !~ '^[A-Za-z0-9_]{3,16}$' then raise exception 'O nick precisa ter de 3 a 16 letras, números ou _'; end if;
  if exists (select 1 from perfis where lower(nick) = lower(p_nick)) then raise exception 'Esse nick já existe'; end if;
  select email into meu_email from auth.users where id = auth.uid();
  insert into perfis (id, nick, papel)
  values (auth.uid(), p_nick, case when lower(meu_email) = lower(email_admin()) then 'admin' else 'jogador' end)
  returning * into p;
  return p;
end $$;

-- Salva o progresso. O ouro vai como diferença (ganhos - gastos) para não
-- apagar doações; os dados só são gravados se o admin não mexeu no perfil.
create or replace function public.salvar_progresso(p_dados jsonb, p_ouro_delta bigint, p_dano_delta bigint, p_versao int)
returns perfis
language plpgsql security definer set search_path = public as $$
declare p perfis; seg numeric; limite bigint; ganho bigint;
begin
  p := _eu();
  seg := greatest(1, extract(epoch from now() - p.salvo_em));
  limite := 3000 + (seg * 60)::bigint;                         -- teto de ouro ganho por intervalo
  ganho := least(p_ouro_delta, limite);
  update perfis set
    ouro       = greatest(0, ouro + ganho),
    ouro_total = ouro_total + greatest(0, ganho),
    dano_total = dano_total + greatest(0, least(p_dano_delta, 100000 + (seg * 5000)::bigint)),
    dados      = case when p_versao = versao and p_dados is not null then p_dados else dados end,
    estrelas   = case when p_versao = versao and p_dados is not null then _soma_estrelas(p_dados) else estrelas end,
    salvo_em   = now()
  where id = p.id
  returning * into p;
  return p;
end $$;

create or replace function public.comprar_skin(p_item bigint) returns perfis
language plpgsql security definer set search_path = public as $$
declare p perfis; l loja_skins;
begin
  p := _eu();
  select * into l from loja_skins where id = p_item for update;
  if l.id is null or now() < l.inicio or now() > l.fim then raise exception 'Essa skin não está mais na loja'; end if;
  if l.estoque is not null and l.vendidas >= l.estoque then raise exception 'Esgotada'; end if;
  if coalesce((p.skins -> l.classe) ? l.skin and (p.skins -> l.classe ->> l.skin) is null, false) then raise exception 'Você já tem essa skin'; end if;
  if p.ouro < l.preco then raise exception 'Ouro insuficiente'; end if;
  update loja_skins set vendidas = vendidas + 1 where id = l.id;
  update perfis set ouro = ouro - l.preco,
    skins = jsonb_set(skins, array[l.classe], coalesce(skins -> l.classe, '{}'::jsonb) || jsonb_build_object(l.skin, null))
  where id = p.id returning * into p;
  return p;
end $$;

-- Recompensa por derrubar outro jogador (o servidor decide quanto vale)
create or replace function public.recompensa_pvp(p_vitima uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare eu perfis; v perfis; c jsonb; dif int; minhas int; dela int; r jsonb; tipo text;
begin
  eu := _eu();
  -- invisível (admin ou moderador observando) não ganha nada em batalha
  if eu.invisivel then return jsonb_build_object('xp', 0, 'ouro', 0, 'tipo', 'invisivel'); end if;
  select * into v from perfis where id = p_vitima;
  if v.id is null or v.id = eu.id then raise exception 'Abate inválido'; end if;
  if exists (select 1 from abates where assassino = eu.id and vitima = v.id and em > now() - interval '60 seconds') then
    return jsonb_build_object('xp', 0, 'ouro', 0, 'tipo', 'repetido');
  end if;
  insert into abates (assassino, vitima) values (eu.id, v.id);
  select valor into c from config where chave = 'pvp';
  minhas := _estrelas_classe(eu.dados); dela := _estrelas_classe(v.dados);
  dif := coalesce((c ->> 'diferenca')::int, 50);
  tipo := case when minhas - dela >= dif then 'experiente_mata_novato'
               when dela - minhas >= dif then 'novato_mata_experiente'
               else 'normal' end;
  r := coalesce(c -> tipo, '{"xp":0,"ouro":0}'::jsonb);
  update perfis set ouro = ouro + coalesce((r ->> 'ouro')::int, 0), ouro_total = ouro_total + coalesce((r ->> 'ouro')::int, 0)
  where id = eu.id;
  return r || jsonb_build_object('tipo', tipo);
end $$;

-- Sorteio de prêmio ao derrubar um mob (skins, itens, ouro) conforme o admin configurou
create or replace function public.sortear_drop(p_mapa text, p_mob text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare eu perfis; d jsonb; validade timestamptz; ganhos jsonb := '[]'::jsonb;
begin
  eu := _eu();
  for d in select x from config, jsonb_array_elements(valor) as x where chave = 'drops' loop
    if (d ->> 'mapa') not in (p_mapa, '*') or (d ->> 'mob') not in (p_mob, '*') then continue; end if;
    if random() * 100 >= coalesce((d ->> 'chance')::numeric, 0) then continue; end if;
    if d ->> 'tipo' = 'skin' then
      validade := case when coalesce((d ->> 'dias')::int, 0) > 0 then now() + make_interval(days => (d ->> 'dias')::int) end;
      -- não troca uma skin permanente por uma de teste
      if not coalesce((eu.skins -> (d ->> 'classe')) ? (d ->> 'skin') and (eu.skins -> (d ->> 'classe') ->> (d ->> 'skin')) is null, false) then
        update perfis set skins = jsonb_set(skins, array[d ->> 'classe'],
          coalesce(skins -> (d ->> 'classe'), '{}'::jsonb) || jsonb_build_object(d ->> 'skin', validade))
        where id = eu.id returning * into eu;
      end if;
    elsif d ->> 'tipo' = 'ouro' then
      update perfis set ouro = ouro + coalesce((d ->> 'qtd')::int, 0) where id = eu.id returning * into eu;
    end if;
    ganhos := ganhos || jsonb_build_array(d);
  end loop;
  return ganhos;
end $$;

create or replace function public.ler_mensagens() returns setof mensagens
language plpgsql security definer set search_path = public as $$
begin
  return query update mensagens set lida = true where para = auth.uid() and not lida returning *;
end $$;

-- ---------------- AMIGOS ----------------
create or replace function public.pedir_amizade(p_num bigint) returns text
language plpgsql security definer set search_path = public as $$
declare eu perfis; o perfis;
begin
  eu := _eu(); o := _por_num(p_num);
  if o.id = eu.id then raise exception 'Esse é você'; end if;
  if exists (select 1 from amizades where de = o.id and para = eu.id) then
    update amizades set aceita = true where de = o.id and para = eu.id;
    return 'Agora vocês são amigos';
  end if;
  insert into amizades (de, para) values (eu.id, o.id) on conflict do nothing;
  return 'Pedido enviado para ' || o.nick;
end $$;

create or replace function public.responder_amizade(p_de uuid, p_aceitar boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_aceitar then update amizades set aceita = true where de = p_de and para = auth.uid();
  else delete from amizades where de = p_de and para = auth.uid(); end if;
end $$;

create or replace function public.desfazer_amizade(p_outro uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from amizades where (de = auth.uid() and para = p_outro) or (para = auth.uid() and de = p_outro);
end $$;

-- ---------------- MODERADOR E ADMIN ----------------
create or replace function public._exigir(p_papeis text[]) returns perfis
language plpgsql stable security definer set search_path = public as $$
declare eu perfis;
begin
  eu := _eu();
  if not (eu.papel = any (p_papeis)) then raise exception 'Sem permissão'; end if;
  return eu;
end $$;

create or replace function public.buscar_jogador(p_texto text) returns setof perfis
language plpgsql stable security definer set search_path = public as $$
begin
  perform _exigir(array['admin', 'moderador']);
  if p_texto ~ '^[0-9]+$' then return query select * from perfis where num = p_texto::bigint;
  else return query select * from perfis where nick ilike '%' || p_texto || '%' order by nick limit 20; end if;
end $$;

create or replace function public.doar_ouro(p_num bigint, p_quantia int) returns text
language plpgsql security definer set search_path = public as $$
declare eu perfis; o perfis; ja int;
begin
  eu := _exigir(array['admin', 'moderador']); o := _por_num(p_num);
  if p_quantia <= 0 then raise exception 'Quantia inválida'; end if;
  if eu.papel = 'moderador' then
    if o.id = eu.id then raise exception 'Moderador não pode doar para si'; end if;
    select coalesce(total, 0) into ja from doacoes_mod where moderador = eu.id and alvo = o.id and dia = current_date;
    ja := coalesce(ja, 0);
    if ja + p_quantia > 1000 then raise exception 'Limite de 1000 de ouro por jogador por dia (faltam %)', 1000 - ja; end if;
    insert into doacoes_mod (moderador, alvo, total) values (eu.id, o.id, p_quantia)
      on conflict (moderador, alvo, dia) do update set total = doacoes_mod.total + p_quantia;
  end if;
  update perfis set ouro = ouro + p_quantia where id = o.id;
  insert into mensagens (para, de, texto) values (o.id, eu.id, 'Você recebeu ' || p_quantia || ' de ouro de ' || eu.nick || '.');
  insert into registro (por, alvo, acao, detalhe) values (eu.id, o.id, 'doar_ouro', p_quantia::text);
  return p_quantia || ' de ouro para ' || o.nick;
end $$;

-- p_dias: número de dias; vazio = para sempre
create or replace function public.banir(p_num bigint, p_dias int, p_motivo text) returns text
language plpgsql security definer set search_path = public as $$
declare eu perfis; o perfis; ate_quando timestamptz;
begin
  eu := _exigir(array['admin', 'moderador']); o := _por_num(p_num);
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Informe o motivo'; end if;
  if o.papel = 'admin' then raise exception 'O administrador não pode ser banido'; end if;
  if o.papel = 'moderador' and eu.papel <> 'admin' then raise exception 'Só o administrador pode banir moderadores'; end if;
  ate_quando := case when p_dias is null or p_dias <= 0 then 'infinity'::timestamptz else now() + make_interval(days => p_dias) end;
  update perfis set banido_ate = ate_quando where id = o.id;
  insert into banimentos (alvo, por, motivo, ate) values (o.id, eu.id, p_motivo, ate_quando);
  return o.nick || ' banido';
end $$;

create or replace function public.desbanir(p_num bigint) returns text
language plpgsql security definer set search_path = public as $$
declare eu perfis; o perfis;
begin
  eu := _exigir(array['admin', 'moderador']); o := _por_num(p_num);
  update perfis set banido_ate = null where id = o.id;
  update banimentos set removido_em = now(), removido_por = eu.id where alvo = o.id and removido_em is null;
  return o.nick || ' desbanido';
end $$;

create or replace function public.relatorio_banimentos() returns table (
  id bigint, alvo_num bigint, alvo_nick text, por_nick text, por_papel text, motivo text,
  ate timestamptz, criado_em timestamptz, removido_em timestamptz, removido_por_nick text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform _exigir(array['admin', 'moderador']);
  return query
    select b.id, a.num, a.nick, p.nick, p.papel, b.motivo, b.ate, b.criado_em, b.removido_em, r.nick
    from banimentos b join perfis a on a.id = b.alvo join perfis p on p.id = b.por
    left join perfis r on r.id = b.removido_por
    order by b.criado_em desc limit 200;
end $$;

-- Dar ou tirar estrelas/XP de uma classe. Tirar exige motivo, que vai como mensagem.
-- Moderador só pode tirar de 1 a 5 estrelas (punição por mau comportamento).
create or replace function public.ajustar_estrelas(p_num bigint, p_classe text, p_estrelas int, p_xp int, p_motivo text) returns text
language plpgsql security definer set search_path = public as $$
declare eu perfis; o perfis; atual int; xp_atual int; novo jsonb;
begin
  eu := _exigir(array['admin', 'moderador']); o := _por_num(p_num);
  if p_classe not in ('soldado', 'suporte', 'mago', 'atirador') then raise exception 'Classe inválida'; end if;
  if eu.papel = 'moderador' then
    if p_estrelas > 0 or p_estrelas < -5 or coalesce(p_xp, 0) <> 0 then raise exception 'Moderador só pode tirar de 1 a 5 estrelas'; end if;
    if o.papel <> 'jogador' then raise exception 'Moderador só pune jogadores'; end if;
  end if;
  if (p_estrelas < 0 or p_xp < 0) and coalesce(trim(p_motivo), '') = '' then raise exception 'Para retirar, escreva o motivo'; end if;
  atual := coalesce((o.dados -> 'classes' -> p_classe ->> 'estrelas')::int, 0);
  xp_atual := coalesce((o.dados -> 'classes' -> p_classe ->> 'xp')::int, 0);
  novo := coalesce(o.dados, '{}'::jsonb);
  if novo -> 'classes' is null then novo := novo || '{"classes":{}}'::jsonb; end if;
  novo := jsonb_set(novo, array['classes', p_classe],
    coalesce(novo -> 'classes' -> p_classe, '{}'::jsonb)
      || jsonb_build_object('estrelas', greatest(0, atual + coalesce(p_estrelas, 0)),
                            'xp', greatest(0, xp_atual + coalesce(p_xp, 0))));
  update perfis set dados = novo, estrelas = _soma_estrelas(novo), versao = versao + 1 where id = o.id;
  insert into mensagens (para, de, texto) values (o.id, eu.id,
    case when p_estrelas < 0 or p_xp < 0
      then 'Você perdeu ' || abs(least(p_estrelas, 0)) || ' estrela(s)' ||
           case when p_xp < 0 then ' e ' || abs(p_xp) || ' XP' else '' end || ' de ' || p_classe || '. Motivo: ' || p_motivo
      else 'Você ganhou ' || greatest(p_estrelas, 0) || ' estrela(s)' ||
           case when p_xp > 0 then ' e ' || p_xp || ' XP' else '' end || ' de ' || p_classe ||
           case when coalesce(trim(p_motivo), '') <> '' then '. ' || p_motivo else '' end
    end);
  insert into registro (por, alvo, acao, detalhe) values (eu.id, o.id, 'estrelas',
    p_classe || ' ' || coalesce(p_estrelas, 0) || '★ ' || coalesce(p_xp, 0) || 'xp · ' || coalesce(p_motivo, ''));
  return 'Pronto: ' || o.nick;
end $$;

-- Poderes: admin pode imortal e invisível; moderador só invisível
create or replace function public.meus_poderes(p_imortal boolean, p_invisivel boolean) returns perfis
language plpgsql security definer set search_path = public as $$
declare eu perfis;
begin
  eu := _exigir(array['admin', 'moderador']);
  update perfis set
    imortal = case when eu.papel = 'admin' then coalesce(p_imortal, imortal) else false end,
    invisivel = coalesce(p_invisivel, invisivel)
  where id = eu.id returning * into eu;
  return eu;
end $$;

create or replace function public.definir_moderador(p_num bigint, p_sim boolean) returns text
language plpgsql security definer set search_path = public as $$
declare eu perfis; o perfis;
begin
  eu := _exigir(array['admin']); o := _por_num(p_num);
  if o.papel = 'admin' then raise exception 'Esse é o administrador'; end if;
  update perfis set papel = case when p_sim then 'moderador' else 'jogador' end,
    invisivel = case when p_sim then invisivel else false end
  where id = o.id;
  if not p_sim then delete from salarios where moderador = o.id; end if;
  insert into mensagens (para, de, texto) values (o.id, eu.id,
    case when p_sim then 'Você agora é moderador do Vilkron.' else 'Você deixou de ser moderador.' end);
  insert into registro (por, alvo, acao) values (eu.id, o.id, case when p_sim then 'nomeou moderador' else 'retirou moderador' end);
  return o.nick || case when p_sim then ' agora é moderador' else ' não é mais moderador' end;
end $$;

-- Salário do moderador: p_ouro a cada p_dias, durante p_por_dias (vazio = sem prazo)
create or replace function public.definir_salario(p_num bigint, p_ouro int, p_dias int, p_por_dias int) returns text
language plpgsql security definer set search_path = public as $$
declare eu perfis; o perfis;
begin
  eu := _exigir(array['admin']); o := _por_num(p_num);
  if o.papel <> 'moderador' then raise exception 'Nomeie como moderador primeiro'; end if;
  if p_ouro is null or p_ouro <= 0 then delete from salarios where moderador = o.id; return 'Salário retirado'; end if;
  insert into salarios (moderador, ouro, a_cada_dias, ate, pago_ate)
  values (o.id, p_ouro, greatest(1, p_dias),
          case when p_por_dias > 0 then now() + make_interval(days => p_por_dias) end, now())
  on conflict (moderador) do update set ouro = excluded.ouro, a_cada_dias = excluded.a_cada_dias, ate = excluded.ate;
  return 'Salário de ' || o.nick || ': ' || p_ouro || ' de ouro a cada ' || greatest(1, p_dias) || ' dia(s)';
end $$;

create or replace function public.receber_salario() returns int
language plpgsql security definer set search_path = public as $$
declare eu perfis; s salarios; limite timestamptz; vezes int;
begin
  eu := _eu();
  select * into s from salarios where moderador = eu.id for update;
  if s.moderador is null or eu.papel <> 'moderador' then return 0; end if;
  limite := least(now(), coalesce(s.ate, now()));
  vezes := floor(extract(epoch from limite - s.pago_ate) / (s.a_cada_dias * 86400))::int;
  if vezes <= 0 then return 0; end if;
  update salarios set pago_ate = pago_ate + make_interval(days => vezes * s.a_cada_dias) where moderador = eu.id;
  update perfis set ouro = ouro + vezes * s.ouro where id = eu.id;
  return vezes * s.ouro;
end $$;

create or replace function public.listar_moderadores() returns table (
  num bigint, nick text, ouro int, a_cada_dias int, ate timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform _exigir(array['admin']);
  return query select p.num, p.nick, s.ouro, s.a_cada_dias, s.ate
    from perfis p left join salarios s on s.moderador = p.id where p.papel = 'moderador' order by p.nick;
end $$;

-- Admin: configurações (recompensas dos mobs, PvP, prêmios)
create or replace function public.salvar_config(p_chave text, p_valor jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _exigir(array['admin']);
  if p_chave not in ('mobs', 'pvp', 'drops') then raise exception 'Chave inválida'; end if;
  insert into config (chave, valor) values (p_chave, p_valor)
    on conflict (chave) do update set valor = excluded.valor;
end $$;

-- Admin: colocar ou tirar skin da loja (todas são limitadas: têm data de fim)
create or replace function public.loja_por_skin(p_classe text, p_skin text, p_nome text, p_preco int,
  p_inicio timestamptz, p_fim timestamptz, p_estoque int) returns bigint
language plpgsql security definer set search_path = public as $$
declare novo bigint;
begin
  perform _exigir(array['admin']);
  if p_fim is null or p_fim <= coalesce(p_inicio, now()) then raise exception 'A data de fim precisa ser depois do início'; end if;
  insert into loja_skins (classe, skin, nome, preco, inicio, fim, estoque)
  values (p_classe, p_skin, p_nome, p_preco, coalesce(p_inicio, now()), p_fim, nullif(p_estoque, 0))
  returning id into novo;
  return novo;
end $$;

create or replace function public.loja_tirar_skin(p_item bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _exigir(array['admin']);
  update loja_skins set fim = least(fim, now()) where id = p_item;
end $$;

-- Admin: dar uma skin direto (permanente ou de teste por X dias)
create or replace function public.dar_skin(p_num bigint, p_classe text, p_skin text, p_dias int) returns text
language plpgsql security definer set search_path = public as $$
declare eu perfis; o perfis; validade timestamptz;
begin
  eu := _exigir(array['admin']); o := _por_num(p_num);
  validade := case when p_dias > 0 then now() + make_interval(days => p_dias) end;
  update perfis set skins = jsonb_set(skins, array[p_classe],
    coalesce(skins -> p_classe, '{}'::jsonb) || jsonb_build_object(p_skin, validade)) where id = o.id;
  insert into mensagens (para, de, texto) values (o.id, eu.id,
    'Você ganhou a skin ' || p_skin || ' (' || p_classe || ')' ||
    case when p_dias > 0 then ' por ' || p_dias || ' dia(s).' else ', para sempre.' end);
  return 'Skin entregue a ' || o.nick;
end $$;

-- Rankings (top 30)
create or replace function public.ranking(p_qual text) returns table (nick text, valor bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if p_qual = 'players' then return query select p.nick, p.estrelas::bigint from perfis p where p.papel <> 'admin' order by 2 desc limit 30;
  elsif p_qual = 'farm' then return query select p.nick, p.ouro_total from perfis p where p.papel <> 'admin' order by 2 desc limit 30;
  elsif p_qual = 'top' then return query select p.nick, p.dano_total from perfis p where p.papel <> 'admin' order by 2 desc limit 30;
  else return query select (p.dados ->> 'clan'), sum(coalesce((p.dados ->> 'pontosRank')::bigint, 0))::bigint
    from perfis p where coalesce(p.dados ->> 'clan', '') <> '' group by 1 order by 2 desc limit 30;
  end if;
end $$;

-- ---------------- PERMISSÕES ----------------
revoke all on all functions in schema public from anon, public;
grant execute on all functions in schema public to authenticated;
revoke execute on function public._eu(), public._por_num(bigint), public._exigir(text[]) from authenticated;

-- Atualização ao vivo do próprio perfil (doações, punições, mensagens)
do $$ begin
  begin alter publication supabase_realtime add table public.perfis; exception when others then null; end;
  begin alter publication supabase_realtime add table public.mensagens; exception when others then null; end;
end $$;
