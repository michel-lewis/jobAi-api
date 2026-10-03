import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { AuthService } from './auth.service.js';
import {
  registerSchema,
  type RegisterDto,
  type RegisteredUserDto,
} from './dto/register.dto.js';
import {
  loginSchema,
  type LoggedInUserDto,
  type LoginDto,
} from './dto/login.dto.js';

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

  /** Une connexion ne crée rien : 200, pas 201. */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  login(
    @Body(new ZodValidationPipe(loginSchema)) dto: LoginDto,
  ): Promise<LoggedInUserDto> {
    return this.authService.login(dto);
  }
}
