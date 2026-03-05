export interface JobImportPayload {
  company: string;
  position: string;
  location?: string;
  salary?: string;
  jobUrl: string;
  jdText?: string;
  source?: string;
}

export type ApplicationStatus =
  | "Applied"
  | "Screening"
  | "Interview"
  | "Offer"
  | "Rejected"
  | "Ghosted"
  | "Withdrawn";

export interface Application extends JobImportPayload {
  id: string;
  user_id: string;
  status: ApplicationStatus;
  parse_quality: 'high' | 'medium' | 'low';
  needs_jd: boolean;
  created_at: string;
  updated_at: string;
}