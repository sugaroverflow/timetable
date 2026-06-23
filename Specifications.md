# **Timetable**

An application to help groups of people make collaborative timetables.

Produced by Sparkle Bureaucracy???

# **Features**

* Users can create and recover accounts via magic link (v1). Google/Microsoft SSO is added in a later release (via Clerk).
* A **user** is a global account (one email, one profile). **Roles are tied to individual timetables**, not to the user globally. A user may access many timetables — ones they created or were invited to — and may hold **different roles in different timetables** (e.g. admin in Timetable A, elector only in Timetable B).
* Users can switch between timetables they belong to.
* Users can create a new timetable; the creator receives the owner (and admin) role **for that timetable only**.
* Timetables can be given a custom domain (e.g. timetable.2026.newspeak.house)
* Admins can invite users (paste a list of emails) to **their timetable** and give and remove roles (admin, host, elector) **within that timetable**. Users sign up separately first; an invite grants membership once the user already has an account.
* A host is someone that can propose topics **in a timetable where they have the host role**. An elector is someone that can ❤️ and comment on topics **in a timetable where they have the elector role**. Within the same timetable, a user can be both host and elector at once.
* Users can edit their profile (name, picture, text description “about”)

* For electors, there are two main activities in this app, Topic Feed and Availability Calendar.
* On the Topic Feed, electors see topics submitted by hosts and can ❤️ and comment on them.
* On the Availability Calendar, electors can share their availability for timeslots with hosts.

## **Topic Feed**

* Hosts have a dashboard where they can draft, submit, and edit **topics**, which are small markdown documents (title, body, (image?)). Hosts can unpublish topics.
* Submitted topics go into a moderation queue, where they can published / edited by Admins.
* Electors can see all topics in a feed, and ❤️ and comment on them. (threaded comments, looks like facebook basically). (ordered randomly / by activity? infinite scroll that loops?)
* On their dashboard, hosts can see the activity across all topics (can filter by host), and also the activity of individual electors (can filter by host).
* Hosts are notified (daily email digest) of new activity on their topics and replies to their comments.
* Electors are notified (daily email digest) of new topics, and replies to their comments.
* Admins can unpublish topics and hide comments, and see a timeline of all actions (admin comments on log).
* Admins can archive hearts?

Topic Feed “wireframe”

**Filter: Everything / Hannah’s**
**Order by: hearts / latest comments / unread / date published**

**Cryptocurrencies**
Lorem ipsum Lorem ipsum Lorem ipsum Lorem ipsum Lorem ipsum Lorem ipsum Lorem ipsum Lorem ipsum Lorem ipsum Lorem ipsum Lorem ipsum Lorem ipsum Lorem ipsum Lorem ipsum

**\> Hearts (only hosts can see these)**
0.33/18❤️s			(18 \= total number of electors)
1/4❤️		Nick
1/22❤️ 	Emily
1/50❤️	Tuna
1/160❤️	Fatima

**\> Comments (everyone can see these)**
Fatima: THIS LOOKS AWESOME
Nick: not sure
Alexandra: I know about this

**\> Hosts comments (only hosts can see these)**
Hannah: I’d like help with this
Ed: let’s chat about it\!

**Campaigning**
Lorem ipsum Lorem ipsum Lorem ipsum Lorem ipsum Lorem ipsum Lorem ipsum Lorem ipsum Lorem ipsum Lorem ipsum Lorem ipsum Lorem ipsum Lorem ipsum Lorem ipsum Lorem ipsum Lorem ipsum Lorem ipsum Lorem ipsum Lorem ipsum Lorem ipsum Lorem ipsum

**\> Hearts (only hosts can see these)**
0.0003/18❤️s			(18 \= total number of electors)
1/160❤️	Fatima

**\> Comments (everyone can see these)**
Fatima: THIS LOOKS AWESOME
Emily: can you explain what this is about?
Hannah: we’ll think about some historical campaigns and what they can tell us about tech

**\> Hosts comments (only hosts can see these)**

## **Calendar**

* Admins can create timeslots (date, start time, end time, location) for a timetable.
* Electors can mark their availability for each slot (🔴🟡🟢) (default is 🟡).
* For both there are nice tools for creating repeating patterns (e.g. every thursday is 🔴), and perhaps calendar sync.
* Hosts can see a list of all (upcoming) timeslots with availability of electors (all, per topic, per host) for each
  * e.g.
    * show me the availability of all electors
    * show me the availability of all electors that have ❤️’d my topics
    * show me the availability of all electors that have ❤️’d one of my topics
* Hosts can comment on timeslots.

  Users that have ❤️’d Hannah’s topics / Cryptocurrencies

**\[Location filter \= Classroom, hall, lounge, terrace\]**
📅Mon 3 Oct ‘26				🟢🟢🟢🟢🟢🟢🟢🟡🟡🟡🟡🟡🔴🔴
	*Hannah: I’d like to book this one for my crypto class (cryptocurrencies: 10🟢 5🟡)*
	*Six: I also want to run a session now (six: 3🟢)*
	*Hannah: Okay I’ll do it next week*
	*Ed (admin): Which topic do you want to do your session on, six?*
	*Six: introduction to yoga*
	*Ed (admin): I’ll make an event page*
	*Ed (admin): [luma.com/123alksjajlalskjjd](http://luma.com/123alksjajlalskjjd)*
	*Ed (admin) tags \[timeslot: Mon 3 Oct ‘26\] with \[topic: yoga\] (which is shown in topic comments)*

📅Tue 4 Oct ‘26				🟢🟢🟢🟢🟢🟡🟡🔴🔴🔴🔴🔴🔴🔴
	*Six: I want to run something totally random (no filter)*
	*Ed (admin): ok\!*

📅Wed 5 Oct ‘26				🟢🟡🟡🟡🟡🟡🟡🟡🟡🟡🟡🟡🟡🔴
📅Thu 6 Oct ‘26				🟢🟢🟢🟢🟢🟡🟡🟡🟡🟡🟡🟡🔴🔴
📅Fri 7 Oct ‘26				🟢🟢🟢🟡🟡🟡🟡🟡🔴🔴🔴🔴🔴🔴

Availability of all electors
**^ Classroom**
📅Mon 3 Oct ‘26				🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟡🟡🔴🔴🔴🔴🔴
📅Tue 4 Oct ‘26				🟢🟢🟢🟢🟢🟡🟡🟡🟡🟡🟡🟡🟡🟡🟡🔴🔴
📅Wed 5 Oct ‘26				🟢🟡🟡🟡🟡🟡🟡🟡🟡🟡🟡🔴🔴🔴🔴🔴🔴
📅Thu 6 Oct ‘26				🟢🟢🟢🟡🟡🟡🟡🟡🟡🟡🟡🟡🟡🟡🟡🟡🟡
📅Fri 7 Oct ‘26				🟢🟢🟢🟢🟢🟢🟢🟢🟢🟡🟡🟡🟡🟡🔴🔴🔴
	Six: I think the room is free, I want to nap in it
	Ed: sorry it’s not free

Users that have ❤️’d Six’s topics / Campaigning
**Classroom**
📅Mon 3 Oct ‘26	🟢
📅Tue 4 Oct ‘26
📅Wed 5 Oct ‘26
📅Thu 6 Oct ‘26	🟢
📅Fri 7 Oct ‘26	🟡

---

# **Screens**

Not-logged in
User account creation

Users
Switch timetable (list of timetables the user belongs to)
User digest settings

Admins
	Timetable Settings
	Timetable Profile (name, description, cover image)
	Timetable is Deactivated (only admins can see it) / Private (only members can see it) / Public (anyone can read the topic feed and comments without logging in; hearts and posting require login)
	Custom Domain
	Default digest settings
	Custom role names (e.g. Admin \= dean, Host \= faculty, elector \= fellowship candidate)
Set User roles

Topic moderation queue
	Hosts Topic Feed (includes private host comments) (ordered by hearts / publish date / latest / random / etc)
	Availability Calendar
		Can filter by host/topic
		Host chat
	Activity timeline
		Activity comments
		Filter by user

Hosts
	Hosts Topic Feed (includes private host comments) (ordered by hearts / etc)
		Filter by host
Filter by elector
(if a user is a host AND and elector, how do you choose which you want to see?)
(ordered by hearts / publish date / latest / random / etc)
	Draft/submitted/published/unpublished topics
		Has admin comments
	Availability Calendar
		Can filter by host/topic
		Host chat

Electors
	Electors Topic Feed
		Can comment
		(ordered by hearts / publish date / latest / random / etc)
	Provide Availability on Availability Calendar

Emails

# **Entities**

**👤 User** (name, description, pic, email, notification settings) — one global identity per person.

**🔗 Timetable membership** (user, timetable, roles[]) — joins users to timetables. Roles (owner, admin, host, elector) live here, not on the user record. A user has one membership row per timetable they belong to.

**🏫 Timetable** (name, description, slots, topics, members, public/private/deactivated, custom domain, settings)

**📘 Topic** (name, host(s?), description, creation date, status: draft (only visible to host(s)), submitted, published, unpublished, archived (can no longer be voted on))

**📅 Timeslot** (start datetime, end datetime, location)
(there will be potentially a lot of these so need good ways to make preset slots / sets of slots)

**❤️ Heart** (elector, topic, created_at) — weighted: each elector’s heart on a topic is worth `1 / (number of published topics they have hearted)`.

## **Roles**

Roles are **scoped to a timetable** via membership. The same person can be an admin in one timetable and an elector in another.

**Owner** (per timetable: can unpublish/freeze that timetable, grant and remove admin privileges; is an admin in that timetable)
**Admin** (per timetable)
**Host** (per timetable)
**Elector** (per timetable)

Maybe you can choose your own names for these roles when you create a timetable (e.g. host = faculty, elector = fellowship candidate)

# **Interfaces**

Dashboard
	Slots
	Topics
	Votes cast by time
	Un-allocated topics by votes/random/creation date
	Votes cast for a topic
	Votes cast for a host
	Votes cast by an elector
	Attendance
	Hosts can see the votes cast for their topics in available slots
	Hosts by total votes over time


	Normalise by number of votes cast per elector?
	E.g. if they vote for two things, each is worth 0.5, if ten things, each is worth 0.1, etc.

Availability
	Calendar sync?
	Week patterns? (available mondays and fridays, maybe tuesdays, never sundays)

Notifications
	Email
	Whatsapp
	Matrix
	webhook?

Something happens when multiple topics are assigned to the same slot
	Email both hosts
	Alert electors based on availability to confirm?

