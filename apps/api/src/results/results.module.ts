import { Module } from '@nestjs/common';
import { SitesModule } from '../sites/sites.module';
import { ResultsController } from './results.controller';
import { ResultsService } from './results.service';

@Module({
  imports: [SitesModule],
  controllers: [ResultsController],
  providers: [ResultsService],
})
export class ResultsModule {}
