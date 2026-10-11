import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import {
  JwtAuthGuard,
  type AuthenticatedRequest,
} from '../../common/guards/jwt-auth.guard.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import {
  ApplicationsService,
  type ApplicationStateDto,
} from './applications.service.js';
import {
  createApplicationSchema,
  type CreateApplicationDto,
} from './dto/create-application.dto.js';

/** 400 avant tout accès au service si l'id n'est pas un UUID — jamais un 500 Postgres. */
const applicationIdParamSchema = z.string().uuid();

@Controller('applications')
@UseGuards(JwtAuthGuard)
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Post()
  @HttpCode(202)
  create(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(createApplicationSchema))
    dto: CreateApplicationDto,
  ): Promise<ApplicationStateDto> {
    return this.applicationsService.create(request.userId, dto.offerId);
  }

  @Get(':id')
  findOne(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ZodValidationPipe(applicationIdParamSchema)) id: string,
  ): Promise<ApplicationStateDto> {
    return this.applicationsService.findOne(request.userId, id);
  }
}
