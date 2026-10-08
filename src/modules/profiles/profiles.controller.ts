import {
  Body,
  Controller,
  Get,
  Headers,
  Put,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  JwtAuthGuard,
  type AuthenticatedRequest,
} from '../../common/guards/jwt-auth.guard.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { ProfilesService } from './profiles.service.js';
import { putProfileSchema, type PutProfileDto } from './dto/put-profile.dto.js';
import type { ProfileDto } from './dto/profile.dto.js';
import { formatETag, parseIfMatch } from './if-match.js';

/**
 * Aucune route ne prend d'id de profil : c'est toujours « le mien », déduit
 * du JWT. Deux routes, pas vingt-quatre : GET lit le document complet
 * imbriqué, PUT le remplace en entier (enfants compris) dans une seule
 * transaction. POST et PATCH n'existent plus.
 */
@Controller('profiles')
@UseGuards(JwtAuthGuard)
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  @Get('me')
  async findMine(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ProfileDto> {
    const { dto, version } = await this.profilesService.findMine(
      request.userId,
    );
    response.setHeader('ETag', formatETag(version));
    return dto;
  }

  /**
   * `If-Match` porte la version lue au dernier GET — jamais dans le corps,
   * ce n'est pas une donnée du CV. Obligatoire : chaque profil existe dès
   * l'inscription, il n'y a plus de première écriture sans version connue.
   */
  @Put('me')
  async replace(
    @Req() request: AuthenticatedRequest,
    @Headers('if-match') ifMatchHeader: string | undefined,
    @Body(new ZodValidationPipe(putProfileSchema)) dto: PutProfileDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ProfileDto> {
    const ifMatch = parseIfMatch(ifMatchHeader);
    const { dto: result, version } = await this.profilesService.replace(
      request.userId,
      ifMatch,
      dto,
    );
    response.setHeader('ETag', formatETag(version));
    return result;
  }
}
