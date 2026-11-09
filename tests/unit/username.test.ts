import { describe, expect, it } from "vitest";
import { emailToUsername, normalizeUsername, usernameToEmail } from "@/lib/auth/username";
import * as scriptImpl from "../../scripts/lib/username.mjs";

const samples = ["Thomas", "  Chloé ", "Jean Luc", "élodie.b", "x", "a", "TOM_2", "-bad", "émile@x", "très très très long nom d'utilisateur!", "ab"];

describe("nom d'utilisateur", () => {
  it("normalise : minuscules, sans accents, espaces → tirets", () => {
    expect(normalizeUsername("Thomas")).toBe("thomas");
    expect(normalizeUsername("  Chloé ")).toBe("chloe");
    expect(normalizeUsername("Jean Luc")).toBe("jean-luc");
    expect(normalizeUsername("TOM_2")).toBe("tom_2");
  });
  it("refuse les noms inutilisables", () => {
    for (const bad of ["x", "", "-bad", "émile@x", "a".repeat(40), "nom/avec/slash"]) expect(normalizeUsername(bad)).toBeNull();
  });
  it("adresse interne sur le domaine réservé .invalid, jamais affichée", () => {
    expect(usernameToEmail("Chloé")).toBe("chloe@japan-trip.invalid");
    expect(emailToUsername("chloe@japan-trip.invalid")).toBe("chloe");
    expect(emailToUsername("autre@exemple.fr")).toBe("autre@exemple.fr");
  });
  it("le script de gestion des comptes applique exactement la même règle", () => {
    for (const s of samples) {
      expect(scriptImpl.normalizeUsername(s)).toBe(normalizeUsername(s));
      expect(scriptImpl.usernameToEmail(s)).toBe(usernameToEmail(s));
    }
  });
});
