import { Module } from '@nestjs/common';
import { dataSourceOptions } from './config/data-source.js';
import { validateEnv } from './config/env.validation.js';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    TypeOrmModule.forRoot(dataSourceOptions),
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
