/**
 * Invitation-only account entry.
 *
 * Public self-registration is intentionally disabled. Companies are created by
 * Super Admin and company users are invited/managed by their Company Admin.
 * Keeping this route as a redirect prevents stale bookmarks from exposing an
 * unsupported signup form or implying that callers can choose their own role.
 */
import { redirect } from 'next/navigation';

/** Redirects stale public-signup links to the authenticated entry point. */
export default function SignUpPage() {
  redirect('/login');
}
