import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import type { Request, Response } from 'express';
import { Role } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SignInDto } from './dto/sign-in.dto';
import { SignUpDto } from './dto/sign-up.dto';
import type { JwtPayload } from './strategies/jwt.strategy';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async signUp({ dto, res }: { dto: SignUpDto; res: Response }) {
    const normalizedEmail = dto.email.toLowerCase().trim();
    const existing = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existing) throw new ConflictException('Email already in use');

    const hashed = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: { name: dto.name, email: normalizedEmail, password: hashed },
      select: { id: true, email: true, name: true, role: true },
    });

    return this.issueTokens({
      res,
      payload: { sub: user.id, email: user.email, role: user.role },
    });
  }

  async signIn({ dto, res }: { dto: SignInDto; res: Response }) {
    const normalizedEmail = dto.email.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (!user)
      throw new BadRequestException('No account found with that email');

    const match = await bcrypt.compare(dto.password, user.password);
    if (!match) throw new BadRequestException('Incorrect password');

    return this.issueTokens({
      res,
      payload: { sub: user.id, email: user.email, role: user.role },
    });
  }

  async getMe({ userId }: { userId: string }): Promise<{
    id: string;
    name: string;
    email: string;
    role: string;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, role: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async refresh({
    req,
    res,
  }: {
    req: Request;
    res: Response;
  }): Promise<{ accessToken: string; role: Role }> {
    const token: string | undefined = req.cookies?.refresh_token as
      | string
      | undefined;
    if (!token) throw new UnauthorizedException('No refresh token provided');

    let payload: JwtPayload;
    try {
      payload = this.jwt.verify<JwtPayload>(token, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true },
    });
    if (!user) throw new UnauthorizedException('User no longer exists');

    return this.issueTokens({
      res,
      payload: { sub: user.id, email: user.email, role: user.role },
    });
  }

  private issueTokens({
    payload,
    res,
  }: {
    payload: JwtPayload;
    res: Response;
  }): { accessToken: string; role: Role } {
    const accessToken = this.jwt.sign(payload, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: '15m',
    });

    const refreshToken = this.jwt.sign(payload, {
      secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: '7d',
    });

    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return { accessToken, role: payload.role };
  }
}
