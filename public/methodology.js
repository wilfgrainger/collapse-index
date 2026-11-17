/** Fills the methodology page's live gate values; the page reads fully without it. */

import { el, text, percent, fetchJson } from "./lib.js";

const result = await fetchJson("/api/v1/current");
const gates = result.body?.publication?.gates;
if (result.ok && gates) {
  text(el("gate-availability"), percent(gates.availableWeight));
  text(el("gate-confidence"), percent(gates.confidence));
  const { indicatorsAvailable, indicatorsTotal } = result.body.coverage;
  text(
    el("method-coverage"),
    `${indicatorsAvailable} of ${indicatorsTotal} indicators are collected, covering ${percent(gates.availableWeight)} of fixed weight ` +
      `against a ${percent(gates.minAvailableWeight)} gate. ` +
      (result.body.publication.status === "suppressed"
        ? "Until the gates are met, the site shows what has been measured and what has not, and withholds the single number."
        : "Both gates currently pass.")
  );
}
