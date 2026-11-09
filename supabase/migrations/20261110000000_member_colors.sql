-- Couleur d'identification distincte pour chaque voyageur d'un groupe.
-- À l'arrivée dans un groupe, si la couleur du profil est déjà prise par un autre
-- membre, on lui attribue la première couleur libre de la palette (modifiable ensuite).

create or replace function public.assign_member_color()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  palette text[] := array['#e8452c', '#f4a6c0', '#7e93d6', '#5fe0a0', '#eab245', '#b88cfa', '#4cc3d9', '#f08a4b'];
  v_current text;
  v_taken text[];
  v_color text;
begin
  select color into v_current from profiles where id = new.user_id;
  select coalesce(array_agg(lower(p.color)), '{}') into v_taken
  from group_members m join profiles p on p.id = m.user_id
  where m.group_id = new.group_id and m.user_id <> new.user_id;
  if v_current is null or not (lower(v_current) = any(v_taken)) then
    return new;
  end if;
  select c into v_color from unnest(palette) with ordinality as t(c, i)
  where not (lower(c) = any(v_taken)) order by i limit 1;
  if v_color is not null then
    update profiles set color = v_color, updated_at = now() where id = new.user_id;
  end if;
  return new;
end $$;

create trigger group_members_assign_color
  after insert on public.group_members
  for each row execute function public.assign_member_color();
