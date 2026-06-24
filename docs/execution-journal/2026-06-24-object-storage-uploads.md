## 2026-06-24T19:03:39Z - Object Storage Uploads

### Goal

Continue issue #8 by implementing object-storage-backed media uploads for the
existing profile image, topic cover, and timetable cover URL fields.

### Changes

- Added an authenticated `POST /api/uploads` REST endpoint that returns
  short-lived signed PUT URLs for S3-compatible image uploads.
- Added S3-compatible storage signing with DigitalOcean Spaces defaults,
  optional key prefixes, optional public base URLs, path-style mode, a 5 MB
  default limit, and PNG/JPEG/WebP/GIF/AVIF validation.
- Scoped profile uploads under user keys and topic/timetable cover uploads under
  timetable keys.
- Wired upload-capable image fields into profile settings, topic creation, topic
  editing, and timetable settings while preserving manual URL entry.
- Added upload previews and upload-pending states so forms cannot save while a
  selected file is still uploading.
- Updated deployment specs, env examples, README, product docs, roadmap, and API
  integration coverage for the upload path.
- Updated the live DigitalOcean App Platform dev and production API env values
  with `doctl apps update`: both use `SPACES_BUCKET=timetable`, with dev using
  `uploads/dev` and production using `uploads/production`.
- Added `scripts/configure-spaces-cors.sh` to make the DigitalOcean Spaces CORS
  setup reproducible without hand-writing XML or using unsupported AWS CLI CORS
  operations.
- After first-time Spaces credentials were added in the DigitalOcean console,
  patched the dev App Platform API env back to include `SPACES_ENDPOINT`,
  `SPACES_REGION`, `SPACES_BUCKET`, and `SPACES_KEY_PREFIX` while preserving the
  newly added `SPACES_KEY` and `SPACES_SECRET`.

### Decisions

The implementation uses signed direct browser PUTs instead of proxying binary
bytes through the API. The API authorizes the signing request, validates declared
image metadata, signs the `public-read` ACL header, and returns the public URL
that existing GraphQL mutations persist.

The hosted setup should use one Spaces bucket for dev and production, isolated
by environment-specific `SPACES_KEY_PREFIX` values (`uploads/dev` and
`uploads/production`). Separate buckets are deferred unless stronger operational
isolation or retention policies become necessary.

### Tradeoffs

The API does not resize, optimize, virus-scan, or delete replaced media objects.
Upload size is validated before signing, but final byte enforcement is delegated
to the storage provider for the signed PUT.

### Risks

- Hosted buckets need CORS allowing `PUT` with `Content-Type` and `x-amz-acl`
  from the web origins. The operator reported the shared bucket CORS setup
  succeeded locally with `s3cmd`; a hosted upload smoke test is still pending.
- The installed `doctl` can manage Spaces keys but not bucket CORS, and
  `aws s3api put-bucket-cors` returned `NotImplemented` from DigitalOcean in
  this environment. Use the helper script or the DigitalOcean console CORS UI.
- `SPACES_PUBLIC_BASE_URL` or bucket public-read behavior must be configured so
  returned image URLs render in the app.
- Orphaned objects can remain if a user uploads an image but never saves the
  form, or later replaces an image URL.
- If the Spaces key is created or rotated, the relevant App Platform API
  components need `SPACES_KEY` and `SPACES_SECRET` values before uploads can
  work.

### Verification

- `npm run test --workspace @timetable/api` passed with elevated local bind
  permission.
- `npm run test` passed with elevated local bind permission.
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run build` passed.
- `npm run test:e2e` passed with elevated local bind permission.
- `doctl apps propose` accepted the generated dev and production App Platform
  specs.
- `doctl apps update --wait` completed for `timetable-dev` and `timetable`.
- DigitalOcean API verification confirmed both live apps use the shared
  `timetable` bucket with distinct key prefixes.
- User reported the local `s3cmd setcors` CORS configuration command succeeded
  after correcting the Spaces key export.
- DigitalOcean API verification confirmed hosted dev has all required
  `SPACES_*` values present after the first-time key setup.
- Hosted dev `/health` and `POST /graphql` smoke checks returned `ok: true` and
  `{"data":{"__typename":"Query"}}` after the dev env patch.

### Demo Impact

Admins and hosts can now demonstrate uploading real profile and cover imagery
instead of pasting externally hosted URLs, provided the target environment has
Spaces credentials and bucket CORS configured.

### Customer-Facing Context

The media flow is production-shaped: application authorization controls who can
create upload URLs, storage credentials stay server-side, and uploaded files live
in customer-configurable S3-compatible storage rather than the app filesystem.

### Next Recommended Step

Smoke test uploads in hosted dev. If the Spaces key was created during CORS
setup, set the App Platform API `SPACES_KEY` and `SPACES_SECRET` values first,
then repeat the smoke test before using the production prefix.
