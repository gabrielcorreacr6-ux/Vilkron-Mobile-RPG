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
