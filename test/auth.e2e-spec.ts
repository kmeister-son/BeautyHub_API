import { ValidationPipe } from '@nestjs/common';
import { NestApplication } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

jest.setTimeout(30_000);

// Runs against the dev database; the test user is removed afterwards
// (password resets cascade with it).
const EMAIL = 'e2e-reset@test.beautyhub.app';

describe('Password reset (e2e)', () => {
  let app: NestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.user.deleteMany({ where: { email: EMAIL } });
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name: 'Reset Tester', email: EMAIL, password: 'original-pw-1' })
      .expect(201);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: EMAIL } });
    await app.close();
  });

  const forgot = (email: string) =>
    request(app.getHttpServer()).post('/auth/forgot-password').send({ email });

  it('answers ok for unknown emails without leaking account existence', async () => {
    const res = await forgot('nobody@test.beautyhub.app').expect(200);
    expect(res.body).toEqual({ ok: true }); // no devCode for unknown users
  });

  it('resets the password with a valid code, once', async () => {
    const { devCode } = (await forgot(EMAIL).expect(200)).body as {
      devCode: string;
    };
    expect(devCode).toMatch(/^\d{6}$/);

    // Wrong code is rejected and does not burn the real one.
    const wrong = devCode === '000000' ? '000001' : '000000';
    await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send({ email: EMAIL, code: wrong, password: 'new-password-1' })
      .expect(400);

    await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send({ email: EMAIL, code: devCode, password: 'new-password-1' })
      .expect(200);

    // Old password no longer works; the new one does.
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: EMAIL, password: 'original-pw-1' })
      .expect(401);
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: EMAIL, password: 'new-password-1' })
      .expect(200);

    // The code is single-use.
    await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send({ email: EMAIL, code: devCode, password: 'another-pw-1' })
      .expect(400);
  });
});
