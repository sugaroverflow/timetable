# "Saved" buttons stop latching (Ed, 2026-08-21)

Ed, on the profile page: after saving, the button reads "Saved" and never
goes back, so there's no invitation to save a further edit.

Every Save button in the web app carried the same shape - a `saved`
boolean set true in the mutation's `onSuccess` and cleared only at the
*start of the next submit*. Nothing was actually disabled, so a second
save would have worked; the label just said "Saved" for the rest of the
visit, which reads as "nothing to do here". Client state shadowing server
state is the usual trap: `useGqlAction` calls `router.refresh()`, so the
saved *data* re-renders correctly (the avatar updates, the name updates)
while the form's own `useState` keeps its stale opinion about the button.

The fix reframes what "Saved" **means**: not a flag someone must remember
to reset, but a fact about the current field values. `useSavedSnapshot`
(`apps/web/src/lib/useSavedSnapshot.ts`) takes whatever the form would
send, remembers the values that were last successfully saved, and reports
`saved` only while the two still match. The first further keystroke puts
"Save ..." back; undoing an edit honestly says "Saved" again. `markSaved`
closes over the values as they stood at submit time, so anything typed
while the request is in flight correctly stays unsaved.

Rejected: a two-second "Saved" flash on a timer. It throws the
confirmation away even when nothing has changed, leaving "Save profile" on
a form with nothing to save.

Seven forms moved onto the hook - `ProfileForm` (the reported one, fixed
inline first in #326), `DigestSettingsForm`, `EmailDigestForm`,
`HostCommentsForm`, `SettingsForm` (theme - its Discard button no longer
resets the flag by hand, since reverting to the initial values simply
stops matching what was saved), `TimetableProfileForm`, and
`MemberRolesEditor`, which was the only one already clearing its flag on
edit and now shares the one implementation.

The rule of the house: a "Saved" label is derived from the form's current
values - never a boolean latched in `onSuccess`.
