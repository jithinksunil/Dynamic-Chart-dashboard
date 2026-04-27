import { IsEmail, IsNotEmpty, IsString, Matches } from 'class-validator';
import { passwordRegex, passwordValidationMessage } from '../../utility';

export class SignUpDto {
  @IsNotEmpty()
  @IsString()
  name: string;

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
