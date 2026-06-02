export interface MasterySummaryDTO {
  acceptedCount: number;
  masteredCount: number;
  percentMastered: number;
}

export interface MasterySummarySuccessResponse {
  ok: true;
  summary: MasterySummaryDTO;
}

export interface MasteryErrorResponse {
  ok: false;
  error: string;
}

export type MasterySummaryResponse = MasterySummarySuccessResponse | MasteryErrorResponse;
