-- AlterEnum
ALTER TYPE "BookingStatus" ADD VALUE 'PENDING';
ALTER TYPE "BookingStatus" ADD VALUE 'DECLINED';
ALTER TYPE "BookingStatus" ADD VALUE 'EXPIRED';

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "respondedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Salon" ADD COLUMN     "autoConfirmBookings" BOOLEAN NOT NULL DEFAULT true;
