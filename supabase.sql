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
  if exists (select 1 from equipe_membros a join equipe_membros b on a.equipe = b.equipe where a.jogador = eu.id and b.jogador = v.id) then
    return jsonb_build_object('xp', 0, 'ouro', 0, 'tipo', 'equipe');
  end if;
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

-- ---------------- EQUIPE (até 4 jogadores que não se ferem) ----------------
create table if not exists public.equipes (
  id        bigint generated always as identity primary key,
  lider     uuid not null references public.perfis(id) on delete cascade,
  criada_em timestamptz not null default now()
);
create table if not exists public.equipe_membros (
  jogador  uuid primary key references public.perfis(id) on delete cascade,   -- cada jogador em uma equipe só
  equipe   bigint not null references public.equipes(id) on delete cascade,
  entrou_em timestamptz not null default now()
);
create table if not exists public.convites_equipe (
  equipe    bigint not null references public.equipes(id) on delete cascade,
  para      uuid not null references public.perfis(id) on delete cascade,
  de        uuid not null references public.perfis(id) on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (equipe, para)
);
alter table public.equipes enable row level security;
alter table public.equipe_membros enable row level security;
alter table public.convites_equipe enable row level security;

create or replace function public.minha_equipe() returns bigint
language sql stable security definer set search_path = public as $$
  select equipe from equipe_membros where jogador = auth.uid()
$$;
drop policy if exists eq_ler on public.equipes;
create policy eq_ler on public.equipes for select to authenticated using (id = public.minha_equipe() or exists (select 1 from convites_equipe c where c.equipe = id and c.para = auth.uid()));
drop policy if exists eqm_ler on public.equipe_membros;
create policy eqm_ler on public.equipe_membros for select to authenticated using (equipe = public.minha_equipe());
drop policy if exists eqc_ler on public.convites_equipe;
create policy eqc_ler on public.convites_equipe for select to authenticated using (para = auth.uid() or equipe = public.minha_equipe());

create or replace function public._amigos(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from amizades where aceita and ((de = a and para = b) or (de = b and para = a)))
$$;

create or replace function public.criar_equipe() returns bigint
language plpgsql security definer set search_path = public as $$
declare eu perfis; e bigint;
begin
  eu := _eu();
  select equipe into e from equipe_membros where jogador = eu.id;
  if e is not null then return e; end if;
  insert into equipes (lider) values (eu.id) returning id into e;
  insert into equipe_membros (jogador, equipe) values (eu.id, e);
  return e;
end $$;

-- só amigos podem ser chamados; a equipe é criada na hora se ainda não existir
create or replace function public.convidar_equipe(p_num bigint) returns text
language plpgsql security definer set search_path = public as $$
declare eu perfis; o perfis; e bigint; n int;
begin
  eu := _eu(); o := _por_num(p_num);
  if o.id = eu.id then raise exception 'Esse é você'; end if;
  if not _amigos(eu.id, o.id) then raise exception 'Só dá para chamar amigos para a equipe'; end if;
  e := criar_equipe();
  select count(*) into n from equipe_membros where equipe = e;
  if n >= 4 then raise exception 'A equipe já tem 4 jogadores'; end if;
  if exists (select 1 from equipe_membros where jogador = o.id and equipe = e) then raise exception '% já está na equipe', o.nick; end if;
  insert into convites_equipe (equipe, para, de) values (e, o.id, eu.id) on conflict (equipe, para) do update set criado_em = now(), de = excluded.de;
  return 'Convite enviado para ' || o.nick;
end $$;

create or replace function public.responder_convite_equipe(p_equipe bigint, p_aceitar boolean) returns text
language plpgsql security definer set search_path = public as $$
declare eu perfis; n int;
begin
  eu := _eu();
  if not exists (select 1 from convites_equipe where equipe = p_equipe and para = eu.id) then raise exception 'Convite não encontrado'; end if;
  delete from convites_equipe where equipe = p_equipe and para = eu.id;
  if not p_aceitar then return 'Convite recusado'; end if;
  select count(*) into n from equipe_membros where equipe = p_equipe;
  if n >= 4 then raise exception 'A equipe já está cheia'; end if;
  perform sair_equipe();                                    -- sai da equipe antiga, se tiver
  insert into equipe_membros (jogador, equipe) values (eu.id, p_equipe);
  return 'Você entrou na equipe';
end $$;

create or replace function public.sair_equipe() returns text
language plpgsql security definer set search_path = public as $$
declare eu perfis; e bigint; novo uuid;
begin
  eu := _eu();
  select equipe into e from equipe_membros where jogador = eu.id;
  if e is null then return 'Você não está em equipe'; end if;
  delete from equipe_membros where jogador = eu.id;
  select jogador into novo from equipe_membros where equipe = e order by entrou_em limit 1;
  if novo is null then delete from equipes where id = e;          -- ficou vazia: desfaz
  else update equipes set lider = novo where id = e and lider = eu.id; end if;
  return 'Você saiu da equipe';
end $$;

create or replace function public.expulsar_equipe(p_jogador uuid) returns text
language plpgsql security definer set search_path = public as $$
declare eu perfis; e bigint;
begin
  eu := _eu();
  select id into e from equipes where lider = eu.id;
  if e is null then raise exception 'Só o líder pode expulsar'; end if;
  if p_jogador = eu.id then raise exception 'Para sair, use Sair da equipe'; end if;
  delete from equipe_membros where jogador = p_jogador and equipe = e;
  return 'Jogador removido da equipe';
end $$;

-- desfazer amizade também tira os dois da mesma equipe? Não: a equipe continua até alguém sair.

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
  begin alter publication supabase_realtime add table public.equipe_membros; exception when others then null; end;
  begin alter publication supabase_realtime add table public.convites_equipe; exception when others then null; end;
end $$;

-- ===== Vilkron v18: evento da arena (rodar uma vez no SQL Editor) =====

-- o admin passa a poder salvar a configuração do evento da arena
create or replace function public.salvar_config(p_chave text, p_valor jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _exigir(array['admin']);
  if p_chave not in ('mobs', 'pvp', 'drops', 'arena_evento') then raise exception 'Chave inválida'; end if;
  insert into config (chave, valor) values (p_chave, p_valor)
    on conflict (chave) do update set valor = excluded.valor;
end $$;

-- quem já pegou cada prêmio de cada evento (um por jogador)
create table if not exists public.premios_evento (
  jogador uuid not null references public.perfis(id) on delete cascade,
  evento  text not null,
  meta    int  not null,
  em      timestamptz not null default now(),
  primary key (jogador, evento, meta)
);
alter table public.premios_evento enable row level security;

-- Prêmio do evento da arena: p_meta = qual meta (0, 1, 2...), p_seq = vitórias seguidas que o jogo contou
create or replace function public.premio_evento_arena(p_meta int, p_seq int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare eu perfis; ev jsonb; m jsonb; validade timestamptz; v_ouro int; v_xp int; sk jsonb; dias int;
begin
  eu := _eu();
  select valor into ev from config where chave = 'arena_evento';
  if ev is null or not coalesce((ev ->> 'ativo')::boolean, false)
     or now() < (ev ->> 'inicio')::timestamptz or now() > (ev ->> 'fim')::timestamptz then
    raise exception 'Nenhum evento da arena agora';
  end if;
  m := ev -> 'metas' -> p_meta;
  if m is null then raise exception 'Meta inválida'; end if;
  if p_seq < coalesce((m ->> 'vitorias')::int, 999999) then raise exception 'Ainda faltam vitórias'; end if;
  insert into premios_evento (jogador, evento, meta) values (eu.id, ev ->> 'id', p_meta)
    on conflict do nothing;
  if not found then return jsonb_build_object('repetido', true); end if;
  v_ouro := greatest(0, coalesce((m ->> 'ouro')::int, 0));
  v_xp   := greatest(0, coalesce((m ->> 'xp')::int, 0));
  sk   := m -> 'skin';
  if v_ouro > 0 then update perfis set ouro = ouro + v_ouro, ouro_total = ouro_total + v_ouro where id = eu.id; end if;
  if sk is not null and coalesce(sk ->> 'id', '') <> '' then
    dias := coalesce((sk ->> 'dias')::int, 0);
    validade := case when dias > 0 then now() + make_interval(days => dias) end;
    update perfis set skins = jsonb_set(skins, array[sk ->> 'classe'],
      coalesce(skins -> (sk ->> 'classe'), '{}'::jsonb) || jsonb_build_object(sk ->> 'id', validade)) where id = eu.id;
  end if;
  insert into mensagens (para, de, texto) values (eu.id, null,
    'Evento ' || coalesce(ev ->> 'nome', 'da arena') || ': ' || (m ->> 'vitorias') || ' vitórias seguidas! Prêmio: ' ||
    concat_ws(' + ', case when v_ouro > 0 then v_ouro || ' de ouro' end, case when v_xp > 0 then v_xp || ' XP' end,
      case when sk is not null and coalesce(sk ->> 'id', '') <> '' then 'skin ' || (sk ->> 'id') end));
  return jsonb_build_object('ouro', v_ouro, 'xp', v_xp, 'skin', sk);
end $$;

revoke all on function public.premio_evento_arena(int, int) from anon, public;
grant execute on function public.premio_evento_arena(int, int) to authenticated;

-- ===== Vilkron: dano/defesa do admin e cinemáticas (rodar uma vez no SQL Editor) =====

-- o admin passa a salvar também o balanço (dano e defesa) e a lista de vídeos
create or replace function public.salvar_config(p_chave text, p_valor jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _exigir(array['admin']);
  if p_chave not in ('mobs', 'pvp', 'drops', 'arena_evento', 'balanco', 'cinematicas') then raise exception 'Chave inválida'; end if;
  insert into config (chave, valor) values (p_chave, p_valor)
    on conflict (chave) do update set valor = excluded.valor;
end $$;

-- pasta pública dos vídeos (todos assistem; só o admin envia, troca ou apaga)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cinematicas', 'cinematicas', true, 52428800, array['video/mp4', 'video/webm', 'video/quicktime'])
on conflict (id) do update set public = true, file_size_limit = 52428800, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists cine_ler on storage.objects;
create policy cine_ler on storage.objects for select using (bucket_id = 'cinematicas');
drop policy if exists cine_admin_enviar on storage.objects;
create policy cine_admin_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'cinematicas' and exists (select 1 from public.perfis where id = auth.uid() and papel = 'admin'));
drop policy if exists cine_admin_trocar on storage.objects;
create policy cine_admin_trocar on storage.objects for update to authenticated
  using (bucket_id = 'cinematicas' and exists (select 1 from public.perfis where id = auth.uid() and papel = 'admin'));
drop policy if exists cine_admin_apagar on storage.objects;
create policy cine_admin_apagar on storage.objects for delete to authenticated
  using (bucket_id = 'cinematicas' and exists (select 1 from public.perfis where id = auth.uid() and papel = 'admin'));

-- ===== Vilkron: chat (equipe, amigos, privado), bloquear e silenciar (rodar uma vez) =====

create table if not exists public.chat (
  id        bigint generated always as identity primary key,
  de        uuid not null references public.perfis(id) on delete cascade,
  tipo      text not null check (tipo in ('equipe', 'amigos', 'privado')),
  equipe    bigint,
  para      uuid references public.perfis(id) on delete cascade,
  texto     text not null check (char_length(texto) between 1 and 200),
  criado_em timestamptz not null default now()
);
create index if not exists chat_quando on public.chat (criado_em desc);
create index if not exists chat_para on public.chat (para);

create table if not exists public.bloqueios (
  quem      uuid not null references public.perfis(id) on delete cascade,
  bloqueado uuid not null references public.perfis(id) on delete cascade,
  primary key (quem, bloqueado)
);
create table if not exists public.silenciados (
  quem       uuid not null references public.perfis(id) on delete cascade,
  silenciado uuid not null references public.perfis(id) on delete cascade,
  primary key (quem, silenciado)
);
alter table public.chat enable row level security;
alter table public.bloqueios enable row level security;
alter table public.silenciados enable row level security;

-- ajudantes (rodam com permissão do dono, para a regra de leitura não depender das regras de outras tabelas)
create or replace function public._na_equipe(p_equipe bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from equipe_membros where equipe = p_equipe and jogador = auth.uid()) $$;
create or replace function public._amigo_de(p_outro uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from amizades where aceita and ((de = p_outro and para = auth.uid()) or (para = p_outro and de = auth.uid()))) $$;
create or replace function public._bloqueei(p_outro uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from bloqueios where quem = auth.uid() and bloqueado = p_outro) $$;

-- quem lê cada mensagem: quem mandou; no privado, quem recebe; na equipe, os membros; em amigos, os amigos de quem mandou.
-- Mensagens de quem você bloqueou nunca chegam.
drop policy if exists chat_ler on public.chat;
create policy chat_ler on public.chat for select to authenticated using (
  (de = auth.uid()
   or (tipo = 'privado' and para = auth.uid())
   or (tipo = 'equipe' and _na_equipe(equipe))
   or (tipo = 'amigos' and _amigo_de(de)))
  and not _bloqueei(de)
);
drop policy if exists bloq_ler on public.bloqueios;
create policy bloq_ler on public.bloqueios for select to authenticated using (quem = auth.uid());
drop policy if exists sil_ler on public.silenciados;
create policy sil_ler on public.silenciados for select to authenticated using (quem = auth.uid());

-- mandar mensagem (o servidor confere equipe, amizade, bloqueio e o ritmo: 1 por segundo)
create or replace function public.enviar_chat(p_tipo text, p_para uuid, p_texto text) returns bigint
language plpgsql security definer set search_path = public as $$
declare eu perfis; t text; eq bigint; novo bigint;
begin
  eu := _eu();
  if eu.banido_ate is not null and eu.banido_ate > now() then raise exception 'Conta banida'; end if;
  t := btrim(coalesce(p_texto, ''));
  if t = '' then raise exception 'Mensagem vazia'; end if;
  t := left(t, 200);
  if exists (select 1 from chat where de = eu.id and criado_em > now() - interval '1 second') then raise exception 'Calma: uma mensagem por segundo'; end if;
  if p_tipo = 'equipe' then
    select equipe into eq from equipe_membros where jogador = eu.id;
    if eq is null then raise exception 'Você não está em uma equipe'; end if;
    insert into chat (de, tipo, equipe, texto) values (eu.id, 'equipe', eq, t) returning id into novo;
  elsif p_tipo = 'amigos' then
    insert into chat (de, tipo, texto) values (eu.id, 'amigos', t) returning id into novo;
  elsif p_tipo = 'privado' then
    if p_para is null or p_para = eu.id then raise exception 'Para quem?'; end if;
    if exists (select 1 from bloqueios where quem = p_para and bloqueado = eu.id) then raise exception 'Esse jogador não recebe suas mensagens'; end if;
    if exists (select 1 from bloqueios where quem = eu.id and bloqueado = p_para) then raise exception 'Você bloqueou esse jogador: desbloqueie para conversar'; end if;
    insert into chat (de, tipo, para, texto) values (eu.id, 'privado', p_para, t) returning id into novo;
  else raise exception 'Tipo de conversa inválido';
  end if;
  -- limpeza: conversas com mais de 7 dias somem
  delete from chat where criado_em < now() - interval '7 days';
  return novo;
end $$;

-- bloquear: desfaz a amizade, apaga pedidos e impede mensagens e novos pedidos
create or replace function public.bloquear(p_outro uuid) returns text
language plpgsql security definer set search_path = public as $$
declare eu perfis;
begin
  eu := _eu();
  if p_outro = eu.id then raise exception 'Esse é você'; end if;
  insert into bloqueios (quem, bloqueado) values (eu.id, p_outro) on conflict do nothing;
  delete from amizades where (de = eu.id and para = p_outro) or (de = p_outro and para = eu.id);
  return 'Jogador bloqueado';
end $$;
create or replace function public.desbloquear(p_outro uuid) returns text
language plpgsql security definer set search_path = public as $$
begin
  delete from bloqueios where quem = auth.uid() and bloqueado = p_outro;
  return 'Jogador desbloqueado';
end $$;
-- silenciar: as mensagens dele somem só para você (continua amigo)
create or replace function public.silenciar(p_outro uuid, p_sim boolean) returns text
language plpgsql security definer set search_path = public as $$
begin
  if p_sim then insert into silenciados (quem, silenciado) values (auth.uid(), p_outro) on conflict do nothing;
  else delete from silenciados where quem = auth.uid() and silenciado = p_outro; end if;
  return case when p_sim then 'Jogador silenciado' else 'Jogador sem silêncio' end;
end $$;

-- pedido de amizade não passa se um bloqueou o outro
create or replace function public.pedir_amizade(p_num bigint) returns text
language plpgsql security definer set search_path = public as $$
declare eu perfis; o perfis;
begin
  eu := _eu(); o := _por_num(p_num);
  if o.id = eu.id then raise exception 'Esse é você'; end if;
  if exists (select 1 from bloqueios where quem = eu.id and bloqueado = o.id) then raise exception 'Você bloqueou esse jogador: desbloqueie primeiro'; end if;
  if exists (select 1 from bloqueios where quem = o.id and bloqueado = eu.id) then raise exception 'Não foi possível enviar o pedido'; end if;
  if exists (select 1 from amizades where de = o.id and para = eu.id) then
    update amizades set aceita = true where de = o.id and para = eu.id;
    return 'Agora vocês são amigos';
  end if;
  insert into amizades (de, para) values (eu.id, o.id) on conflict do nothing;
  return 'Pedido enviado para ' || o.nick;
end $$;

revoke all on function public.enviar_chat(text, uuid, text), public.bloquear(uuid), public.desbloquear(uuid), public.silenciar(uuid, boolean) from anon, public;
grant execute on function public.enviar_chat(text, uuid, text), public.bloquear(uuid), public.desbloquear(uuid), public.silenciar(uuid, boolean) to authenticated;
grant select on public.chat, public.bloqueios, public.silenciados to authenticated;

-- mensagens chegam ao vivo
do $$ begin
  begin alter publication supabase_realtime add table public.chat; exception when others then null; end;
end $$;
-- ===== Vilkron v38: herói Jin, moderador imortal, labirinto (rodar uma vez) =====

-- Jin conta como classe (estrelas e skins próprias)
alter table public.loja_skins drop constraint if exists loja_skins_classe_check;
alter table public.loja_skins add constraint loja_skins_classe_check check (classe in ('soldado', 'suporte', 'mago', 'atirador', 'jin'));

create or replace function public.ajustar_estrelas(p_num bigint, p_classe text, p_estrelas int, p_xp int, p_motivo text) returns text
language plpgsql security definer set search_path = public as $$
declare eu perfis; o perfis; atual int; xp_atual int; novo jsonb;
begin
  eu := _exigir(array['admin', 'moderador']); o := _por_num(p_num);
  if p_classe not in ('soldado', 'suporte', 'mago', 'atirador', 'jin') then raise exception 'Classe inválida'; end if;
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

-- moderador também pode ficar imortal
create or replace function public.meus_poderes(p_imortal boolean, p_invisivel boolean) returns perfis
language plpgsql security definer set search_path = public as $$
declare eu perfis;
begin
  eu := _exigir(array['admin', 'moderador']);
  update perfis set
    imortal = coalesce(p_imortal, imortal),
    invisivel = coalesce(p_invisivel, invisivel)
  where id = eu.id returning * into eu;
  return eu;
end $$;

-- dar skin: "default" numa classe de herói de evento (jin) libera o herói
create or replace function public.dar_skin(p_num bigint, p_classe text, p_skin text, p_dias int) returns text
language plpgsql security definer set search_path = public as $$
declare eu perfis; o perfis; validade timestamptz;
begin
  eu := _exigir(array['admin']); o := _por_num(p_num);
  validade := case when p_dias > 0 then now() + make_interval(days => p_dias) end;
  update perfis set skins = jsonb_set(skins, array[p_classe],
    coalesce(skins -> p_classe, '{}'::jsonb) || jsonb_build_object(p_skin, validade)) where id = o.id;
  insert into mensagens (para, de, texto) values (o.id, eu.id,
    case when p_skin = 'default' then 'Você ganhou o herói ' || initcap(p_classe) else 'Você ganhou a skin ' || p_skin || ' (' || p_classe || ')' end ||
    case when p_dias > 0 then ' por ' || p_dias || ' dia(s).' else ', para sempre.' end);
  return case when p_skin = 'default' then 'Herói entregue a ' else 'Skin entregue a ' end || o.nick;
end $$;

-- configuração nova: labirinto
create or replace function public.salvar_config(p_chave text, p_valor jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _exigir(array['admin']);
  if p_chave not in ('mobs', 'pvp', 'drops', 'arena_evento', 'balanco', 'cinematicas', 'labirinto') then raise exception 'Chave inválida'; end if;
  insert into config (chave, valor) values (p_chave, p_valor)
    on conflict (chave) do update set valor = excluded.valor;
end $$;

-- baú do labirinto: uma vez por mudança das paredes; quem já ganhou só ganha de novo
-- se o administrador liberou entradas extras para ganhadores
create or replace function public.premio_labirinto(p_ciclo int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare eu perfis; ev jsonb; pr jsonb; sk jsonb; v_ouro int; v_xp int; v_est int; dias int; validade timestamptz; ganhos int; intervalo int;
begin
  eu := _eu();
  select valor into ev from config where chave = 'labirinto';
  if ev is null or not coalesce((ev ->> 'ativo')::boolean, false)
     or now() < (ev ->> 'inicio')::timestamptz or now() > (ev ->> 'fim')::timestamptz then
    raise exception 'O labirinto está fechado agora';
  end if;
  intervalo := greatest(2, coalesce((ev ->> 'intervalo')::int, 30));
  select count(*) into ganhos from premios_evento where jogador = eu.id and evento like 'lab|' || (ev ->> 'id') || '|%';
  if ganhos >= 1 + greatest(0, coalesce((ev ->> 'tentativasGanhador')::int, 0)) then return jsonb_build_object('repetido', true); end if;
  if exists (select 1 from premios_evento where jogador = eu.id and evento like 'lab|%' and em > now() - make_interval(mins => greatest(1, intervalo - 1))) then
    return jsonb_build_object('repetido', true);
  end if;
  insert into premios_evento (jogador, evento, meta) values (eu.id, 'lab|' || (ev ->> 'id') || '|' || p_ciclo, 0) on conflict do nothing;
  if not found then return jsonb_build_object('repetido', true); end if;
  pr := coalesce(ev -> 'premio', '{}'::jsonb);
  v_ouro := greatest(0, coalesce((pr ->> 'ouro')::int, 0));
  v_xp   := greatest(0, coalesce((pr ->> 'xp')::int, 0));
  v_est  := least(50, greatest(0, coalesce((pr ->> 'estrelas')::int, 0)));
  sk := pr -> 'skin';
  if v_ouro > 0 then update perfis set ouro = ouro + v_ouro, ouro_total = ouro_total + v_ouro where id = eu.id; end if;
  if sk is not null and coalesce(sk ->> 'id', '') <> '' then
    dias := coalesce((sk ->> 'dias')::int, 0);
    validade := case when dias > 0 then now() + make_interval(days => dias) end;
    update perfis set skins = jsonb_set(skins, array[sk ->> 'classe'],
      coalesce(skins -> (sk ->> 'classe'), '{}'::jsonb) || jsonb_build_object(sk ->> 'id', validade)) where id = eu.id;
  end if;
  insert into mensagens (para, de, texto) values (eu.id, null,
    'Você venceu o labirinto! Prêmio: ' || coalesce(nullif(concat_ws(' + ', case when v_ouro > 0 then v_ouro || ' de ouro' end, case when v_xp > 0 then v_xp || ' XP' end,
      case when v_est > 0 then v_est || ' estrela(s)' end, case when sk is not null and coalesce(sk ->> 'id', '') <> '' then case when sk ->> 'id' = 'default' then 'herói ' || initcap(sk ->> 'classe') else 'skin ' || (sk ->> 'id') end end), ''), 'parabéns'));
  return jsonb_build_object('ouro', v_ouro, 'xp', v_xp, 'estrelas', v_est, 'skin', sk);
end $$;

revoke all on function public.premio_labirinto(int) from anon, public;
grant execute on function public.premio_labirinto(int) to authenticated;
-- ===== Vilkron v45: clãs, troca de nick e preços na loja (rodar uma vez) =====

create table if not exists public.clas (
  id        bigint generated always as identity primary key,
  nome      text not null,
  lider     uuid not null references public.perfis(id) on delete cascade,
  criado_em timestamptz not null default now()
);
create unique index if not exists clas_nome_unico on public.clas (lower(nome));
create table if not exists public.cla_membros (
  jogador   uuid primary key references public.perfis(id) on delete cascade,   -- cada jogador em um clã só
  cla       bigint not null references public.clas(id) on delete cascade,
  entrou_em timestamptz not null default now()
);
create table if not exists public.convites_cla (
  cla       bigint not null references public.clas(id) on delete cascade,
  para      uuid not null references public.perfis(id) on delete cascade,
  de        uuid not null references public.perfis(id) on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (cla, para)
);
grant select on public.clas, public.cla_membros, public.convites_cla to authenticated;
alter table public.clas enable row level security;
alter table public.cla_membros enable row level security;
alter table public.convites_cla enable row level security;

create or replace function public.meu_cla() returns bigint
language sql stable security definer set search_path = public as $$
  select cla from cla_membros where jogador = auth.uid()
$$;
drop policy if exists cla_ler on public.clas;
create policy cla_ler on public.clas for select to authenticated using (true);
drop policy if exists clam_ler on public.cla_membros;
create policy clam_ler on public.cla_membros for select to authenticated using (true);
drop policy if exists clac_ler on public.convites_cla;
create policy clac_ler on public.convites_cla for select to authenticated using (para = auth.uid() or cla = public.meu_cla());

-- preço definido pelo administrador (config "precos"), com um valor padrão
create or replace function public._preco(p_chave text, p_padrao int) returns int
language sql stable security definer set search_path = public as $$
  select greatest(0, coalesce((select (valor ->> p_chave)::int from config where chave = 'precos'), p_padrao))
$$;

-- o nome do clã fica também no perfil (ranking de clãs); versao + 1 faz o jogo recarregar o perfil
create or replace function public._marcar_cla(p_jogador uuid, p_nome text) returns void
language sql security definer set search_path = public as $$
  update perfis set dados = jsonb_set(coalesce(dados, '{}'::jsonb), '{clan}', to_jsonb(coalesce(p_nome, ''))), versao = versao + 1 where id = p_jogador
$$;

create or replace function public.criar_cla(p_nome text) returns perfis
language plpgsql security definer set search_path = public as $$
declare eu perfis; preco int; c bigint; v_nome text;
begin
  eu := _eu(); v_nome := btrim(regexp_replace(coalesce(p_nome, ''), '\s+', ' ', 'g'));
  if v_nome !~ '^[A-Za-zÀ-ÿ0-9 _-]{3,20}$' then raise exception 'Nome do clã: de 3 a 20 letras, números, espaço, _ ou -'; end if;
  if exists (select 1 from cla_membros where jogador = eu.id) then raise exception 'Saia do seu clã antes de criar outro'; end if;
  if exists (select 1 from clas where lower(clas.nome) = lower(v_nome)) then raise exception 'Já existe um clã com esse nome'; end if;
  preco := _preco('cla', 5000);
  if eu.ouro < preco then raise exception 'Ouro insuficiente (precisa de %)', preco; end if;
  insert into clas (nome, lider) values (v_nome, eu.id) returning id into c;
  insert into cla_membros (jogador, cla) values (eu.id, c);
  update perfis set ouro = ouro - preco where id = eu.id;
  perform _marcar_cla(eu.id, v_nome);
  select * into eu from perfis where id = eu.id;
  return eu;
end $$;

create or replace function public.convidar_cla(p_num bigint) returns text
language plpgsql security definer set search_path = public as $$
declare eu perfis; o perfis; c bigint; n int;
begin
  eu := _eu(); o := _por_num(p_num);
  if o.id = eu.id then raise exception 'Esse é você'; end if;
  select cla into c from cla_membros where jogador = eu.id;
  if c is null then raise exception 'Você não está em um clã'; end if;
  if exists (select 1 from cla_membros where jogador = o.id) then raise exception '% já está em um clã', o.nick; end if;
  select count(*) into n from cla_membros where cla = c;
  if n >= 30 then raise exception 'O clã já tem 30 membros'; end if;
  insert into convites_cla (cla, para, de) values (c, o.id, eu.id) on conflict (cla, para) do update set de = excluded.de, criado_em = now();
  insert into mensagens (para, de, texto) values (o.id, eu.id, eu.nick || ' chamou você para o clã ' || (select nome from clas where id = c) || '. Veja em ⋮ › Clã.');
  return 'Convite enviado para ' || o.nick;
end $$;

create or replace function public.responder_convite_cla(p_cla bigint, p_aceitar boolean) returns text
language plpgsql security definer set search_path = public as $$
declare eu perfis; v_nome text;
begin
  eu := _eu();
  if not exists (select 1 from convites_cla where cla = p_cla and para = eu.id) then raise exception 'Convite não encontrado'; end if;
  if not p_aceitar then delete from convites_cla where cla = p_cla and para = eu.id; return 'Convite recusado'; end if;
  if exists (select 1 from cla_membros where jogador = eu.id) then raise exception 'Saia do seu clã antes de entrar em outro'; end if;
  if (select count(*) from cla_membros where cla = p_cla) >= 30 then raise exception 'O clã está cheio'; end if;
  insert into cla_membros (jogador, cla) values (eu.id, p_cla);
  delete from convites_cla where para = eu.id;
  select clas.nome into v_nome from clas where id = p_cla;
  perform _marcar_cla(eu.id, v_nome);
  return 'Bem-vindo ao clã ' || v_nome;
end $$;

-- sair: se o líder sai, o membro mais antigo vira líder; o último a sair fecha o clã
create or replace function public.sair_cla() returns text
language plpgsql security definer set search_path = public as $$
declare eu perfis; c bigint; l uuid; prox uuid;
begin
  eu := _eu();
  select cla into c from cla_membros where jogador = eu.id;
  if c is null then raise exception 'Você não está em um clã'; end if;
  delete from cla_membros where jogador = eu.id;
  perform _marcar_cla(eu.id, '');
  select lider into l from clas where id = c;
  select jogador into prox from cla_membros where cla = c order by entrou_em limit 1;
  if prox is null then delete from clas where id = c; return 'Você saiu e o clã foi fechado'; end if;
  if l = eu.id then update clas set lider = prox where id = c; end if;
  return 'Você saiu do clã';
end $$;

create or replace function public.expulsar_cla(p_jogador uuid) returns text
language plpgsql security definer set search_path = public as $$
declare eu perfis; c bigint;
begin
  eu := _eu();
  select id into c from clas where lider = eu.id and id = (select cla from cla_membros where jogador = eu.id);
  if c is null then raise exception 'Só o líder do clã pode expulsar'; end if;
  if p_jogador = eu.id then raise exception 'Use "Sair do clã"'; end if;
  delete from cla_membros where jogador = p_jogador and cla = c;
  if not found then raise exception 'Esse jogador não está no clã'; end if;
  perform _marcar_cla(p_jogador, '');
  return 'Expulso do clã';
end $$;

-- trocar o nick (pago; o preço vem do administrador)
create or replace function public.trocar_nick(p_nick text) returns perfis
language plpgsql security definer set search_path = public as $$
declare eu perfis; preco int;
begin
  eu := _eu();
  if p_nick !~ '^[A-Za-z0-9_]{3,16}$' then raise exception 'O nick precisa ter de 3 a 16 letras, números ou _'; end if;
  if lower(p_nick) = lower(eu.nick) then raise exception 'Esse já é o seu nick'; end if;
  if exists (select 1 from perfis where lower(nick) = lower(p_nick)) then raise exception 'Esse nick já existe'; end if;
  preco := _preco('nick', 2000);
  if eu.ouro < preco then raise exception 'Ouro insuficiente (precisa de %)', preco; end if;
  update perfis set nick = p_nick, ouro = ouro - preco where id = eu.id returning * into eu;
  return eu;
end $$;

create or replace function public.salvar_config(p_chave text, p_valor jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _exigir(array['admin']);
  if p_chave not in ('mobs', 'pvp', 'drops', 'arena_evento', 'balanco', 'cinematicas', 'labirinto', 'precos') then raise exception 'Chave inválida'; end if;
  insert into config (chave, valor) values (p_chave, p_valor)
    on conflict (chave) do update set valor = excluded.valor;
end $$;

revoke all on function public.criar_cla(text), public.convidar_cla(bigint), public.responder_convite_cla(bigint, boolean), public.sair_cla(), public.expulsar_cla(uuid), public.trocar_nick(text) from anon, public;
grant execute on function public.criar_cla(text), public.convidar_cla(bigint), public.responder_convite_cla(bigint, boolean), public.sair_cla(), public.expulsar_cla(uuid), public.trocar_nick(text) to authenticated;
revoke execute on function public._marcar_cla(uuid, text) from anon, public, authenticated;
-- ===== Vilkron v53: rankings com todos (inclusive o administrador) e a sua posição (rodar uma vez) =====

create or replace function public.ranking(p_qual text) returns table (nick text, valor bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if p_qual = 'players' then return query select p.nick, p.estrelas::bigint from perfis p order by 2 desc, p.nick limit 30;
  elsif p_qual = 'farm' then return query select p.nick, p.ouro_total from perfis p order by 2 desc, p.nick limit 30;
  elsif p_qual = 'top' then return query select p.nick, p.dano_total from perfis p order by 2 desc, p.nick limit 30;
  else return query select (p.dados ->> 'clan'), sum(coalesce((p.dados ->> 'pontosRank')::bigint, 0))::bigint
    from perfis p where coalesce(p.dados ->> 'clan', '') <> '' group by 1 order by 2 desc limit 30;
  end if;
end $$;

-- a sua posição em cada ranking (mesmo fora dos 30)
create or replace function public.minha_posicao(p_qual text) returns table (posicao bigint, valor bigint)
language plpgsql stable security definer set search_path = public as $$
declare eu perfis; v bigint; cla text;
begin
  eu := _eu();
  if p_qual = 'players' then v := eu.estrelas; return query select 1 + count(*), v from perfis where estrelas > v;
  elsif p_qual = 'farm' then v := eu.ouro_total; return query select 1 + count(*), v from perfis where ouro_total > v;
  elsif p_qual = 'top' then v := eu.dano_total; return query select 1 + count(*), v from perfis where dano_total > v;
  else
    cla := coalesce(eu.dados ->> 'clan', '');
    if cla = '' then return query select null::bigint, null::bigint; return; end if;
    return query with t as (select (p.dados ->> 'clan') c, sum(coalesce((p.dados ->> 'pontosRank')::bigint, 0))::bigint s
      from perfis p where coalesce(p.dados ->> 'clan', '') <> '' group by 1)
      select 1 + (select count(*) from t where t.s > (select s from t where c = cla)), (select s from t where c = cla);
  end if;
end $$;
revoke all on function public.minha_posicao(text) from anon, public;
grant execute on function public.minha_posicao(text) to authenticated;
