import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import {
  JwtAuthGuard,
  type AuthenticatedRequest,
} from '../../common/guards/jwt-auth.guard.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { OffersService } from './offers.service.js';
import {
  createOfferSchema,
  type CreateOfferDto,
} from './dto/create-offer.dto.js';
import {
  listOffersQuerySchema,
  type ListOffersQueryDto,
} from './dto/list-offers-query.dto.js';
import type { OfferDto, PaginatedOffersDto } from './dto/offer.dto.js';

/** 400 avant tout accès au service si l'id n'est pas un UUID — jamais un 500 Postgres. */
const offerIdParamSchema = z.string().uuid();

/**
 * Toutes les routes exigent un utilisateur connecté : même "ses offres et
 * les offres publiques" dépend de savoir qui est "ses".
 */
@Controller('offers')
@UseGuards(JwtAuthGuard)
export class OffersController {
  constructor(private readonly offersService: OffersService) {}

  @Post()
  create(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(createOfferSchema)) dto: CreateOfferDto,
  ): Promise<OfferDto> {
    return this.offersService.create(request.userId, dto);
  }

  @Get(':id')
  findOne(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ZodValidationPipe(offerIdParamSchema)) id: string,
  ): Promise<OfferDto> {
    return this.offersService.findVisibleById(request.userId, id);
  }

  @Get()
  findMany(
    @Req() request: AuthenticatedRequest,
    @Query(new ZodValidationPipe(listOffersQuerySchema))
    query: ListOffersQueryDto,
  ): Promise<PaginatedOffersDto> {
    return this.offersService.listVisible(request.userId, query);
  }
}
