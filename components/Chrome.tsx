// Authlete site chrome — the branded header and footer, matching makeclient.dev.

/** The official Authlete logo, composed from the shield + wordmark SVGs. */
function AuthleteLogo({ variant }: { variant: "header" | "footer" }) {
  const p = variant === "header" ? "hdr" : "ftr";
  return (
    <span className={`authlete-logo authlete-logo--${variant}`} aria-label="Authlete">
      <span className="al-shield">
        <img src={`/authlete/${p}-shield.svg`} alt="" />
      </span>
      <span className="al-wordmark">
        <img src={`/authlete/${p}-wordmark.svg`} alt="" />
      </span>
    </span>
  );
}

export function SiteHeader() {
  return (
    <header className="flex items-center justify-between border-b border-line bg-base px-5 py-3 md:px-10">
      <div className="flex items-center gap-3">
        <AuthleteLogo variant="header" />
        <span className="text-[20px] leading-8 text-muted">/</span>
        <span className="flex items-center gap-2">
          <span className="font-mono text-[16px] font-medium text-ink">poppy</span>
          <span className="rounded-sm bg-surface-2 px-2 font-mono text-[14px] text-ink">
            PLAYGROUND
          </span>
        </span>
      </div>
      <a
        className="rounded-md bg-primary px-3 py-1.5 text-[14px] font-medium text-primary-ink hover:opacity-90"
        href="https://console.authlete.com/register"
        target="_blank"
        rel="noreferrer"
      >
        Try Authlete free
      </a>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-line-2 bg-base">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-5 md:px-6">
        <AuthleteLogo variant="footer" />
        <p className="text-[14px] text-muted">© 2026 Authlete, Inc. All rights reserved.</p>
        <p className="text-[14px] text-ink-2">English</p>
      </div>
    </footer>
  );
}
