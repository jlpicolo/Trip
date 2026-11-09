#!/usr/bin/env node
/**
 * Gestion des comptes par le propriétaire du service (pas de compte « admin » dans l'app :
 * ce script s'exécute sur l'ordinateur du propriétaire, avec la clé secrète de .env.local).
 * Les voyageurs se connectent avec un NOM D'UTILISATEUR, sans email.
 *
 *   npm run travelers -- list
 *   npm run travelers -- create <nom> [--affiche "Prénom"] [--group <id-du-groupe>] [--password <mdp>]
 *   npm run travelers -- password <nom> [--password <mdp>]
 *   npm run travelers -- add-to-group <nom> <id-du-groupe>
 *   npm run travelers -- delete <nom>
 *
 * <nom> : 2 à 32 caractères, accents et majuscules convertis (« Chloé » → chloe).
 * Sans --password, un mot de passe aléatoire lisible est généré et affiché une seule fois.
 */
import { createClient } from "@supabase/supabase-js";
import { randomInt } from "node:crypto";
import { readFileSync } from "node:fs";
import { emailToUsername, normalizeUsername, usernameToEmail } from "./lib/username.mjs";

try {
  for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
} catch {
  // variables fournies par l'environnement
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) {
  console.error("NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SECRET_KEY sont requis (.env.local).");
  process.exit(1);
}
const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });

const [, , command, ...rest] = process.argv;
const flags = {};
const args = [];
for (let i = 0; i < rest.length; i++) {
  if (rest[i].startsWith("--")) flags[rest[i].slice(2)] = rest[++i];
  else args.push(rest[i]);
}

// Sans caractères ambigus (0/O, 1/l/I) : le mot de passe sera dicté ou recopié.
function generatePassword() {
  const alphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const block = () => Array.from({ length: 4 }, () => alphabet[randomInt(alphabet.length)]).join("");
  return `${block()}-${block()}-${block()}`;
}

function checkPassword(p) {
  if (p.length < 10) throw new Error("Mot de passe trop court (10 caractères minimum).");
  return p;
}

function toEmail(name) {
  const email = usernameToEmail(name ?? "");
  if (!email) throw new Error(`Nom d'utilisateur invalide : « ${name ?? ""} » (2 à 32 lettres, chiffres, . _ -)`);
  return email;
}

async function findUser(name) {
  const target = toEmail(name);
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === target);
    if (hit) return hit;
    if (data.users.length < 200) return null;
  }
}

async function addToGroup(userId, groupId) {
  const { data: group, error } = await admin.from("travel_groups").select("id,name").eq("id", groupId).maybeSingle();
  if (error) throw error;
  if (!group) throw new Error(`Groupe introuvable : ${groupId}`);
  const { error: insErr } = await admin.from("group_members").upsert({ group_id: groupId, user_id: userId }, { onConflict: "group_id,user_id", ignoreDuplicates: true });
  if (insErr) throw insErr;
  return group.name;
}

async function main() {
  switch (command) {
    case "list": {
      const { data, error } = await admin.auth.admin.listUsers({ perPage: 200 });
      if (error) throw error;
      const { data: profiles } = await admin.from("profiles").select("id,display_name");
      const { data: members } = await admin.from("group_members").select("user_id,group_id");
      const { data: groups } = await admin.from("travel_groups").select("id,name");
      const { data: trips } = await admin.from("trips").select("group_id,name").is("deleted_at", null);
      for (const u of data.users) {
        const name = profiles?.find((p) => p.id === u.id)?.display_name ?? "";
        const gs = (members ?? []).filter((m) => m.user_id === u.id).map((m) => {
          const g = groups?.find((x) => x.id === m.group_id);
          const t = (trips ?? []).filter((x) => x.group_id === m.group_id).map((x) => x.name).join(", ");
          return `${g?.name ?? m.group_id} [${m.group_id}]${t ? ` — voyages : ${t}` : ""}`;
        });
        console.log(`${emailToUsername(u.email)}  ·  ${name}\n    ${gs.length ? gs.join("\n    ") : "(aucun groupe)"}`);
      }
      if (data.users.length === 0) console.log("Aucun compte.");
      return;
    }
    case "create": {
      const [raw] = args;
      if (!raw) throw new Error('Usage : create <nom> [--affiche "Prénom"] [--group <id>] [--password <mdp>]');
      const email = toEmail(raw);
      const display = flags.affiche ?? raw.trim().replace(/^./, (c) => c.toUpperCase());
      const password = checkPassword(flags.password ?? generatePassword());
      const { data, error } = await admin.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { display_name: display },
      });
      if (error) throw new Error(/already been registered|already exists/i.test(error.message) ? `Le nom « ${normalizeUsername(raw)} » est déjà pris.` : error.message);
      console.log(`Compte créé — nom d'utilisateur : ${normalizeUsername(raw)} (affiché « ${display} »)`);
      if (flags.group) console.log(`Ajouté au groupe « ${await addToGroup(data.user.id, flags.group)} »`);
      console.log(`Mot de passe : ${password}\n→ À transmettre au voyageur ; il pourra le changer dans Paramètres › Compte.`);
      return;
    }
    case "password": {
      const [name] = args;
      const user = await findUser(name);
      if (!user) throw new Error(`Compte introuvable : ${name}`);
      const password = checkPassword(flags.password ?? generatePassword());
      const { error } = await admin.auth.admin.updateUserById(user.id, { password });
      if (error) throw error;
      console.log(`Nouveau mot de passe pour ${emailToUsername(user.email)} : ${password}`);
      return;
    }
    case "add-to-group": {
      const [name, groupId] = args;
      if (!groupId) throw new Error("Usage : add-to-group <nom> <id-du-groupe>");
      const user = await findUser(name);
      if (!user) throw new Error(`Compte introuvable : ${name}`);
      console.log(`${emailToUsername(user.email)} ajouté au groupe « ${await addToGroup(user.id, groupId)} »`);
      return;
    }
    case "delete": {
      const [name] = args;
      const user = await findUser(name);
      if (!user) throw new Error(`Compte introuvable : ${name}`);
      const { error } = await admin.auth.admin.deleteUser(user.id);
      if (error) throw error;
      console.log(`Compte supprimé : ${emailToUsername(user.email)}`);
      return;
    }
    default:
      console.log(readFileSync(new URL(import.meta.url), "utf8").split("*/")[0].replace("/**", "").replace(/^ \* ?/gm, ""));
  }
}

main().catch((e) => {
  console.error(`Erreur : ${e.message}`);
  process.exit(1);
});
