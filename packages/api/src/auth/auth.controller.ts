import { Body, Controller, Delete, HttpCode, HttpStatus, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle, seconds } from '@nestjs/throttler';
import { CurrentUser } from '../access/decorators/current-user.decorator';
import { JwtAuthGuard } from '../access/jwt-auth.guard';
import type { AuthenticatedUser } from '../access/interfaces/authenticated-user.interface';
import { AuthService } from './auth.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { MfaChallengeDto } from './dto/mfa-challenge.dto';
import { MfaRecoveryChallengeDto } from './dto/mfa-recovery-challenge.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { VerifyMfaCodeDto } from './dto/verify-mfa-code.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 5, ttl: seconds(60) } })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: seconds(60) } })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: seconds(60) } })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@Body() dto: RefreshTokenDto) {
    return this.authService.logout(dto);
  }

  @Post('password/forgot')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 3, ttl: seconds(60) } })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('password/reset')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 5, ttl: seconds(60) } })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Post('email/verify')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 5, ttl: seconds(60) } })
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto.token);
  }

  @Post('email/resend')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 3, ttl: seconds(60) } })
  resendVerification(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.authService.resendVerificationEmail(currentUser.id);
  }

  /** Public: reached with the mfaToken from a login response, before the caller has a session. */
  @Post('mfa/challenge')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  mfaChallenge(@Body() dto: MfaChallengeDto) {
    return this.authService.mfaChallenge(dto.mfaToken, dto.code, dto.trustDevice);
  }

  /** Public: same pending-token flow as mfa/challenge, for a lost authenticator device. */
  @Post('mfa/recovery')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  mfaRecoveryChallenge(@Body() dto: MfaRecoveryChallengeDto) {
    return this.authService.mfaRecoveryChallenge(dto.mfaToken, dto.recoveryCode, dto.trustDevice);
  }

  @Post('mfa/setup')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  setupMfa(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.authService.setupMfa(currentUser.id);
  }

  /** Returns freshly generated recovery codes — shown to the caller once, never retrievable again. */
  @Post('mfa/enable')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  enableMfa(@CurrentUser() currentUser: AuthenticatedUser, @Body() dto: VerifyMfaCodeDto) {
    return this.authService.enableMfa(currentUser.id, dto.code);
  }

  @Post('mfa/disable')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  disableMfa(@CurrentUser() currentUser: AuthenticatedUser, @Body() dto: VerifyMfaCodeDto) {
    return this.authService.disableMfa(currentUser.id, dto.code);
  }

  /** docs/12_SECURITY_SPECIFICATION.md "Trusted Devices" — never returns the token itself, just the metadata. */
  @Get('mfa/trusted-devices')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  listTrustedDevices(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.authService.listTrustedDevices(currentUser.id);
  }

  @Delete('mfa/trusted-devices/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  revokeTrustedDevice(@CurrentUser() currentUser: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.authService.revokeTrustedDevice(currentUser.id, id);
  }
}
