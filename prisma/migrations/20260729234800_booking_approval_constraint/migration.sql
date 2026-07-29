-- Widen the double-booking guarantee: a PENDING request holds its slot just
-- like a CONFIRMED booking, so two customers cannot request the same time and
-- an accept can never create an overlap. Lives in its own migration because
-- the PENDING enum value must be committed before it can appear in an index
-- predicate.
ALTER TABLE "Booking" DROP CONSTRAINT no_double_booking;

ALTER TABLE "Booking"
  ADD CONSTRAINT no_double_booking
  EXCLUDE USING gist (
    "salonId" WITH =,
    tsrange("start", "end") WITH &&
  )
  WHERE (status IN ('PENDING', 'CONFIRMED'));
