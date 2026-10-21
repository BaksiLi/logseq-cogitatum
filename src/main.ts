import "@logseq/libs";
import viewStyle from "@cogitatum/view/style.css";
import logseqStyle from "./logseq.css";
import { registerCogitatum } from "./register.js";

logseq.ready(() => {
  const status = registerCogitatum(logseq, `${viewStyle}\n${logseqStyle}`);
  if (status.unsupported.length) console.warn("[cogitatum] Logseq host lacks:", status.unsupported.join(", "));
  console.info("[cogitatum] Reading registered", status);
}).catch(console.error);
