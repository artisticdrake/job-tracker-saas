export type AppStatus =
  | "Applied"
  | "Screening"
  | "Interview Scheduled"
  | "Interview Completed"
  | "Offer"
  | "Rejected"
  | "Ghosted"
  | "Withdrawn";

export type AppSource =
  | "LinkedIn"
  | "Handshake"
  | "Jobright"
  | "Glassdoor"
  | "Indeed"
  | "Interstride"
  | "Other/Custom";

export interface TimelineEntry {
  status: string;
  ts: number;
}

export interface Document {
  name: string;
  dateApplied: string;
}

export interface JobApplication {
  id: string;
  company: string;
  position: string;
  location: string;
  salary: string;
  dateApplied: string;
  status: AppStatus;
  source: AppSource;
  referral: "Yes" | "No";
  jobUrl: string;
  jobDescription: string;
  notes: string;
  documents: Document[];
  timeline: TimelineEntry[];
  last_updated: string;
}

// The tailored resume_builder version linked to a given application, as
// returned by GET /resume-builder/application-links (most recent one only).
export interface ResumeAppLink {
  id: string;
  version_name: string;
  updated_at: string;
}

export interface AppFormData {
  company: string;
  position: string;
  location: string;
  salary: string;
  dateApplied: string;
  status: string;
  statusDate: string;
  jobUrl: string;
  source: string;
  referral: string;
  notes: string;
  jobDescription: string;
  documents: Document[];
}
