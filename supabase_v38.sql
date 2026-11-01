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
