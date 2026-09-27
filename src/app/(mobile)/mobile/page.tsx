/**
 * `/mobile` - the explicit phone URL.
 *
 * It renders the SAME home screen as `/` (re-exported, so there is one implementation
 * of that screen), and `WideScreenRedirect` marks the tab as having CHOSEN the phone
 * layout when it sees this path - which is what stops a wide viewport from being sent
 * to the desktop client from here, and from any in-app link back to `/`.
 */
export { default } from "../page";
