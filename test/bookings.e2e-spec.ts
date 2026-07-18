import { ValidationPipe } from '@nestjs/common';
import { NestApplication } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

jest.setTimeout(30_000);

// Runs against the dev database; all bookings are made on far-future days at
// salon-lotus and cleaned up afterwards so reruns and app data stay unaffected.
const SALON = 'salon-lotus'; // opens 10, closes 18
const DAY = '2030-03-04';
const DURATION = 60;

const slotAt = (hour: number, minute = 0) =>
  new Date(2030, 2, 4, hour, minute).toISOString();

describe('BeautyHub API (e2e)', () => {
  let app: NestApplication;
  let prisma: PrismaService;
  const guestTokens: string[] = [];
  const guestIds: string[] = [];

  const newGuest = async () => {
    const res = await request(app.getHttpServer()).post('/auth/guest').expect(201);
    guestTokens.push(res.body.token as string);
    guestIds.push(res.body.user.id as string);
    return res.body.token as string;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.booking.deleteMany({ where: { customerId: { in: guestIds } } });
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
        .send({ salonId: SALON, start: slotAt(11), serviceNames: ['Swedish Massage'] })
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
        .send({ salonId: SALON, start: slotAt(14), serviceNames: ['Unicorn Polish'] })
        .expect(400);
    });

    it('exactly one of two concurrent identical bookings wins', async () => {
      const [tokenA, tokenB] = [await newGuest(), await newGuest()];
      const book = (token: string) =>
        request(app.getHttpServer())
          .post('/bookings')
          .set('Authorization', `Bearer ${token}`)
          .send({ salonId: SALON, start: slotAt(15), serviceNames: ['Radiance Facial'] });

      const [a, b] = await Promise.all([book(tokenA), book(tokenB)]);
      expect([a.status, b.status].sort()).toEqual([201, 409]);
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
