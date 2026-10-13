// Open a server-rendered document in a new tab.
//
// Printable documents (proforma, deposit bill, the statement layout preview)
// are fetched with the session token - a plain link could not carry the
// Authorization header - so the response is wrapped in a Blob URL and opened
// in a new tab. The URL is revoked a minute later: long enough for the tab to
// load, short enough not to pin the document in memory for the session.
export function openBlobInNewTab(content: string | Blob, type = 'text/html'): void {
  const blob = typeof content === 'string' ? new Blob([content], { type }) : content;
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
