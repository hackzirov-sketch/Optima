# TypeORM migrations archive

This project no longer uses TypeORM at runtime (see `SYSTEM_DESIGN.md` §2.1) —
schema is created from a single snapshot at
`backend/docker/postgres/init.sql`, which already includes the cumulative
effect of every migration below (including the ones ported from `UPZ-main`
during the merge: OTIMA community, meeting file sharing, random 6-digit
public user IDs — see `/MERGE_NOTES.md` at the repo root).

These files are kept only as historical reference for how the schema
evolved. They are **not** compiled or run — they live outside `src/` on
purpose so `tsc`/`nest build` never sees them, and the `typeorm` /
`@nestjs/typeorm` packages are intentionally not installed. If you ever need
to run one of these against a real database, use `ts-node` directly with
`typeorm` installed as a one-off dev dependency; don't wire them back into
the app's build.
