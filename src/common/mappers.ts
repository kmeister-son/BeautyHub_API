import {
  Booking,
  Review,
  Salon,
  SalonService,
  StaffMember,
  User,
} from '@prisma/client';

// JSON shapes are contract-matched to the Flutter app's domain entities:
// enum values lowercase (Dart's `.byName`), Decimal → number, DateTime → ISO.

export const toServiceJson = (s: SalonService) => ({
  id: s.id,
  name: s.name,
  description: s.description,
  durationMinutes: s.durationMinutes,
  price: Number(s.price),
  category: s.category.toLowerCase(),
});

export const toStaffJson = (s: StaffMember) => ({
  id: s.id,
  name: s.name,
  role: s.role,
  rating: s.rating,
});

export const toReviewJson = (r: Review) => ({
  id: r.id,
  authorName: r.authorName,
  rating: r.rating,
  comment: r.comment,
  date: r.date.toISOString(),
});

export const toSalonJson = (
  salon: Salon & {
    services: SalonService[];
    staff: StaffMember[];
    reviews: Review[];
  },
) => ({
  id: salon.id,
  ownerId: salon.ownerId,
  name: salon.name,
  tagline: salon.tagline,
  about: salon.about,
  address: salon.address,
  distanceKm: salon.distanceKm,
  rating: salon.rating,
  reviewCount: salon.reviewCount,
  categories: salon.categories.map((c) => c.toLowerCase()),
  openHour: salon.openHour,
  closeHour: salon.closeHour,
  isFeatured: salon.isFeatured,
  coverSeed: salon.coverSeed,
  autoConfirmBookings: salon.autoConfirmBookings,
  services: salon.services.map(toServiceJson),
  staff: salon.staff.map(toStaffJson),
  reviews: salon.reviews.map(toReviewJson),
});

export const toBookingJson = (b: Booking) => ({
  id: b.id,
  salonId: b.salonId,
  salonName: b.salonName,
  salonAddress: b.salonAddress,
  coverSeed: b.coverSeed,
  serviceNames: b.serviceNames,
  staffName: b.staffName,
  start: b.start.toISOString(),
  totalDurationMinutes: b.totalDurationMinutes,
  totalPrice: Number(b.totalPrice),
  status: b.status.toLowerCase(),
  expiresAt: b.expiresAt?.toISOString() ?? null,
});

export const toAdminBookingJson = (b: Booking & { customer: User }) => ({
  ...toBookingJson(b),
  customerId: b.customerId,
  customerName: b.customer.name,
  customerEmail: b.customer.email,
});

export const salonInclude = {
  services: true,
  staff: true,
  reviews: { orderBy: { date: 'desc' as const } },
};
