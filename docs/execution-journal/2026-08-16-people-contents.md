# 2026-08-16 — a real table of contents on People

Ed:

> The people page will have potentially a lot of people on it - instead of
> just links to the start of each role section, it should have a proper
> table of contents that lists every person, grouped by role, in the order
> they appear on the page … maybe the table of contents can have avatar
> pictures too

The old nav was three pills — Admins, Hosts, Electors — which told you
where the sections started and nothing else. On a forum with sixty people
that is barely navigation at all.

`PeopleContents` now lists every person under their role, in the same
order the sections below use (primary role, then name). The role heading
stays a link to its section, so the old behaviour survives inside the new
one; each name jumps to that person's own card, which carries an
`id="person-<userId>"` anchor and the same 80px scroll margin the sections
already had. Each entry wears a small avatar — a face is faster to find in
a list than a name.

Layout is one column per role, flexing to a single stack when there isn't
room; names truncate with an ellipsis rather than wrapping, so the
contents scan as one row per person.

It appears once there are more than three people. Below that the page is
its own contents, and a list of three names above three cards is just the
page twice.
