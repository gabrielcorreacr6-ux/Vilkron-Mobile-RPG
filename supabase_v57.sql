-- ===== Vilkron v57: heróis novos Gigante, Phil, Merlin e Violet (rodar uma vez) =====
-- Eles contam como classe (estrelas e skins próprias), como o Jin. Para liberar um herói de evento para alguém:
-- menu do administrador > Jogadores > dar skin > classe do herói (gigante, phil, merlin ou violet) > skin "default".

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
