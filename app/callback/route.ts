import { buildAgent, completeFlow } from "@/lib/agent";
import { readSession, sessionCookie, RecordStore } from "@/lib/session";
import { Wire } from "@/lib/wire";
import { CALLBACK_KEY, CALLBACK_TYPE } from "@/lib/signin";

// Direct Sign-In lands here (in the sign-in tab) with ?code&state&iss. Finish the exchange against this
// browser's session, persist the new tokens to the cookie, then report back to the main tab — including
// the authorization code and the wire of the exchange (the PAR/token calls), so the main tab shows the
// full flow — and close.
export async function GET(req: Request) {
  const session = await readSession(req);
  const wire = new Wire();
  const agent = await buildAgent(new RecordStore(session.store), session, wire);
  const code = new URL(req.url).searchParams.get("code") ?? undefined;

  let ok = true;
  let message = "";
  try {
    await completeFlow(agent, session, req.url);
  } catch (err) {
    ok = false;
    message = err instanceof Error ? err.message : String(err);
  }
  await wire.settle();

  const result = JSON.stringify({
    type: CALLBACK_TYPE,
    ok,
    message,
    code,
    wire: wire.entries,
  }).replace(/</g, "\\u003c");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Sign-in</title></head>
<body style="font:14px system-ui,sans-serif;color:#4d4d4d;padding:28px">
<p>${ok ? "Signed in. You can close this tab." : "Sign-in failed: " + escapeHtml(message)}</p>
<script>
  var r = ${result};
  try { if (window.opener) window.opener.postMessage(r, location.origin); } catch (e) {}
  try { localStorage.setItem(${JSON.stringify(CALLBACK_KEY)}, JSON.stringify(Object.assign({ t: Date.now() }, r))); } catch (e) {}
  try { window.close(); } catch (e) {}
</script>
</body></html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "Set-Cookie": await sessionCookie(session),
    },
  });
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!,
  );
}
