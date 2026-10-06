import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  JwtAuthGuard,
  type AuthenticatedRequest,
} from '../../common/guards/jwt-auth.guard.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { ProfilesService } from './profiles.service.js';
import {
  createProfileSchema,
  type CreateProfileDto,
  type ProfileDto,
} from './dto/create-profile.dto.js';
import {
  updateProfileSchema,
  type UpdateProfileDto,
} from './dto/update-profile.dto.js';

/**
 * Aucune route ne prend d'id de profil : c'est toujours « le mien », déduit
 * du JWT. Un paramètre d'id est une vérification d'appartenance qu'on peut
 * oublier d'ajouter à la prochaine route ; son absence rend la fuite
 * structurellement impossible.
 */
@Controller('profiles')
@UseGuards(JwtAuthGuard)
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  @Post()
  create(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(createProfileSchema)) dto: CreateProfileDto,
  ): Promise<ProfileDto> {
    return this.profilesService.create(request.userId, dto);
  }

  @Get('me')
  findMine(@Req() request: AuthenticatedRequest): Promise<ProfileDto> {
    return this.profilesService.findMine(request.userId);
  }

  @Patch('me')
  update(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(updateProfileSchema)) dto: UpdateProfileDto,
  ): Promise<ProfileDto> {
    return this.profilesService.update(request.userId, dto);
  }
}
