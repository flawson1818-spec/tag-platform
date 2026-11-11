/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */

import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app/app.module';
import { webOrigins } from './common/web-origin';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // docs/12_SECURITY_SPECIFICATION.md API SECURITY: "Helmet" / "Content Security Policy". A
  // relaxed script/style-src is needed only because Swagger UI (served at GET /api/docs below)
  // renders actual HTML with inline script/style — every other endpoint here returns pure JSON
  // or upgrades to a WebSocket, so this is as strict as this app's one HTML page allows.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
        },
      },
    }),
  );
  app.enableCors({ origin: webOrigins() });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);

  const swaggerConfig = new DocumentBuilder()
    .setTitle("Tour d'avant-garde API")
    .setDescription('Une prière s\'élève à chaque instant — API')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(`${globalPrefix}/docs`, app, swaggerDocument);

  const port = process.env.PORT || 3000;
  await app.listen(port);
  Logger.log(
    `🚀 Application is running on: http://localhost:${port}/${globalPrefix}`,
  );
  Logger.log(`📖 Swagger docs available at: http://localhost:${port}/${globalPrefix}/docs`);
  keepAwake(`${globalPrefix}/health`);
}

/**
 * The prayer room never stops, so the server must never sleep. A free Render service falls
 * asleep after 15 minutes without a visit and the room's clock stops with it; calling our own
 * public address every 10 minutes keeps it awake. Only on Render (RENDER_EXTERNAL_URL is set
 * there by Render itself); KEEP_AWAKE=false turns it off.
 */
function keepAwake(healthPath: string): void {
  const base = process.env.RENDER_EXTERNAL_URL;
  if (!base || process.env.KEEP_AWAKE === 'false') return;
  const url = `${base.replace(/\/$/, '')}/${healthPath}`;
  setInterval(() => {
    fetch(url).catch((error) => Logger.warn(`Keep-awake ping failed: ${(error as Error).message}`));
  }, 10 * 60 * 1000).unref();
  Logger.log(`⏰ Keep-awake ping every 10 minutes on ${url}`);
}

bootstrap();
