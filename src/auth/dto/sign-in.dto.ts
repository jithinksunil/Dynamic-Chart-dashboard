import { IsEmail, IsNotEmpty, IsString, Matches } from 'class-validator';
import { passwordRegex, passwordValidationMessage } from '../../utility';

export class SignInDto {
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @IsNotEmpty()
  @IsString()
  @Matches(passwordRegex, {
    message: passwordValidationMessage,
  })
  password: string;
}
