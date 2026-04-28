export const REFRESH_TOKEN_COOKIE = 'refresh_token';

export const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{6,}$/;
export const passwordValidationMessage =
  'Password must be at least 6 characters and contain at least one uppercase letter, one lowercase letter, one number, and one special character';
