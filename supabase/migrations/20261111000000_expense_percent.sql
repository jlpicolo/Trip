-- 4e mode de répartition du pot commun : pourcentages (en plus de parts égales, montants exacts, parts).
-- Les centimes restent calculés par l'appareil (base_minor) et vérifiés par tg_validate_expense.
alter table public.expenses drop constraint expenses_split_mode_check;
alter table public.expenses add constraint expenses_split_mode_check
  check (split_mode in ('equal', 'exact', 'shares', 'percent'));
