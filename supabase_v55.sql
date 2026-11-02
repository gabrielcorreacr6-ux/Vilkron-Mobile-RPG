-- ===== Vilkron v55: o administrador nunca pode ser banido (rodar uma vez) =====

-- 1) qualquer mudança no perfil do administrador: o banimento é apagado e ele continua admin
create or replace function public._admin_intocavel() returns trigger
language plpgsql security definer set search_path = public as $$
declare mail text;
begin
  select email into mail from auth.users where id = new.id;
  if old.papel = 'admin' or lower(coalesce(mail, '')) = lower(email_admin()) then
    new.banido_ate := null;
    new.papel := 'admin';
  end if;
  return new;
end $$;
drop trigger if exists perfis_admin_intocavel on public.perfis;
create trigger perfis_admin_intocavel before update on public.perfis
  for each row execute function public._admin_intocavel();

-- 2) se já existir algum banimento no administrador, ele é retirado agora
update public.banimentos set removido_em = now()
  where removido_em is null and alvo in (select id from public.perfis where papel = 'admin');
update public.perfis set banido_ate = null where papel = 'admin' and banido_ate is not null;

-- 3) o banimento nunca bloqueia o administrador
create or replace function public._eu() returns perfis
language plpgsql stable security definer set search_path = public as $$
declare p perfis;
begin
  select * into p from perfis where id = auth.uid();
  if p.id is null then raise exception 'Crie seu nick primeiro'; end if;
  if p.papel <> 'admin' and p.banido_ate is not null and p.banido_ate > now() then raise exception 'Conta banida'; end if;
  return p;
end $$;

-- 4) banir: recusa o administrador (por papel e pelo e-mail)
create or replace function public.banir(p_num bigint, p_dias int, p_motivo text) returns text
language plpgsql security definer set search_path = public as $$
declare eu perfis; o perfis; ate_quando timestamptz; mail text;
begin
  eu := _exigir(array['admin', 'moderador']); o := _por_num(p_num);
  select email into mail from auth.users where id = o.id;
  if o.papel = 'admin' or lower(coalesce(mail, '')) = lower(email_admin()) then raise exception 'O administrador não pode ser banido'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Informe o motivo'; end if;
  if o.papel = 'moderador' and eu.papel <> 'admin' then raise exception 'Só o administrador pode banir moderadores'; end if;
  ate_quando := case when p_dias is null or p_dias <= 0 then 'infinity'::timestamptz else now() + make_interval(days => p_dias) end;
  update perfis set banido_ate = ate_quando where id = o.id;
  insert into banimentos (alvo, por, motivo, ate) values (o.id, eu.id, p_motivo, ate_quando);
  return o.nick || ' banido';
end $$;
