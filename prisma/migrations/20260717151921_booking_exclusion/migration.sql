-- Hard guarantee against double booking: no two CONFIRMED bookings at the
-- same salon may have overlapping [start, end) ranges, enforced by Postgres
-- itself so concurrent createBooking transactions cannot both commit.
-- (When per-staff capacity lands, switch "salonId" to coalesce("staffId", "salonId").)
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Booking"
  ADD CONSTRAINT no_double_booking
  EXCLUDE USING gist (
    "salonId" WITH =,
    tsrange("start", "end") WITH &&
  )
  WHERE (status = 'CONFIRMED');
