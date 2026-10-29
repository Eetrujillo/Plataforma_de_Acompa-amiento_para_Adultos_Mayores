export type Role = 'admin' | 'teacher' | 'student' | 'familiar';

export interface PrivacyPolicyAcceptance {
  version: string;
  acceptedAt: string;
}

export interface User {
  _id: string;
  name: string;
  email: string;
  role: Role;
  emailVerified: boolean;
  emailVerifiedAt?: string;
  privacyPolicy?: PrivacyPolicyAcceptance;
  createdAt: string;
  updatedAt: string;
}

export type OlderAdultLinkStatus = 'pending' | 'linked';

export interface OlderAdult {
  _id: string;
  name: string;
  timeZone: string;
  linkStatus: OlderAdultLinkStatus;
  pinConfigured: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface OlderAdultCreatePayload {
  name: string;
  pin: string;
  timeZone: string;
}

export interface OlderAdultUpdatePayload {
  name: string;
  pin?: string;
  timeZone: string;
}

export interface OlderAdultListResponse {
  olderAdults: OlderAdult[];
}

export interface OlderAdultResponse {
  olderAdult: OlderAdult;
  message?: string;
}

export interface OlderAdultLinkingCode {
  code: string;
  expiresAt: string;
  qrPayload: string;
  qrDataUrl: string;
}

export interface OlderAdultLinkingCodeResponse {
  olderAdult: OlderAdult;
  linkingCode: OlderAdultLinkingCode;
  message?: string;
}

export interface ConsentItem {
  title: string;
  description: string;
}

export interface ConsentText {
  version: string;
  title: string;
  intro: string;
  items: ConsentItem[];
  closing: string;
  legal: string;
  acceptLabel: string;
  rejectMessage: string;
}

export interface ConsentState {
  currentVersion: string;
  acceptedVersion: string | null;
  required: boolean;
}

export interface OlderAdultAppProfile {
  _id: string;
  name: string;
  timeZone: string;
  linkStatus: OlderAdultLinkStatus;
  consent: {
    version: string;
    acceptedAt: string;
  } | null;
}

export interface RedeemLinkingCodePayload {
  code: string;
  consentAccepted: boolean;
  consentVersion: string;
}

export interface RedeemLinkingCodeResponse {
  olderAdult: OlderAdultAppProfile;
  message: string;
  sessionToken: string;
  consent: {
    version: string;
    acceptedAt: string;
  };
}

export interface OlderAdultSessionResponse {
  olderAdult: OlderAdultAppProfile;
  consent: ConsentState;
}

export interface AppActivity {
  _id: string;
  title: string;
  icon: string;
  iconLabel: string;
  iconEmoji: string;
  scheduledAt: string;
  time: string;
  repeatType: OlderAdultRepeatType;
  repeatSummary: string;
  completed: boolean;
  completedAt: string | null;
}

export interface AppActivitiesResponse {
  olderAdult: OlderAdultAppProfile;
  date: string;
  timeZone: string;
  activities: AppActivity[];
}

export interface AppCompletion {
  _id: string;
  activity: string;
  occurrenceDate: string;
  completedAt: string;
  snapshot: {
    title: string;
    icon: string;
    time: string;
    timeZone: string;
    repeatSummary: string;
  };
}

export interface AppCompleteActivityResponse {
  message: string;
  completion: AppCompletion;
}

export type OlderAdultRepeatType = 'once' | 'daily' | 'weekly';

export interface Activity {
  _id: string;
  olderAdult: string;
  title: string;
  icon: string;
  iconLabel: string;
  iconEmoji: string;
  scheduledAt: string;
  date: string;
  time: string;
  timeZone: string;
  repeatType: OlderAdultRepeatType;
  weekdays: number[];
  repeatSummary: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityCreatePayload {
  olderAdultId: string;
  title: string;
  icon: string;
  date: string;
  time: string;
  repeatType: OlderAdultRepeatType;
  weekdays?: number[];
  confirmPast?: boolean;
}

export interface ActivityUpdatePayload {
  title: string;
  icon: string;
  date: string;
  time: string;
  repeatType: OlderAdultRepeatType;
  weekdays?: number[];
  confirmPast?: boolean;
}

export interface ActivityListResponse {
  activities: Activity[];
}

export interface ActivityResponse {
  activity: Activity;
  message?: string;
}

export interface ConsentResponse {
  consent: ConsentText;
}

export interface AcceptConsentResponse {
  message: string;
  consent: {
    version: string;
    acceptedAt: string;
  };
}

export interface AuthResponse {
  token: string;
  user: User;
  emailVerificationSent?: boolean;
}

export interface VerifyEmailResponse {
  message: string;
  code: 'EMAIL_VERIFIED';
}

export interface ResendVerificationResponse {
  message: string;
  code: string;
  retryAfterSeconds?: number;
}

export interface ForgotPasswordResponse {
  message: string;
  code: string;
}

export interface ResetPasswordResponse {
  message: string;
  code: 'PASSWORD_RESET';
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  name?: string;
  email: string;
  password: string;
  acceptPrivacyPolicy: boolean;
}
