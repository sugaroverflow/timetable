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

### Decisions

The implementation uses signed direct browser PUTs instead of proxying binary
bytes through the API. The API authorizes the signing request, validates declared
image metadata, signs the `public-read` ACL header, and returns the public URL
that existing GraphQL mutations persist.

### Tradeoffs

The API does not resize, optimize, virus-scan, or delete replaced media objects.
Upload size is validated before signing, but final byte enforcement is delegated
to the storage provider for the signed PUT.

### Risks

- Hosted buckets still need CORS allowing `PUT` with `Content-Type` and
  `x-amz-acl` from the web origins.
- `SPACES_PUBLIC_BASE_URL` or bucket public-read behavior must be configured so
  returned image URLs render in the app.
- Orphaned objects can remain if a user uploads an image but never saves the
  form, or later replaces an image URL.

### Verification

- `npm run test --workspace @timetable/api` passed with elevated local bind
  permission.
- `npm run test` passed with elevated local bind permission.
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run build` passed.
- `npm run test:e2e` passed with elevated local bind permission.

### Demo Impact

Admins and hosts can now demonstrate uploading real profile and cover imagery
instead of pasting externally hosted URLs, provided the target environment has
Spaces credentials and bucket CORS configured.

### Customer-Facing Context

The media flow is production-shaped: application authorization controls who can
create upload URLs, storage credentials stay server-side, and uploaded files live
in customer-configurable S3-compatible storage rather than the app filesystem.

### Next Recommended Step

Configure and test the dev Spaces bucket/CDN path in DigitalOcean, then update
issue #8 once a hosted upload smoke test succeeds.
