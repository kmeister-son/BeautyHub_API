import { PrismaClient, Role, ServiceCategory } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

type ServiceSeed = {
  id: string;
  name: string;
  description: string;
  durationMinutes: number;
  price: number;
  category: ServiceCategory;
};

type StaffSeed = { id: string; name: string; role: string; rating: number };

type ReviewSeed = {
  id: string;
  authorName: string;
  rating: number;
  comment: string;
  date: Date;
};

type SalonSeed = {
  id: string;
  name: string;
  tagline: string;
  about: string;
  address: string;
  distanceKm: number;
  rating: number;
  reviewCount: number;
  categories: ServiceCategory[];
  openHour: number;
  closeHour: number;
  isFeatured: boolean;
  coverSeed: number;
  ownerEmail: string;
  services: ServiceSeed[];
  staff: StaffSeed[];
  reviews: ReviewSeed[];
};

// Ported verbatim from the Flutter app's lib/data/mock/mock_salons.dart so the
// customer app looks identical the moment it switches to the API.
const salons: SalonSeed[] = [
  {
    id: 'salon-velvet',
    name: 'Velvet & Vine Studio',
    tagline: 'Luxury hair styling in the heart of town',
    about:
      'Award-winning stylists specialising in colour, balayage and precision ' +
      'cuts. Walk out feeling brand new — complimentary consultation with ' +
      'every appointment.',
    address: '12 Rosewood Ave, City Centre',
    distanceKm: 1.2,
    rating: 4.9,
    reviewCount: 312,
    categories: [ServiceCategory.HAIRCUT, ServiceCategory.MAKEUP],
    openHour: 9,
    closeHour: 19,
    isFeatured: true,
    coverSeed: 0,
    ownerEmail: 'owner-velvet@beautyhub.app',
    services: [
      {
        id: 'velvet-cut',
        name: 'Signature Cut & Style',
        description: 'Consultation, wash, precision cut and blow-dry finish.',
        durationMinutes: 60,
        price: 45,
        category: ServiceCategory.HAIRCUT,
      },
      {
        id: 'velvet-balayage',
        name: 'Balayage & Tone',
        description: 'Hand-painted highlights with a gloss toner.',
        durationMinutes: 150,
        price: 140,
        category: ServiceCategory.HAIRCUT,
      },
      {
        id: 'velvet-blowout',
        name: 'Blowout',
        description: 'Wash and professional blow-dry styling.',
        durationMinutes: 45,
        price: 30,
        category: ServiceCategory.HAIRCUT,
      },
      {
        id: 'velvet-makeup',
        name: 'Event Makeup',
        description: 'Full-face glam for evenings and special occasions.',
        durationMinutes: 60,
        price: 65,
        category: ServiceCategory.MAKEUP,
      },
    ],
    staff: [
      { id: 'velvet-amara', name: 'Amara Okafor', role: 'Senior Stylist', rating: 4.9 },
      { id: 'velvet-lucia', name: 'Lucia Fernandes', role: 'Colour Specialist', rating: 4.8 },
      { id: 'velvet-jade', name: 'Jade Morena', role: 'Stylist', rating: 4.7 },
    ],
    reviews: [
      {
        id: 'rv-1',
        authorName: 'Naledi M.',
        rating: 5,
        comment: 'Amara transformed my hair — best balayage I have ever had.',
        date: new Date(2026, 5, 28),
      },
      {
        id: 'rv-2',
        authorName: 'Chloe T.',
        rating: 4.5,
        comment: 'Gorgeous studio and friendly team. Booking again!',
        date: new Date(2026, 5, 14),
      },
    ],
  },
  {
    id: 'salon-kings',
    name: "King's Chair Barbershop",
    tagline: 'Sharp fades, hot towels, zero fuss',
    about:
      'Classic barbershop with a modern edge. Fades, beard sculpting and ' +
      'hot-towel shaves by barbers who take their craft seriously.',
    address: '48 Meridian St, Old Town',
    distanceKm: 0.8,
    rating: 4.8,
    reviewCount: 540,
    categories: [ServiceCategory.BARBER, ServiceCategory.HAIRCUT],
    openHour: 8,
    closeHour: 20,
    isFeatured: true,
    coverSeed: 1,
    ownerEmail: 'owner-kings@beautyhub.app',
    services: [
      {
        id: 'kings-fade',
        name: 'Skin Fade',
        description: 'Precision skin fade with styled finish.',
        durationMinutes: 45,
        price: 25,
        category: ServiceCategory.BARBER,
      },
      {
        id: 'kings-beard',
        name: 'Beard Sculpt & Line-Up',
        description: 'Shape, trim and hot-towel finish.',
        durationMinutes: 30,
        price: 18,
        category: ServiceCategory.BARBER,
      },
      {
        id: 'kings-shave',
        name: 'Hot Towel Shave',
        description: 'Traditional straight-razor shave with hot towels.',
        durationMinutes: 40,
        price: 22,
        category: ServiceCategory.BARBER,
      },
      {
        id: 'kings-kids',
        name: 'Kids Cut',
        description: 'Patient, friendly cuts for under-12s.',
        durationMinutes: 30,
        price: 15,
        category: ServiceCategory.HAIRCUT,
      },
    ],
    staff: [
      { id: 'kings-marcus', name: 'Marcus Dube', role: 'Master Barber', rating: 4.9 },
      { id: 'kings-leo', name: 'Leo Ramirez', role: 'Barber', rating: 4.8 },
      { id: 'kings-theo', name: 'Theo Jansen', role: 'Barber', rating: 4.6 },
    ],
    reviews: [
      {
        id: 'rv-3',
        authorName: 'Sipho K.',
        rating: 5,
        comment: 'Marcus gives the cleanest fade in town. Worth every cent.',
        date: new Date(2026, 6, 2),
      },
      {
        id: 'rv-4',
        authorName: 'Daniel O.',
        rating: 4.5,
        comment: 'Great vibe, quick service, always consistent.',
        date: new Date(2026, 5, 20),
      },
    ],
  },
  {
    id: 'salon-lotus',
    name: 'Lotus Day Spa',
    tagline: 'Unwind. Recharge. Glow.',
    about:
      'A calm sanctuary offering massages, facials and full-body ' +
      'treatments using organic products.',
    address: '7 Serenity Lane, Riverside',
    distanceKm: 3.4,
    rating: 4.7,
    reviewCount: 198,
    categories: [ServiceCategory.SPA, ServiceCategory.SKINCARE],
    openHour: 10,
    closeHour: 18,
    isFeatured: true,
    coverSeed: 2,
    ownerEmail: 'owner-lotus@beautyhub.app',
    services: [
      {
        id: 'lotus-swedish',
        name: 'Swedish Massage',
        description: 'Full-body relaxation massage, 60 minutes of calm.',
        durationMinutes: 60,
        price: 55,
        category: ServiceCategory.SPA,
      },
      {
        id: 'lotus-deep',
        name: 'Deep Tissue Massage',
        description: 'Targeted pressure for stubborn knots and tension.',
        durationMinutes: 60,
        price: 65,
        category: ServiceCategory.SPA,
      },
      {
        id: 'lotus-facial',
        name: 'Radiance Facial',
        description: 'Cleanse, exfoliate, mask and glow serum.',
        durationMinutes: 50,
        price: 48,
        category: ServiceCategory.SKINCARE,
      },
      {
        id: 'lotus-hotstone',
        name: 'Hot Stone Therapy',
        description: 'Heated basalt stones melt away deep tension.',
        durationMinutes: 75,
        price: 75,
        category: ServiceCategory.SPA,
      },
    ],
    staff: [
      { id: 'lotus-mei', name: 'Mei Lin', role: 'Lead Therapist', rating: 4.8 },
      { id: 'lotus-anna', name: 'Anna Botha', role: 'Skin Therapist', rating: 4.7 },
    ],
    reviews: [
      {
        id: 'rv-5',
        authorName: 'Lerato P.',
        rating: 5,
        comment: 'The hot stone massage is heavenly. Left floating.',
        date: new Date(2026, 5, 30),
      },
    ],
  },
  {
    id: 'salon-polished',
    name: 'Polished Nail Bar',
    tagline: 'Nail art that turns heads',
    about:
      'Trend-led nail studio for gel, acrylic and hand-painted nail art. ' +
      'Sterile tools, premium polishes, serious attention to detail.',
    address: '23 Bloom St, Fashion District',
    distanceKm: 2.1,
    rating: 4.8,
    reviewCount: 265,
    categories: [ServiceCategory.NAILS],
    openHour: 9,
    closeHour: 19,
    isFeatured: false,
    coverSeed: 3,
    ownerEmail: 'owner-polished@beautyhub.app',
    services: [
      {
        id: 'polished-gel',
        name: 'Gel Manicure',
        description: 'Cuticle care, shaping and long-wear gel colour.',
        durationMinutes: 45,
        price: 32,
        category: ServiceCategory.NAILS,
      },
      {
        id: 'polished-acrylic',
        name: 'Acrylic Full Set',
        description: 'Sculpted acrylic extensions with gel finish.',
        durationMinutes: 90,
        price: 55,
        category: ServiceCategory.NAILS,
      },
      {
        id: 'polished-pedi',
        name: 'Luxury Pedicure',
        description: 'Soak, scrub, massage and polish.',
        durationMinutes: 60,
        price: 40,
        category: ServiceCategory.NAILS,
      },
      {
        id: 'polished-art',
        name: 'Nail Art (per set)',
        description: 'Custom hand-painted designs by our artists.',
        durationMinutes: 30,
        price: 20,
        category: ServiceCategory.NAILS,
      },
    ],
    staff: [
      { id: 'polished-yuki', name: 'Yuki Tanaka', role: 'Nail Artist', rating: 4.9 },
      { id: 'polished-rosa', name: 'Rosa Almeida', role: 'Nail Technician', rating: 4.7 },
    ],
    reviews: [
      {
        id: 'rv-6',
        authorName: 'Amina S.',
        rating: 5,
        comment: 'Yuki is an actual artist. My chrome nails are perfect.',
        date: new Date(2026, 6, 5),
      },
      {
        id: 'rv-7',
        authorName: 'Jess W.',
        rating: 4.5,
        comment: 'Spotless studio and my gels lasted three weeks.',
        date: new Date(2026, 5, 8),
      },
    ],
  },
  {
    id: 'salon-glowlab',
    name: 'GlowLab Skin Clinic',
    tagline: 'Science-backed skincare',
    about:
      'Clinical facials, peels and LED therapy tailored to your skin by ' +
      'certified aestheticians.',
    address: '90 Crescent Rd, Northgate',
    distanceKm: 4.6,
    rating: 4.6,
    reviewCount: 143,
    categories: [ServiceCategory.SKINCARE, ServiceCategory.SPA],
    openHour: 9,
    closeHour: 17,
    isFeatured: false,
    coverSeed: 4,
    ownerEmail: 'owner-glowlab@beautyhub.app',
    services: [
      {
        id: 'glow-signature',
        name: 'Signature Facial',
        description: 'Deep cleanse, enzyme exfoliation and hydration boost.',
        durationMinutes: 60,
        price: 58,
        category: ServiceCategory.SKINCARE,
      },
      {
        id: 'glow-peel',
        name: 'Chemical Peel',
        description: 'Resurfacing peel for tone and texture.',
        durationMinutes: 45,
        price: 70,
        category: ServiceCategory.SKINCARE,
      },
      {
        id: 'glow-led',
        name: 'LED Light Therapy',
        description: 'Calming LED session for acne and collagen support.',
        durationMinutes: 30,
        price: 35,
        category: ServiceCategory.SKINCARE,
      },
    ],
    staff: [
      { id: 'glow-priya', name: 'Priya Naidoo', role: 'Aesthetician', rating: 4.7 },
      { id: 'glow-emma', name: 'Emma Krige', role: 'Skin Therapist', rating: 4.6 },
    ],
    reviews: [
      {
        id: 'rv-8',
        authorName: 'Thandi N.',
        rating: 4.5,
        comment: 'My skin has never looked better. Priya knows her stuff.',
        date: new Date(2026, 5, 25),
      },
    ],
  },
  {
    id: 'salon-braided',
    name: 'Braided Crown Studio',
    tagline: 'Protective styles, done right',
    about:
      'Specialists in braids, locs and natural hair care. Gentle hands, ' +
      'quality extensions and styles that last.',
    address: '5 Unity Plaza, Eastside',
    distanceKm: 2.9,
    rating: 4.9,
    reviewCount: 421,
    categories: [ServiceCategory.HAIRCUT],
    openHour: 8,
    closeHour: 18,
    isFeatured: true,
    coverSeed: 5,
    ownerEmail: 'owner-braided@beautyhub.app',
    services: [
      {
        id: 'braided-box',
        name: 'Box Braids (Full Head)',
        description: 'Classic box braids, extensions included.',
        durationMinutes: 240,
        price: 95,
        category: ServiceCategory.HAIRCUT,
      },
      {
        id: 'braided-cornrows',
        name: 'Cornrows',
        description: 'Neat, sleek cornrows in your chosen pattern.',
        durationMinutes: 90,
        price: 40,
        category: ServiceCategory.HAIRCUT,
      },
      {
        id: 'braided-loc',
        name: 'Loc Retwist',
        description: 'Root retwist and style for mature locs.',
        durationMinutes: 120,
        price: 60,
        category: ServiceCategory.HAIRCUT,
      },
      {
        id: 'braided-treatment',
        name: 'Deep Conditioning Treatment',
        description: 'Steam treatment for natural hair health.',
        durationMinutes: 45,
        price: 28,
        category: ServiceCategory.HAIRCUT,
      },
    ],
    staff: [
      { id: 'braided-zanele', name: 'Zanele Khumalo', role: 'Master Braider', rating: 5.0 },
      { id: 'braided-fatou', name: 'Fatou Diallo', role: 'Braider', rating: 4.8 },
      { id: 'braided-nia', name: 'Nia Williams', role: 'Loctician', rating: 4.9 },
    ],
    reviews: [
      {
        id: 'rv-9',
        authorName: 'Boitumelo R.',
        rating: 5,
        comment: 'Zanele braided my hair in half the usual time, zero tension.',
        date: new Date(2026, 6, 10),
      },
      {
        id: 'rv-10',
        authorName: 'Karabo L.',
        rating: 5,
        comment: 'Six weeks later and my box braids still look fresh.',
        date: new Date(2026, 4, 30),
      },
    ],
  },
  {
    id: 'salon-blush',
    name: 'Blush Beauty Lounge',
    tagline: 'Brows, lashes and full glam',
    about:
      'Your one-stop lounge for lash extensions, brow lamination and ' +
      'occasion makeup.',
    address: '31 Amber Way, Westfield',
    distanceKm: 5.2,
    rating: 4.5,
    reviewCount: 176,
    categories: [ServiceCategory.MAKEUP, ServiceCategory.SKINCARE],
    openHour: 9,
    closeHour: 18,
    isFeatured: false,
    coverSeed: 6,
    ownerEmail: 'owner-blush@beautyhub.app',
    services: [
      {
        id: 'blush-lash',
        name: 'Classic Lash Extensions',
        description: 'Natural-look individual lash extensions.',
        durationMinutes: 90,
        price: 60,
        category: ServiceCategory.MAKEUP,
      },
      {
        id: 'blush-brow',
        name: 'Brow Lamination & Tint',
        description: 'Fuller, sculpted brows for up to 6 weeks.',
        durationMinutes: 45,
        price: 35,
        category: ServiceCategory.MAKEUP,
      },
      {
        id: 'blush-glam',
        name: 'Bridal Makeup Trial',
        description: 'Full trial session with premium products.',
        durationMinutes: 75,
        price: 80,
        category: ServiceCategory.MAKEUP,
      },
    ],
    staff: [
      { id: 'blush-sofia', name: 'Sofia Marino', role: 'Lash Artist', rating: 4.6 },
      { id: 'blush-hana', name: 'Hana Kim', role: 'Makeup Artist', rating: 4.5 },
    ],
    reviews: [
      {
        id: 'rv-11',
        authorName: 'Palesa D.',
        rating: 4.5,
        comment: 'My lashes look so natural, constantly getting compliments.',
        date: new Date(2026, 5, 18),
      },
    ],
  },
  {
    id: 'salon-groom',
    name: 'The Groom Room',
    tagline: 'Premium grooming for the modern gent',
    about:
      'Barbering, skin care and express manicures under one roof — ' +
      'with an espresso while you wait.',
    address: '18 Foundry Yard, Docklands',
    distanceKm: 3.8,
    rating: 4.7,
    reviewCount: 289,
    categories: [ServiceCategory.BARBER, ServiceCategory.SKINCARE, ServiceCategory.NAILS],
    openHour: 10,
    closeHour: 21,
    isFeatured: false,
    coverSeed: 7,
    ownerEmail: 'owner-groom@beautyhub.app',
    services: [
      {
        id: 'groom-executive',
        name: 'Executive Cut & Style',
        description: 'Tailored cut, wash and product styling.',
        durationMinutes: 50,
        price: 35,
        category: ServiceCategory.BARBER,
      },
      {
        id: 'groom-facial',
        name: "Gent's Express Facial",
        description: 'Deep cleanse and de-stress in 30 minutes.',
        durationMinutes: 30,
        price: 30,
        category: ServiceCategory.SKINCARE,
      },
      {
        id: 'groom-mani',
        name: 'Express Manicure',
        description: 'Tidy-up, buff and finish.',
        durationMinutes: 25,
        price: 18,
        category: ServiceCategory.NAILS,
      },
      {
        id: 'groom-combo',
        name: 'Cut + Beard Combo',
        description: 'Full cut with beard sculpt — our most popular.',
        durationMinutes: 75,
        price: 48,
        category: ServiceCategory.BARBER,
      },
    ],
    staff: [
      { id: 'groom-oliver', name: 'Oliver Grant', role: 'Head Barber', rating: 4.8 },
      { id: 'groom-ray', name: 'Ray Mokoena', role: 'Barber', rating: 4.7 },
    ],
    reviews: [
      {
        id: 'rv-12',
        authorName: 'Michael B.',
        rating: 5,
        comment: 'The cut + beard combo with an espresso — unbeatable.',
        date: new Date(2026, 6, 8),
      },
    ],
  },
];

async function upsertUser(
  email: string,
  name: string,
  role: Role,
  opts: { password?: string; isGuest?: boolean } = {},
) {
  const passwordHash = opts.password ? await bcrypt.hash(opts.password, 10) : null;
  return prisma.user.upsert({
    where: { email },
    update: { name, role },
    create: {
      email,
      name,
      role,
      passwordHash,
      isGuest: opts.isGuest ?? false,
    },
  });
}

async function main() {
  const admin = await upsertUser('admin@beautyhub.app', 'BeautyHub Admin', Role.ADMIN, {
    password: 'admin_dev_password',
  });
  const guest = await upsertUser('guest@beautyhub.app', 'Guest', Role.CUSTOMER, {
    isGuest: true,
  });

  for (const s of salons) {
    const owner = await upsertUser(s.ownerEmail, `${s.name} Owner`, Role.PROVIDER, {
      password: 'provider_dev_password',
    });

    const salonData = {
      name: s.name,
      tagline: s.tagline,
      about: s.about,
      address: s.address,
      distanceKm: s.distanceKm,
      rating: s.rating,
      reviewCount: s.reviewCount,
      categories: s.categories,
      openHour: s.openHour,
      closeHour: s.closeHour,
      isFeatured: s.isFeatured,
      coverSeed: s.coverSeed,
      ownerId: owner.id,
    };
    await prisma.salon.upsert({
      where: { id: s.id },
      update: salonData,
      create: { id: s.id, ...salonData },
    });

    for (const svc of s.services) {
      const { id, ...data } = svc;
      await prisma.salonService.upsert({
        where: { id },
        update: { ...data, salonId: s.id },
        create: { id, ...data, salonId: s.id },
      });
    }
    for (const st of s.staff) {
      const { id, ...data } = st;
      await prisma.staffMember.upsert({
        where: { id },
        update: { ...data, salonId: s.id },
        create: { id, ...data, salonId: s.id },
      });
    }
    for (const rv of s.reviews) {
      const { id, ...data } = rv;
      await prisma.review.upsert({
        where: { id },
        update: { ...data, salonId: s.id },
        create: { id, ...data, salonId: s.id },
      });
    }
  }

  // The mock repository's seed booking: Skin Fade with Marcus Dube at
  // King's Chair, 12 days ago at 11:00, so the Bookings tab looks identical.
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 12, 11, 0, 0);
  const end = new Date(start.getTime() + 45 * 60_000);
  await prisma.booking.upsert({
    where: { id: 'bk-seed-1' },
    update: {},
    create: {
      id: 'bk-seed-1',
      customerId: guest.id,
      salonId: 'salon-kings',
      staffId: 'kings-marcus',
      start,
      end,
      totalDurationMinutes: 45,
      totalPrice: 25,
      status: 'CONFIRMED',
      salonName: "King's Chair Barbershop",
      salonAddress: '48 Meridian St, Old Town',
      coverSeed: 1,
      serviceNames: ['Skin Fade'],
      staffName: 'Marcus Dube',
    },
  });

  console.log(`Seeded ${salons.length} salons, admin ${admin.email}, guest ${guest.email}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
