// /shared/types.ts
export type ApplicationStatus = 
  | "Applied" 
  | "Screening" 
  | "Interview Scheduled" 
  | "Interview Completed" 
  | "Offer" 
  | "Rejected" 
  | "Withdrawn" 
  | "Ghosted"; // Added per Tier 0

export interface JobImportPayload {
  company: string;
  position: string;
  location?: string;
  salary?: string;
  jobUrl: string;
  jdText?: string; // New: for the Matching Engine [cite: 54]
}