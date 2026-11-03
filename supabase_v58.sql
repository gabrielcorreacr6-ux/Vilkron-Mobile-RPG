-- ===== Vilkron v58: loja de heróis (rodar uma vez, depois do supabase_v57.sql) =====
-- Todos os heróis são vendidos por 15.000 de ouro. Jogador novo começa com 15.000 e compra o primeiro.
-- O herói comprado fica em perfis.skins -> <classe> -> "default" (o mesmo lugar onde o admin "dá" um herói).

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
