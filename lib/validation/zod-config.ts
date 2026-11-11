import { z } from "zod";

// zod sonde `new Function` pour accélérer ses validations : la politique de sécurité (sans eval) le
// bloque et le navigateur le signale. Mode sans eval explicite : même résultat, aucune alerte.
z.config({ jitless: true });
