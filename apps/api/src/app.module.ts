import { Controller, Get, Global, Module } from '@nestjs/common'
import { APP_FILTER, APP_GUARD } from '@nestjs/core'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'
import { AuditController } from './audit/audit.controller'
import { AuditService } from './audit/audit.service'
import { AccessService } from './auth/access.service'
import { AuthController } from './auth/auth.controller'
import { AuthGuard, Public } from './auth/auth.guard'
import { CoaController } from './coa/coa.controller'
import { AllExceptionsFilter } from './common/errors'
import { DbService } from './db/db.service'
import { JournalsController } from './journals/journals.controller'
import { JournalsService } from './journals/journals.service'
import { PeriodsController } from './periods/periods.controller'
import { ReportsController } from './reports/reports.controller'
import { TenancyController } from './tenancy/tenancy.controller'

@Controller()
class HealthController {
  constructor(private readonly db: DbService) {}

  @Public()
  @Get('health')
  async health() {
    await this.db.pool.query('select 1')
    return { status: 'ok' }
  }
}

@Global()
@Module({
  providers: [DbService, AccessService, AuditService],
  exports: [DbService, AccessService, AuditService],
})
class CoreModule {}

@Module({
  imports: [CoreModule, ThrottlerModule.forRoot([{ ttl: 60_000, limit: 600 }])],
  controllers: [HealthController, AuthController, TenancyController, CoaController, PeriodsController, JournalsController, ReportsController, AuditController],
  providers: [
    JournalsService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
