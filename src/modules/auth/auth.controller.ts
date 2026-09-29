import { Body, Controller, Post } from '@nestjs/common';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { AuthService } from './auth.service.js';
import {
  registerSchema,
  type RegisterDto,
  type RegisteredUserDto,
} from './dto/register.dto.js';

/**
 * Le contrôleur connaît HTTP et rien d'autre : il valide l'entrée, délègue,
 * et renvoie. Aucune décision métier ici.
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(
    @Body(new ZodValidationPipe(registerSchema)) dto: RegisterDto,
  ): Promise<RegisteredUserDto> {
    return this.authService.register(dto);
  }
}
