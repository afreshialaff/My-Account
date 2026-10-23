import 'reflect-metadata'
import { INestApplication } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import cookieParser from 'cookie-parser'
import { AppModule } from './app.module'
import { config } from './config'

export function configure(app: INestApplication) {
  app.setGlobalPrefix('api/v1')
  app.use(cookieParser())
  app.enableCors({ origin: config.webOrigin, credentials: true })
  const http = app.getHttpAdapter().getInstance()
  http.disable('x-powered-by')
  http.use((_req: unknown, res: { setHeader: (k: string, v: string) => void }, next: () => void) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('Referrer-Policy', 'no-referrer')
    next()
  })
  return app
}

async function bootstrap() {
  const app = configure(await NestFactory.create(AppModule))
  const doc = SwaggerModule.createDocument(
    app,
    new DocumentBuilder().setTitle('Accounting OS API').setVersion('0.1.0').addBearerAuth().build(),
  )
  SwaggerModule.setup('api/docs', app, doc)
  await app.listen(config.port)
  console.log(`Accounting OS API listening on :${config.port} (docs at /api/docs)`)
}

if (require.main === module) bootstrap()
