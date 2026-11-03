-- ===== Vilkron v60: rodar UMA vez no Supabase (SQL Editor > New query > colar tudo > Run) =====
-- Junta tudo o que o servidor precisa para os heróis novos e a loja de heróis (v57 + v58).
-- Pode rodar mesmo que já tenha rodado o v57 ou o v58: nada se repete nem se perde.
-- Sem isto, o painel do administrador mostra "Classe inválida" ao dar estrelas/XP para Jin, Gigante,
-- Phil, Merlin ou Violet, e a compra de heróis não funciona.

alter table public.loja_skins drop constraint if exists loja_skins_classe_check;
alter table public.loja_skins add constraint loja_skins_classe_check check (classe in ('soldado', 'suporte', 'mago', 'atirador', 'jin', 'gigante', 'phil', 'merlin', 'violet'));

create or replace function public.ajustar_estrelas(p_num bigint, p_classe text, p_estrelas int, p_xp int, p_motivo text) returns text
language plpgsql security definer set search_path = public as $$
declare eu perfis; o perfis; atual int; xp_atual int; novo jsonb;
begin
  eu := _exigir(array['admin', 'moderador']); o := _por_num(p_num);
  if p_classe not in ('soldado', 'suporte', 'mago', 'atirador', 'jin', 'gigante', 'phil', 'merlin', 'violet') then raise exception 'Classe inválida'; end if;
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

-- 1) jogador novo começa com 15.000 de ouro
alter table public.perfis alter column ouro set default 15000;

-- 2) quem já jogava fica com os heróis que já usou (classe com XP ou estrelas, e a classe atual).
--    Herói que já tinha (inclusive de teste por dias) fica como estava.
update public.perfis p set skins = p.skins || coalesce((
  select jsonb_object_agg(x.k, coalesce(p.skins -> x.k, '{}'::jsonb) || jsonb_build_object('default', null))
  from (
    select c.key as k from jsonb_each(case when jsonb_typeof(p.dados -> 'classes') = 'object' then p.dados -> 'classes' else '{}'::jsonb end) c
      where coalesce((c.value ->> 'xp')::numeric, 0) > 0 or coalesce((c.value ->> 'estrelas')::numeric, 0) > 0
    union
    select p.dados ->> 'classe' where coalesce(p.dados ->> 'classe', '') <> ''
  ) x
  where x.k in ('soldado', 'suporte', 'mago', 'atirador', 'jin', 'gigante', 'phil', 'merlin', 'violet')
    and not coalesce((p.skins -> x.k) ? 'default', false)
), '{}'::jsonb);

-- 3) comprar um herói: o servidor confere o ouro e desconta
create or replace function public.comprar_heroi(p_classe text) returns perfis
language plpgsql security definer set search_path = public as $$
declare p perfis; preco int := 15000; atual text;
begin
  p := _eu();
  if p_classe not in ('soldado', 'suporte', 'mago', 'atirador', 'jin', 'gigante', 'phil', 'merlin', 'violet') then raise exception 'Herói inválido'; end if;
  if p.papel = 'admin' then return p; end if;
  if coalesce((p.skins -> p_classe) ? 'default', false) then
    atual := p.skins -> p_classe ->> 'default';
    if atual is null or atual::timestamptz > now() then raise exception 'Você já tem esse herói'; end if;
  end if;
  if p.ouro < preco then raise exception 'Ouro insuficiente: cada herói custa 15.000'; end if;
  update perfis set ouro = ouro - preco,
    skins = jsonb_set(skins, array[p_classe], coalesce(skins -> p_classe, '{}'::jsonb) || jsonb_build_object('default', null))
  where id = p.id returning * into p;
  insert into registro (por, alvo, acao, detalhe) values (p.id, p.id, 'heroi', 'comprou ' || p_classe || ' por ' || preco);
  return p;
end $$;
revoke all on function public.comprar_heroi(text) from anon, public;
grant execute on function public.comprar_heroi(text) to authenticated;
