import { Share } from "lucide-react";

/**
 * install-steps (Web Push, docs/web-push-plan.md §3.4): how to add Topic to
 * an iPhone or iPad Home Screen, which Apple requires before alerts can
 * work there. ONE component, so the alerts line on the Notifications page
 * and step 6's "Get Notifications" sidebar link give the same explanation.
 * The Home Screen app keeps its own sign-in (installable-app), so the
 * steps say to sign in there.
 */
export function InstallSteps() {
  return (
    <div className="install-steps">
      <p>
        On iPhone and iPad, alerts work only in Topic added to your Home Screen:
      </p>
      <ol>
        <li>
          Tap Share{" "}
          <Share className="install-steps-icon" size={14} aria-hidden />, then{" "}
          <b>Add to Home Screen</b>.
        </li>
        <li>Open Topic from its new icon.</li>
        <li>Sign in there — the Home Screen app keeps its own sign-in.</li>
        <li>Turn alerts on from this forum&rsquo;s Notifications page.</li>
      </ol>
    </div>
  );
}
