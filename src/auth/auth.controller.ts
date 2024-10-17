import { Controller, Logger, Get, Post, Param, Body } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {}
  @Get('getQrCode')
  async getQrCode() {
    return await this.authService.getQrCode();
  }

  @Get('getCodeStatus/:scene')
  async getCodeStatus(@Param('scene') scene: string) {
    return await this.authService.getCodeStatus(scene);
  }

  @Post('appletLogin/:scene')
  async appletLogin(@Param('scene') scene: string, @Body() data: any) {
    return await this.authService.appletLogin(scene, data);
  }
}
