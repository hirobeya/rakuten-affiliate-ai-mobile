# Auth Console read-only inspection — 2026-10-31 JST

Authenticated Supabase dashboard access was established through the user-selected GitHub sign-in method. This is administrator Console authentication, not Urenavi application login. No credential values were read, logged or stored.

Project: upooxcugrplfmjnqpuxs / ウレナビ. Existing main Production project viewed read-only.

Directly observed:
- Site URL: https://rakuten-affiliate-ai-mobile.vercel.app/
- Four Redirect URLs: the Production root, Production /app.html, the existing git-auth-sessi Preview /app.html, and https://*-hirobeya-6572.vercel.app/**.
- Current recovery Preview /app.html matches the displayed wildcard under official dot/slash separator semantics. No additional allowlist entry is needed for this URL.
- Magic link or OTP uses the provider default template. Subject: Your sign-in link. The preview Sign in href is {{ .ConfirmationURL }}. No hardcoded Google or Production destination was observed in that link.
- UI says custom SMTP is required to edit templates and default templates are sent. No SMTP configuration or credential page was opened.
- Rate Limits describes email send limit as project-wide emails/hour. Its numeric value was redacted by the browser tool and is therefore not reported as a confirmed number. The per-user minimum interval UI shows 60 seconds and explicitly says it applies only with Custom SMTP. Do not mistake the app's resend countdown for project-wide quota reset.

No Save changes, Add URL, switch, template edit, SMTP configuration, API key view, user change or Auth configuration mutation was performed. No email resend, application OTP verification, real search, Blob write or Groq inference was performed in this inspection. Existing code and test pass evidence remains unchanged.

Conclusion: configuration inspection is now complete for visible Site URL/allowlist/default template; missing Preview allowlist and a hardcoded Google link are not supported by the observed configuration. Invalid/expired provider link errors and browser-origin/session continuity remain distinct from the administrator Console login. No Urenavi application authentication pass is claimed.
