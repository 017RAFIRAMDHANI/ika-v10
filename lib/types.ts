export type UserRole = "Alumni" | "Admin";

export type SessionUser = {
  id: number;
  userId: string;
  displayName: string;
  role: UserRole;
  hasVoted: boolean;
  faceEnrolled: boolean;
  faceVerified: boolean;
  desktopPrimaryEnrolled: boolean;
  mobilePrimaryEnrolled: boolean;
  canonicalEnrolled: boolean;
};

export type Candidate = {
  id: number;
  name: string;
  vision: string;
  mission: string;
  featuredProgram: string;
  image: string;
  occupation: string;
  cohort: string;
  votes: number;
};

export type VoterRecord = {
  id: number;
  userRecordId: number | null;
  userId: string | null;
  nim: string | null;
  displayName: string | null;
  role: UserRole;
  hasVoted: boolean | null;
  email: string | null;
  whatsapp: string | null;
  studyProgram: string | null;
  cohort: string | null;
  graduationYear: string | null;
  domicile: string | null;
  faceEnrolled: boolean;
  faceVerified: boolean;
  faceEnrolledAt: string | null;
  faceVerifiedAt: string | null;
  desktopPrimaryEnrolled: boolean;
  mobilePrimaryEnrolled: boolean;
  canonicalEnrolled: boolean;
  faceTemplateCount: number;
  registrationSource: string | null;
  createdAt: string;
  updatedAt: string;
};


export type AdminUserRecord = {
  id: number;
  userId: string;
  displayName: string;
  role: UserRole;
  hasVoted: boolean;
};

export type AdminStats = {
  users: number;
  voters: number;
  voted: number;
  candidates: number;
  totalVotes: number;
};


export type VoteIntegrity = {
  candidates: Array<{ id: number; name: string; votes: number; ballots: number }>;
  ballots: number;
  votedUsers: number;
  consistent: boolean;
};

