"use client";

import { useCallback, useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, SectionTitle } from "@/components/ui/Card";
import { Drawer } from "@/components/ui/Drawer";
import { EmptyState, Spinner } from "@/components/ui/EmptyState";
import { Field, FormError } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { useCurrentTrip } from "@/components/app/TripContext";
import { useTravelers } from "@/hooks/useTrip";
import { useBudget, useFx } from "./useBudget";
import { ExpenseForm, initialExpenseForm } from "./ExpenseForm";
import { PersonalForm, initialPersonalForm } from "./PersonalForm";
import { Converter } from "./Converter";
import { getEngine } from "@/lib/sync/client";
import { deleteExpense, deletePersonal, deleteSettlement, recordSettlement, saveExpense, savePersonal } from "@/lib/db/budget";
import { balances, settleUp, totalsByCategory } from "@/lib/budget/balances";
import { EXPENSE_LABEL, PERSONAL_LABEL, SPLIT_LABEL } from "@/lib/budget/labels";
import { formatDayShort, formatMoney, todayIn } from "@/lib/formatters";
import { minorToInput, parseAmountToMinor } from "@/lib/money";
import { toMessage } from "@/lib/errors/messages";
import type { Expense, PersonalExpense } from "@/lib/types/budget";

type Tab = "pot" | "perso" | "convertir";
type DrawerState =
  | null
  | { kind: "expense"; id: string }
  | { kind: "expense-form"; id?: string }
  | { kind: "personal-form"; id?: string }
  | { kind: "settle"; from: string; to: string; amount: number };

const TABS: { id: Tab; label: string }[] = [{ id: "pot", label: "Pot commun" }, { id: "perso", label: "Mes dépenses" }, { id: "convertir", label: "Convertisseur" }];

export function BudgetPage() {
  const { trip, userId } = useCurrentTrip();
  const travelers = useTravelers(trip.group_id);
  const data = useBudget(trip.id);
  const fx = useFx(trip);
  const toast = useToast();
  const engine = getEngine();
  const [tab, setTab] = useState<Tab>("pot");
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const close = useCallback(() => setDrawer(null), []);
  const today = todayIn(trip.timezone);
  const base = trip.base_currency;

  const computed = useMemo(() => {
    if (!data || !travelers) return null;
    const members = travelers.map((t) => t.id);
    const bal = balances(members, data.expenses, data.settlements);
    return { bal, transfers: settleUp(bal), total: data.expenses.reduce((s, e) => s + e.base_amount_minor, 0) };
  }, [data, travelers]);

  if (!data || !travelers || !computed || fx.known === undefined) return <Spinner />;

  const name = (id: string) => travelers.find((t) => t.id === id)?.display_name ?? "Ancien membre";
  const color = (id: string) => travelers.find((t) => t.id === id)?.color ?? "var(--text-mute)";
  const saved = (msg: string) => toast(navigator.onLine ? msg : `${msg} Enregistré sur l'appareil, envoyé au retour du réseau.`);
  const guard = async (fn: () => Promise<unknown>, msg: string) => {
    try {
      await fn();
      saved(msg);
      return true;
    } catch (e) {
      toast(toMessage(e), "error");
      return false;
    }
  };
  const me = computed.bal.get(userId) ?? 0;
  const current = drawer && (drawer.kind === "expense" || drawer.kind === "expense-form") && drawer.id ? data.expenses.find((e) => e.id === drawer.id) : undefined;
  const currentPersonal = drawer?.kind === "personal-form" && drawer.id ? data.personal.find((p) => p.id === drawer.id) : undefined;
  const mine = data.personal.filter((p) => p.owner_id === userId);
  const title =
    drawer?.kind === "expense" ? (current?.title ?? "Dépense introuvable")
    : drawer?.kind === "expense-form" ? (drawer.id ? "Modifier la dépense" : "Nouvelle dépense commune")
    : drawer?.kind === "personal-form" ? (drawer.id ? "Modifier" : "Nouvelle dépense personnelle")
    : drawer?.kind === "settle" ? "Remboursement effectué" : "";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-3xl font-bold">Budget</h1>
        {tab === "pot" && <Button icon="plus" onClick={() => setDrawer({ kind: "expense-form" })}>Dépense</Button>}
        {tab === "perso" && <Button icon="plus" onClick={() => setDrawer({ kind: "personal-form" })}>Dépense perso</Button>}
      </div>
      <div role="tablist" aria-label="Sections du budget" className="grid grid-cols-3 gap-1 rounded-xl bg-elev p-1">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className={`min-h-10 rounded-lg px-1 text-sm font-semibold ${tab === t.id ? "bg-card text-ink shadow" : "text-dim"}`}>{t.label}</button>
        ))}
      </div>

      {tab === "pot" && (
        data.expenses.length === 0 && data.settlements.length === 0 ? (
          <EmptyState icon="wallet" title="Aucune dépense commune">
            Ajoutez les dépenses partagées (repas, billets, hôtels…) : parts égales, parts, pourcentages ou montants exacts,
            en euros ou en yens. L&apos;app calcule qui doit quoi au centime près.
          </EmptyState>
        ) : (
          <div className="flex flex-col gap-4 xl:grid xl:grid-cols-2 xl:items-start xl:gap-6">
            <div className="flex min-w-0 flex-col gap-4">
            <Card className="flex flex-col gap-3" aria-label="Soldes">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm text-dim">Total du pot commun</span>
                <span className="font-display text-2xl font-bold">{formatMoney(computed.total, base)}</span>
              </div>
              <p className={`text-sm font-semibold ${me > 0 ? "text-teal" : me < 0 ? "text-coral" : "text-dim"}`}>
                {me > 0 ? `On vous doit ${formatMoney(me, base)}` : me < 0 ? `Vous devez ${formatMoney(-me, base)}` : "Vous êtes à jour"}
              </p>
              <ul className="flex flex-col gap-1 border-t border-line pt-3" aria-label="Solde de chaque voyageur">
                {travelers.map((t) => {
                  const b = computed.bal.get(t.id) ?? 0;
                  return (
                    <li key={t.id} className="flex items-center gap-2 text-sm">
                      <span className="grid size-6 place-items-center rounded-full text-[11px] font-bold text-[#0b1020]" style={{ background: t.color }} aria-hidden="true">{t.display_name.slice(0, 1).toUpperCase()}</span>
                      <span className="flex-1">{t.display_name}</span>
                      <span className={`tabular-nums ${b > 0 ? "text-teal" : b < 0 ? "text-coral" : "text-dim"}`}>{b > 0 ? "+" : ""}{formatMoney(b, base)}</span>
                    </li>
                  );
                })}
              </ul>
            </Card>

            <section aria-labelledby="titre-rembours">
              <SectionTitle><span id="titre-rembours">Remboursements suggérés</span></SectionTitle>
              {computed.transfers.length === 0 ? (
                <p className="text-sm text-dim">Tout le monde est à jour.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {computed.transfers.map((t) => (
                    <li key={`${t.from}-${t.to}`} className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-card px-3 py-2">
                      <span className="min-w-0 flex-1 text-sm"><strong>{name(t.from)}</strong> doit <strong className="tabular-nums">{formatMoney(t.amount, base)}</strong> à <strong>{name(t.to)}</strong></span>
                      <Button variant="subtle" onClick={() => setDrawer({ kind: "settle", from: t.from, to: t.to, amount: t.amount })}
                        aria-label={`Marquer le remboursement de ${name(t.from)} à ${name(t.to)} comme effectué`}>Marquer payé</Button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-1 text-xs text-mute">Nombre de virements réduit au minimum.</p>
            </section>

            </div>
            <div className="flex min-w-0 flex-col gap-4">
            <section aria-labelledby="titre-depenses">
              <SectionTitle><span id="titre-depenses">Dépenses</span></SectionTitle>
              <ul className="flex flex-col gap-2">
                {data.expenses.map((e) => <ExpenseRow key={e.id} e={e} base={base} payer={name(e.paid_by)} color={color(e.paid_by)} onOpen={() => setDrawer({ kind: "expense", id: e.id })} />)}
              </ul>
            </section>

            {data.settlements.length > 0 && (
              <section aria-labelledby="titre-faits">
                <SectionTitle><span id="titre-faits">Remboursements effectués</span></SectionTitle>
                <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-card">
                  {data.settlements.map((s) => (
                    <li key={s.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                      <span className="flex-1">{name(s.from_user)} → {name(s.to_user)} · {formatDayShort(s.date)}</span>
                      <span className="tabular-nums">{formatMoney(s.base_amount_minor, base)}</span>
                      <Button variant="ghost" icon="trash" aria-label={`Annuler le remboursement de ${name(s.from_user)} à ${name(s.to_user)}`}
                        onClick={() => guard(() => deleteSettlement(engine, s), "Remboursement annulé.")} />
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
          </div>
        )
      )}

      {tab === "perso" && (
        mine.length === 0 ? (
          <EmptyState icon="bag" title="Aucune dépense personnelle">
            Souvenirs, achats perso… Suivez ici ce qui est à votre charge : rien n&apos;entre dans le pot commun.
          </EmptyState>
        ) : (
          <>
            <Card className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between"><span className="text-sm text-dim">Mes dépenses personnelles</span>
                <span className="font-display text-2xl font-bold">{formatMoney(mine.reduce((s, p) => s + p.base_amount_minor, 0), base)}</span></div>
              <ul className="flex flex-wrap gap-2 text-xs">
                {[...totalsByCategory(mine)].map(([c, v]) => <li key={c}><Badge>{PERSONAL_LABEL[c as PersonalExpense["category"]]} · {formatMoney(v, base)}</Badge></li>)}
              </ul>
            </Card>
            <ul className="flex flex-col gap-2">
              {mine.map((p) => (
                <li key={p.id}>
                  <button onClick={() => setDrawer({ kind: "personal-form", id: p.id })} aria-label={`Modifier « ${p.title} »`}
                    className="flex w-full items-center gap-3 rounded-2xl border border-line bg-card px-3 py-2 text-left hover:bg-elev">
                    <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{p.title}</span>
                      <span className="text-xs text-dim">{PERSONAL_LABEL[p.category]} · {formatDayShort(p.date)}</span></span>
                    <span className="text-right text-sm tabular-nums">{formatMoney(p.amount_minor, p.currency)}
                      {p.currency !== base && <span className="block text-xs text-mute">≈ {formatMoney(p.base_amount_minor, base)}</span>}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )
      )}

      {tab === "convertir" && (
        <Converter trip={trip} known={fx.known} loading={fx.loading} error={fx.error} onRefresh={() => void fx.refresh()}
          onManual={async (rate) => {
            await guard(() => engine.update("trips", trip.id, {
              settings: { ...trip.settings, manual_fx_rate: rate ? { pair: `${base}/${trip.secondary_currency}`, rate, set_at: new Date().toISOString() } : null },
            }), rate ? "Taux manuel appliqué." : "Retour au taux BCE.");
          }} />
      )}

      <Drawer open={drawer !== null} title={title} onClose={close}>
        {drawer?.kind === "expense" && current && (
          <ExpenseDetails e={current} base={base} name={name}
            onEdit={() => setDrawer({ kind: "expense-form", id: current.id })}
            onDelete={async () => { if (await guard(() => deleteExpense(engine, current), "Dépense supprimée.")) close(); }} />
        )}
        {drawer?.kind === "expense-form" && (
          <ExpenseForm key={drawer.id ?? "new"} trip={trip} travelers={travelers} isNew={!drawer.id} known={fx.known}
            initial={initialExpenseForm(trip, travelers, userId, today, fx.known, current)}
            onSubmit={async (patch) => {
              const id = await saveExpense(engine, trip.id, patch, current);
              saved(current ? "Dépense enregistrée." : "Dépense ajoutée.");
              setDrawer({ kind: "expense", id });
            }} />
        )}
        {drawer?.kind === "personal-form" && (
          <>
            <PersonalForm key={drawer.id ?? "new"} trip={trip} isNew={!drawer.id} known={fx.known}
              initial={initialPersonalForm(trip, today, fx.known, currentPersonal)}
              onSubmit={async (patch) => {
                await savePersonal(engine, trip.id, userId, base, patch, currentPersonal);
                saved(currentPersonal ? "Dépense enregistrée." : "Dépense ajoutée.");
                close();
              }} />
            {currentPersonal && (
              <Button variant="danger" icon="trash" className="mt-3" block
                onClick={async () => { if (await guard(() => deletePersonal(engine, currentPersonal, userId), "Dépense supprimée.")) close(); }}>Supprimer</Button>
            )}
          </>
        )}
        {drawer?.kind === "settle" && (
          <SettleForm key={`${drawer.from}-${drawer.to}`} from={name(drawer.from)} to={name(drawer.to)} amount={drawer.amount} base={base} today={today}
            onSubmit={async (amountMinor, date) => {
              if (await guard(() => recordSettlement(engine, trip.id, { from: drawer.from, to: drawer.to, amountMinor, currency: base, date }), "Remboursement enregistré.")) close();
            }} />
        )}
      </Drawer>
    </div>
  );
}

function ExpenseRow({ e, base, payer, color, onOpen }: { e: Expense; base: string; payer: string; color: string; onOpen: () => void }) {
  return (
    <li>
      <button onClick={onOpen} aria-label={`Ouvrir « ${e.title} »`} className="flex w-full items-center gap-3 rounded-2xl border border-line bg-card px-3 py-2 text-left hover:bg-elev">
        <span className="grid size-9 shrink-0 place-items-center rounded-full text-sm font-bold text-[#0b1020]" style={{ background: color }} aria-hidden="true">{payer.slice(0, 1).toUpperCase()}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{e.title}</span>
          <span className="text-xs text-dim">{payer} a payé · {formatDayShort(e.date)} · {EXPENSE_LABEL[e.category]}</span>
        </span>
        <span className="text-right text-sm tabular-nums">{formatMoney(e.amount_minor, e.currency)}
          {e.currency !== base && <span className="block text-xs text-mute">{formatMoney(e.base_amount_minor, base)}</span>}</span>
      </button>
    </li>
  );
}

function ExpenseDetails({ e, base, name, onEdit, onDelete }: { e: Expense; base: string; name: (id: string) => string; onEdit: () => void; onDelete: () => Promise<void> }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="font-display text-3xl font-bold">{formatMoney(e.amount_minor, e.currency)}</p>
        {e.currency !== base && (
          <p className="text-sm text-dim">= {formatMoney(e.base_amount_minor, base)} au taux figé de 1 {e.currency} = {e.fx_rate.toLocaleString("fr-FR", { maximumSignificantDigits: 6 })} {base}</p>
        )}
        <p className="mt-1 text-sm text-dim">Payé par <strong className="text-ink">{name(e.paid_by)}</strong> · {formatDayShort(e.date)} · {EXPENSE_LABEL[e.category]}</p>
      </div>
      <section aria-label="Répartition">
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-dim">Répartition · {SPLIT_LABEL[e.split_mode]}</h3>
        <ul className="divide-y divide-line rounded-xl border border-line">
          {e.shares.map((s) => (
            <li key={s.user_id} className="flex justify-between px-3 py-2 text-sm">
              <span>{name(s.user_id)}{e.split_mode === "shares" ? ` · ${s.weight} part${s.weight > 1 ? "s" : ""}` : e.split_mode === "percent" ? ` · ${s.weight} %` : ""}</span>
              <span className="tabular-nums">{formatMoney(s.base_minor, base)}</span>
            </li>
          ))}
        </ul>
      </section>
      {e.notes && <p className="whitespace-pre-wrap text-sm">{e.notes}</p>}
      <div className="flex flex-wrap gap-2 border-t border-line pt-4">
        <Button variant="ghost" icon="edit" onClick={onEdit}>Modifier</Button>
        {confirm ? <Button variant="danger" icon="trash" onClick={onDelete}>Confirmer la suppression</Button>
          : <Button variant="danger" icon="trash" onClick={() => setConfirm(true)}>Supprimer</Button>}
      </div>
    </div>
  );
}

function SettleForm({ from, to, amount, base, today, onSubmit }: { from: string; to: string; amount: number; base: string; today: string; onSubmit: (amountMinor: number, date: string) => Promise<void> }) {
  const [value, setValue] = useState(minorToInput(amount, base));
  const [date, setDate] = useState(today);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form className="flex flex-col gap-4" noValidate onSubmit={async (e) => {
      e.preventDefault();
      const m = parseAmountToMinor(value, base);
      if (!m) return setError("Montant invalide");
      setBusy(true);
      await onSubmit(m, date);
      setBusy(false);
    }}>
      <FormError message={error} />
      <p className="text-sm"><strong>{from}</strong> a remboursé <strong>{to}</strong>.</p>
      <Field label={`Montant (${base})`} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} hint="Un remboursement partiel est possible." />
      <Field label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <Button type="submit" loading={busy} block>Enregistrer le remboursement</Button>
    </form>
  );
}
