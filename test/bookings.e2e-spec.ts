import { ValidationPipe } from '@nestjs/common';
import { NestApplication } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { salonWallClockToUtc } from '../src/common/timezone';
import { PrismaService } from '../src/prisma/prisma.service';

jest.setTimeout(30_000);

// Runs against the dev database; all bookings are made on far-future days at
// salon-lotus and cleaned up afterwards so reruns and app data stay unaffected.
const SALON = 'salon-lotus'; // opens 10, closes 18
const DAY = '2030-03-04';
const DURATION = 60;

// Wall-clock hours at the salon, like the API defines them — keeps the
// assertions correct whatever timezone the test machine runs in.
const slotAt = (hour: number, minute = 0) =>
  salonWallClockToUtc(2030, 3, 4, hour, minute).toISOString();

describe('BeautyHub API (e2e)', () => {
  let app: NestApplication;
  let prisma: PrismaService;
  const guestTokens: string[] = [];
  const guestIds: string[] = [];

  const newGuest = async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/guest')
      .expect(201);
    guestTokens.push(res.body.token as string);
    guestIds.push(res.body.user.id as string);
    return res.body.token as string;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.booking.deleteMany({
      where: { customerId: { in: guestIds } },
    });
    await prisma.user.deleteMany({ where: { id: { in: guestIds } } });
    await app.close();
  });

  const getSlots = async (durationMinutes = DURATION) => {
    const res = await request(app.getHttpServer())
      .get(`/salons/${SALON}/availability`)
      .query({ date: DAY, durationMinutes })
      .expect(200);
    return res.body as string[];
  };

  describe('availability grid', () => {
    it('respects open/close hours and duration', async () => {
      const slots = await getSlots(60);
      // Lotus: 10:00–18:00, 60-minute service → first 10:00, last 17:00.
      expect(slots[0]).toBe(slotAt(10));
      expect(slots[slots.length - 1]).toBe(slotAt(17));
      expect(slots).toHaveLength(15); // 30-min grid: 10:00 … 17:00
    });

    it('shortens the tail for longer services', async () => {
      const slots = await getSlots(120);
      expect(slots[slots.length - 1]).toBe(slotAt(16)); // 16:00 + 2h = close
    });
  });

  describe('booking lifecycle', () => {
    it('books a slot, removes overlapping availability, restores on cancel', async () => {
      const token = await newGuest();
      const create = await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${token}`)
        .send({
          salonId: SALON,
          start: slotAt(11),
          serviceNames: ['Swedish Massage'],
        })
        .expect(201);

      expect(create.body.salonName).toBe('Lotus Day Spa');
      expect(create.body.totalPrice).toBe(55);
      expect(create.body.totalDurationMinutes).toBe(60);
      expect(create.body.status).toBe('confirmed');

      // 10:30, 11:00 and 11:30 all overlap an 11:00–12:00 booking.
      const during = await getSlots();
      expect(during).not.toContain(slotAt(10, 30));
      expect(during).not.toContain(slotAt(11));
      expect(during).not.toContain(slotAt(11, 30));
      expect(during).toContain(slotAt(12));

      const mine = await request(app.getHttpServer())
        .get('/bookings')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(mine.body).toHaveLength(1);

      await request(app.getHttpServer())
        .post(`/bookings/${create.body.id}/cancel`)
        .set('Authorization', `Bearer ${token}`)
        .expect(204);

      const after = await getSlots();
      expect(after).toContain(slotAt(11));
    });

    it('rejects unknown service names', async () => {
      const token = await newGuest();
      await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${token}`)
        .send({
          salonId: SALON,
          start: slotAt(14),
          serviceNames: ['Unicorn Polish'],
        })
        .expect(400);
    });

    it('exactly one of two concurrent identical bookings wins', async () => {
      const [tokenA, tokenB] = [await newGuest(), await newGuest()];
      const book = (token: string) =>
        request(app.getHttpServer())
          .post('/bookings')
          .set('Authorization', `Bearer ${token}`)
          .send({
            salonId: SALON,
            start: slotAt(15),
            serviceNames: ['Radiance Facial'],
          });

      const [a, b] = await Promise.all([book(tokenA), book(tokenB)]);
      expect([a.status, b.status].sort()).toEqual([201, 409]);
    });
  });

  describe('booking approval flow', () => {
    let ownerToken: string;

    const asOwner = async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'owner-lotus@beautyhub.app',
          password: 'provider_dev_password',
        })
        .expect(200);
      return (res.body as { token: string }).token;
    };

    const setAutoConfirm = (value: boolean) =>
      request(app.getHttpServer())
        .patch('/provider/salon')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ autoConfirmBookings: value })
        .expect(200);

    beforeAll(async () => {
      ownerToken = await asOwner();
      await setAutoConfirm(false);
    });

    afterAll(async () => {
      await setAutoConfirm(true);
    });

    const requestBooking = async (hour: number) => {
      const token = await newGuest();
      const res = await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${token}`)
        .send({
          salonId: SALON,
          start: slotAt(hour),
          serviceNames: ['Swedish Massage'],
        })
        .expect(201);
      return {
        token,
        booking: res.body as { id: string; status: string; expiresAt: string },
      };
    };

    const respond = (id: string, verb: 'accept' | 'decline') =>
      request(app.getHttpServer())
        .post(`/provider/bookings/${id}/${verb}`)
        .set('Authorization', `Bearer ${ownerToken}`);

    it('creates a PENDING request that holds the slot until declined', async () => {
      const { booking } = await requestBooking(10);
      expect(booking.status).toBe('pending');
      expect(new Date(booking.expiresAt).getTime()).toBeGreaterThan(Date.now());

      // The unanswered request blocks the slot for everyone else…
      expect(await getSlots()).not.toContain(slotAt(10));

      // …and shows up on the owner's schedule to be answered.
      const day = await request(app.getHttpServer())
        .get('/provider/bookings')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      const mine = (day.body as { id: string; status: string }[]).find(
        (b) => b.id === booking.id,
      );
      expect(mine?.status).toBe('pending');

      const declined = await respond(booking.id, 'decline').expect(201);
      expect((declined.body as { status: string }).status).toBe('declined');
      expect(await getSlots()).toContain(slotAt(10));
    });

    it('accept confirms the booking; a second response conflicts', async () => {
      const { token, booking } = await requestBooking(12);
      const accepted = await respond(booking.id, 'accept').expect(201);
      expect((accepted.body as { status: string }).status).toBe('confirmed');

      const mine = await request(app.getHttpServer())
        .get('/bookings')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect((mine.body as { status: string }[])[0].status).toBe('confirmed');

      await respond(booking.id, 'decline').expect(409);
    });

    it('two requests for the same slot cannot both be created', async () => {
      const [{ booking }, second] = [
        await requestBooking(14),
        await (async () => {
          const token = await newGuest();
          return request(app.getHttpServer())
            .post('/bookings')
            .set('Authorization', `Bearer ${token}`)
            .send({
              salonId: SALON,
              start: slotAt(14),
              serviceNames: ['Swedish Massage'],
            });
        })(),
      ];
      expect(second.status).toBe(409);
      await respond(booking.id, 'decline').expect(201);
    });

    it('an unanswered request lapses to expired and frees its slot', async () => {
      const { token, booking } = await requestBooking(16);
      await prisma.booking.update({
        where: { id: booking.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      // Any read sweeps it; the customer sees the lapse and the slot returns.
      const mine = await request(app.getHttpServer())
        .get('/bookings')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect((mine.body as { status: string }[])[0].status).toBe('expired');
      expect(await getSlots()).toContain(slotAt(16));

      await respond(booking.id, 'accept').expect(409);
    });

    it('auto-confirm salons keep instant booking', async () => {
      await setAutoConfirm(true);
      const token = await newGuest();
      const res = await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${token}`)
        .send({
          salonId: SALON,
          start: slotAt(17),
          serviceNames: ['Swedish Massage'],
        })
        .expect(201);
      const body = res.body as { status: string; expiresAt: string | null };
      expect(body.status).toBe('confirmed');
      expect(body.expiresAt).toBeNull();
      await setAutoConfirm(false);
    });
  });

  describe('role guards', () => {
    it('blocks customers from provider and admin routes', async () => {
      const token = await newGuest();
      await request(app.getHttpServer())
        .get('/provider/salon')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
      await request(app.getHttpServer())
        .get('/admin/users')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('rejects unauthenticated bookings access', async () => {
      await request(app.getHttpServer()).get('/bookings').expect(401);
    });
  });
});
