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
