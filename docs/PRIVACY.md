# Privacy and permissions

The user-facing policy is [src/help/privacy.html](../src/help/privacy.html), accessible from Help & privacy inside Upkopp. Before publication, add the public support contact and host an accessible HTTPS copy. A local extension URL cannot serve as the public store privacy URL.

Upkopp handles website content and current-page URLs locally. Local processing still needs disclosure; do not claim the extension handles no user data. There is no developer-operated data endpoint, analytics, advertising, or account system.

| Permission | Current user-facing purpose |
| --- | --- |
| `activeTab` | Read the page selected through the toolbar action. |
| `scripting` | Run packaged page readers and map interactions on demand. |
| `sidePanel` | Open the user-requested persistent workspace. |
| `storage` | Store local preferences and temporary capture/export state. |
| `downloads` | Save exports and observe completion or failure. |
| `offscreen` | Hold the local ZIP Blob during download independently of the popup. |
| `webNavigation` | Enumerate embedded documents for Page map. |
| Optional HTTP/HTTPS origins | Read a selected embedded page or download images after origin-specific permission is granted. |

No blanket host access is granted at installation. No automatically declared content scripts, remote fonts, or remote executable scripts are included.

Indexability requests the current site's HTML and robots.txt with its session where applicable. Previews load original image resources. ZIP fetches request permitted origins without cookies or referrers and reject redirects. Scrolling can cause the source website to load more resources. Original hosts can see ordinary request metadata.

Captures and export progress use session storage; settings use local storage. In-memory maps and overviews are temporary. Uninstalling removes extension storage, but downloaded files remain until the user deletes them.

Before submitting, review dashboard categories against [Google's local-data guidance](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq) and [privacy fields documentation](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy). Describe website content and page URL handling at minimum. Never select “no data handled” merely because there is no backend.
